import copy
import datetime as dt
import json
from pathlib import Path

import pytest

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


def destinations(app):
    app.mail.publish(snapshot())
    return [f for f in app.mail.folders()['folders'] if f['allowed_target']]


def scan(folder, messages, **extra):
    return {'folder_id': folder, 'messages': messages, 'complete': True, 'reset': True, 'watermark': '2026-11-18T08:00:00+00:00', **extra}


def filed(i, sender='contact@example.test', conversation='thread'):
    return {'id': str(i), 'sender': sender, 'conversation_id': conversation}


def message(**extra):
    return {'id': 'inbox-message', 'conversation_id': 'thread', 'from': {'address': 'contact@example.test'}, **extra}


def test_conversation_precedes_sender_and_uses_other_messages_only(panel):
    app, _ = panel
    folders = destinations(app)
    first, second = folders[:2]
    app.mail.update_history({'folders': [scan(first['id'], [filed('old')]),
        scan(second['id'], [filed(i, conversation='other') for i in range(8)])]}, folders)
    proposal = app.mail.deterministic_proposal(message(), folders)
    assert proposal['source'] == 'conversation' and proposal['folder_id'] == first['id']
    assert proposal['reason'] == '1 mails de cet échange dans ' + first['path']
    assert proposal['confidence'] == 'high'
    assert app.mail.deterministic_proposal(message(folder_id=first['id']), folders) is None
    only_self = [scan(first['id'], [filed('inbox-message')]), scan(second['id'], [])]
    app.mail.update_history({'folders': only_self}, folders)
    assert app.mail.deterministic_proposal(message(), folders) is None


def test_sender_domain_thresholds_ambiguity_and_system_exclusion(panel):
    app, _ = panel
    folders = destinations(app)
    first, second = folders[:2]
    app.mail.update_history({'folders': [scan(first['id'], [filed(i, conversation=None) for i in range(2)])]}, folders)
    assert app.mail.deterministic_proposal(message(), folders) is None
    app.mail.update_history({'folders': [scan(first['id'], [filed(i, conversation=None) for i in range(5)])]}, folders)
    p = app.mail.deterministic_proposal(message(), folders)
    assert p['source'] == 'sender' and p['confidence'] == 'high'
    app.mail.update_history({'folders': [scan(first['id'], [filed(i, sender=f'user{i}@example.test', conversation=None) for i in range(6)])]}, folders)
    assert app.mail.deterministic_proposal(message(), folders)['source'] == 'domain'
    app.mail.update_history({'folders': [scan(second['id'], [filed('other'+str(i), sender=f'user{i}@example.test', conversation=None) for i in range(6)])]}, folders)
    assert app.mail.deterministic_proposal(message(), folders) is None
    inbox = next(f for f in app.mail.folders()['folders'] if f['well_known'] == 'inbox')
    app.mail.update_history({'folders': [scan(inbox['id'], [filed('system')])]}, app.mail.folders()['folders'])
    assert 'system' not in app.mail.history()['messages']


def test_incremental_history_is_private_idempotent_and_recovers_partial_scan(panel):
    app, _ = panel
    folders = destinations(app)
    first = folders[0]['id']
    initial = {'folders': [scan(first, [filed('one'), filed('two')])]}
    app.mail.update_history(initial, folders)
    app.mail.update_history(initial, folders)
    assert len(app.mail.history()['messages']) == 2
    app.mail.update_history({'folders': [scan(first, [filed('three')], reset=False, complete=False, watermark='bad')]}, folders)
    assert set(app.mail.history()['messages']) == {'one', 'two', 'three'}
    assert app.mail.history()['folders'][first]['watermark'] != 'bad'
    app.mail.update_history({'folders': [scan(first, [filed('three')], reset=False, deleted_ids=['one'])]}, folders)
    assert set(app.mail.history()['messages']) == {'two', 'three'}
    app.mail.update_history({'folders': [scan(first, [filed('three')])]}, folders)
    assert set(app.mail.history()['messages']) == {'three'}
    assert app.mail.history_path.stat().st_mode & 0o777 == 0o600
    assert set(app.mail.history()['messages']['three']) == {'id', 'folder_id', 'conversation_id', 'sender'}
    app.mail.update_history({'folders': []}, [])
    assert app.mail.history()['messages'] == {}


def test_rules_reference_markdown_and_precede_fallback(panel, tmp_path):
    app, _ = panel
    rule = 'Archive subscription receipts.'
    path = tmp_path / 'rules.md'
    path.write_text(rule)
    app.cfg['mail'].update(triage_rules=str(path), filing_rules=[{'rule': rule, 'match': {'subject_contains': ['abonnement']}, 'action': 'archive'}])
    value = snapshot()
    row = value['items'][0]
    row.update(subject='Reçu ABONNEMENT', conversation_id=None, proposal={'action': 'keep', 'confidence': 'low', 'reason': 'fallback'})
    app.mail.publish(value)
    p = app.mail.find(row['id'])['proposal']
    assert p['source'] == 'rules' and p['action'] == 'archive' and rule in p['reason']
    path.write_text('The rule was withdrawn.')
    app.mail.publish(value)
    assert app.mail.find(row['id'])['proposal']['source'] == 'llm'


def test_fallback_cannot_override_history_or_invent_folders_and_caps_confidence(panel):
    app, _ = panel
    value = snapshot()
    value['history'] = {'folders': [scan(value['folders'][2]['id'], [filed('filed', conversation=value['items'][0]['conversation_id'])])]}
    for row in value['items']:
        row['proposal'] = None
    app.mail.publish(value)
    protected = value['items'][0]['id']
    op = app.store.operation('mail.sync', {'request_id': 'fallback'}, 'sync')
    assert app.mail.queue_proposals(op)
    job = app.store.get('jobs', op['operation_id'])
    assert protected not in job['candidate_ids']
    assert all(f['path'] in job['prompt'] for f in app.mail.folders()['folders'])
    output = {'items': [{'id': i, 'proposal': {'action': 'move', 'folder_id': value['folders'][2]['id'], 'source': 'rules', 'reason': 'fallback', 'confidence': 'high'}} for i in job['candidate_ids']]}
    app.mail.apply_proposals(job, output)
    assert app.mail.find(protected)['proposal']['source'] == 'conversation'
    for i in job['candidate_ids']:
        assert app.mail.find(i)['proposal']['source'] == 'llm'
        assert app.mail.find(i)['proposal']['confidence'] == 'medium'
    assert app.mail.normalized_proposal({'action': 'move', 'folder_id': 'invented', 'confidence': 'high'}, {f['id']: f for f in app.mail.folders()['folders']}) is None
    with pytest.raises(ValueError):
        app.mail.apply_proposals(job, output)


def test_sync_stages_fallback_batches_after_history(panel, monkeypatch):
    app, _ = panel
    app.cfg['mail']['proposals_per_sync'] = 2
    monkeypatch.setattr(app.mail, 'transcript_ok', lambda *a, **k: True)
    op = app.mail.collect('mail.sync', {'request_id': 'pipeline'}, '/sync')
    job = app.store.get('jobs', op['operation_id'])
    value = snapshot()
    value['history'] = {'folders': []}
    for row in value['items']:
        row['proposal'] = None
    Path(job['output']).parent.mkdir(parents=True, exist_ok=True)
    Path(job['output']).write_text(json.dumps(value))
    op['status'] = 'succeeded'
    app.mail.complete(op, job, {}, '')
    assert op['status'] == 'queued' and op['steps'][-1]['name'] == 'propose'
    seen = set()
    while op['status'] == 'queued':
        job = app.store.get('jobs', op['operation_id'])
        seen.update(job['candidate_ids'])
        Path(job['output']).write_text(json.dumps({'items': [{'id': i, 'proposal': {'action': 'keep', 'confidence': 'low', 'reason': 'Needs review'}} for i in job['candidate_ids']]}))
        op['status'] = 'succeeded'
        app.mail.complete(op, job, {}, '')
    assert op['status'] == 'succeeded' and len(seen) == len(value['items'])
    assert op['result']['proposals']['llm'] == len(value['items'])


def test_learning_starts_on_confirmation_is_weighted_durable_and_isolated(panel):
    from crow_panel.mail import Mail
    app, _ = panel
    folders = destinations(app)
    row = app.mail.raw()['items'][0]
    target = next(f for f in folders if f['id'] != (row.get('proposal') or {}).get('folder_id'))
    plan = app.mail.plan({'snapshot_rev': app.mail.raw()['snapshot_rev'], 'items': [{'message_id': row['id'], 'action': 'move', 'folder_id': target['id']}]})
    assert not app.mail.feedback_path.exists()
    confirmation = {'plan_id': plan['plan_id'], 'plan_hash': plan['plan_hash'], 'confirm': True, 'request_id': 'corrected'}
    op = app.mail.execute(confirmation, '/execute')
    saved = json.loads(app.mail.feedback_path.read_text())
    assert len(saved) == 1 and next(iter(saved.values()))['weight'] == 5
    app.mail.record_choices(plan, op['operation_id'])
    assert len(json.loads(app.mail.feedback_path.read_text())) == 1
    restarted = Mail(app.cfg, app.store, app.launcher)
    proposal = restarted.deterministic_proposal(message(conversation_id=None, **{'from': row['from']}), folders)
    assert proposal['source'] == 'sender' and proposal['folder_id'] == target['id']
    assert app.mail.folders()['recent_targets'][0] == target['id']
    assert app.mail.feedback_path.stat().st_mode & 0o777 == 0o600
    app.cfg['mode'] = 'live'
    assert not app.mail.feedback_path.exists()
    assert app.mail.deterministic_proposal(message(conversation_id=None, **{'from': row['from']}), folders) is None


def test_unchanged_choice_is_not_a_correction_and_undo_retracts_learning(panel):
    app, _ = panel
    folders = destinations(app)
    row = next(r for r in app.mail.raw()['items'] if (r.get('proposal') or {}).get('folder_id'))
    suggested = row['proposal']['folder_id']
    same = {'items': [{'message_id': row['id'], 'folder_id': suggested, 'learning': {'sender': row['from']['address'], 'suggested_folder_id': suggested}}]}
    app.mail.record_choices(same, 'same')
    assert json.loads(app.mail.feedback_path.read_text()) == {}
    target = next(f['id'] for f in folders if f['id'] != suggested)
    plan = app.mail.plan({'snapshot_rev': app.mail.raw()['snapshot_rev'], 'items': [{'message_id': row['id'], 'action': 'move', 'folder_id': target}]})
    op = app.mail.execute({'request_id': 'correct-and-undo', 'plan_id': plan['plan_id'], 'plan_hash': plan['plan_hash'], 'confirm': True}, '/execute')
    app.launcher.tick()
    op = app.operation(op['operation_id'])
    assert op['status'] == 'succeeded'
    undo = app.mail.undo(op, {'request_id': 'undo-correction'}, '/undo')
    app.launcher.tick()
    assert app.operation(undo['operation_id'])['status'] == 'succeeded'
    assert json.loads(app.mail.feedback_path.read_text()) == {}


def test_com_capability_requires_readonly_folder_resolution(panel):
    app, _ = panel
    app.cfg['mode'] = 'live'
    class Backend:
        def probe(self):
            return {'connected': True, 'folders_resolvable': self.resolved}
    app.mail.com = Backend()
    app.mail.com.resolved = False
    with pytest.raises(Exception):
        app.mail.require('mail_move')
    app.mail.com.resolved = True
    for name in ('mail_move', 'mail_archive', 'mail_triage_undo'):
        app.mail.require(name)


def test_connector_owner_trial_requires_schema_guard_and_single_message(panel):
    app, _ = panel
    app.cfg['mode'] = 'live'
    proof = {'mail_move': {'schema': {'ok': True}}, 'tool_deny_passthrough':
             {k: {'ok': True} for k in ('schema', 'headless_probe', 'permissions')}}
    path = app.cfg.state / 'capabilities.json'
    path.write_text(json.dumps(proof))
    assert not app.mail.connector_trial({}, [{}])
    assert not app.mail.connector_trial({'owner_trial': True}, [{}, {}])
    assert app.mail.connector_trial({'owner_trial': True}, [{}])
    proof['tool_deny_passthrough']['permissions']['ok'] = None
    path.write_text(json.dumps(proof))
    assert not app.mail.connector_trial({'owner_trial': True}, [{}])


def test_connector_proof_only_after_successful_confirmed_roundtrip(panel):
    app, _ = panel
    app.cfg['mode'] = 'live'
    original = app.store.operation('mail.triage.execute', {'request_id': 'trial'}, 'trial')
    original['status'] = 'succeeded'
    app.store.save_op(original)
    undo = app.store.operation('mail.triage.undo', {'request_id': 'undo'}, 'undo')
    undo.update(status='unknown', items=[{'status': 'succeeded'}])
    manifest = {'undoes': original['operation_id'], 'owner_trial': True}
    app.mail.record_connector_trial(undo, manifest)
    assert not (app.cfg.state / 'capabilities.json').exists()
    undo['status'] = 'succeeded'
    app.mail.record_connector_trial(undo, manifest)
    proof = json.loads((app.cfg.state / 'capabilities.json').read_text())
    assert all(proof[n]['live_trial']['undo_operation_id'] == undo['operation_id']
               for n in ('mail_move', 'mail_archive', 'mail_triage_undo'))
