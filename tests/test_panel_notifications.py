import base64
import datetime as dt
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

import pytest

from test_panel_api import panel
from crow_panel.core import Config
from crow_panel.notifications import Notifications, WindowsToast


START = dt.datetime(2026, 11, 20, 12, tzinfo=dt.timezone.utc)


def monitor(app):
    app.cfg['notifications']['enabled'] = True
    sent, runs, pending = [], [], []
    app.readers.runs = lambda *_: {'runs': runs, 'source_status': {'cdx_runs': 'ok', 'registry': 'ok'}}
    app.pending.view = lambda: {'sections': [{'kind': 'followups', 'items': pending}]}
    app.notifications.send = sent.append
    return app.notifications, sent, runs, pending


def test_default_disabled_has_no_reads_or_processes(panel):
    app, fake = panel
    fake.calls.clear()
    app.notifications.send = lambda *_: pytest.fail('disabled notification')
    app.notifications.tick(START)
    assert not fake.calls
    assert app.store.get('meta', 'notifications') is None
    assert not app.get('/api/notifications', {})['enabled']
    example = Path(__file__).resolve().parents[1] / 'docs/panel.example.yaml'
    assert Config(example)['notifications']['enabled'] is False


def test_initial_backlog_silent_then_aggregates_and_survives_restart(panel):
    app, _ = panel
    notifier, sent, runs, pending = monitor(app)
    runs.append({'run_id': 'historical', 'status': 'succeeded', 'ended_at': (START - dt.timedelta(hours=1)).isoformat()})
    pending.append({'id': 'old', 'due': '2026-11-19'})
    notifier.tick(START)
    assert not sent
    runs.extend({'run_id': str(n), 'status': 'running'} for n in range(50))
    notifier.tick(START + dt.timedelta(seconds=30))
    for row in runs[1:]:
        row.update(status='failed', ended_at=(START + dt.timedelta(seconds=40)).isoformat())
    pending.extend({'id': str(n), 'due': '2026-11-19'} for n in range(40))
    notifier.tick(START + dt.timedelta(seconds=60))
    assert sent == ['50 runs terminés. 40 échéances dépassées. Ouvre le panneau local.']
    restarted = Notifications(app, sent.append)
    restarted.tick(START + dt.timedelta(hours=1))
    assert len(sent) == 1
    assert restarted.status()['last_status'] == 'accepted'


def test_cooldown_queues_events_across_restart_and_sends_one_batch(panel):
    app, _ = panel
    notifier, sent, runs, pending = monitor(app)
    notifier.tick(START)
    runs.append({'run_id': 'first', 'status': 'succeeded', 'ended_at': (START + dt.timedelta(seconds=20)).isoformat()})
    notifier.tick(START + dt.timedelta(seconds=30))
    pending.extend({'id': str(n), 'due': '2026-11-19'} for n in range(5))
    notifier.tick(START + dt.timedelta(seconds=60))
    assert notifier.status()['queued']['overdue'] == 5 and len(sent) == 1
    restarted = Notifications(app, sent.append)
    restarted.tick(START + dt.timedelta(seconds=90))
    assert len(sent) == 1
    restarted.tick(START + dt.timedelta(seconds=150))
    assert sent[1] == '5 échéances dépassées. Ouvre le panneau local.'
    assert restarted.status()['queued'] == {'runs': 0, 'overdue': 0}


def test_due_today_becomes_overdue_once_then_snoozed_date_can_notify(panel):
    app, _ = panel
    notifier, sent, _, pending = monitor(app)
    pending.append({'id': 'item', 'due': '2026-11-20'})
    notifier.tick(START)
    assert not sent
    notifier.tick(START + dt.timedelta(days=1))
    notifier.tick(START + dt.timedelta(days=1, minutes=5))
    assert sent == ['1 échéance dépassée. Ouvre le panneau local.']
    pending[0]['due'] = '2026-11-22'
    notifier.tick(START + dt.timedelta(days=2))
    assert len(sent) == 1
    notifier.tick(START + dt.timedelta(days=3))
    assert len(sent) == 2


def test_done_sections_and_unknown_runs_do_not_notify(panel):
    app, _ = panel
    notifier, sent, runs, _ = monitor(app)
    notifier.tick(START)
    app.pending.view = lambda: {'sections': [{'kind': 'done', 'items': [{'id': 'done', 'due': '2026-11-19'}]}]}
    runs.append({'run_id': 'uncertain', 'status': 'unknown'})
    notifier.tick(START + dt.timedelta(seconds=30))
    assert not sent


def test_source_outage_then_old_runs_reappear_without_a_storm(panel):
    app, _ = panel
    notifier, sent, _, _ = monitor(app)
    app.readers.runs = lambda *_: {'runs': [], 'source_status': {'cdx_runs': 'unavailable', 'registry': 'ok'}}
    notifier.tick(START)
    assert 'indisponibles' in notifier.status()['source_error']
    app.readers.runs = lambda *_: {'runs': [{'run_id': 'old', 'status': 'succeeded', 'ended_at': (START - dt.timedelta(days=1)).isoformat()}], 'source_status': {'cdx_runs': 'ok', 'registry': 'ok'}}
    notifier.tick(START + dt.timedelta(seconds=30))
    assert not sent and notifier.status()['source_error'] is None


@pytest.mark.parametrize('failure', [OSError('unavailable'), subprocess.TimeoutExpired('powershell.exe', 15)])
def test_native_failure_is_recorded_and_never_retried(panel, failure):
    app, _ = panel
    notifier, sent, _, pending = monitor(app)
    notifier.tick(START)
    def fail(text):
        sent.append(text)
        # The event is consumed durably before a possibly uncertain system call.
        assert notifier.state()['queued'] == {'runs': 0, 'overdue': 0}
        assert notifier.state()['last_status'] == 'attempting'
        raise failure
    notifier.send = fail
    pending.append({'id': 'item', 'due': '2026-11-19'})
    notifier.tick(START + dt.timedelta(seconds=30))
    assert notifier.status()['last_status'] == 'failed'
    for n in range(1, 4):
        Notifications(app, fail).tick(START + dt.timedelta(hours=n))
    assert len(sent) == 1


def test_configured_event_switches_and_poll_interval(panel):
    app, _ = panel
    notifier, sent, runs, pending = monitor(app)
    app.cfg['notifications']['run_finished'] = False
    app.readers.runs = lambda *_: pytest.fail('runs disabled')
    notifier.tick(START)
    pending.append({'id': 'new', 'due': '2026-11-19'})
    notifier.tick(START + dt.timedelta(seconds=10))
    assert not sent
    notifier.tick(START + dt.timedelta(seconds=30))
    assert len(sent) == 1


@pytest.mark.parametrize('source', ['runs', 'pending'])
def test_one_failed_source_preserves_the_other_and_the_queue(panel, source):
    app, _ = panel
    notifier, sent, runs, pending = monitor(app)
    notifier.tick(START)
    def fail(*_):
        raise OSError('unavailable')
    if source == 'runs':
        app.readers.runs = fail
        pending.append({'id': 'overdue', 'due': '2026-11-19'})
    else:
        app.pending.view = fail
        runs.append({'run_id': 'finished', 'status': 'succeeded', 'ended_at': (START + dt.timedelta(seconds=20)).isoformat()})
    notifier.tick(START + dt.timedelta(seconds=30))
    assert len(sent) == 1 and notifier.status()['source_error']
    notifier.tick(START + dt.timedelta(hours=1))
    assert len(sent) == 1


def test_interrupted_delivery_is_uncertain_and_consumed(panel):
    app, _ = panel
    notifier, sent, _, _ = monitor(app)
    state = notifier.state()
    state.update(last_status='attempting', last_attempt_at=START.isoformat(), queued={'runs': 0, 'overdue': 0})
    app.store.put('meta', 'notifications', state)
    restarted = Notifications(app, sent.append)
    assert restarted.status()['last_status'] == 'unknown'
    restarted.tick(START + dt.timedelta(hours=1))
    assert not sent


def test_powershell_content_is_encoded_xml_and_runs_without_shell(panel, monkeypatch):
    app, _ = panel
    app.cfg['notifications']['app_id'] = "example'; unsafe"
    sender = WindowsToast(app.cfg)
    text = "<value> & 'quote' $(command)"
    argv = sender.argv(text)
    assert argv[:4] == ['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand']
    script = base64.b64decode(argv[-1]).decode('utf-16-le')
    assert text not in script and "example'; unsafe" not in script
    encoded = re.search(r"FromBase64String\('([^']+)'\)", script)[1]
    payload = json.loads(base64.b64decode(encoded))
    xml = ET.fromstring(payload['xml'])
    assert xml.find('visual/binding/text[2]').text == text
    assert xml.find('audio').get('silent') == 'true'
    assert payload['app_id'] == "example'; unsafe"
    def run(args, **kwargs):
        assert args == argv and not kwargs.get('shell') and kwargs['timeout'] == 15
        assert kwargs['env']['HOME'] == app.cfg['real_home']
        return subprocess.CompletedProcess(args, 0, 'accepted\n', '')
    monkeypatch.setattr(subprocess, 'run', run)
    sender.send(text)


@pytest.mark.parametrize('options', [False, {'enabled': 'false'}, {'poll_seconds': 0}, {'min_interval_seconds': 1}, {'app_id': []}, {'powershell_exe': ''}])
def test_notification_config_validation(options):
    with pytest.raises(ValueError):
        Config(overrides={'notifications': options})
