"""Shared terminal integration, retired model workflows and read-only history."""
import json
import shutil
import subprocess
import time
from types import SimpleNamespace

import pytest

from test_panel_api import panel, pending_item, post, snapshot
from crow_panel.core import Problem
from crow_panel.security import hook_input, tool_allowed


@pytest.fixture
def hub(panel):
    app, _ = panel
    if not shutil.which('tmux'):
        pytest.skip('tmux required')
    name = 'crow-panel-test-' + app.cfg.home.name
    # No model: a shell waits for a submitted line in a real terminal.
    command = "IFS= read -r line; printf '\\nSUBMITTED:%s\\n' \"$line\"; sleep 30"
    subprocess.run(['tmux', 'new-session', '-d', '-s', name, '-c', str(app.cfg.home), 'sh', '-c', command], check=True)
    app.cfg['mode'] = 'live'
    try:
        for _ in range(30):
            found = [r for r in app.terminal.sessions() if r['session'] == name]
            if found: break
            time.sleep(.02)
        row = found[0]
        yield app, row
    finally:
        subprocess.run(['tmux', 'kill-session', '-t', name], capture_output=True)


def test_live_terminal_capture_literal_context_without_enter_then_explicit_enter(hub):
    app, row = hub
    item = pending_item(app)
    path = '/api/terminal/handoff'
    body = {**row, 'request_id': 'handoff', 'topic_id': item['topic_id'], 'note': 'Bonjour\n$(touch /tmp/no)\x1b\rtest'}
    _, result = post(app, path, body)
    assert result['submitted'] is False
    assert str(app.cfg['pending_md']) + ':' in result['text']
    assert '\n' not in result['text'] and '\x1b' not in result['text']
    assert post(app, path, body)[1] == result
    query = {'session': [row['session']], 'pid': [str(row['pid'])]}
    screen = app.get('/api/terminal/screen', query)
    assert 'SUBMITTED:' not in '\n'.join(screen['lines'])
    assert screen['cols'] and screen['rows'] and screen['cursor']
    post(app, '/api/terminal/resize', {**row, 'request_id': 'resize', 'cols': 90, 'rows': 25})
    post(app, '/api/terminal/keys', {**row, 'request_id': 'enter', 'keys': [{'key': 'Enter'}]})
    for _ in range(20):
        output = '\n'.join(app.get('/api/terminal/screen', query)['lines'])
        if 'SUBMITTED:' in output:
            break
        time.sleep(.02)
    assert 'SUBMITTED:' in output and '$(touch /tmp/no)' in output
    assert 'tmux attach -t ' + row['session'] == row['attach']


@pytest.mark.parametrize('keys', [[{'key': 'invalid'}], [{'text': ''}], [{'key': {}}], [], 'text'])
def test_terminal_validates_keys_before_invoking_upstream(hub, keys):
    app, row = hub
    with pytest.raises(Problem) as err:
        post(app, '/api/terminal/keys', {**row, 'request_id': 'invalid', 'keys': keys})
    assert err.value.status == 400


def test_terminal_rejects_stale_target_and_trial_writes(hub):
    app, row = hub
    with pytest.raises(Problem) as err:
        app.terminal.keys({**row, 'pid': row['pid'] + 1, 'keys': [{'text': 'e'}]})
    assert err.value.body['error']['code'] == 'hub_missing'
    app.cfg['mode'] = 'dry_run'
    with pytest.raises(Problem) as err:
        app.terminal.keys({**row, 'keys': [{'text': 'e'}]})
    assert err.value.body['error']['code'] == 'trial_mode'
    with pytest.raises(Problem):
        app.terminal.start()
    with pytest.raises(Problem):
        app.terminal.resize({**row, 'cols': 1, 'rows': 2})
    with pytest.raises(Problem):
        app.terminal.screen({'pid': ['bad']})


def test_hub_start_reuses_upstream_launcher_and_does_not_duplicate(panel, monkeypatch):
    app, _ = panel
    app.cfg['mode'] = 'live'
    calls, sessions = [], []
    monkeypatch.setattr(app.terminal, 'sessions', lambda: sessions)
    def run(argv):
        calls.append(argv)
        sessions.append({'session': 'crow-claude-test', 'pid': 123, 'attach': 'tmux attach -t crow-claude-test'})
        return SimpleNamespace(returncode=0)
    monkeypatch.setattr(app.terminal, 'run', run)
    assert app.terminal.start()['running']
    assert app.terminal.start()['running']
    assert len(calls) == 1
    assert calls[0][0:2] == ['env', 'CROW_TERMINAL=headless']
    assert calls[0][3:] == ['term', '--account', 'claude', '--on-busy', 'fail', 'crow']


@pytest.mark.parametrize('method,path,extra', [
    ('POST', '/api/topics', {'title': 'new'}),
    ('PUT', '/api/topics/{topic}', {'default_model': 'opus'}),
    ('POST', '/api/topics/{topic}/messages', {'text': 'Hello'}),
    ('POST', '/api/pending/{pending}/followup', {'instructions': 'Relance'}),
])
def test_removed_panel_model_actions_are_not_routes(panel, method, path, extra):
    app, fake = panel
    item = pending_item(app)
    path = path.format(topic=item['topic_id'], pending=item['id'])
    with pytest.raises(Problem) as err:
        app.mutate(method, path, {'request_id': 'retired', **extra})
    assert err.value.status == 404
    assert not app.store.all('jobs') and not any(c[1] == 'run' for c in fake.calls)
    for tool in ('Bash', 'Write', 'Read', 'mcp__mail__send_email'):
        assert not tool_allowed('chat', tool, {})
        assert not hook_input({'profile': 'chat'}, {'tool_name': tool, 'tool_input': {}})


@pytest.mark.parametrize('kind,profile', [('chat.message','chat'), ('mail.sync','read'), ('mail.sync','propose'), ('calendar.sync','calendar'), ('mail.followup','read'), ('mail.triage.execute','triage')])
def test_old_queued_model_jobs_are_retired_on_restart(panel, kind, profile):
    app, fake = panel
    op = app.store.operation(kind, {'request_id': 'legacy'}, 'Legacy')
    app.launcher.enqueue(op, {'profile': profile, 'account': 'claude', 'provider': 'claude', 'model': 'sonnet', 'cwd': str(app.cfg.home), 'prompt': 'Never launch'}, '/old', {})
    app.launcher.tick()
    result = app.operation(op['operation_id'])
    assert result['status'] == 'failed' and result['error']['code'] == 'model_disabled'
    assert not any(c[1] == 'run' for c in fake.calls)


@pytest.mark.parametrize('route', ['/api/mail/sync', '/api/calendar/sync'])
def test_sync_without_classic_outlook_preserves_cache_and_never_uses_model(panel, route):
    app, fake = panel
    app.mail.publish(snapshot())
    before = app.mail.snapshot_path.read_bytes()
    with pytest.raises(Problem) as err:
        post(app, route, {'request_id': 'no-com'})
    assert err.value.body['error']['code'] == 'outlook_unavailable'
    assert app.mail.snapshot_path.read_bytes() == before
    assert not any(c[1] == 'run' for c in fake.calls)


def test_normal_mail_sync_with_native_agenda_has_no_model_proposal_stage(panel):
    from test_panel_calendar import snapshot as calendar_snapshot
    app, fake = panel
    value = snapshot()
    class Backend:
        options = {}
        def probe(self, **kwargs): return {'connected': True, 'folders_resolvable': True}
        def call(self, action, **kwargs):
            if action == 'folders': return {'folders': value['folders'], 'folders_complete': True}
            if action == 'inbox': return {k: value[k] for k in ('items','coverage','exhausted')}
            if action == 'drafts': return {'items': []}
            if action == 'calendar': return calendar_snapshot()
            raise AssertionError(action)
        def conversation(self, *args): return {'items': [], 'complete': True}
        def scan_history(self, folders): return {'folders': []}
    app.mail.com = Backend()
    _, op = post(app, '/api/mail/sync', {'request_id': 'native'})
    app.launcher.tick()
    result = app.operation(op['operation_id'])
    assert result['status'] == 'succeeded' and len(result['steps']) == 1
    assert all(row['proposal'] is None for row in app.mail.raw()['items'])
    assert app.operation(op['calendar_operation_id'])['status'] == 'succeeded'
    assert not any(c[1] == 'run' for c in fake.calls)

@pytest.mark.parametrize('kind,context,expected', [
    ('mail', {'message_id': 'm', 'web_link': 'https://example.test/mail/m'}, 'https://example.test/mail/m'),
    ('dossier', {'folder_path': '/work/project'}, '/work/project'),
    ('run', {'report': '/work/report.md'}, '/work/report.md'),
])
def test_each_topic_handoff_has_its_source_and_no_submission(panel, monkeypatch, kind, context, expected):
    app, _ = panel
    topic = app.launcher.topic(kind, 'reference', 'Subject', context)
    sent = []
    monkeypatch.setattr(app.terminal, 'keys', sent.append)
    result = app.terminal.handoff({'topic_id': topic, 'note': 'My note'})
    assert expected in result['text'] and 'My note' in result['text']
    assert sent[0]['keys'] == [{'text': result['text']}]
    assert not result['submitted']


def test_explicit_native_draft_is_the_only_direct_model_run(panel, tmp_path):
    app, fake = panel
    app.cfg.update(mode='live', work_handoff_dir=str(tmp_path / 'work'))
    app.cfg['accounts']['worka'] = {'provider': 'codex', 'model': 'gpt-5', 'kinds': ['mail_style']}
    rules = tmp_path / 'style.md'; rules.write_text('Concise reply.')
    (app.cfg.home / 'local').mkdir(exist_ok=True)
    (app.cfg.home / 'local/owner-prefs.md').write_text('Never send mail.')
    app.cfg['mail'].update(style_rules=str(rules), reply_closing_internal=['Regards'], reply_closing_external=['Regards'])
    value = snapshot(); value['backend'] = 'outlook_com'
    app.mail.publish(value)
    row = app.mail.raw()['items'][0]
    source = {**row, 'to': [], 'cc': [], 'body_text': 'Original thread'}
    app.mail.com = SimpleNamespace(probe=lambda: {'connected': True}, body=lambda *a: source,
                                    conversation=lambda *a: {'complete': True, 'items': [source]})
    _, op = post(app, '/api/mail/' + row['id'] + '/reply-all', {'request_id': 'draft', 'instructions': 'Reply briefly'})
    app.launcher.tick()
    command = next(c for c in fake.calls if c[1] == 'run')
    assert command[2] == 'worka' and command[command.index('--power') + 1] == 'high'
    assert command[command.index('--permission') + 1] == 'read-only'
    assert '--disable apps' in command[command.index('--extra-args') + 1]
    assert app.operation(op['operation_id'])['steps'][0]['name'] == 'compose'


def test_legacy_cached_model_suggestions_are_not_actionable(panel):
    from crow_panel.core import atomic, canonical
    app, _ = panel
    app.mail.publish(snapshot())
    value = app.mail.raw()
    value['items'][0]['proposal'] = {'source': 'llm', 'action': 'archive', 'confidence': 'high'}
    atomic(app.mail.snapshot_path, canonical(value))
    assert app.mail.list({})['items'][0]['proposal'] is None
