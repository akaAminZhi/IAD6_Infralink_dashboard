from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from scripts.automation.daily_reports import (
    ReportNameError,
    list_reports,
    normalize_report_name,
    read_report,
    validate_sections,
    write_report,
)
from scripts.automation.runner import AutomationConfig, TaskManager


class JobOptionsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    headed: bool = False
    dry_run: bool = False
    force: bool = False
    only: list[str] = Field(default_factory=list)
    limit: int | None = Field(default=None, ge=1, le=10_000)
    no_excel_update: bool = False


class JobRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    options: JobOptionsRequest = Field(default_factory=JobOptionsRequest)
    confirmed: bool = False


class PipelineRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    headed: bool = False
    force: bool = False


class DailyReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    failed: str = ""
    retested_and_passed: str = ""
    tested: str = ""
    overwrite: bool = False


def _file_status(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"exists": False, "modified_at": None}
    return {
        "exists": True,
        "modified_at": datetime.fromtimestamp(path.stat().st_mtime).astimezone().isoformat(),
    }


def _last_etl_status(config: AutomationConfig) -> dict[str, Any] | None:
    path = config.dashboard_root / "frontend" / "public" / "data" / "etl_run_metadata.json"
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"path": str(path), "generated_at": None, "readable": False}
    return {
        "path": str(path),
        "generated_at": payload.get("generated_at"),
        "readable": True,
    }


def create_app(
    config: AutomationConfig | None = None,
    manager: TaskManager | None = None,
) -> FastAPI:
    resolved_config = config or AutomationConfig.discover()
    task_manager = manager or TaskManager(resolved_config)
    app = FastAPI(title="IAD6 Dashboard Automation", version="1.0.0")
    app.state.automation_config = resolved_config
    app.state.task_manager = task_manager
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^https?://(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$",
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Content-Type"],
    )

    @app.get("/api/automation/health")
    def health() -> dict[str, Any]:
        return {
            "service_status": "ok",
            "dashboard_root": str(resolved_config.dashboard_root),
            "eps_tracker_root": str(resolved_config.eps_root),
            "eps_tracker_exists": resolved_config.eps_root.is_dir(),
            "report_directory": str(resolved_config.report_dir),
            "runtime_directory": str(resolved_config.runtime_root),
            "sessions": {
                "jc2": _file_status(resolved_config.jc2_auth_state),
                "cxalloy": _file_status(resolved_config.cxalloy_auth_state),
            },
            "active_run_id": task_manager.active_run_id(),
            "last_etl": _last_etl_status(resolved_config),
        }

    @app.get("/api/automation/jobs")
    def jobs() -> list[dict[str, Any]]:
        return task_manager.jobs_public()

    @app.get("/api/automation/runs")
    def runs() -> list[dict[str, Any]]:
        return task_manager.list_runs()

    @app.get("/api/automation/runs/{run_id}")
    def run_detail(run_id: str) -> dict[str, Any]:
        try:
            return task_manager.get_run(run_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/api/automation/runs/{run_id}/logs")
    def run_logs(
        run_id: str,
        after: int = Query(default=0, ge=0),
        limit: int = Query(default=65_536, ge=1, le=262_144),
    ) -> dict[str, Any]:
        try:
            return task_manager.read_log(run_id, after, limit)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/api/automation/jobs/{job_id}/runs", status_code=202)
    def start_job(job_id: str, request: JobRunRequest) -> dict[str, Any]:
        try:
            return task_manager.start_job(
                job_id,
                request.options.model_dump(),
                confirmed=request.confirmed,
            )
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post("/api/automation/pipelines/daily/runs", status_code=202)
    def start_daily_pipeline(request: PipelineRunRequest) -> dict[str, Any]:
        try:
            return task_manager.start_daily_pipeline(request.model_dump())
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post("/api/automation/runs/{run_id}/resume", status_code=202)
    def resume_run(run_id: str) -> dict[str, Any]:
        try:
            return task_manager.resume(run_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post("/api/automation/runs/{run_id}/cancel", status_code=202)
    def cancel_run(run_id: str) -> dict[str, Any]:
        try:
            return task_manager.cancel(run_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post("/api/automation/logins/{provider}", status_code=202)
    def start_login(provider: str) -> dict[str, Any]:
        try:
            return task_manager.start_login(provider)
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post("/api/automation/runs/{run_id}/continue", status_code=202)
    def continue_login(run_id: str) -> dict[str, Any]:
        try:
            return task_manager.continue_login(run_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.get("/api/automation/daily-reports")
    def daily_reports() -> list[dict[str, Any]]:
        return list_reports(resolved_config.report_dir)

    @app.get("/api/automation/daily-reports/{report_name}")
    def daily_report(report_name: str) -> dict[str, Any]:
        try:
            return read_report(resolved_config.report_dir, report_name)
        except ReportNameError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/api/automation/daily-reports/validate")
    def validate_daily_report(request: DailyReportRequest) -> dict[str, Any]:
        return validate_sections(
            request.failed,
            request.retested_and_passed,
            request.tested,
        )

    @app.put("/api/automation/daily-reports/{report_name}", status_code=202)
    def save_daily_report(report_name: str, request: DailyReportRequest) -> dict[str, Any]:
        if task_manager.has_active_run():
            raise HTTPException(
                status_code=409,
                detail="Wait for the active automation run before saving a daily report.",
            )
        try:
            normalized_name = normalize_report_name(report_name)
            validation = validate_sections(
                request.failed,
                request.retested_and_passed,
                request.tested,
            )
            path = write_report(
                resolved_config.report_dir,
                normalized_name,
                validation["sections"],  # type: ignore[arg-type]
                overwrite=request.overwrite,
            )
            saved_report = read_report(resolved_config.report_dir, path.name)
            wash_run = task_manager.start_job("wash_daily_reports")
            return {
                "report": saved_report,
                "validation": validation,
                "wash_run": wash_run,
            }
        except ReportNameError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except FileExistsError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8765)
