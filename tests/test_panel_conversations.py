import datetime as dt
import importlib.machinery
import importlib.util
import json
from pathlib import Path
import shlex
import sys
import threading

import pytest

from test_panel_api import panel, pending_item, post, snapshot, wait_routine
from crow_panel.core import Problem, canonical
from crow_panel.security import hook_input
from crow_panel.server import App, Server


def test_done_keeps_topic_context_history_and_undo(panel):
    app, fake = panel
    item = pending_item(app)
    topic = item['topic_id']
    context = app.store.get('contexts', topic)
    app.store.put('messages', topic, [{'role': 'user', 'text': 'Éléments uniques conservés'}])
    _, op = post(app, '/api/pending/' + item['id'] + '/done', {'request_id': 'done', 'item_rev': item['item_rev']})
    done = next(i for s in app.pending.view()['sections'] if s['kind'] == 'done' for i in s['items'] if i['id'] == item['id'])
    assert done['topic_id'] == topic
    assert app.topic(topic)['settled'] and not app.topic(topic)['orphan']
    assert app.store.get('contexts', topic) == context
    result = app.get('/api/search', {'q': ['elements uniques']})
    hit = next(g for g in result['groups'] if g['kind'] == 'conversation')['items'][0]
    assert hit['key'] == topic and hit['view'] == 'conversation'
    restarted = App(app.cfg, fake)
    try:
        assert restarted.topic(topic)['settled']
        assert restarted.get('/api/topics/' + topic + '/messages', {})['messages'][0]['text'] == 'Éléments uniques conservés'
    finally:
        restarted.store.db.close()
    app.pending.undo(op, {'request_id': 'undo'}, '/undo')
    assert pending_item(app)['topic_id'] == topic
    assert not app.topic(topic)['settled']


def test_legacy_settled_row_recovers_exact_operation_topic_without_editing_file(panel):
    app, fake = panel
    item = pending_item(app)
    _, op = post(app, '/api/pending/' + item['id'] + '/done', {'request_id': 'legacy-done', 'item_rev': item['item_rev']})
    # Reproduce the old panel: done row gets a fresh id with no topic, old topic becomes orphan.
    old = app.store.get('pending_index', item['id'])
    old['active'] = False
    app.store.put('pending_index', item['id'], old)
    app.store.put('pending_index', 'legacy_done', {**old, 'id': 'legacy_done', 'active': True})
    before = app.pending.path.read_bytes()
    done = next(i for s in app.pending.view()['sections'] if s['kind'] == 'done' for i in s['items'] if i['id'] == item['id'])
    assert done['topic_id'] == op['topic_id']
    assert app.pending.path.read_bytes() == before
    assert not any(i['id'] == item['id'] for s in app.pending.view()['sections'] if s['kind'] != 'done' for i in s['items'])


def test_new_topic_validation_idempotence_dossier_and_recent_order(panel):
    app, _ = panel
    for title in ('', ' ', 123, 'x' * 201):
        with pytest.raises(Problem):
            post(app, '/api/topics', {'request_id': str(title), 'title': title})
    body = {'request_id': 'new-free', 'title': ' Projet libre '}
    code, topic = post(app, '/api/topics', body)
    assert code == 201 and topic['kind'] == 'free' and topic['title'] == 'Projet libre'
    assert post(app, '/api/topics', body) == (code, topic)
    assert app.get('/api/topics/' + topic['topic_id'], {}) == topic
    topic['last_message_at'] = '2099-01-01T00:00:00+00:00'
    app.store.put('topics', topic['topic_id'], topic)
    assert app.get('/api/topics', {})['topics'][0]['topic_id'] == topic['topic_id']
    app.pending.path.write_text(app.pending.path.read_text() + '\n## Dossiers\n### Fixture dossier\n- Plan\n')
    dossier = app.readers.dossiers()['dossiers'][0]
    _, linked = post(app, '/api/topics', {'request_id': 'dossier-chat', 'dossier_slug': dossier['slug']})
    assert linked['topic_id'] == dossier['topic_id']


def test_live_action_turns_keep_guards_and_transcript_without_native_resume(panel):
    app, fake = panel
    app.cfg['mode'] = 'live'
    topic = pending_item(app)['topic_id']
    path = '/api/topics/' + topic + '/messages'
    _, op = post(app, path, {'request_id': 'live-chat', 'text': 'Mets à jour mes préférences'})
    job = app.store.get('jobs', op['operation_id'])
    assert job['profile'] == 'chat' and 'NEVER SEND MAIL' in job['prompt']
    assert 'crow-panel-api' in job['prompt'] and 'reply-all' in job['prompt']
    app.launcher.tick()
    cmd = next(c for c in reversed(fake.calls) if c[1] == 'run')
    assert cmd[cmd.index('--permission') + 1] == 'full'
    assert cmd[cmd.index('--label') + 1].startswith('Chat · ')
    extra = shlex.split(cmd[cmd.index('--extra-args') + 1])
    settings = json.loads(Path(extra[extra.index('--settings') + 1]).read_text())
    assert settings['hooks']['PreToolUse'] and settings['permissions']['deny'] == []
    policy = json.loads((app.cfg.state / 'ops' / op['operation_id'] / 'policy.json').read_text())
    assert hook_input(policy, {'tool_name': 'Write', 'tool_input': {'file_path': str(app.cfg.home / 'local/owner-prefs.md')}})
    assert hook_input(policy, {'tool_name': 'Bash', 'tool_input': {'command': 'crow dispatch ...'}})
    assert not hook_input(policy, {'tool_name': 'mcp__mail__send_email', 'tool_input': {}})
    rid = app.operation(op['operation_id'])['steps'][0]['run_id']
    fake.rows[rid].update(status='succeeded', ended_at=dt.datetime.now(dt.timezone.utc).isoformat(), exit_code=0)
    app.launcher.tick()
    _, second = post(app, path, {'request_id': 'live-again', 'text': 'Et ensuite ?'})
    app.launcher.tick()
    cmd = next(c for c in reversed(fake.calls) if c[1] == 'run')
    assert '--continue-run' not in cmd
    assert 'Mets à jour mes préférences' in app.store.get('jobs', second['operation_id'])['prompt']


def test_live_chat_queued_before_mode_change_cannot_run_in_trial(panel):
    app, fake = panel
    app.cfg['mode'] = 'live'
    _, op = post(app, '/api/topics/' + pending_item(app)['topic_id'] + '/messages', {'request_id': 'mode-change', 'text': 'Classe le mail'})
    app.cfg['mode'] = 'dry_run'
    app.launcher.tick()
    assert app.operation(op['operation_id'])['status'] == 'failed'
    assert not any(c[1] == 'run' for c in fake.calls)


def test_nested_mail_operation_does_not_release_the_active_chat(panel):
    app, _ = panel
    topic = pending_item(app)['topic_id']
    _, chat = post(app, '/api/topics/' + topic + '/messages', {'request_id': 'parent-chat', 'text': 'Prépare une réponse'})
    nested = app.store.operation('mail.reply_all', {'request_id': 'nested-draft'}, 'Draft', topic)
    nested['status'] = 'failed'
    app.launcher.finish(nested, {}, {}, '')
    assert app.topic(topic)['active_operation_id'] == chat['operation_id']


def test_old_chat_run_label_and_topic_survive_null_live_metadata(panel):
    app, fake = panel
    topic = pending_item(app)['topic_id']
    op = app.store.operation('chat.message', {'request_id': 'old-run'}, 'Old', topic)
    stamp = dt.datetime.now(dt.timezone.utc).isoformat()
    record = {'run_id': 'chat-old', 'started_at': stamp, 'source': 'panel', 'label': 'panel:chat.message', 'topic_id': topic, 'operation_id': op['operation_id']}
    Path(app.cfg['runs_registry']).write_text(canonical(record) + '\n')
    app.launcher.cache['runs:24h'] = (__import__('time').monotonic(), {'runs': [{**record, 'topic_id': None, 'operation_id': None, 'source': None}]})
    row = next(r for r in app.readers.runs()['runs'] if r['run_id'] == 'chat-old')
    assert row['topic_id'] == topic and row['owned_by_panel']
    assert row['label'] == 'Chat · ' + app.topic(topic)['title']


def test_backup_is_a_separate_script_without_maintenance_wait(panel, tmp_path):
    app, fake = panel
    marker = tmp_path / 'backup'
    app.cfg['routines']['backup'] = {'argv': [sys.executable, '-c', 'from pathlib import Path; Path(' + repr(str(marker)) + ').touch()']}
    fake.active = 2
    _, op = post(app, '/api/routines/backup', {'request_id': 'backup-only'})
    assert op['steps'][0]['name'] == 'script' and not app.launcher.maintenance()
    with pytest.raises(Problem):
        post(app, '/api/routines/daily_update', {'request_id': 'concurrent-update'})
    assert wait_routine(app, op)['status'] == 'succeeded'
    assert marker.exists()
    assert next(r for r in app.readers.routines()['routines'] if r['name'] == 'backup')['label'] == 'Save OneDrive'


def test_chat_api_helper_uses_real_http_csrf_and_existing_reply_pipeline(panel):
    app, _ = panel
    app.mail.publish(snapshot())
    server = Server(app)
    app.cfg['port'] = app.port
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    loader = importlib.machinery.SourceFileLoader('panel_api_helper', str(Path(__file__).resolve().parents[1] / 'bin/crow-panel-api'))
    module = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))
    loader.exec_module(module)
    try:
        status, mailbox = module.call(app.cfg, '/api/mail')
        assert status == 200
        status, result = module.call(app.cfg, '/api/mail/' + mailbox['items'][0]['id'] + '/reply-all', 'POST', {'instructions': 'Prépare la réponse'})
        assert status == 202 and result['kind'] == 'mail.reply_all', result
        assert len(result['steps']) == 3
        status, denied = module.call(app.cfg, '/api/mail/send', 'POST', {})
        assert status == 404
        with pytest.raises(ValueError):
            module.call(app.cfg, 'https://example.test/api/mail')
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
