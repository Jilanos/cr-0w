import copy
import datetime as dt
import json

from test_panel_api import panel, snapshot


def test_full_nested_tree_survives_failed_refresh_and_expiry(panel):
    app, _ = panel
    value = snapshot()
    value.update(folders_complete=True)
    value['folders'] += [
        {'id': 'parent', 'path': 'Projects', 'well_known': None},
        {'id': 'child', 'path': 'Projects/Études', 'parent_id': 'parent', 'well_known': None},
        {'id': 'deep', 'path': 'Projects/Études/Phase 2', 'parent_id': 'child', 'well_known': None},
    ]
    app.mail.publish(value)
    tree = app.mail.folders()
    assert tree['complete'] and not tree['stale']
    leaf = next(f for f in tree['folders'] if f['id'] == 'deep')
    assert leaf['parent_id'] == 'child' and leaf['depth'] == 2 and leaf['allowed_target']
    cache = app.cfg.state / 'mail/folders.json'
    stored = json.loads(cache.read_text())
    assert cache.stat().st_mode & 0o777 == 0o600
    stored['expires_at'] = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=1)).isoformat()
    cache.write_text(json.dumps(stored))
    assert app.mail.folders()['stale']
    failed = copy.deepcopy(value)
    failed.update(folders_complete=False, folders=value['folders'][:1])
    app.mail.publish(failed)
    assert len(app.mail.folders()['folders']) == len(value['folders'])
    assert app.mail.folders()['stale']
    app.mail.publish(value)
    assert not app.mail.folders()['stale']


def test_sync_forces_folder_refresh_even_with_fresh_cache(panel):
    app, _ = panel
    app.mail.collect('mail.sync', {'request_id': 'tree'}, '/sync')
    prompt = app.store.all('jobs')[0]['prompt']
    assert 'regardless of its cache TTL' in prompt and 'parent_id' in prompt
