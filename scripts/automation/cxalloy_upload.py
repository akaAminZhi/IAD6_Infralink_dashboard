"""Compatibility CLI forwarding upload decisions to the EPS Tracker uploader."""
from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.etl.build_cxalloy_report_status import get_tracker_root  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--tracker-root", type=Path, default=get_tracker_root())
    wrapper, vendor_args = parser.parse_known_args(argv)
    root = wrapper.tracker_root.resolve()
    return subprocess.call(
        [sys.executable, "-u", str(root / "upload_cxalloy_reports.py"), *vendor_args],
        cwd=root,
    )


if __name__ == "__main__":
    raise SystemExit(main())
