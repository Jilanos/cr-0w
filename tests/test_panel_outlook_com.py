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


def test_native_move_undo_and_source_check_use_frozen_ids_without_cdx(panel):
    from test_panel_api import snapshot
    app, fake = panel
    value = snapshot(); value['backend'] = 'outlook_com'
    app.mail.publish(value)
    class Backend:
        def probe(self, **args):
            return {'connected': True, 'folders_resolvable': True}
        def move(self, entry_id, source, target, *args):
            return {'new_message_id': entry_id + '-moved', 'folder_id': target, 'verified': True, 'store_id': 'store'}
    app.mail.com = Backend(); app.cfg['mode'] = 'live'
    row = app.mail.raw()['items'][0]
    target = next(f['id'] for f in app.mail.folders()['folders'] if f['allowed_target'])
    plan = app.mail.plan({'snapshot_rev': app.mail.raw()['snapshot_rev'], 'items': [{'message_id': row['id'], 'action': 'move', 'folder_id': target}]})
    op = app.mail.execute({'request_id': 'move', 'plan_id': plan['plan_id'], 'plan_hash': plan['plan_hash'], 'confirm': True}, '/execute')
    calls_before = len(fake.calls)
    app.launcher.tick(); op = app.operation(op['operation_id'])
    assert op['status'] == 'succeeded' and op['undo']['available']
    assert row['id'] not in {r['id'] for r in app.mail.raw()['items']}
    undo = app.mail.undo(op, {'request_id': 'undo'}, '/undo')
    app.launcher.tick(); undo = app.operation(undo['operation_id'])
    assert undo['status'] == 'succeeded'
    restored = next(r for r in app.mail.raw()['items'] if r['id'] == row['id'] + '-moved-moved')
    assert restored['folder_id'] == row['folder_id']
    assert len(fake.calls) == calls_before


def test_native_timeout_never_replays_a_write(panel):
    from test_panel_api import snapshot
    app, _ = panel
    value = snapshot(); value['backend'] = 'outlook_com'; app.mail.publish(value)
    calls = []
    class Backend:
        def probe(self, **args):
            return {'connected': True, 'folders_resolvable': True}
        def move(self, *args):
            calls.append(args)
            raise ComError('timeout', 'Contrôle Outlook requis.', True)
    app.mail.com = Backend(); app.cfg['mode'] = 'live'
    row = app.mail.raw()['items'][0]
    target = next(f['id'] for f in app.mail.folders()['folders'] if f['allowed_target'])
    plan = app.mail.plan({'snapshot_rev': app.mail.raw()['snapshot_rev'], 'items': [{'message_id': row['id'], 'action': 'move', 'folder_id': target}]})
    op = app.mail.execute({'request_id': 'move', 'plan_id': plan['plan_id'], 'plan_hash': plan['plan_hash'], 'confirm': True}, '/execute')
    app.launcher.tick(); app.launcher.tick()
    assert app.operation(op['operation_id'])['status'] == 'unknown' and len(calls) == 1
    assert not app.operation(op['operation_id'])['undo']['available']


def test_backend_switch_requires_sync_and_cannot_use_old_ids(panel):
    from test_panel_api import snapshot
    from crow_panel.core import Problem
    app, _ = panel
    value = snapshot(); value['backend'] = 'outlook_com'; app.mail.publish(value)
    app.cfg['mode'] = 'live'
    with pytest.raises(Problem, match='Synchronise'):
        app.mail.reply(value['items'][0]['id'], {'request_id': 'reply', 'instructions': 'test'}, '/reply')


def test_readback_checks_recipients_quote_cids_and_signature(panel):
    from crow_panel.outlook_pipeline import verify_reply
    app, _ = panel
    app.cfg['mail']['internal_domains'] = ['example.test']
    recipient = {'address': 'colleague@example.test', 'type': 1}
    creation = {'draft_id': 'd', 'to': [recipient], 'cc': [], 'expected_recipients': [recipient],
                'quoted_text': 'Original thread', 'quoted_html': '<div>Original thread</div>'}
    actual = {**creation, 'is_draft': True, 'html': '<div id="crow-reply"><div>Hello,</div><div>Regards,</div><div>Owner</div></div>Original thread',
              'body_text': 'Hello, Regards, Owner Original thread', 'attachments': []}
    expected = {'closing': ['Regards,', 'Owner'], 'external': False, 'cids': [], 'files': []}
    assert all(c['ok'] for c in verify_reply(actual, creation, expected, app.cfg))
    actual['to'] = [{'address': 'other@example.test', 'type': 1}]
    assert not next(c['ok'] for c in verify_reply(actual, creation, expected, app.cfg) if c['name'] == 'recipients')
    actual['body_text'] = 'Hello, Regards, Owner'
    assert not next(c['ok'] for c in verify_reply(actual, creation, expected, app.cfg) if c['name'] == 'quoted_thread')


def test_external_signature_is_configured_locally_and_uses_cid(panel):
    from crow_panel.outlook_pipeline import compose_html, Fragment
    app, _ = panel
    app.cfg['mail'].update(internal_domains=['example.test'], reply_closing_internal=['Regards,', 'Owner'],
        reply_closing_external=['Kind regards'], signature_image='/private/signature.jpg')
    body = '<div style="margin:0">Hello,</div>'
    internal = {'from': {'address': 'colleague@example.test'}}
    html, images, expected = compose_html(body, internal, {}, app.cfg)
    assert not images and not expected['external'] and 'Times New Roman' in html and 'rgb(0,36,81)' in html
    html, images, expected = compose_html(body, internal, {'cc': ['outside@external.test']}, app.cfg)
    assert expected['external'] and html.count('cid:crow-signature') == 1 and len(images) == 1
    for bad in ('<script>bad()</script>', '<p>text</p>', '<div style="line-height:2">bad</div>', '<img src="https://example.test/a.png">'):
        with pytest.raises(ValueError):
            Fragment().feed(bad)


def test_office_metadata_cids_are_not_inline_images(panel):
    from crow_panel.outlook_pipeline import image_sources
    markup = '<html><head><link href="cid:filelist.xml"><link href="cid:editdata.mso"></head><body><img src="cid:actual-image"></body></html>'
    assert image_sources(markup) == ['cid:actual-image']


def test_powershell_quote_preparation_strips_only_automatic_signature(tmp_path):
    import shutil
    if not shutil.which('powershell.exe') or not shutil.which('wslpath'):
        pytest.skip('Windows PowerShell bridge unavailable')
    source = (Path(__file__).resolve().parents[1] / 'bin/crow_panel/outlook_com.ps1').read_text(encoding='utf-8-sig')
    function = source[source.index('function QuotedThread('):source.index('\nfunction InlineCids')]
    script = tmp_path / 'quote.ps1'
    script.write_text(function + '''
$html = '<html><head></head><body><div class="WordSection1"><div><a name="_MailAutoSig">Default closing</a><img src="cid:auto"></div><div><div style="border-top:solid"><p><a name="_MailOriginal">From:</a> Original sender</p></div><p>Original thread</p><img src="cid:original"></div></div></body></html>'
$result = QuotedThread $html
if ($result.Contains('Default closing') -or $result.Contains('cid:auto') -or -not $result.Contains('Original thread') -or -not $result.Contains('cid:original')) { exit 1 }
$result
''', encoding='utf-8-sig')
    path = subprocess.run(['wslpath', '-w', str(script)], capture_output=True, text=True, check=True).stdout.strip()
    result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path], capture_output=True, timeout=20)
    assert result.returncode == 0, result.stderr.decode(errors='replace')


def test_panel_connection_label_and_native_sync_are_distinct_from_routines(panel):
    app, _ = panel
    assert app.mail.connection()['label'] == 'Outlook classique : non ouvert, instantané conservé'
    class Backend:
        def probe(self):
            return {'connected': True, 'folders_resolvable': True}
    app.mail.com = Backend()
    assert app.readers.state()['mail']['connection']['label'] == 'Outlook classique : connecté'
    _, op = app.mutate('POST', '/api/mail/sync', {'request_id': 'outlook-only'})
    assert app.store.get('jobs', op['operation_id'])['kind'] == 'outlook_com'
    assert not any(o['kind'].startswith('routine.') for o in app.store.all('operations'))
    assert any(o['kind'] == 'calendar.sync' for o in app.store.all('operations'))


def test_shared_mailbox_tree_does_not_change_message_source_or_archive(panel):
    from test_panel_api import snapshot
    app, _ = panel
    value = snapshot()
    source = next(f for f in value['folders'] if f['well_known'] == 'inbox')
    archive = next(f for f in value['folders'] if f['well_known'] == 'archive')
    for folder in value['folders']:
        folder['store_id'] = 'primary'
    for row in value['items']:
        row.update(folder_id=source['id'], store_id='primary')
    value['folders'][:0] = [{'id': 'shared-inbox', 'path': 'Shared/Inbox', 'well_known': 'inbox', 'store_id': 'shared'},
                            {'id': 'shared-archive', 'path': 'Shared/Archive', 'well_known': 'archive', 'store_id': 'shared'}]
    app.mail.publish(value)
    plan = app.mail.plan({'snapshot_rev': app.mail.raw()['snapshot_rev'], 'items': [{'message_id': value['items'][0]['id'], 'action': 'archive'}]})
    assert plan['items'][0]['source_folder_id'] == source['id']
    assert plan['items'][0]['folder_id'] == archive['id']


def test_powershell_inline_repair_preserves_bytes_and_remaps_cid(tmp_path):
    import shutil
    if not shutil.which('powershell.exe') or not shutil.which('wslpath'):
        pytest.skip('Windows PowerShell bridge unavailable')
    source = (Path(__file__).resolve().parents[1] / 'bin/crow_panel/outlook_com.ps1').read_text(encoding='utf-8-sig')
    functions = source[source.index('function Attachments('):source.index('\nfunction Summary(')] + source[source.index('function InlineCids('):source.index('\nfunction Tree')]
    script = tmp_path / 'inline.ps1'
    script.write_text('''
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;using System.IO;using System.Collections;using System.Collections.Generic;
public class Accessor { public string Cid=""; public object GetProperty(string key){return Cid;} public void SetProperty(string key,object value){if(key.Contains("3712"))Cid=(string)value;} }
public class Attached { public string FileName; public long Size; public int Type=1; public byte[] Bytes; public Accessor PropertyAccessor=new Accessor(); public Collection Owner; public void SaveAsFile(string dest){File.WriteAllBytes(dest,Bytes);} public void Delete(){Owner.Values.Remove(this);} }
public class Collection:IEnumerable { public List<Attached> Values=new List<Attached>(); public int Count {get{return Values.Count;}} public Attached Item(int i){return Values[i-1];} public Attached Add(string path,int type){var bytes=File.ReadAllBytes(path);var a=new Attached{FileName=Path.GetFileName(path),Size=bytes.Length,Bytes=bytes,Owner=this};Values.Add(a);return a;} public IEnumerator GetEnumerator(){return Values.GetEnumerator();} }
public class Draft { public string HTMLBody; public Collection Attachments=new Collection(); }
'@
''' + functions + '''
$path=Join-Path $PSScriptRoot 'image.png'
[IO.File]::WriteAllBytes($path,[byte[]]@(1,2,3,4,5))
$source=New-Object Draft; $source.HTMLBody='<img src="cid:source">'
$a=$source.Attachments.Add($path,1);$a.PropertyAccessor.Cid='source'
$draft=New-Object Draft
PreserveInline $source $draft '<img src="cid:quoted">'
if($draft.Attachments.Count -ne 1 -or $draft.Attachments.Item(1).PropertyAccessor.Cid -ne 'quoted' -or $draft.Attachments.Item(1).Size -ne 5 -or $draft.Attachments.Item(1).Bytes[4] -ne 5){exit 1}
''', encoding='utf-8-sig')
    path = subprocess.run(['wslpath', '-w', str(script)], capture_output=True, text=True, check=True).stdout.strip()
    result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path], capture_output=True, timeout=20)
    assert result.returncode == 0, result.stderr.decode(errors='replace')


def test_deleted_descendants_are_visible_but_not_filing_destinations(panel):
    from test_panel_api import snapshot
    app, _ = panel
    value = snapshot()
    value['folders'] += [{'id': 'deleted', 'path': 'Deleted', 'well_known': 'deleteditems'},
                         {'id': 'deleted-child', 'path': 'Deleted/Old', 'parent_id': 'deleted'},
                         {'id': 'inbox-child', 'path': 'Inbox/Project', 'parent_id': next(f['id'] for f in value['folders'] if f['well_known'] == 'inbox')}]
    app.mail.publish(value)
    folders = {f['id']: f for f in app.mail.folders()['folders']}
    assert not folders['deleted-child']['allowed_target'] and folders['inbox-child']['allowed_target']


def test_fast_native_sync_publishes_without_starting_a_model(panel):
    from test_panel_api import snapshot
    app, fake = panel
    value = snapshot()
    for row in value['items']:
        row['proposal'] = None
    class Backend:
        options = {}
        def probe(self):
            return {'connected': True, 'folders_resolvable': True}
        def call(self, action, **args):
            if action == 'folders':
                return {'folders': value['folders'], 'folders_complete': True}
            if action == 'inbox':
                return {k: value[k] for k in ('items', 'coverage', 'exhausted')}
            if action == 'drafts':
                return {'items': []}
            raise AssertionError(action)
        def scan_history(self, folders):
            return {'folders': []}
        def conversation(self, *args):
            return {'items': [], 'complete': True}
    app.mail.com = Backend()
    op = app.mail.collect('mail.sync', {'request_id': 'fast', 'fast': True}, '/sync')
    before = len(fake.calls)
    app.launcher.tick(); op = app.operation(op['operation_id'])
    assert op['status'] == 'succeeded' and op['result']['published']
    assert len(fake.calls) == before and len(op['steps']) == 1
    assert all(row['proposal'] is None for row in app.mail.raw()['items'])
