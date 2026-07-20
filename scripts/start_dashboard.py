from __future__ import annotations

import os
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
            ],
            cwd=PROJECT_ROOT,
        )
        print("Starting dashboard at http://127.0.0.1:5173")
        frontend_process = subprocess.Popen(
            [npm, "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"],
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

