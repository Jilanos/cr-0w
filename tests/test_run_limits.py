"""Account limits are shared by CLI dispatch and queued panel model steps."""
import json
import threading

import pytest

from test_panel_api import panel, pending_item, post
from crow_limits import available, load, normalize, slots
from crow_panel.core import Config
from test_crow_runs_mission import cr, fake, args

LIMITS = {'claude': 3, 'worka': 1, 'workb': 1, 'total': 5}


def rows(**counts):
    return [{'run_id': name + str(n), 'session': name, 'status': 'running', 'cwd': '/other'}
            for name, count in counts.items() for n in range(count)]


def test_total_fallback_and_override(tmp_path, monkeypatch):
    assert normalize({}, {}) == {'total': 5}
    assert normalize({'max_parallel': 2}, {})['total'] == 2
    assert normalize({}, {'CROW_MAX_RUNS': '4'})['total'] == 4
    assert normalize({'max_parallel': 2, 'limits': LIMITS}, {'CROW_MAX_RUNS': 'bad'}) == LIMITS
    path = tmp_path / 'panel.yaml'
    path.write_text('max_parallel: 2\nlimits: {claude: 3, worka: 1, workb: 1, total: 5}\n')
    monkeypatch.setenv('CROW_PANEL_CONFIG', str(path))
    assert load(tmp_path) == LIMITS
    cfg = Config(path)
    assert cfg['limits'] == LIMITS and cfg['max_parallel'] == 5
    assert normalize({'accounts': {'a': {'provider': 'claude'}, 'b': {'provider': 'codex'}}}, {}) == {'a': 3, 'b': 1, 'total': 5}


@pytest.mark.parametrize('value', [None, [], 3, {'total': 0}, {'total': None}, {'worka': -1}, {'workb': True}, {'claude': 1.5}, {'total': '5'}])
def test_invalid_limits_rejected(value):
    with pytest.raises(ValueError):
        normalize({'limits': value}, {})


def test_registry_metadata_dedup_and_terminal_rows():
    live = rows(claude=1, workb=1) + [{'run_id': 'legacy'}, {'run_id': 'done', 'status': 'succeeded'}, {'run_id': 'ended', 'ended_at': 'today'}]
    usage = slots(live + live, LIMITS, [{'run_id': 'legacy', 'account': 'worka'}, {'run_id': 'stale', 'account': 'claude'}])
    assert usage['busy'] == 3 and usage['unknown'] == 0
    assert usage['accounts'] == {name: {'busy': 1, 'max': cap} for name, cap in LIMITS.items() if name != 'total'}
    assert available('claude', usage, LIMITS)
    assert not available('worka', usage, LIMITS)
    assert not available('workb', usage, LIMITS)
    assert available('claude', slots(rows(claude=1) + [{'run_id': 'unknown'}], LIMITS), LIMITS)
    assert not available('worka', slots([{'run_id': 'unknown'}], LIMITS), LIMITS)


def test_every_account_and_total_capacity():
    full = slots(rows(claude=3, worka=1, workb=1), LIMITS)
    assert full['busy'] == 5
    assert all(not available(name, full, LIMITS) for name in ('claude', 'worka', 'workb'))
    assert not available('claude', slots(rows(claude=3), LIMITS), LIMITS)
    assert available('workb', slots(rows(claude=3, worka=1), LIMITS), LIMITS)
    tight = {**LIMITS, 'total': 2}
    assert not available('claude', slots(rows(worka=1, workb=1), tight), tight)


def test_queue_skips_saturated_account_and_releases_its_slot(panel):
    app, fake = panel
    app.cfg['limits'] = LIMITS.copy()
    app.cfg['max_parallel'] = 5
    active = rows(workb=1)
    original = fake.__call__

    def command(argv):
        if argv[1] == 'runs' and '--running' in argv:
            return {'runs': list(active)}
        result = original(argv)
        if argv[1] == 'run':
            active.append({'run_id': result['run_id'], 'session': argv[2], 'status': 'running'})
        return result

    app.launcher.command = command
    first = app.launcher.topic('free', 'b', 'Codex')
    _, queued = post(app, '/api/topics/' + first + '/messages', {'request_id': 'b', 'text': 'Wait', 'account': 'workb', 'model': 'gpt-5'})
    _, chat = post(app, '/api/topics/' + pending_item(app)['topic_id'] + '/messages', {'request_id': 'c', 'text': 'Go'})
    app.launcher.tick()
    assert app.operation(queued['operation_id'])['status'] == 'queued'
    assert app.operation(chat['operation_id'])['status'] == 'running'
    assert app.readers.state()['admissions']['slots']['accounts']['claude']['busy'] == 1
    cmd = next(c for c in fake.calls if c[1] == 'run')
    assert cmd[cmd.index('--max-parallel') + 1] == '5'
    active.pop(0)
    app.launcher.tick()
    assert app.operation(queued['operation_id'])['status'] == 'running'


def test_parallel_panel_launches_cannot_take_the_same_account_slot(panel):
    app, fake = panel
    app.cfg['limits'] = LIMITS.copy()
    active = []
    original = fake.__call__

    def command(argv):
        if argv[1] == 'runs' and '--running' in argv:
            return {'runs': list(active)}
        result = original(argv)
        if argv[1] == 'run':
            active.append({'run_id': result['run_id'], 'session': argv[2]})
        return result

    app.launcher.command = command
    jobs = []
    for i in range(2):
        topic = app.launcher.topic('free', str(i), str(i))
        _, op = post(app, '/api/topics/' + topic + '/messages', {'request_id': str(i), 'text': 'Go', 'account': 'workb', 'model': 'gpt-5'})
        jobs.append((op, app.store.get('jobs', op['operation_id'])))
    errors = []
    def start(op, job):
        try:
            app.launcher.start_run(op, job)
        except Exception as exc:
            errors.append(exc)
    threads = [threading.Thread(target=start, args=job) for job in jobs]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=5)
    assert not errors
    assert len(active) == 1
    assert sorted(app.operation(op['operation_id'])['status'] for op, _ in jobs) == ['queued', 'running']


@pytest.mark.parametrize('active, permitted', [(rows(claude=2, workb=1), True), (rows(claude=3), False), (rows(worka=1, workb=1), True)])
def test_dispatch_account_admission(fake, monkeypatch, capsys, active, permitted):
    monkeypatch.setattr(cr, 'running_runs', lambda: active)
    monkeypatch.setattr(cr, 'pick_account', lambda a: 'claude')
    monkeypatch.setattr(cr.crow_limits, 'load', lambda home: LIMITS.copy())
    if permitted:
        cr.dispatch(args())
        cmd = next(c['cmd'] for c in fake.calls if c['cmd'][:2] == ['cdx', 'run'])
        assert cmd[cmd.index('--max-parallel') + 1] == '5'
        assert '--failover' not in cmd
    else:
        with pytest.raises(SystemExit):
            cr.dispatch(args())
        assert json.loads(capsys.readouterr().out)['error']['code'] == 'too_many_runs'
        assert not any(c['cmd'][:2] == ['cdx', 'run'] for c in fake.calls)


def test_night_child_rechecks_account_after_panel_admission(tmp_path, monkeypatch):
    import runpy
    import types
    from pathlib import Path
    from crow_panel.core import locked
    from conftest import BIN
    home = tmp_path / 'hub'
    (home / 'local').mkdir(parents=True)
    (home / 'local/maj.json').write_text('{"account":"claude"}')
    locks = tmp_path / 'locks'
    monkeypatch.setenv('CROW_HOME', str(home))
    monkeypatch.setenv('CROW_LOCKS_DIR', str(locks))
    module = runpy.run_path(str(BIN / 'crow-maj'), run_name='night_admission_test')
    calls, sleeps = [], []
    active = [rows(claude=3), rows(claude=2, worka=1, workb=1)]
    def run(cmd, **kwargs):
        assert locked(locks, 'admission')
        calls.append(cmd)
        if cmd[1] == 'runs':
            return types.SimpleNamespace(returncode=0, stdout=json.dumps({'runs': active.pop(0)}))
        return 'launched'
    def sleep(seconds):
        assert not locked(locks, 'admission')
        sleeps.append(seconds)
    launch = module['launch_night']
    monkeypatch.setitem(launch.__globals__, 'subprocess', types.SimpleNamespace(run=run))
    monkeypatch.setitem(launch.__globals__, 'time', types.SimpleNamespace(sleep=sleep))
    assert launch(['cdx', 'run', 'claude'], {}, LIMITS) == 'launched'
    assert sleeps == [5] and len(calls) == 3
