import json
from pathlib import Path
import subprocess
from types import SimpleNamespace

import pytest

from test_panel_api import panel
from crow_panel.outlook_com import ComError, OutlookCom


def test_transport_uses_json_file_utf8_and_fixed_argv(panel, monkeypatch):
    app, _ = panel
    seen = []
    def runner(argv, **kwargs):
        path = Path(argv[-1])
        seen.append(path)
        payload = json.loads(path.read_text())
        assert payload['entry_id'] == 'é; $(exit) `oops`'
        assert payload['action'] == 'body'
        assert kwargs['encoding'] == 'utf-8' and kwargs['timeout'] > 0
        assert '-Command' not in argv
        return SimpleNamespace(returncode=0, stdout='\ufeff{"ok":true,"result":{"body_text":"été"}}')
    bridge = OutlookCom(app.cfg, runner)
    monkeypatch.setattr(bridge, 'windows_path', str)
    assert bridge.body('é; $(exit) `oops`')['body_text'] == 'été'
    assert not seen[0].exists()
    with pytest.raises(ValueError):
        bridge.call('unknown')


@pytest.mark.parametrize('action,uncertain', [('body', False), ('move', True), ('reply_all', True)])
def test_timeout_is_not_retried_and_marks_writes_uncertain(panel, monkeypatch, action, uncertain):
    app, _ = panel
    calls = []
    def runner(argv, **kwargs):
        calls.append(argv)
        raise subprocess.TimeoutExpired(argv, 1)
    bridge = OutlookCom(app.cfg, runner)
    monkeypatch.setattr(bridge, 'windows_path', str)
    with pytest.raises(ComError) as error:
        bridge.call(action)
    assert error.value.uncertain is uncertain and len(calls) == 1
    assert not list((app.cfg.state / 'mail/com-requests').glob('*.json'))


def test_history_cap_checkpoint_and_periodic_sweep(panel, monkeypatch):
    app, _ = panel
    app.cfg['mail']['outlook_com'] = {'history_scan_cap': 1}
    bridge = OutlookCom(app.cfg)
    calls = []
    def call(action, **args):
        calls.append(args)
        return {'messages': [{'id': 'm', 'sender': 'a@example.test', 'conversation_id': 'c'}], 'scanned': 1,
                'complete': True, 'cursor': {'modified': '2026-11-18T01:00:00+00:00', 'ids': ['m'], **args['cursor']}}
    monkeypatch.setattr(bridge, 'call', call)
    folders = [{'id': 'f', 'allowed_target': True}, {'id': 'g', 'allowed_target': True}]
    value = bridge.scan_history(folders)
    assert len(calls) == 1 and calls[0]['limit'] == 1
    assert value['folders'][0]['messages'][0]['id'] == 'm'
    bridge.scan_history(folders)
    assert calls[1]['folder_id'] == 'g'
    saved = json.loads((app.cfg.state / 'mail/com-history.json').read_text())
    assert set(saved['checkpoints']) == {'f', 'g'}
