from __future__ import annotations

from scripts.etl import run_etl


def test_run_steps_stops_after_first_failure(monkeypatch, capsys) -> None:
    calls: list[str] = []

    def first() -> None:
        calls.append("first")

    def failing() -> None:
        calls.append("failing")
        raise RuntimeError("broken input")

    def never_runs() -> None:
        calls.append("never")

    monkeypatch.setattr(
        run_etl,
        "build_pipeline_steps",
        lambda input_files: [
            ("first.py", first),
            ("failing.py", failing),
            ("never.py", never_runs),
        ],
    )

    assert run_etl.run_steps({}) is False
    assert calls == ["first", "failing"]
    output = capsys.readouterr().out
    assert "ERROR: ETL step failed: failing.py" in output
    assert "RuntimeError: broken input" in output


def test_run_steps_completes_every_registered_step(monkeypatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(
        run_etl,
        "build_pipeline_steps",
        lambda input_files: [
            ("one.py", lambda: calls.append("one")),
            ("two.py", lambda: calls.append("two")),
        ],
    )

    assert run_etl.run_steps({}) is True
    assert calls == ["one", "two"]
