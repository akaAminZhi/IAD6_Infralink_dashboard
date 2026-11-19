from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
from typing import Any
from uuid import uuid4
from scripts.automation.user_sessions import user_session_path


ACTIVE_STATUSES = {"queued", "running", "waiting_for_user"}
AUTH_PROVIDERS = {
    "refresh_jc2_exports": "jc2", "download_neta_reports": "jc2",
    "download_feeder_cable_atp": "jc2", "download_issue_attachments": "jc2",
    "upload_cxalloy_reports": "cxalloy",
}
RESUMABLE_STATUSES = {"failed", "auth_required", "interrupted", "cancelled"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class AutomationConfig:
    dashboard_root: Path
    eps_root: Path
    runtime_root: Path
    jc2_auth_state: Path
    cxalloy_auth_state: Path

    def session_path(self, user_id: str | None, provider: str) -> Path:
        if user_id is not None:
            return user_session_path(self.jc2_auth_state.parent, user_id, provider)
        return self.jc2_auth_state if provider == "jc2" else self.cxalloy_auth_state

    @classmethod
    def discover(
        cls,
        dashboard_root: Path | None = None,
        eps_root: Path | None = None,
        runtime_root: Path | None = None,
    ) -> "AutomationConfig":
        dashboard = (dashboard_root or Path(__file__).resolve().parents[2]).resolve()
        configured_eps = eps_root or (
            Path(os.environ["IAD6_EPS_TRACKER_ROOT"])
            if os.environ.get("IAD6_EPS_TRACKER_ROOT")
            else dashboard.parent / "IAD6_EPS_Testing_Tracker"
        )
        local_app_data = Path(
            os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")
        )
        auth_root = local_app_data / "iad6_eps_tracker"
        return cls(
            dashboard_root=dashboard,
            eps_root=configured_eps.resolve(),
            runtime_root=(runtime_root or dashboard / "runtime" / "automation").resolve(),
            jc2_auth_state=auth_root / "jc2_auth_state.json",
            cxalloy_auth_state=auth_root / "cxalloy_auth_state.json",
        )

    @property
    def report_dir(self) -> Path:
        return self.eps_root / "Daily_test_report"

    @property
    def mv_report_dir(self) -> Path:
        return self.eps_root / "MV_Daily_test_report"

    def site_report_dir(self, site: str) -> Path:
        directories = {"onsite": "Onsite_Test_Report", "offsite": "Offsite_Test_Report"}
        if site not in directories:
            raise ValueError("Unknown daily report site.")
        return self.eps_root / directories[site]

    @property
    def neta_report_results_path(self) -> Path:
        return self.eps_root / "NETA_eport_To_GC" / "test_reports_result.json"


@dataclass(frozen=True)
class JobDefinition:
    job_id: str
    label: str
    description: str
    project: str
    script: str
    supported_options: tuple[str, ...] = ()
    dangerous: bool = False


JOB_DEFINITIONS: dict[str, JobDefinition] = {
    "update_neta_duplicate_decision": JobDefinition(
        "update_neta_duplicate_decision", "Update NETA Duplicate Decision",
        "Confirm or revoke a reviewed PDF pair; never uploads attachments.",
        "dashboard", "scripts/automation/neta_duplicates.py",
        ("match_id", "expected_revision", "action"),
    ),
    "rename_neta_gc_report": JobDefinition(
        "rename_neta_gc_report", "Rename GC NETA Report",
        "Rename one GC report PDF in the Tracker; queue the CxAlloy name fix for the next upload.",
        "dashboard", "scripts/automation/neta_report_rename.py",
        ("report_file", "new_name", "expected_sha256"),
    ),
    "refresh_neta_duplicate_evidence": JobDefinition(
        "refresh_neta_duplicate_evidence", "Refresh NETA Duplicate Evidence",
        "Rebuild report links and duplicate evidence without changing decisions.",
        "dashboard", "scripts/etl/build_neta_report_manifest.py",
    ),
    "refresh_jc2_exports": JobDefinition(
        "refresh_jc2_exports",
        "Refresh JC2 Excel Exports",
        "Download the latest SystemElements and Cases workbooks.",
        "eps",
        "download_jc2_excel_exports.py",
        ("headed", "only"),
    ),
    "wash_daily_reports": JobDefinition(
        "wash_daily_reports",
        "Rebuild Daily Test Summary",
        "Rebuild EPS + Onsite + Offsite daily_tested_equipment.md without rewriting raw reports.",
        "eps",
        "wash_daily_test_report_data.py",
        ("dry_run",),
    ),
    "download_neta_reports": JobDefinition(
        "download_neta_reports",
        "Download NETA Reports",
        "Download missing NETA PDF reports from JC2.",
        "eps",
        "download_neta_reports.py",
        ("headed", "dry_run", "force", "only", "limit"),
    ),
    "download_feeder_cable_atp": JobDefinition(
        "download_feeder_cable_atp",
        "Download Feeder Cable ATP",
        "Download Feeder Cable ATP PDFs referenced by SystemElements.",
        "eps",
        "download_feeder_cable_atp.py",
        ("headed", "dry_run", "force", "only", "limit"),
    ),
    "download_issue_attachments": JobDefinition(
        "download_issue_attachments",
        "Download Issue Attachments",
        "Download issue and corrective files from JC2.",
        "eps",
        "download_issue_case_images.py",
        ("headed", "dry_run", "force", "only", "limit"),
    ),
    "organize_gc_reports": JobDefinition(
        "organize_gc_reports",
        "Organize GC Reports",
        "Copy and rename downloaded NETA reports for GC delivery.",
        "eps",
        "organize_neta_reports_for_gc.py",
        ("dry_run", "force"),
    ),
    "run_dashboard_etl": JobDefinition(
        "run_dashboard_etl",
        "Run Dashboard ETL",
        "Rebuild all dashboard datasets and manifests.",
        "dashboard",
        "scripts/etl/run_etl.py",
    ),
    "upload_cxalloy_reports": JobDefinition(
        "upload_cxalloy_reports",
        "Upload CxAlloy Reports",
        "Add new reports, reuse verified uploaded PDFs, and optionally update the Testing Matrix.",
        "eps",
        "upload_cxalloy_reports.py",
        ("headed", "dry_run", "force", "only", "limit", "no_excel_update"),
        dangerous=True,
    ),
}

# Parameterized write-back jobs run only through their dedicated, validated endpoints.
HIDDEN_JOBS = {"update_neta_duplicate_decision", "rename_neta_gc_report"}

DAILY_PIPELINE = (
    "preflight",
    "refresh_jc2_exports",
    "wash_daily_reports",
    "download_neta_reports",
    "download_feeder_cable_atp",
    "download_issue_attachments",
    "organize_gc_reports",
    "run_dashboard_etl",
)

# Pipeline-only flags: NETA post-processing runs once, after the Feeder Cable ATP
# and issue downloads, instead of in both the NETA download and organize steps.
PIPELINE_STEP_ARGS: dict[str, tuple[str, ...]] = {
    "download_neta_reports": ("--skip-post",),
    "organize_gc_reports": ("--after-download",),
}

# Auto-sync: after a successful manual Daily Data Refresh, keep local data and the
# saved JC2 session fresh until the service stops. Light syncs run every
# interval (measured from the previous run's end); the full pipeline replaces a
# light sync at most once per full interval. State lives only in memory.
LIGHT_SYNC_PIPELINE = (
    "preflight",
    "refresh_jc2_exports",
    "wash_daily_reports",
    "run_dashboard_etl",
)
PIPELINE_KINDS = {"pipeline", "auto_sync"}
AUTO_SYNC_HISTORY_LIMIT = 20
RUN_HISTORY_LIMIT = 50
AUTO_SYNC_POLL_S = 15.0
AUTO_SYNC_SETTINGS_FILE = "auto_sync_settings.json"
AUTO_SYNC_MAX_MINUTES = 24 * 60


def _env_seconds(name: str, default: float) -> float:
    try:
        value = float(os.environ.get(name, default))
    except ValueError:
        return default
    return value if value > 0 else default


def _iso_from_epoch(value: float | None) -> str | None:
    if value is None:
        return None
    return datetime.fromtimestamp(value, timezone.utc).isoformat()


class TaskManager:
    def __init__(
        self, config: AutomationConfig | None = None, *, start_auto_sync: bool = True
    ) -> None:
        self.config = config or AutomationConfig.discover()
        self.config.runtime_root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._runs: dict[str, dict[str, Any]] = {}
        self._active_run_id: str | None = None
        self._process: subprocess.Popen[str] | None = None
        self._cancel_requested = False
        self._clock = time.time
        self.auto_sync_interval_s = _env_seconds("IAD6_AUTO_SYNC_INTERVAL_S", 600)
        self.auto_full_interval_s = _env_seconds("IAD6_AUTO_FULL_INTERVAL_S", 3600)
        self._auto: dict[str, Any] = {
            "armed": False,
            "owner_user_id": None,
            "armed_at": None,
            "next_run_at": None,
            "last_full_at": None,
            "last_success_at": None,
            "stopped_reason": None,
            "stopped_at": None,
            "waiting_for_idle": False,
            "active_run_id": None,
            "active_mode": None,
            "exports": None,
            "last_finished_at": None,
        }
        self._auto_shutdown = threading.Event()
        self._load_auto_sync_settings()
        self._load_runs()
        if start_auto_sync:
            threading.Thread(
                target=self._auto_sync_loop, name="automation-auto-sync", daemon=True
            ).start()

    def jobs_public(self) -> list[dict[str, Any]]:
        return [
            {
                "job_id": definition.job_id,
                "label": definition.label,
                "description": definition.description,
                "supported_options": list(definition.supported_options),
                "dangerous": definition.dangerous,
            }
            for definition in JOB_DEFINITIONS.values()
            if definition.job_id not in HIDDEN_JOBS
        ]

    def has_active_run(self) -> bool:
        with self._lock:
            return self._active_run_id is not None

    def active_run_id(self) -> str | None:
        with self._lock:
            return self._active_run_id

    def list_runs(self) -> list[dict[str, Any]]:
        with self._lock:
            return sorted(
                (self._copy_run(run) for run in self._runs.values()),
                key=lambda run: run["created_at"],
                reverse=True,
            )[: RUN_HISTORY_LIMIT + AUTO_SYNC_HISTORY_LIMIT]

    def get_run(self, run_id: str) -> dict[str, Any]:
        with self._lock:
            if run_id not in self._runs:
                raise KeyError(f"Automation run not found: {run_id}")
            return self._copy_run(self._runs[run_id])

    def start_job(
        self,
        job_id: str,
        options: dict[str, Any] | None = None,
        *,
        confirmed: bool = False,
        owner_user_id: str | None = None,
    ) -> dict[str, Any]:
        definition = self._job(job_id)
        normalized_options = self._validate_options(definition, options or {})
        if job_id == "update_neta_duplicate_decision":
            from scripts.automation.neta_duplicates import validate_decision
            if not confirmed or not owner_user_id:
                raise PermissionError("Duplicate decisions require explicit operator confirmation.")
            if set(normalized_options) != {"match_id", "expected_revision", "action"}:
                raise ValueError("Duplicate match, revision and action are required.")
            validate_decision(self.config.eps_root, normalized_options['match_id'],
                              normalized_options['expected_revision'], normalized_options['action'])
        if job_id == "rename_neta_gc_report":
            from scripts.automation.neta_report_rename import LOCAL_OPERATOR, validate_rename
            if owner_user_id != LOCAL_OPERATOR:
                raise PermissionError("GC report renaming is only available to the local operator.")
            if not confirmed:
                raise PermissionError("GC report renaming requires explicit operator confirmation.")
            if set(normalized_options) != {"report_file", "new_name", "expected_sha256"}:
                raise ValueError("Report file, new name and expected SHA-256 are required.")
            validate_rename(self.config.eps_root, normalized_options["report_file"],
                            normalized_options["new_name"], normalized_options["expected_sha256"])
        if definition.dangerous and not normalized_options.get("dry_run") and not confirmed:
            raise PermissionError("CxAlloy upload requires explicit confirmation.")
        run = self._new_run(
            kind="job",
            label=definition.label,
            steps=[job_id],
            options=normalized_options,
            owner_user_id=owner_user_id,
        )
        self._start_worker(run["run_id"], 0)
        return self.get_run(run["run_id"])

    def start_login(self, provider: str, owner_user_id: str | None = None) -> dict[str, Any]:
        provider_key = provider.strip().lower()
        if provider_key == "jc2":
            job_id = "login_jc2"
            label = "Refresh JC2 Login"
        elif provider_key == "cxalloy":
            job_id = "login_cxalloy"
            label = "Refresh CxAlloy Login"
        else:
            raise ValueError("Login provider must be jc2 or cxalloy.")
        run = self._new_run(kind="login", label=label, steps=[job_id], options={}, owner_user_id=owner_user_id)
        self._start_worker(run["run_id"], 0)
        return self.get_run(run["run_id"])

    def start_daily_pipeline(self, options: dict[str, Any] | None = None, *, owner_user_id: str | None = None) -> dict[str, Any]:
        options = options or {}
        allowed = {"headed", "force"}
        unknown = {key for key, value in options.items() if value and key not in allowed}
        if unknown:
            raise ValueError(f"Unsupported pipeline option(s): {', '.join(sorted(unknown))}")
        normalized = {key: bool(options.get(key)) for key in allowed}
        run = self._new_run(
            kind="pipeline",
            label="Daily Data Refresh",
            steps=list(DAILY_PIPELINE),
            options=normalized,
            owner_user_id=owner_user_id,
        )
        self._start_worker(run["run_id"], 0)
        return self.get_run(run["run_id"])

    def resume(self, run_id: str) -> dict[str, Any]:
        with self._lock:
            self._ensure_idle()
            run = self._require_run(run_id)
            if run["status"] not in RESUMABLE_STATUSES:
                raise ValueError(f"Run cannot be resumed from status {run['status']}.")
            start_index = next(
                (
                    index
                    for index, step in enumerate(run["steps"])
                    if step["status"] != "succeeded"
                ),
                len(run["steps"]),
            )
            if start_index >= len(run["steps"]):
                raise ValueError("Run has no incomplete steps.")
            for step in run["steps"][start_index:]:
                step.update(
                    {
                        "status": "pending",
                        "started_at": None,
                        "finished_at": None,
                        "exit_code": None,
                        "error": None,
                    }
                )
            run.update(
                {
                    "status": "queued",
                    "finished_at": None,
                    "exit_code": None,
                    "error": None,
                }
            )
            self._append_log(run_id, "\n=== RESUMING AUTOMATION RUN ===\n")
            self._persist(run)
        self._start_worker(run_id, start_index)
        return self.get_run(run_id)

    def continue_login(self, run_id: str) -> dict[str, Any]:
        with self._lock:
            run = self._require_run(run_id)
            if run["kind"] != "login" or run["status"] != "waiting_for_user":
                raise ValueError("Run is not waiting for login confirmation.")
            if self._active_run_id != run_id or self._process is None or self._process.stdin is None:
                raise RuntimeError("Login process is no longer available.")
            self._process.stdin.write("\n")
            self._process.stdin.flush()
            run["status"] = "running"
            run["steps"][0]["status"] = "running"
            self._persist(run)
            self._append_log(run_id, "Login completion confirmed from Data Operations.\n")
            return self._copy_run(run)

    def cancel(self, run_id: str) -> dict[str, Any]:
        with self._lock:
            run = self._require_run(run_id)
            if self._active_run_id != run_id or run["status"] not in ACTIVE_STATUSES:
                raise ValueError("Run is not active.")
            process = self._process
            self._cancel_requested = True
            self._append_log(run_id, "Cancellation requested.\n")
        if process is not None and process.poll() is None:
            self._terminate_process_tree(process)
        return self.get_run(run_id)

    def read_log(self, run_id: str, offset: int = 0, limit: int = 65_536) -> dict[str, Any]:
        self.get_run(run_id)
        path = self._log_path(run_id)
        if not path.exists():
            return {"offset": 0, "content": "", "has_more": False}
        size = path.stat().st_size
        safe_offset = max(0, min(offset, size))
        with path.open("rb") as handle:
            handle.seek(safe_offset)
            data = handle.read(max(1, min(limit, 262_144)))
        next_offset = safe_offset + len(data)
        return {
            "offset": next_offset,
            "content": data.decode("utf-8", errors="replace"),
            "has_more": next_offset < size,
        }

    def _new_run(
        self,
        *,
        kind: str,
        label: str,
        steps: list[str],
        options: dict[str, Any],
        owner_user_id: str | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            self._ensure_idle()
            run_id = uuid4().hex
            run = {
                "run_id": run_id,
                "owner_user_id": owner_user_id,
                "kind": kind,
                "label": label,
                "status": "queued",
                "created_at": utc_now(),
                "started_at": None,
                "finished_at": None,
                "exit_code": None,
                "error": None,
                "current_step": None,
                "options": options,
                "steps": [
                    {
                        "job_id": step,
                        "label": self._step_label(step),
                        "status": "pending",
                        "started_at": None,
                        "finished_at": None,
                        "exit_code": None,
                        "error": None,
                    }
                    for step in steps
                ],
            }
            self._runs[run_id] = run
            self._persist(run)
            self._trim_history()
            self._active_run_id = run_id
            return run

    def _start_worker(self, run_id: str, start_index: int) -> None:
        with self._lock:
            if self._active_run_id not in {None, run_id}:
                self._ensure_idle()
            self._active_run_id = run_id
            self._cancel_requested = False
        thread = threading.Thread(
            target=self._execute_run,
            args=(run_id, start_index),
            name=f"automation-{run_id[:8]}",
            daemon=True,
        )
        thread.start()

    def _execute_run(self, run_id: str, start_index: int) -> None:
        try:
            with self._lock:
                run = self._require_run(run_id)
                run["status"] = "running"
                run["started_at"] = run["started_at"] or utc_now()
                self._persist(run)
            self._append_log(run_id, f"=== {run['label']} ===\n")

            for index in range(start_index, len(run["steps"])):
                with self._lock:
                    run = self._require_run(run_id)
                    step = run["steps"][index]
                    if step["status"] == "succeeded":
                        continue
                    run["current_step"] = step["job_id"]
                    step["status"] = "running"
                    step["started_at"] = utc_now()
                    self._persist(run)
                self._append_log(run_id, f"\n--- {step['label']} ---\n")

                track_exports = (
                    run["kind"] == "auto_sync" and step["job_id"] == "refresh_jc2_exports"
                )
                exports_before = self._export_snapshot() if track_exports else set()
                if step["job_id"] == "preflight":
                    exit_code, error, auth_required = self._run_preflight(run_id)
                else:
                    options = self._options_for_step(run, step["job_id"])
                    exit_code, error, auth_required = self._run_process(
                        run_id,
                        step["job_id"],
                        options,
                        login=run["kind"] == "login",
                        pipeline=run["kind"] in PIPELINE_KINDS,
                    )
                if track_exports and exit_code == 0 and not self._cancel_requested:
                    self._prune_superseded_auto_exports(run_id, exports_before)

                with self._lock:
                    run = self._require_run(run_id)
                    step = run["steps"][index]
                    step["finished_at"] = utc_now()
                    step["exit_code"] = exit_code
                    if self._cancel_requested:
                        step["status"] = "cancelled"
                        run["status"] = "cancelled"
                        run["error"] = "Run cancelled by user."
                    elif exit_code == 0:
                        step["status"] = "succeeded"
                    elif auth_required:
                        step["status"] = "auth_required"
                        step["error"] = error
                        run["status"] = "auth_required"
                        run["error"] = error
                    else:
                        step["status"] = "failed"
                        step["error"] = error
                        run["status"] = "failed"
                        run["error"] = error
                    self._persist(run)

                if exit_code != 0 or self._cancel_requested:
                    break
            else:
                with self._lock:
                    run = self._require_run(run_id)
                    run["status"] = "succeeded"
                    run["exit_code"] = 0
                    run["error"] = None
                    self._persist(run)
        except Exception as exc:  # pragma: no cover - last-resort process guard
            self._append_log(run_id, f"Automation service error: {exc}\n")
            with self._lock:
                run = self._runs.get(run_id)
                if run is not None:
                    run["status"] = "failed"
                    run["error"] = str(exc)
                    self._persist(run)
        finally:
            with self._lock:
                run = self._runs.get(run_id)
                if run is not None:
                    run["finished_at"] = utc_now()
                    run["current_step"] = None
                    if run["exit_code"] is None:
                        failed_step = next(
                            (
                                step
                                for step in run["steps"]
                                if step["status"] in {"failed", "auth_required", "cancelled"}
                            ),
                            None,
                        )
                        run["exit_code"] = failed_step["exit_code"] if failed_step else None
                    self._persist(run)
                self._process = None
                self._active_run_id = None
                self._cancel_requested = False
                if run is not None:
                    self._on_run_finished(run)

    def _run_process(
        self,
        run_id: str,
        job_id: str,
        options: dict[str, Any],
        *,
        login: bool,
        pipeline: bool = False,
    ) -> tuple[int, str | None, bool]:
        owner = self.get_run(run_id).get("owner_user_id")
        provider = AUTH_PROVIDERS.get(job_id)
        if owner and provider and not self.config.session_path(owner, provider).is_file():
            message = f"Your {provider.upper()} session is missing. Use Refresh login."
            self._append_log(run_id, message + "\n")
            return 2, message, True
        command, cwd = self.build_command(job_id, options, owner_user_id=owner, pipeline=pipeline)
        self._append_log(run_id, f"Working directory: {cwd}\n")
        self._append_log(run_id, f"Command: {' '.join(command)}\n")
        process = subprocess.Popen(
            command,
            cwd=cwd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
        with self._lock:
            self._process = process

        output_tail: list[str] = []
        assert process.stdout is not None
        for line in process.stdout:
            self._append_log(run_id, line)
            output_tail.append(line)
            output_tail = output_tail[-80:]
            if login and "Finish logging in" in line:
                with self._lock:
                    run = self._require_run(run_id)
                    run["status"] = "waiting_for_user"
                    run["steps"][0]["status"] = "waiting_for_user"
                    self._persist(run)

        exit_code = process.wait()
        output_text = "".join(output_tail).lower()
        auth_required = exit_code == 2 or any(
            phrase in output_text
            for phrase in (
                "login is required",
                "auth state not found",
                "run: python download_jc2_excel_exports.py --login",
                "run python upload_cxalloy_reports.py --login",
            )
        )
        error = None if exit_code == 0 else f"{self._step_label(job_id)} exited with code {exit_code}."
        if auth_required:
            error = f"{self._step_label(job_id)} requires a refreshed browser login."
        return exit_code, error, auth_required

    def _run_preflight(self, run_id: str) -> tuple[int, str | None, bool]:
        missing: list[str] = []
        if not self.config.eps_root.is_dir():
            missing.append(f"EPS Tracker directory: {self.config.eps_root}")
        for job_id in DAILY_PIPELINE:
            if job_id == "preflight":
                continue
            definition = self._job(job_id)
            root = self.config.eps_root if definition.project == "eps" else self.config.dashboard_root
            if not (root / definition.script).is_file():
                missing.append(f"Script: {root / definition.script}")
        for module_name in ("openpyxl", "fitz", "playwright"):
            if importlib.util.find_spec(module_name) is None:
                missing.append(f"Python module: {module_name}")
        if importlib.util.find_spec("playwright") is not None:
            try:
                from playwright.sync_api import sync_playwright

                with sync_playwright() as playwright:
                    chromium_path = Path(playwright.chromium.executable_path)
                    if not chromium_path.is_file():
                        missing.append("Playwright Chromium (run: playwright install chromium)")
            except Exception as exc:
                missing.append(f"Playwright Chromium check: {exc}")
        auth_path = self.config.session_path(self.get_run(run_id).get("owner_user_id"), "jc2")
        if not auth_path.is_file():
            message = "Your JC2 session is missing. Sign in using Refresh login."
            self._append_log(run_id, f"AUTH REQUIRED: {message}\n")
            return 2, message, True
        if missing:
            message = "Preflight failed; missing " + "; ".join(missing)
            self._append_log(run_id, f"ERROR: {message}\n")
            return 1, message, False
        self._append_log(run_id, f"Dashboard root: {self.config.dashboard_root}\n")
        self._append_log(run_id, f"EPS Tracker root: {self.config.eps_root}\n")
        self._append_log(run_id, "Preflight checks passed.\n")
        return 0, None, False

    def build_command(
        self, job_id: str, options: dict[str, Any] | None = None, *, owner_user_id: str | None = None,
        pipeline: bool = False,
    ) -> tuple[list[str], Path]:
        options = options or {}
        if job_id == "login_jc2":
            return [
                sys.executable,
                "-u",
                str(self.config.eps_root / "download_jc2_excel_exports.py"),
                "--login",
                *(["--auth-state", str(self.config.session_path(owner_user_id, "jc2"))] if owner_user_id else []),
            ], self.config.eps_root
        if job_id == "login_cxalloy":
            return [
                sys.executable,
                "-u",
                str(self.config.eps_root / "upload_cxalloy_reports.py"),
                "--login",
                *(["--auth-state", str(self.config.session_path(owner_user_id, "cxalloy"))] if owner_user_id else []),
            ], self.config.eps_root

        definition = self._job(job_id)
        normalized = self._validate_options(definition, options)
        cwd = self.config.eps_root if definition.project == "eps" else self.config.dashboard_root
        command = [sys.executable, "-u", str(cwd / definition.script)]
        if job_id == "refresh_neta_duplicate_evidence":
            command.extend(["--tracker-root", str(self.config.eps_root)])
        if job_id == "update_neta_duplicate_decision":
            for key in ("match_id", "expected_revision", "action"):
                command.extend(["--" + key.replace('_', '-'), normalized[key]])
            command.extend(["--tracker-root", str(self.config.eps_root), "--actor", owner_user_id or "local_operator"])
            return command, cwd
        if job_id == "rename_neta_gc_report":
            for key in ("report_file", "new_name", "expected_sha256"):
                command.extend(["--" + key.replace('_', '-'), normalized[key]])
            command.extend(["--tracker-root", str(self.config.eps_root), "--actor", owner_user_id or ""])
            return command, cwd
        if job_id == "refresh_jc2_exports":
            selected = normalized.get("only") or ["all"]
            command.extend(["--only", selected[0]])
        elif normalized.get("only"):
            for value in normalized["only"]:
                command.extend(["--only", value])
        if normalized.get("headed"):
            command.append("--headed")
        if normalized.get("dry_run"):
            command.append("--dry-run")
        if normalized.get("force"):
            command.append("--force")
        if normalized.get("limit") is not None:
            command.extend(["--limit", str(normalized["limit"])])
        if normalized.get("no_excel_update"):
            command.append("--no-excel-update")
        if pipeline:
            command.extend(PIPELINE_STEP_ARGS.get(job_id, ()))
        provider = AUTH_PROVIDERS.get(job_id)
        if owner_user_id and provider:
            command.extend(["--auth-state", str(self.config.session_path(owner_user_id, provider))])
        return command, cwd

    def _options_for_step(self, run: dict[str, Any], job_id: str) -> dict[str, Any]:
        if run["kind"] not in PIPELINE_KINDS:
            return dict(run["options"])
        definition = self._job(job_id)
        options: dict[str, Any] = {}
        if "headed" in definition.supported_options:
            options["headed"] = bool(run["options"].get("headed"))
        if "force" in definition.supported_options:
            options["force"] = bool(run["options"].get("force"))
        return options

    def _validate_options(
        self, definition: JobDefinition, options: dict[str, Any]
    ) -> dict[str, Any]:
        supported = set(definition.supported_options)
        normalized: dict[str, Any] = {}
        for key, value in options.items():
            if value in (None, False, "", []):
                continue
            if key not in supported:
                raise ValueError(f"{definition.label} does not support option {key}.")
            if key in {"headed", "dry_run", "force", "no_excel_update"}:
                normalized[key] = bool(value)
            elif key in {"match_id", "expected_revision"}:
                import re
                if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
                    raise ValueError("Invalid duplicate identity or revision.")
                normalized[key] = value
            elif key == "expected_sha256":
                import re
                if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
                    raise ValueError("Invalid report SHA-256.")
                normalized[key] = value
            elif key == "report_file":
                import re
                text = value.replace("\\", "/") if isinstance(value, str) else ""
                if (not text or len(text) > 300 or not text.lower().endswith(".pdf")
                        or text.startswith("/") or re.match(r"^[A-Za-z]:", text)
                        or any(part in {"", ".", ".."} for part in text.split("/"))
                        or re.search(r"[\x00-\x1f]", text)):
                    raise ValueError("Invalid GC report path.")
                normalized[key] = text
            elif key == "new_name":
                import re
                text = value.strip() if isinstance(value, str) else ""
                if not text or len(text) > 154 or re.search(r'[\\/:*?"<>|\x00-\x1f]', text):
                    raise ValueError('Report name must be 1-150 characters without \\ / : * ? " < > |.')
                normalized[key] = text
            elif key == "action":
                if value not in {"confirm", "revoke"}:
                    raise ValueError("Invalid duplicate decision action.")
                normalized[key] = value
            elif key == "limit":
                limit = int(value)
                if limit < 1 or limit > 10_000:
                    raise ValueError("Limit must be between 1 and 10000.")
                normalized[key] = limit
            elif key == "only":
                values = value if isinstance(value, list) else [value]
                cleaned = [str(item).strip() for item in values if str(item).strip()]
                if not cleaned:
                    continue
                if any(len(item) > 160 or "\n" in item or "\x00" in item for item in cleaned):
                    raise ValueError("Only filters contain an invalid value.")
                if definition.job_id == "refresh_jc2_exports":
                    allowed = {"all", "system", "system_elements", "case"}
                    if len(cleaned) != 1 or cleaned[0] not in allowed:
                        raise ValueError("JC2 export filter must be all, system, system_elements, or case.")
                normalized[key] = cleaned
        return normalized

    # ----- Auto-sync -------------------------------------------------------

    def auto_sync_status(self) -> dict[str, Any]:
        with self._lock:
            auto = dict(self._auto)
            active = self._runs.get(auto["active_run_id"]) if auto["active_run_id"] else None
            current_step = None
            if active is not None and active.get("current_step"):
                current_step = self._step_label(active["current_step"])
            if active is not None and active.get("status") in ACTIVE_STATUSES:
                state = "running"
            elif auto["armed"] and auto["waiting_for_idle"]:
                state = "waiting_for_idle"
            elif auto["armed"]:
                state = "on"
            elif auto["stopped_reason"]:
                state = "stopped"
            else:
                state = "off"
            next_full_at = None
            if auto["armed"] and auto["last_full_at"] is not None:
                next_full_at = max(
                    auto["last_full_at"] + self.auto_full_interval_s,
                    auto["next_run_at"] or 0,
                )
            running = state == "running"
            return {
                "state": state,
                "armed": bool(auto["armed"]),
                "interval_minutes": round(self.auto_sync_interval_s / 60),
                "full_interval_minutes": round(self.auto_full_interval_s / 60),
                "owner_user_id": auto["owner_user_id"],
                "interval_seconds": int(self.auto_sync_interval_s),
                "full_interval_seconds": int(self.auto_full_interval_s),
                "armed_at": _iso_from_epoch(auto["armed_at"]),
                "next_run_at": _iso_from_epoch(auto["next_run_at"]) if auto["armed"] else None,
                "next_full_at": _iso_from_epoch(next_full_at),
                "last_full_at": _iso_from_epoch(auto["last_full_at"]),
                "last_success_at": _iso_from_epoch(auto["last_success_at"]),
                "stopped_reason": auto["stopped_reason"],
                "stopped_at": _iso_from_epoch(auto["stopped_at"]),
                "waiting_for_idle": bool(auto["armed"] and auto["waiting_for_idle"]),
                "active_run_id": auto["active_run_id"] if running else None,
                "active_mode": auto["active_mode"] if running else None,
                "current_step": current_step if running else None,
            }

    def update_auto_sync_settings(self, light_minutes: int, full_minutes: int) -> dict[str, Any]:
        """Change the light/full intervals; reschedules a waiting auto-sync."""
        for value in (light_minutes, full_minutes):
            if isinstance(value, bool) or not isinstance(value, int):
                raise ValueError("Intervals must be whole minutes.")
        if not 1 <= light_minutes <= AUTO_SYNC_MAX_MINUTES:
            raise ValueError(f"Light sync interval must be 1-{AUTO_SYNC_MAX_MINUTES} minutes.")
        if not light_minutes <= full_minutes <= AUTO_SYNC_MAX_MINUTES:
            raise ValueError(
                f"Full sync interval must be between the light interval and {AUTO_SYNC_MAX_MINUTES} minutes."
            )
        with self._lock:
            self.auto_sync_interval_s = float(light_minutes * 60)
            self.auto_full_interval_s = float(full_minutes * 60)
            auto = self._auto
            if auto["armed"] and auto["active_run_id"] is None:
                base = auto["last_finished_at"] or self._clock()
                auto["next_run_at"] = base + self.auto_sync_interval_s
            payload = json.dumps(
                {"light_minutes": light_minutes, "full_minutes": full_minutes}, indent=2
            )
        path = self.config.runtime_root / AUTO_SYNC_SETTINGS_FILE
        temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        try:
            temporary.write_text(payload, encoding="utf-8")
            os.replace(temporary, path)
        except OSError:
            temporary.unlink(missing_ok=True)
            path.write_text(payload, encoding="utf-8")
        return self.auto_sync_status()

    def _load_auto_sync_settings(self) -> None:
        path = self.config.runtime_root / AUTO_SYNC_SETTINGS_FILE
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            light = int(data["light_minutes"])
            full = int(data["full_minutes"])
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
            return
        if 1 <= light <= AUTO_SYNC_MAX_MINUTES and light <= full <= AUTO_SYNC_MAX_MINUTES:
            self.auto_sync_interval_s = float(light * 60)
            self.auto_full_interval_s = float(full * 60)

    def stop_auto_sync(self, reason: str) -> None:
        with self._lock:
            self._auto.update(
                {
                    "armed": False,
                    "next_run_at": None,
                    "waiting_for_idle": False,
                    "stopped_reason": reason,
                    "stopped_at": self._clock(),
                }
            )

    def shutdown_auto_sync(self) -> None:
        self._auto_shutdown.set()

    def _auto_sync_loop(self) -> None:
        while not self._auto_shutdown.wait(AUTO_SYNC_POLL_S):
            try:
                self._auto_sync_tick()
            except Exception:  # pragma: no cover - keep the scheduler alive
                continue

    def _auto_sync_tick(self) -> str | None:
        """Start an auto-sync run when one is due and the service is idle."""
        now = self._clock()
        with self._lock:
            auto = self._auto
            if not auto["armed"] or auto["next_run_at"] is None or now < auto["next_run_at"]:
                auto["waiting_for_idle"] = False
                return None
            if self._active_run_id is not None:
                auto["waiting_for_idle"] = True
                return None
            full = (
                auto["last_full_at"] is None
                or now - auto["last_full_at"] >= self.auto_full_interval_s
            )
            mode = "full" if full else "light"
            run = self._new_run(
                kind="auto_sync",
                label="Auto Sync (full)" if full else "Auto Sync (light)",
                steps=list(DAILY_PIPELINE if full else LIGHT_SYNC_PIPELINE),
                options={"headed": False, "force": False},
                owner_user_id=auto["owner_user_id"],
            )
            run["auto_mode"] = mode
            self._persist(run)
            auto.update(
                {"waiting_for_idle": False, "active_run_id": run["run_id"], "active_mode": mode}
            )
            run_id = run["run_id"]
        self._start_worker(run_id, 0)
        return run_id

    def _on_run_finished(self, run: dict[str, Any]) -> None:
        now = self._clock()
        kind = run.get("kind")
        status = run.get("status")
        with self._lock:
            auto = self._auto
            if kind in PIPELINE_KINDS:
                auto["last_finished_at"] = now
            if kind == "pipeline" and status == "succeeded":
                auto.update(
                    {
                        "armed": True,
                        "owner_user_id": run.get("owner_user_id"),
                        "armed_at": now,
                        "next_run_at": now + self.auto_sync_interval_s,
                        "last_full_at": now,
                        "last_success_at": now,
                        "stopped_reason": None,
                        "stopped_at": None,
                        "waiting_for_idle": False,
                    }
                )
            elif kind == "auto_sync":
                auto.update({"active_run_id": None, "active_mode": None})
                if status == "succeeded":
                    auto["last_success_at"] = now
                    if run.get("auto_mode") == "full":
                        auto["last_full_at"] = now
                    if auto["armed"]:
                        auto["next_run_at"] = now + self.auto_sync_interval_s
                else:
                    self.stop_auto_sync(
                        run.get("error") or f"Auto sync ended with status {status}."
                    )

    def _export_dirs(self) -> list[Path]:
        return [
            self.config.eps_root / "Excel" / "system_elements",
            self.config.eps_root / "Excel" / "case",
            self.config.dashboard_root / "raw_data" / "system_elements",
            self.config.dashboard_root / "raw_data" / "cases",
        ]

    def _export_snapshot(self) -> set[Path]:
        files: set[Path] = set()
        for folder in self._export_dirs():
            if folder.is_dir():
                files.update(path for path in folder.glob("*.xlsx") if path.is_file())
        return files

    @staticmethod
    def _export_family(path: Path) -> tuple[Path, str]:
        return path.parent, path.name.split("_", 1)[0].casefold()

    def _prune_superseded_auto_exports(self, run_id: str, before: set[Path]) -> None:
        """Delete the previous same-day auto-sync export once a newer one exists.

        Manual exports and earlier days are never touched. Every ETL selector picks
        the newest export per date, so dashboard outputs are unchanged.
        """
        new_files = self._export_snapshot() - before
        today = datetime.now().date().isoformat()
        with self._lock:
            previous = self._auto.get("exports") or {}
            self._auto["exports"] = {
                "date": today,
                "files": sorted(str(path) for path in new_files),
            }
        if previous.get("date") != today:
            return
        replaced = {self._export_family(path) for path in new_files}
        removed: list[str] = []
        for value in previous.get("files", []):
            path = Path(value)
            if path in new_files or self._export_family(path) not in replaced:
                continue
            try:
                path.unlink(missing_ok=True)
                removed.append(path.name)
            except OSError as exc:
                self._append_log(run_id, f"WARNING: could not remove {path}: {exc}\n")
        if removed:
            self._append_log(
                run_id,
                "Removed superseded same-day auto-sync exports: " + ", ".join(removed) + "\n",
            )

    def _job(self, job_id: str) -> JobDefinition:
        if job_id not in JOB_DEFINITIONS:
            raise ValueError(f"Unknown automation job: {job_id}")
        return JOB_DEFINITIONS[job_id]

    def _step_label(self, job_id: str) -> str:
        if job_id == "preflight":
            return "Preflight Checks"
        if job_id == "login_jc2":
            return "Refresh JC2 Login"
        if job_id == "login_cxalloy":
            return "Refresh CxAlloy Login"
        return self._job(job_id).label

    def _ensure_idle(self) -> None:
        if self._active_run_id is not None:
            raise RuntimeError(f"Automation run {self._active_run_id} is already active.")

    def _require_run(self, run_id: str) -> dict[str, Any]:
        if run_id not in self._runs:
            raise KeyError(f"Automation run not found: {run_id}")
        return self._runs[run_id]

    def _copy_run(self, run: dict[str, Any]) -> dict[str, Any]:
        return json.loads(json.dumps(run))

    def _record_path(self, run_id: str) -> Path:
        return self.config.runtime_root / f"{run_id}.json"

    def _log_path(self, run_id: str) -> Path:
        return self.config.runtime_root / f"{run_id}.log"

    def _append_log(self, run_id: str, text: str) -> None:
        with self._log_path(run_id).open("a", encoding="utf-8", newline="") as handle:
            handle.write(text)
            handle.flush()

    def _persist(self, run: dict[str, Any]) -> None:
        path = self._record_path(run["run_id"])
        payload = json.dumps(run, indent=2)
        temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        temporary.write_text(payload, encoding="utf-8")

        try:
            for delay in (0.0, 0.02, 0.05):
                if delay:
                    time.sleep(delay)
                try:
                    os.replace(temporary, path)
                    return
                except PermissionError:
                    # OneDrive can briefly open the destination without delete sharing,
                    # which blocks an atomic replacement even though normal writes work.
                    continue

            for delay in (0.0, 0.05, 0.15, 0.3):
                if delay:
                    time.sleep(delay)
                try:
                    path.write_text(payload, encoding="utf-8")
                    return
                except PermissionError:
                    continue

            try:
                self._append_log(
                    run["run_id"],
                    "WARNING: OneDrive temporarily blocked the automation status file; "
                    "the task will continue using in-memory status.\n",
                )
            except OSError:
                pass
        finally:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass


    def _load_runs(self) -> None:
        for path in self.config.runtime_root.glob("*.json"):
            try:
                run = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if not isinstance(run, dict) or not isinstance(run.get("run_id"), str):
                # The local runtime directory can contain other state files,
                # such as MV equipment comments. Only task-run records belong
                # in the automation run history.
                continue
            if run.get("status") in ACTIVE_STATUSES:
                run["status"] = "interrupted"
                run["finished_at"] = utc_now()
                run["error"] = "Automation service restarted before this run completed."
                for step in run.get("steps", []):
                    if step.get("status") in ACTIVE_STATUSES:
                        step["status"] = "interrupted"
                        step["finished_at"] = utc_now()
                self._persist(run)
            self._runs[run["run_id"]] = run
        self._trim_history()

    def _trim_history(self) -> None:
        # Auto-sync runs are trimmed separately so frequent background syncs
        # never push manual runs and their logs out of the history window.
        ordered = sorted(
            self._runs.values(), key=lambda run: run.get("created_at", ""), reverse=True
        )
        auto = [run for run in ordered if run.get("kind") == "auto_sync"]
        manual = [run for run in ordered if run.get("kind") != "auto_sync"]
        for run in [*manual[RUN_HISTORY_LIMIT:], *auto[AUTO_SYNC_HISTORY_LIMIT:]]:
            run_id = run["run_id"]
            if run_id == self._active_run_id:
                continue
            self._record_path(run_id).unlink(missing_ok=True)
            self._log_path(run_id).unlink(missing_ok=True)
            self._runs.pop(run_id, None)

    def _terminate_process_tree(self, process: subprocess.Popen[str]) -> None:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                capture_output=True,
                text=True,
                check=False,
            )
            return
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
