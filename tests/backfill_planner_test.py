import importlib.util
import io
from contextlib import redirect_stdout
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "init_newapi_logs.py"
spec = importlib.util.spec_from_file_location("init_newapi_logs", MODULE_PATH)
init_newapi_logs = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(init_newapi_logs)


def test_full_hour_window_splits_to_minutes():
    windows = init_newapi_logs.plan_child_windows(100, 3700, fetched=1000, page_size=1000)

    assert windows[0] == (100, 160)
    assert windows[-1] == (3640, 3700)
    assert len(windows) == 60


def test_sparse_hour_window_does_not_split():
    assert init_newapi_logs.plan_child_windows(100, 3700, fetched=241, page_size=1000) == []


def test_dry_run_does_not_require_credentials():
    output = io.StringIO()
    with redirect_stdout(output):
        code = init_newapi_logs.main(["--start", "1780243200", "--end", "1780246800", "--dry-run"])

    assert code == 0
    assert "[dry-run]" in output.getvalue()


def test_minute_window_at_cap_is_reported_as_capped():
    args = type(
        "Args",
        (),
        {
            "dry_run": False,
            "split_threshold": 1000,
            "min_window_seconds": 60,
            "sleep_seconds": 0,
        },
    )()
    local_server = type("LocalServer", (), {})()
    calls = []

    def fetch_window(_local_server, _args, start, end):
        calls.append((start, end))
        return {"fetched": 1000, "inserted_rows": [], "pages": 10}

    original = init_newapi_logs.fetch_window
    try:
        init_newapi_logs.fetch_window = fetch_window
        with redirect_stdout(io.StringIO()):
            result = init_newapi_logs.sync_window(local_server, args, 100, 160)
    finally:
        init_newapi_logs.fetch_window = original

    assert calls == [(100, 160)]
    assert result["capped"] is True


def test_capped_main_clears_existing_backfill_complete():
    calls = []
    fake = type("FakeLocalServer", (), {})()
    fake.RateLimitedError = RuntimeError
    fake.init_db = lambda: calls.append("init_db")
    fake.make_sync_key = lambda base_url, api_user, access_token: "sync-key"
    fake.get_global_latest_created_at = lambda: 123
    fake.save_sync_state = lambda sync_key, base_url, api_user, access_token, newest: calls.append(("save", sync_key, newest))
    fake.mark_backfill_complete = lambda sync_key: calls.append(("complete", sync_key))
    fake.mark_backfill_incomplete = lambda sync_key, warning=None: calls.append(("incomplete", sync_key, warning))
    fake.get_log_summary = lambda: {"all": {"usedAmount": 0}, "today": {"usedAmount": 0}}

    original_load = init_newapi_logs.load_local_server
    original_sync = init_newapi_logs.sync_window
    try:
        init_newapi_logs.load_local_server = lambda: fake
        init_newapi_logs.sync_window = lambda local_server, args, start, end: {
            "fetched": 1000,
            "inserted": 0,
            "windows": 1,
            "capped": True,
        }
        with redirect_stdout(io.StringIO()):
            code = init_newapi_logs.main(
                [
                    "--base-url",
                    "https://www.cctq.ai",
                    "--access-token",
                    "token",
                    "--api-user",
                    "5781",
                    "--start",
                    "1780243200",
                    "--end",
                    "1780246800",
                ]
            )
    finally:
        init_newapi_logs.load_local_server = original_load
        init_newapi_logs.sync_window = original_sync

    assert code == 0
    assert ("complete", "sync-key") not in calls
    incomplete = [call for call in calls if call[0] == "incomplete"]
    assert incomplete
    assert incomplete[0][1] == "sync-key"
    assert "logs may be truncated" in incomplete[0][2]


if __name__ == "__main__":
    test_full_hour_window_splits_to_minutes()
    test_sparse_hour_window_does_not_split()
    test_dry_run_does_not_require_credentials()
    test_minute_window_at_cap_is_reported_as_capped()
    test_capped_main_clears_existing_backfill_complete()
    print("backfill planner tests passed")
