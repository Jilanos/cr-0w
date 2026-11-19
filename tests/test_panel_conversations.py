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
