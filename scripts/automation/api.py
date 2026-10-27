from __future__ import annotations

from datetime import datetime
from contextlib import asynccontextmanager
import json
from pathlib import Path
from typing import Any, Literal

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, model_validator

from scripts.automation.daily_reports import (
    ReportNameError,
    list_mv_reports,
    list_reports,
    normalize_report_name,
    read_mv_report,
    read_report,
    validate_mv_sections,
    validate_sections,
    write_mv_report,
    write_report,
    list_site_reports, read_site_report, validate_site_sections, write_site_report,
)
from scripts.automation.mv_comments import (
    add_mv_equipment_comment,
    delete_mv_equipment_comment,
    list_mv_equipment_comments,
)
from scripts.automation.neta_report_reviews import (
    list_neta_report_reviews,
    update_neta_report_review,
)
from scripts.automation.runner import AutomationConfig, TaskManager
from scripts.automation.auth import require_operator
from scripts.automation.browser_login import BrowserLoginManager, KEYS, WIDTH, HEIGHT


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


class MvDailyReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tested_and_passed: str = ""
    partially_tested: str = ""
    failed: str = ""
    retested_and_passed: str = ""
    overwrite: bool = False


class SiteDailyReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tested_and_passed: str = ""
    failed: str = ""
    retested_and_passed: str = ""
    overwrite: bool = False


class MvEquipmentCommentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    annotation_id: str = Field(min_length=1, max_length=300)
    text: str = Field(min_length=1, max_length=4_000)


class NetaReportReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    file: str = Field(min_length=1, max_length=500)
    status: str = Field(pattern=r"^(PASSED|FAILED)$")


class BrowserActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["screen", "click", "text", "key", "scroll", "save"]
    x: float | None = Field(default=None, ge=0, lt=WIDTH)
    y: float | None = Field(default=None, ge=0, lt=HEIGHT)
    text: str | None = Field(default=None, max_length=4096)
    key: str | None = None
    delta: int | None = Field(default=None, ge=-800, le=800)

    @model_validator(mode="after")
    def validate_action(self) -> BrowserActionRequest:
        if self.kind == "click" and (self.x is None or self.y is None):
            raise ValueError("Click coordinates are required.")
        if self.kind == "text" and self.text is None:
            raise ValueError("Text is required.")
        if self.kind == "key" and self.key not in KEYS:
            raise ValueError("Unsupported key.")
        if self.kind == "scroll" and self.delta is None:
            raise ValueError("Scroll distance is required.")
        return self


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
    browser_logins: BrowserLoginManager | None = None,
) -> FastAPI:
    resolved_config = config or AutomationConfig.discover()
    task_manager = manager or TaskManager(resolved_config)
    login_manager = browser_logins or BrowserLoginManager(resolved_config)
    @asynccontextmanager
    async def lifespan(app):
        yield
        login_manager.shutdown()
    app = FastAPI(title="IAD6 Dashboard Automation", version="1.0.0",
                  dependencies=[Depends(require_operator)], lifespan=lifespan)
    app.state.automation_config = resolved_config
    app.state.task_manager = task_manager
    app.state.browser_logins = login_manager

    @app.middleware("http")
    async def private_api_cache(request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/automation/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    def visible(run: dict[str, Any], user_id: str) -> bool:
        return run.get("owner_user_id") == user_id or (user_id == "local_operator" and run.get("owner_user_id") is None)

    def require_run(run_id: str, user_id: str) -> dict[str, Any]:
        try:
            run = task_manager.get_run(run_id)
        except KeyError as exc:
            raise HTTPException(404, "Task not found.") from exc
        if not visible(run, user_id):
            raise HTTPException(404, "Task not found.")
        return run
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^https?://(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$",
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type", "Authorization"],
    )

    @app.get("/api/automation/access")
    def access(user_id: str = Depends(require_operator)) -> dict[str, str]:
        return {"user_id": user_id}

    @app.get("/api/automation/health")
    def health(user_id: str = Depends(require_operator)) -> dict[str, Any]:
        active_id = task_manager.active_run_id()
        own_active_id = active_id if active_id and visible(task_manager.get_run(active_id), user_id) else None
        return {
            "service_status": "ok",
            "dashboard_root": str(resolved_config.dashboard_root),
            "eps_tracker_root": str(resolved_config.eps_root),
            "eps_tracker_exists": resolved_config.eps_root.is_dir(),
            "report_directory": str(resolved_config.report_dir),
            "mv_report_directory": str(resolved_config.mv_report_dir),
            "site_report_directories": {site: str(resolved_config.site_report_dir(site)) for site in ("onsite", "offsite")},
            "runtime_directory": str(resolved_config.runtime_root),
            "sessions": {
                "jc2": _file_status(resolved_config.session_path(user_id, "jc2")),
                "cxalloy": _file_status(resolved_config.session_path(user_id, "cxalloy")),
            },
            "active_run_id": own_active_id,
            "busy": bool(active_id),
            "session_scope": "personal",
            "last_etl": _last_etl_status(resolved_config),
        }

    @app.get("/api/automation/jobs")
    def jobs() -> list[dict[str, Any]]:
        return task_manager.jobs_public()

    @app.get("/api/automation/runs")
    def runs(user_id: str = Depends(require_operator)) -> list[dict[str, Any]]:
        return [run for run in task_manager.list_runs() if visible(run, user_id)]

    @app.get("/api/automation/runs/{run_id}")
    def run_detail(run_id: str, user_id: str = Depends(require_operator)) -> dict[str, Any]:
        require_run(run_id, user_id)
        try:
            return task_manager.get_run(run_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/api/automation/runs/{run_id}/logs")
    def run_logs(
        run_id: str,
        after: int = Query(default=0, ge=0),
        limit: int = Query(default=65_536, ge=1, le=262_144),
        user_id: str = Depends(require_operator),
    ) -> dict[str, Any]:
        require_run(run_id, user_id)
        try:
            return task_manager.read_log(run_id, after, limit)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/api/automation/jobs/{job_id}/runs", status_code=202)
    def start_job(job_id: str, request: JobRunRequest, user_id: str = Depends(require_operator)) -> dict[str, Any]:
        try:
            return task_manager.start_job(
                job_id,
                request.options.model_dump(),
                confirmed=request.confirmed,
                owner_user_id=user_id,
            )
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post("/api/automation/pipelines/daily/runs", status_code=202)
    def start_daily_pipeline(request: PipelineRunRequest, user_id: str = Depends(require_operator)) -> dict[str, Any]:
        try:
            return task_manager.start_daily_pipeline(request.model_dump(), owner_user_id=user_id)
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post("/api/automation/runs/{run_id}/resume", status_code=202)
    def resume_run(run_id: str, user_id: str = Depends(require_operator)) -> dict[str, Any]:
        require_run(run_id, user_id)
        try:
            return task_manager.resume(run_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post("/api/automation/runs/{run_id}/cancel", status_code=202)
    def cancel_run(run_id: str, user_id: str = Depends(require_operator)) -> dict[str, Any]:
        require_run(run_id, user_id)
        try:
            return task_manager.cancel(run_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post("/api/automation/logins/{provider}", status_code=202)
    def start_login(provider: str) -> dict[str, Any]:
        raise HTTPException(410, "Use the personal browser login window in Data Operations.")

    @app.post("/api/automation/browser-logins/{provider}", status_code=202)
    def start_browser_login(provider: Literal["jc2", "cxalloy"], user_id: str = Depends(require_operator)):
        try:
            return login_manager.start(user_id, provider)
        except (ValueError, OSError, StopIteration) as exc:
            raise HTTPException(503, "Provider login configuration is unavailable on the automation host.") from exc

    @app.post("/api/automation/browser-logins/{session_id}/actions")
    def browser_action(session_id: str, action: BrowserActionRequest, user_id: str = Depends(require_operator)):
        return login_manager.command(user_id, session_id, action.model_dump(exclude_none=True))

    @app.delete("/api/automation/browser-logins/{session_id}")
    def close_browser_login(session_id: str, user_id: str = Depends(require_operator)):
        return login_manager.close(user_id, session_id)

    @app.delete("/api/automation/provider-sessions/{provider}")
    def disconnect_provider(provider: Literal["jc2", "cxalloy"], user_id: str = Depends(require_operator)):
        if task_manager.has_active_run():
            raise HTTPException(409, "Wait for the active task before disconnecting.")
        login_manager.disconnect(user_id, provider)
        return {"provider": provider, "disconnected": True}

    @app.post("/api/automation/runs/{run_id}/continue", status_code=202)
    def continue_login(run_id: str, user_id: str = Depends(require_operator)) -> dict[str, Any]:
        require_run(run_id, user_id)
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
    def save_daily_report(report_name: str, request: DailyReportRequest, user_id: str = Depends(require_operator)) -> dict[str, Any]:
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
            wash_run = task_manager.start_job("wash_daily_reports", owner_user_id=user_id)
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

    @app.get("/api/automation/mv-daily-reports")
    def mv_daily_reports() -> list[dict[str, Any]]:
        return list_mv_reports(resolved_config.mv_report_dir)

    @app.get("/api/automation/mv-daily-reports/{report_name}")
    def mv_daily_report(report_name: str) -> dict[str, Any]:
        try:
            return read_mv_report(resolved_config.mv_report_dir, report_name)
        except ReportNameError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/api/automation/mv-daily-reports/validate")
    def validate_mv_daily_report(request: MvDailyReportRequest) -> dict[str, Any]:
        return validate_mv_sections(
            request.tested_and_passed,
            request.partially_tested,
            request.failed,
            request.retested_and_passed,
        )

    @app.put("/api/automation/mv-daily-reports/{report_name}", status_code=202)
    def save_mv_daily_report(
        report_name: str,
        request: MvDailyReportRequest,
    ) -> dict[str, Any]:
        if task_manager.has_active_run():
            raise HTTPException(
                status_code=409,
                detail="Wait for the active automation run before saving an MV daily report.",
            )
        try:
            normalized_name = normalize_report_name(report_name)
            validation = validate_mv_sections(
                request.tested_and_passed,
                request.partially_tested,
                request.failed,
                request.retested_and_passed,
            )
            path = write_mv_report(
                resolved_config.mv_report_dir,
                normalized_name,
                validation["sections"],  # type: ignore[arg-type]
                overwrite=request.overwrite,
            )
            return {
                "report": read_mv_report(resolved_config.mv_report_dir, path.name),
                "validation": validation,
            }
        except ReportNameError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except FileExistsError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.get("/api/automation/site-daily-reports/{site}")
    def site_reports(site: Literal["onsite", "offsite"]) -> list[dict[str, Any]]:
        return list_site_reports(resolved_config.site_report_dir(site), site)

    @app.get("/api/automation/site-daily-reports/{site}/{report_name}")
    def site_report(site: Literal["onsite", "offsite"], report_name: str) -> dict[str, Any]:
        try:
            return read_site_report(resolved_config.site_report_dir(site), report_name, site)
        except FileNotFoundError as exc:
            raise HTTPException(404, "Daily report not found.") from exc
        except ReportNameError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post("/api/automation/site-daily-reports/{site}/validate")
    def validate_site_report(site: Literal["onsite", "offsite"], request: SiteDailyReportRequest) -> dict[str, Any]:
        try:
            return validate_site_sections(request.tested_and_passed, request.failed, request.retested_and_passed)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.put("/api/automation/site-daily-reports/{site}/{report_name}", status_code=202)
    def save_site_report(site: Literal["onsite", "offsite"], report_name: str, request: SiteDailyReportRequest,
                         user_id: str = Depends(require_operator)) -> dict[str, Any]:
        if task_manager.has_active_run():
            raise HTTPException(409, "Wait for the active automation run before saving a daily report.")
        try:
            validation = validate_site_sections(request.tested_and_passed, request.failed, request.retested_and_passed)
            path = write_site_report(resolved_config.site_report_dir(site), report_name,
                                     validation["sections"], overwrite=request.overwrite)
        except FileExistsError as exc:
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        # A saved report remains available even if summary scheduling fails.
        try:
            wash_run = task_manager.start_job("wash_daily_reports", owner_user_id=user_id)
            rebuild_error = None
        except (RuntimeError, ValueError) as exc:
            wash_run, rebuild_error = None, str(exc)
        return {"report": read_site_report(resolved_config.site_report_dir(site), path.name, site),
                "validation": validation, "wash_run": wash_run, "rebuild_error": rebuild_error}

    @app.get("/api/automation/mv-equipment-comments")
    def mv_equipment_comments() -> dict[str, list[dict[str, str]]]:
        return {"comments": list_mv_equipment_comments(resolved_config.runtime_root)}

    @app.get("/api/automation/neta-report-reviews")
    def neta_report_reviews() -> dict[str, Any]:
        try:
            return list_neta_report_reviews(resolved_config.neta_report_results_path)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @app.put("/api/automation/neta-report-reviews")
    def save_neta_report_review(request: NetaReportReviewRequest) -> dict[str, Any]:
        try:
            return {
                "report": update_neta_report_review(
                    resolved_config.neta_report_results_path,
                    request.file,
                    request.status,
                )
            }
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except (OSError, ValueError) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post("/api/automation/mv-equipment-comments", status_code=201)
    def add_mv_equipment_comment_endpoint(
        request: MvEquipmentCommentRequest,
    ) -> dict[str, dict[str, str]]:
        annotation_id = request.annotation_id.strip()
        text = request.text.strip()
        if not annotation_id or not text:
            raise HTTPException(status_code=422, detail="Annotation ID and comment text are required.")
        return {
            "comment": add_mv_equipment_comment(
                resolved_config.runtime_root,
                annotation_id,
                text,
            )
        }

    @app.delete("/api/automation/mv-equipment-comments/{comment_id}")
    def delete_mv_equipment_comment_endpoint(comment_id: str) -> dict[str, str]:
        if not comment_id or len(comment_id) > 100:
            raise HTTPException(status_code=422, detail="Comment ID is invalid.")
        if not delete_mv_equipment_comment(resolved_config.runtime_root, comment_id):
            raise HTTPException(status_code=404, detail="Comment was not found.")
        return {"comment_id": comment_id}

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8765)
