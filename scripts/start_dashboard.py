from __future__ import annotations

import os
import argparse
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time


PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_ROOT = PROJECT_ROOT / "frontend"


def terminate(process: subprocess.Popen[bytes] | None) -> None:
    if process is None or process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            capture_output=True,
            check=False,
        )
    else:
        process.send_signal(signal.SIGTERM)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


def main() -> int:
    parser = argparse.ArgumentParser(description="Start the dashboard and local automation API.")
    parser.add_argument("--preview", action="store_true",
                        help="Build once and serve compiled frontend assets on port 5173.")
    args = parser.parse_args()
    from dotenv import load_dotenv

    load_dotenv(PROJECT_ROOT / ".env.local")
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if npm is None:
        print("npm was not found. Install Node.js before starting the dashboard.")
        return 1

    try:
        __import__("fastapi")
        __import__("uvicorn")
    except ImportError:
        print("Automation dependencies are missing. Run: pip install -r requirements.txt")
        return 1

    if args.preview:
        print("Building frontend assets for preview...")
        build = subprocess.run(
            [npm, "run", "build"], cwd=FRONTEND_ROOT, check=False,
            env={**os.environ, "IAD6_PREVIEW_BUILD": "1"},
        )
        if build.returncode:
            return build.returncode

    api_process: subprocess.Popen[bytes] | None = None
    frontend_process: subprocess.Popen[bytes] | None = None
    try:
        print("Starting local automation service at http://127.0.0.1:8765")
        api_process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "scripts.automation.api:app",
                "--host",
                "127.0.0.1",
                "--port",
                "8765",
                "--reload",
                "--reload-dir",
                str(PROJECT_ROOT / "scripts" / "automation"),
            ],
            cwd=PROJECT_ROOT,
        )
        frontend_mode = "preview" if args.preview else "dev"
        print(f"Starting dashboard ({frontend_mode}) at http://127.0.0.1:5173")
        frontend_process = subprocess.Popen(
            [npm, "run", frontend_mode, "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"],
            cwd=FRONTEND_ROOT,
        )

        while True:
            api_exit = api_process.poll()
            frontend_exit = frontend_process.poll()
            if api_exit is not None:
                print(f"Automation service exited with code {api_exit}.")
                return api_exit
            if frontend_exit is not None:
                print(f"Frontend exited with code {frontend_exit}.")
                return frontend_exit
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nStopping dashboard services...")
        return 0
    finally:
        terminate(frontend_process)
        terminate(api_process)


if __name__ == "__main__":
    raise SystemExit(main())
