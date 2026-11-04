"""Build CxAlloy detail links offline; --refresh explicitly reads project identities.

Only equipment-list navigation is used. No uploads, edits, or browser session
data are included in either the private identity snapshot or published links.
"""
from __future__ import annotations

import argparse
import ast
import json
import os
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlsplit

try:
    from .json_utils import load_records_json, write_json
    from .schemas import CxalloyEquipmentLink
except ImportError:
    from json_utils import load_records_json, write_json
    from schemas import CxalloyEquipmentLink

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"
CACHE_PATH = PROJECT_ROOT / "runtime" / "automation" / "cxalloy_equipment_ids.json"
OUTPUT_PATH = DATA_DIR / "cxalloy_equipment_links.json"
ORIGIN = "https://tq.cxalloy.com"
DEFAULT_PROJECT_URL = f"{ORIGIN}/project/49402/equipment"


def key(value: Any) -> str:
    return str(value or "").strip().upper()


def valid_id(value: Any) -> bool:
    return re.fullmatch(r"[1-9][0-9]*", str(value)) is not None


def configured_project_url(tracker_root: Path | None = None) -> str:
    configured = os.environ.get("CXALLOY_PROJECT_URL")
    if configured:
        return configured
    tracker_root = tracker_root or Path(os.environ.get(
        "IAD6_EPS_TRACKER_ROOT", PROJECT_ROOT.parent / "IAD6_EPS_Testing_Tracker"))
    source = tracker_root / "upload_cxalloy_reports.py"
    if source.is_file():
        # Read configuration without importing any upload machinery.
        tree = ast.parse(source.read_text(encoding="utf-8-sig"))
        for node in tree.body:
            if isinstance(node, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id == "DEFAULT_PROJECT_URL"
                for target in node.targets
            ):
                return str(ast.literal_eval(node.value))
        raise ValueError("Tracker DEFAULT_PROJECT_URL is unavailable; specify --project-url.")
    return DEFAULT_PROJECT_URL


def project_identity(project_url: str) -> tuple[str, str]:
    parsed = urlsplit(project_url)
    match = re.fullmatch(r"/project/([1-9][0-9]*)/equipment/?", parsed.path)
    if (parsed.scheme != "https" or parsed.netloc != "tq.cxalloy.com"
            or not match or parsed.query):
        raise ValueError("Expected an HTTPS tq.cxalloy.com project equipment-list URL.")
    project_id = match[1]
    return project_id, f"{ORIGIN}/project/{project_id}/equipment"


def lookup_names(reference: str) -> list[str]:
    names = [key(reference)]
    if names[0].startswith("IAD06-"):
        names.append(names[0][6:])
    # Match the Tracker's narrowly scoped website-only Utility alias.
    match = re.fullmatch(r"UTILITY6-0([1-8])", names[-1])
    if match:
        names.append(f"UTILITY6-{match[1]}")
    return names


def build_links(equipment: list[dict], snapshot: list[dict], project_id: str) -> dict[str, Any]:
    if not valid_id(project_id):
        raise ValueError("Invalid CxAlloy project ID.")
    candidates: dict[str, dict[str, str]] = defaultdict(dict)
    for row in snapshot:
        if not isinstance(row, dict):
            continue
        identifier, name = str(row.get("cxalloy_id") or ""), str(row.get("cxalloy_name") or "").strip()
        if name and valid_id(identifier) and str(row.get("project_id")) == project_id:
            candidates[key(name)][identifier] = name
    records, missing, ambiguous = [], [], []
    for reference in sorted({str(row.get("equipment_id") or "").strip() for row in equipment} - {""}):
        found: dict[str, str] = {}
        for name in lookup_names(reference):
            found = candidates.get(name, {})
            if found:
                break  # Exact names (including ambiguous ones) always win.
        if len(found) == 1:
            identifier, name = next(iter(found.items()))
            records.append(CxalloyEquipmentLink(reference, project_id, identifier, name).to_dict())
        elif found:
            ambiguous.append({"equipment_id": reference, "candidates": [
                {"project_id": project_id, "cxalloy_id": identifier, "cxalloy_name": name}
                for identifier, name in sorted(found.items())
            ]})
        else:
            missing.append(reference)
    return {"project_id": project_id, "records": records,
            "missing_equipment_ids": missing, "ambiguous_equipment": ambiguous}


def collect_snapshot(page: Any, project_url: str, timeout_ms: int = 60000) -> list[dict[str, str]]:
    """Read all equipment-list pages, using the Tracker's existing Next control."""
    project_id, base = project_identity(project_url)
    page.goto(f"{base}#sort%5B%5D=name", wait_until="domcontentloaded", timeout=timeout_ms)
    rows: dict[str, dict[str, str]] = {}
    seen: set[tuple[str, ...]] = set()
    expected_total: int | None = None
    while True:
        page.wait_for_function("""() => location.hostname !== 'tq.cxalloy.com'
            || /\\/(auth|login|signin)(?:[/?]|$)/i.test(location.pathname)
            || !!document.querySelector('#items_list .list-header')""", timeout=timeout_ms)
        parsed = urlsplit(page.url)
        if parsed.netloc != "tq.cxalloy.com" or parsed.path.rstrip("/") != urlsplit(base).path:
            raise RuntimeError("CxAlloy login expired or project access denied; refresh your CxAlloy login.")
        header = page.locator("#items_list .list-header").inner_text()
        total_match = re.search(r"\b([0-9][0-9,]*)\s+Equipment\s+sorted\s+by\s+name\b", header, re.I)
        if not total_match:
            raise ValueError("CxAlloy equipment total not found; cannot verify a complete inventory.")
        total = int(total_match[1].replace(",", ""))
        if expected_total is not None and total != expected_total:
            raise ValueError("CxAlloy inventory changed during lookup; snapshot retained. Retry the refresh.")
        expected_total = total
        links = page.locator("a.item-card-name")
        batch = links.evaluate_all("nodes => nodes.map(node => ({name: node.textContent.trim(), href: node.href}))")
        identifiers = []
        for row in batch:
            detail = urlsplit(urljoin(base, row["href"]))
            match = re.fullmatch(rf"/project/{project_id}/equipment/([1-9][0-9]*)/?", detail.path)
            if (detail.scheme != "https" or detail.netloc != "tq.cxalloy.com" or not match
                    or detail.query or detail.fragment or not row["name"]):
                raise ValueError("Invalid or out-of-project CxAlloy equipment link; snapshot retained.")
            identifier = match[1]
            if identifier in rows:
                raise ValueError("CxAlloy pagination repeated an equipment ID; snapshot retained.")
            identifiers.append(identifier)
            rows[identifier] = {"project_id": project_id, "cxalloy_id": identifier, "cxalloy_name": row["name"]}
        signature = tuple(identifiers)
        if (not signature and expected_total != 0) or signature in seen:
            raise ValueError("Empty or repeated CxAlloy page; cannot verify a complete inventory.")
        seen.add(signature)
        next_page = page.locator('a.page-item[data-filtername="page"]').filter(has_text=re.compile(r"^\s*Next\b", re.I))
        if not next_page.count():
            raise ValueError("CxAlloy pagination controls not found; snapshot retained.")
        enabled = next_page.locator("xpath=self::*[not(contains(concat(' ', normalize-space(@class), ' '), ' disabled '))]")
        print(f"Read CxAlloy identities: page {len(seen)}, {len(rows)} equipment", flush=True)
        if not enabled.count():
            if len(rows) != expected_total:
                raise ValueError("Incomplete CxAlloy inventory; equipment total does not match scanned IDs.")
            break
        if len(rows) >= expected_total:
            raise ValueError("CxAlloy pagination exceeds the equipment total; snapshot retained.")
        enabled.first.click(timeout=timeout_ms)
        page.wait_for_function("""old => location.hostname !== 'tq.cxalloy.com'
            || /\\/(auth|login|signin)(?:[/?]|$)/i.test(location.pathname)
            || (document.querySelectorAll('a.item-card-name').length > 0
                && JSON.stringify(Array.from(document.querySelectorAll('a.item-card-name'), node => node.href))
                    !== JSON.stringify(old))""", arg=[row["href"] for row in batch], timeout=timeout_ms)
    return list(rows.values())


def refresh_snapshot(auth_state: Path, project_url: str, cache_path: Path = CACHE_PATH) -> None:
    project_id, _ = project_identity(project_url)
    if not auth_state.is_file():
        raise FileNotFoundError("Saved CxAlloy session not found; supply your explicit --auth-state path.")
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            context = browser.new_context(storage_state=str(auth_state))
            records = collect_snapshot(context.new_page(), project_url)
        finally:
            browser.close()
    # Atomic publication happens only after a successful complete scan.
    write_json(cache_path, {"generated_at": datetime.now().astimezone().isoformat(),
                            "project_id": project_id, "records": records})


def run_build(equipment_path: Path = DATA_DIR / "equipment.json", cache_path: Path = CACHE_PATH,
              output_path: Path = OUTPUT_PATH, project_url: str | None = None) -> dict[str, Any]:
    project_id, _ = project_identity(project_url or configured_project_url())
    source = cache_path if cache_path.exists() else output_path
    snapshot = load_records_json(source) if source.exists() else []
    metadata = json.loads(source.read_text(encoding="utf-8")) if source.exists() else {}
    metadata = metadata if isinstance(metadata, dict) else {}
    if metadata.get("project_id") and str(metadata["project_id"]) != project_id:
        raise ValueError("CxAlloy snapshot belongs to another project; refresh before rebuilding links.")
    if source == output_path:
        # Published identities remain usable on hosts without the private snapshot.
        snapshot = [{**row, "cxalloy_name": row["equipment_id"]} for row in snapshot]
        for diagnostic in metadata.get("ambiguous_equipment", []):
            snapshot.extend({**row, "cxalloy_name": diagnostic["equipment_id"]}
                            for row in diagnostic["candidates"])
    result = build_links(load_records_json(equipment_path), snapshot, project_id)
    if source == output_path:
        original_names = {key(row["equipment_id"]): row["cxalloy_name"] for row in load_records_json(source)} if source.exists() else {}
        for row in result["records"]:
            row["cxalloy_name"] = original_names.get(key(row["equipment_id"]), row["cxalloy_name"])
        prior_ambiguities = {key(row["equipment_id"]): row["candidates"]
                             for row in metadata.get("ambiguous_equipment", [])}
        for diagnostic in result["ambiguous_equipment"]:
            diagnostic["candidates"] = prior_ambiguities.get(key(diagnostic["equipment_id"]), diagnostic["candidates"])
    result.update(generated_at=datetime.now().astimezone().isoformat(), snapshot_available=source.exists(),
                  snapshot_generated_at=metadata.get("snapshot_generated_at") or metadata.get("generated_at"))
    write_json(output_path, result)
    print(f"CxAlloy links: {len(result['records'])}; missing: {len(result['missing_equipment_ids'])}; "
          f"ambiguous: {len(result['ambiguous_equipment'])}")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Read the complete project equipment inventory")
    parser.add_argument("--auth-state", type=Path, help="Explicit operator CxAlloy state; never auto-discovered")
    parser.add_argument("--tracker-root", type=Path)
    parser.add_argument("--project-url")
    args = parser.parse_args()
    project_url = args.project_url or configured_project_url(args.tracker_root)
    if args.refresh:
        if args.auth_state is None:
            parser.error("--refresh requires --auth-state")
        refresh_snapshot(args.auth_state, project_url)
    run_build(project_url=project_url)


if __name__ == "__main__":
    main()
