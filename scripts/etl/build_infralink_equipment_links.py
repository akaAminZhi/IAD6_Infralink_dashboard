"""Build direct JC2 device links from a read-only, project-scoped ID snapshot.

Normal ETL uses only local files. --refresh explicitly reads JC2 using the
operator's saved browser session; no session data is published in the snapshot.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

try:
    from .json_utils import load_records_json, write_json
    from .schemas import InfralinkEquipmentLink
except ImportError:
    from json_utils import load_records_json, write_json
    from schemas import InfralinkEquipmentLink

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "frontend" / "public" / "data"
CACHE_PATH = PROJECT_ROOT / "runtime" / "automation" / "infralink_equipment_ids.json"
OUTPUT_PATH = DATA_DIR / "infralink_equipment_links.json"
JC2_ORIGIN = "https://jc2.mcdean.com"


def key(value: Any) -> str:
    return str(value or "").strip().upper()


def build_links(equipment: list[dict], snapshot: list[dict]) -> dict[str, Any]:
    candidates: dict[str, set[str]] = defaultdict(set)
    for row in snapshot:
        reference, identifier = key(row.get("equipment_id")), str(row.get("infralink_id") or "")
        if reference and re.fullmatch(r"[1-9][0-9]*", identifier):
            candidates[reference].add(identifier)
    records, missing, ambiguous = [], [], []
    for reference in sorted({str(row.get("equipment_id") or "").strip() for row in equipment} - {""}):
        identifiers = candidates.get(key(reference), set())
        if len(identifiers) == 1:
            records.append(InfralinkEquipmentLink(reference, next(iter(identifiers))).to_dict())
        elif identifiers:
            ambiguous.append({"equipment_id": reference, "infralink_ids": sorted(identifiers)})
        else:
            missing.append(reference)
    return {"records": records, "missing_equipment_ids": missing, "ambiguous_equipment": ambiguous}


def grid_payload(contract_ids: list[int], offset: int, page_size: int = 5000) -> dict[str, Any]:
    return {
        "pageSize": page_size, "pageOffset": offset, "search": None,
        "loadGridConfig": {"gridConfigUUID": None, "gridConfigId": None, "gridConfig": {
            "columns": ["name"], "filters": ["contract", "disabled"],
            "sortInfo": {"column": "name"}, "filterValues": [
                {"filterId": "contract", "value": {"entityIds": contract_ids, "excludeInactive": False}},
                {"filterId": "disabled", "value": "EXCLUDE"},
            ],
        }},
        "dataLoadOptions": {"pinnedFilters": [], "idsToInclude": None, "idsToExclude": None,
                                "quickSearchMode": False},
        "metaDataLoadOptions": {"metaDataLoadMode": "MIN", "includeReservedColumns": False},
    }


def collect_snapshot(request, headers: dict[str, str], contract_ids: list[int]) -> list[dict[str, str]]:
    """Only the Device/entities read query is allowed here (POST is its query verb)."""
    rows: dict[str, str] = {}
    offset, expected_total = 0, None
    while True:
        response = request.post(f"{JC2_ORIGIN}/resources/webclient/Device/entities",
                                data=grid_payload(contract_ids, offset), headers=headers, timeout=60000)
        if response.status in {401, 403}:
            raise RuntimeError("JC2 session expired or access denied; refresh the saved JC2 login.")
        if response.status != 200:
            raise RuntimeError(f"JC2 device lookup failed (HTTP {response.status}).")
        payload = response.json()
        total, batch = payload.get("total"), payload.get("data")
        if not isinstance(total, int) or not isinstance(batch, list):
            raise ValueError("Unexpected JC2 device response; existing link snapshot was retained.")
        if expected_total is not None and total != expected_total:
            raise ValueError("JC2 inventory changed during lookup; retry to obtain a complete snapshot.")
        expected_total = total
        for row in batch:
            name = row.get("data", {}).get("name", {})
            identifier = str(row.get("id") or "")
            reference = str(name.get("displayValue") or "").strip()
            if not re.fullmatch(r"[1-9][0-9]*", identifier) or not reference or name.get("entity") != "Device":
                raise ValueError("Invalid JC2 device identity; existing link snapshot was retained.")
            if identifier in rows:
                raise ValueError("JC2 pagination repeated a device; retry the snapshot.")
            rows[identifier] = reference
        offset += len(batch)
        if offset > total:
            raise ValueError("JC2 pagination exceeded the inventory total; retry the snapshot.")
        print(f"Read JC2 equipment identities: {offset}/{total}", flush=True)
        if offset >= total:
            break
        if not batch:
            raise ValueError("Incomplete JC2 device lookup; existing link snapshot was retained.")
    return [InfralinkEquipmentLink(reference, identifier).to_dict() for identifier, reference in rows.items()]


def refresh_snapshot(auth_state: Path, tracker_root: Path, cache_path: Path = CACHE_PATH) -> None:
    # Reuse the same project contract scope as the sibling NETA downloader's view.
    configured = os.environ.get("JC2_SYSTEM_ELEMENTS_URL") or (
        tracker_root / "config" / "jc2_system_elements_url.txt"
    ).read_text(encoding="utf-8-sig").strip()
    parsed = urlsplit(configured)
    scope = re.search(r"(?:^|;)contracts\.contract\.id=([0-9,]+)(?:;|$)", parsed.fragment)
    if parsed.scheme != "https" or parsed.netloc != "jc2.mcdean.com" or not scope:
        raise ValueError("The tracker JC2 view must specify an HTTPS JC2 project contract scope.")
    if not auth_state.is_file():
        raise FileNotFoundError("Saved JC2 session not found; supply --auth-state.")
    contract_ids = [int(value) for value in scope.group(1).split(",")]
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            context = browser.new_context(storage_state=str(auth_state))
            page = context.new_page()
            # The app sends an anti-CSRF header with read queries. Keep it only in
            # memory; never copy cookies, headers, or storage state into outputs.
            with page.expect_request(lambda req: req.url == f"{JC2_ORIGIN}/resources/webclient/Device/entitiesTree",
                                     timeout=60000) as initial_query:
                page.goto(f"{JC2_ORIGIN}/imms-js-webapp/#/view/SystemElement_", wait_until="domcontentloaded")
            csrf = initial_query.value.header_value("x-xsrf-token")
            if not csrf:
                raise RuntimeError("JC2 session is not ready; refresh the saved JC2 login.")
            records = collect_snapshot(context.request, {"x-xsrf-token": csrf}, contract_ids)
        finally:
            browser.close()
    write_json(cache_path, {"generated_at": datetime.now().astimezone().isoformat(), "records": records})


def run_build(equipment_path: Path = DATA_DIR / "equipment.json", cache_path: Path = CACHE_PATH,
              output_path: Path = OUTPUT_PATH) -> dict[str, Any]:
    source = cache_path if cache_path.exists() else output_path
    snapshot = load_records_json(source) if source.exists() else []
    source_metadata = json.loads(source.read_text(encoding="utf-8")) if source.exists() else {}
    result = build_links(load_records_json(equipment_path), snapshot)
    result["generated_at"] = datetime.now().astimezone().isoformat()
    result["snapshot_available"] = source.exists()
    result["snapshot_generated_at"] = (source_metadata.get("snapshot_generated_at") or source_metadata.get("generated_at")) if isinstance(source_metadata, dict) else None
    write_json(output_path, result)
    print(f"Infralink links: {len(result['records'])}; missing: {len(result['missing_equipment_ids'])}; "
          f"ambiguous: {len(result['ambiguous_equipment'])}")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Read project device IDs from JC2 before building")
    parser.add_argument("--auth-state", type=Path)
    parser.add_argument("--tracker-root", type=Path, default=Path(os.environ.get(
        "IAD6_EPS_TRACKER_ROOT", PROJECT_ROOT.parent / "IAD6_EPS_Testing_Tracker")))
    args = parser.parse_args()
    if args.refresh:
        if args.auth_state is None:
            parser.error("--refresh requires --auth-state")
        refresh_snapshot(args.auth_state, args.tracker_root)
    run_build()


if __name__ == "__main__":
    main()
