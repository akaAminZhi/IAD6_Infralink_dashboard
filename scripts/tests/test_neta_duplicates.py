from __future__ import annotations

from pathlib import Path
import csv
import hashlib
import json
import shutil
import time

import pytest
from fastapi.testclient import TestClient

from scripts.automation import neta_duplicates
from scripts.automation.api import create_app
from scripts.automation.auth import require_operator
from scripts.automation.runner import AutomationConfig, TaskManager
from scripts.etl import build_neta_report_manifest as builder


def config(tmp_path):
    return AutomationConfig(tmp_path / 'dashboard', tmp_path / 'tracker', tmp_path / 'runtime',
                            tmp_path / 'jc2.json', tmp_path / 'cx.json')


def test_duplicate_endpoint_requires_auth_confirmation_and_rejects_raw_paths(tmp_path, monkeypatch):
    manager = TaskManager(config(tmp_path))
    app = create_app(manager.config, manager)
    monkeypatch.delenv('AUTOMATION_LOCAL_AUTH_BYPASS', raising=False)
    client = TestClient(app)
    payload = {'match_id': 'a' * 64, 'expected_revision': 'b' * 64, 'action': 'confirm', 'confirmed': True}
    url = '/api/automation/neta-report-duplicates/decisions'
    assert client.post(url, json=payload).status_code == 401
    app.dependency_overrides[require_operator] = lambda: 'user_operator'
    assert client.post(url, json={**payload, 'file': '../secret.pdf'}).status_code == 422
    assert client.post(url, json={**payload, 'action': 'delete'}).status_code == 422
    assert client.post(url, json={**payload, 'confirmed': False}).status_code == 403
    called = []
    monkeypatch.setattr(neta_duplicates, 'validate_decision', lambda *args: called.append(args))
    monkeypatch.setattr(manager, '_start_worker', lambda *_: None)
    response = client.post(url, json=payload)
    assert response.status_code == 202
    assert response.json()['owner_user_id'] == 'user_operator'
    assert called == [(manager.config.eps_root, 'a' * 64, 'b' * 64, 'confirm')]
    assert client.post(url, json=payload).status_code == 409


def test_stale_decision_fails_before_scheduling_and_command_is_fixed(tmp_path, monkeypatch):
    manager = TaskManager(config(tmp_path))
    def stale(*args):
        raise ValueError('Evidence changed; refresh.')
    monkeypatch.setattr(neta_duplicates, 'validate_decision', stale)
    with pytest.raises(ValueError, match='refresh'):
        manager.start_job('update_neta_duplicate_decision',
            {'match_id': 'a' * 64, 'expected_revision': 'b' * 64, 'action': 'confirm'},
            confirmed=True, owner_user_id='operator')
    assert manager.list_runs() == []
    options = {'match_id': 'a' * 64, 'expected_revision': 'b' * 64, 'action': 'revoke'}
    command, cwd = manager.build_command('update_neta_duplicate_decision', options, owner_user_id='operator')
    assert command[2] == str(manager.config.dashboard_root / 'scripts/automation/neta_duplicates.py')
    assert command[-2:] == ['--actor', 'operator']
    assert cwd == manager.config.dashboard_root
    with pytest.raises(ValueError):
        manager.build_command('update_neta_duplicate_decision', {**options, 'match_id': '../../file'})
    with pytest.raises(ValueError):
        manager.build_command('update_neta_duplicate_decision', {**options, 'command': 'anything'})


def test_missing_tracker_support_is_explicitly_unavailable(tmp_path):
    snapshot = neta_duplicates.read_snapshot(tmp_path)
    assert snapshot['available'] is False
    assert snapshot['errors']


def test_manifest_projects_both_original_gc_sides_and_missing_public_file(tmp_path, monkeypatch):
    root = tmp_path / 'tracker'
    sources = []
    for source, directory, label in [('gc', 'NETA_eport_To_GC', 'GC'), ('downloaded', 'downloads/neta_reports', 'Original')]:
        for name in ('one.pdf', 'two.pdf'):
            path = root / directory / '_temporary/EQ-1' / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'%PDF fixture')
        sources.append({'source_key': source, 'source_label': label, 'directory': root / directory,
                        'public_directory': tmp_path / 'public' / source, 'url_base': '/' + source})
    monkeypatch.setattr(builder, 'SOURCE_DEFINITIONS', sources)
    monkeypatch.setattr(builder, 'create_public_directory_link', lambda *_: {'status': 'exists'})
    monkeypatch.delenv('IAD6_EPS_TRACKER_ROOT', raising=False)
    def snapshot(_):
        return {'available': True, 'errors': [], 'matches': [{
            'match_id': 'a' * 64, 'revision': 'b' * 64, 'device_name': 'EQ-1',
            'report_stage': 'temporary', 'batch_id': 'batch', 'category': 'equipment',
            'recognized_name': 'same report', 'classification': 'possible_duplicate',
            'status': 'confirmed', 'confirmation_source': 'manual', 'can_confirm': False,
            'can_revoke': True, 'problems': [], 'upload_action': 'skip_confirmed_duplicate',
            'confirmation': {'confirmed_by': 'user', 'confirmed_at': '2026-11-06T12:00:00Z'},
            'first': 'NETA_eport_To_GC/_temporary/EQ-1/one.pdf',
            'second': 'NETA_eport_To_GC/_temporary/EQ-1/two.pdf',
            'first_source': 'downloads/neta_reports/_temporary/EQ-1/one.pdf',
            'second_source': 'downloads/neta_reports/_temporary/EQ-1/two.pdf',
        }]}
    monkeypatch.setattr(builder, 'read_snapshot', snapshot)
    audit = builder.build_neta_report_manifest()['duplicate_audit']
    pair = audit['matches'][0]
    assert pair['status'] == 'confirmed' and pair['confirmed_by'] == 'user'
    assert pair['first']['original']['url'] == '/downloaded/_temporary/EQ-1/one.pdf'
    assert pair['second']['gc']['url'] == '/gc/_temporary/EQ-1/two.pdf'
    (root / 'NETA_eport_To_GC/_temporary/EQ-1/two.pdf').unlink()
    invalid = builder.build_neta_report_manifest()['duplicate_audit']['matches'][0]
    assert invalid['status'] == 'invalid' and not invalid['can_revoke']
    assert invalid['problems']


def test_real_worker_confirms_and_revokes_only_temporary_tracker_data(tmp_path, monkeypatch):
    """Exercise API -> runner -> subprocess -> Tracker -> static manifest together."""
    project = Path(__file__).resolve().parents[2]
    sibling = project.parent / 'IAD6_EPS_Testing_Tracker'
    if not (sibling / 'neta_duplicate_decisions.py').is_file():
        pytest.skip('Cross-repository worker check requires the sibling Tracker checkout.')
    cfg = config(tmp_path)
    monkeypatch.setenv('LOCALAPPDATA', str(tmp_path / 'private'))
    monkeypatch.delenv('IAD6_EPS_TRACKER_ROOT', raising=False)
    for source in (project / 'scripts').rglob('*.py'):
        if 'tests' in source.relative_to(project / 'scripts').parts:
            continue
        target = cfg.dashboard_root / source.relative_to(project)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    cfg.eps_root.mkdir(parents=True)
    for name in ('neta_duplicate_decisions.py', 'neta_report_duplicates.py', 'neta_report_lifecycle.py', 'cxalloy_upload_runtime.py'):
        shutil.copyfile(sibling / name, cfg.eps_root / name)
    gc = cfg.eps_root / 'NETA_eport_To_GC'
    rows = []
    for number in (1, 2):
        output = gc / f'_temporary/EQ-1/report{number}.pdf'
        original = cfg.eps_root / f'downloads/neta_reports/_temporary/EQ-1/original{number}.pdf'
        for file in (output, original):
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(f'%PDF fixture {number}'.encode())
        rows.append({'device_name': 'EQ-1', 'report_stage': 'temporary', 'batch_id': 'batch',
                     'parsed_source': 'OCR_ASSET', 'parsed_value': 'same report', 'status': 'copied',
                     'source_path': original.relative_to(cfg.eps_root).as_posix(),
                     'output_path': output.relative_to(cfg.eps_root).as_posix()})
    with (gc / 'rename_manifest.csv').open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    match = {'device_name': 'EQ-1', 'report_stage': 'temporary', 'batch_id': 'batch',
             'category': 'equipment', 'recognized_name': 'same report', 'classification': 'possible_duplicate',
             'confirmed': False, 'first': rows[0]['output_path'], 'second': rows[1]['output_path'],
             'first_source': rows[0]['source_path'], 'second_source': rows[1]['source_path'],
             'first_sha256': hashlib.sha256((cfg.eps_root / rows[0]['output_path']).read_bytes()).hexdigest(),
             'second_sha256': hashlib.sha256((cfg.eps_root / rows[1]['output_path']).read_bytes()).hexdigest()}
    (gc / 'duplicate_reports.json').write_text(json.dumps({'version': 2, 'matches': [match], 'errors': []}))
    manager = TaskManager(cfg)
    app = create_app(cfg, manager)
    app.dependency_overrides[require_operator] = lambda: 'fixture_operator'
    client = TestClient(app)
    for action, expected in [('confirm', 'confirmed'), ('revoke', 'possible')]:
        current = neta_duplicates.read_snapshot(cfg.eps_root)['matches'][0]
        response = client.post('/api/automation/neta-report-duplicates/decisions', json={
            'match_id': current['match_id'], 'expected_revision': current['revision'], 'action': action, 'confirmed': True})
        assert response.status_code == 202, response.text
        run_id = response.json()['run_id']
        deadline = time.monotonic() + 25
        while manager.has_active_run() and time.monotonic() < deadline:
            time.sleep(0.05)
        assert manager.get_run(run_id)['status'] == 'succeeded', manager.read_log(run_id)['content']
        published = json.loads((cfg.dashboard_root / 'frontend/public/data/neta_report_manifest.json').read_text())
        assert published['duplicate_audit']['matches'][0]['status'] == expected
        assert neta_duplicates.read_snapshot(cfg.eps_root)['matches'][0]['status'] == expected
    ledger = json.loads((gc / 'duplicate_report_decisions.json').read_text())['decisions'][0]
    assert ledger['confirmed_by'] == ledger['revoked_by'] == 'fixture_operator'
