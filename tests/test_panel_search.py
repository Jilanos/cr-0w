import copy
import datetime as dt
import json

import pytest

from test_panel_api import panel, snapshot
from crow_panel.core import Problem, atomic, canonical


def search(app, text, **params):
    return app.get('/api/search', {'q': [text], **{k: [v] for k, v in params.items()}})


def test_search_groups_accents_all_words_and_exact_targets(panel, tmp_path):
    app, fake = panel
    mail = snapshot()
    mail['items'][0]['subject'] = 'Échéance Example'
    app.mail.publish(mail)
    root = tmp_path / 'afk'
    root.mkdir()
    app.cfg['afk_dir'] = str(root)
    (root / ('decisions-' + dt.date.today().isoformat() + '.md')).write_text('## 1. Example choice?\n- Option: Tomorrow\n')
    result = search(app, 'example')
    groups = {g['kind']: g for g in result['groups']}
    assert groups['mail']['items'][0]['view'] == 'mail'
    assert groups['pending']['items'][0]['view'] == 'pending'
    assert groups['decision']['items'][0]['key'] == 'afk:1'
    assert set(groups) == {'mail', 'pending', 'decision', 'dossier', 'run', 'conversation'}
    assert search(app, 'EXAMPLE echeance')['groups'][0]['total'] == 1
    assert not any(g['total'] for g in search(app, 'echeance missing')['groups'])
    assert all(call[1] in ('runs',) for call in fake.calls)


def test_search_mail_beyond_first_page_bounded_results_and_no_bodies(panel):
    app, _ = panel
    value = snapshot()
    first = value['items'][0]
    value['items'] = [{**copy.deepcopy(first), 'id': 'm_' + str(n), 'subject': 'needle ' + str(n)} for n in range(1300)]
    value['coverage']['collected'] = 1300
    app.mail.publish(value)
    assert len(app.mail.list({})['items']) == 50
    result = search(app, 'needle', limit='3')['groups'][0]
    assert result['total'] == 1300 and len(result['items']) == 3
    hit = search(app, 'needle 1299')['groups'][0]['items'][0]
    opened = app.get('/api/mail', {'id': [hit['key']]})
    assert opened['items'][0]['id'] == 'm_1299' and opened['next_cursor'] is None
    assert 'body_text' not in canonical(result)


def test_search_runs_registry_when_cdx_unavailable_and_dossier(panel):
    app, fake = panel
    pending = app.pending.path
    pending.write_text(pending.read_text() + '\n## Dossiers\n### Needle project\n- Review spec\n')
    record = {'run_id': 'old-run', 'label': 'Needle run', 'started_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'status': 'failed'}
    atomic(app.cfg['runs_registry'], json.dumps(record) + '\n')
    fake.unavailable = True
    result = search(app, 'needle')
    assert result['groups'][3]['items'][0]['view'] == 'dossiers'
    assert result['groups'][4]['items'][0]['key'] == 'run:old-run'
    assert result['sources']['runs']['cdx_runs'] == 'unavailable'
    assert app.readers.run('old-run')['label'] == 'Needle run'


@pytest.mark.parametrize('query', [{'q': ['x' * 201]}, {'q': ['x'], 'limit': ['0']}, {'q': ['x'], 'limit': ['51']}])
def test_search_invalid_input(panel, query):
    app, _ = panel
    with pytest.raises(Problem) as error:
        app.get('/api/search', query)
    assert error.value.status == 400


def test_search_empty_has_no_external_reads(panel):
    app, fake = panel
    fake.calls.clear()
    assert not any(g['total'] for g in search(app, '  ')['groups'])
    assert not fake.calls
