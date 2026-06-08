import importlib.util
import json
import sqlite3
import shutil
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVER_PATH = ROOT / "local-server.py"


spec = importlib.util.spec_from_file_location("local_server", SERVER_PATH)
local_server = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(local_server)


def test_codex_rate_limits_normalize_remaining_and_reset_time():
    quota = local_server.normalize_codex_rate_limits(
        {
            "primary": {
                "used_percent": 6,
                "window_minutes": 300,
                "resets_at": 1780728056,
            },
            "secondary": {
                "used_percent": 33,
                "window_minutes": 10080,
                "resets_at": 1781141666,
            },
            "plan_type": "plus",
        }
    )

    assert quota["window5h"]["usedPercent"] == 6
    assert quota["window5h"]["remainingPercent"] == 94
    assert quota["window5h"]["windowMinutes"] == 300
    assert quota["window5h"]["resetAt"].startswith("2026-06-06T")
    assert quota["weekly"]["remainingPercent"] == 67
    assert quota["weekly"]["windowMinutes"] == 10080
    assert quota["planType"] == "plus"


def test_codex_token_reader_reuses_session_and_reads_appended_events():
    tmp_path = Path(tempfile.mkdtemp())
    original_sessions = local_server.CODEX_SESSIONS
    try:
        sessions = tmp_path / "sessions" / "2026" / "06" / "06"
        sessions.mkdir(parents=True)
        session_file = sessions / "rollout.jsonl"
        session_file.write_text(
            json.dumps(
                make_codex_token_event(
                    "2026-06-06T02:00:00.000Z",
                    input_tokens=100,
                    cached_input_tokens=80,
                    output_tokens=5,
                    used_percent=10,
                    weekly_used_percent=20,
                )
            )
            + "\n",
            encoding="utf-8",
        )
        local_server.CODEX_SESSIONS = tmp_path / "sessions"
        local_server.reset_codex_session_discovery_cache()
        local_server.reset_codex_token_event_cache()

        first = local_server.get_latest_codex_token_usage()
        assert first["available"] is True
        assert first["usage"]["inputTokens"] == 100
        assert first["quota"]["window5h"]["remainingPercent"] == 90
        first_offset = local_server.CODEX_TOKEN_EVENT_CACHE["offset"]
        assert first_offset > 0

        with session_file.open("a", encoding="utf-8") as handle:
            handle.write(
                json.dumps(
                    make_codex_token_event(
                        "2026-06-06T02:00:03.000Z",
                        input_tokens=200,
                        cached_input_tokens=160,
                        output_tokens=8,
                        used_percent=11,
                        weekly_used_percent=21,
                    )
                )
                + "\n"
            )

        second = local_server.get_latest_codex_token_usage()
        assert second["available"] is True
        assert second["usage"]["inputTokens"] == 200
        assert second["quota"]["window5h"]["remainingPercent"] == 89
        assert local_server.CODEX_TOKEN_EVENT_CACHE["offset"] > first_offset
    finally:
        local_server.CODEX_SESSIONS = original_sessions
        local_server.reset_codex_session_discovery_cache()
        local_server.reset_codex_token_event_cache()
        shutil.rmtree(tmp_path, ignore_errors=True)


def make_codex_token_event(
    timestamp,
    *,
    input_tokens,
    cached_input_tokens,
    output_tokens,
    used_percent,
    weekly_used_percent,
):
    return {
        "timestamp": timestamp,
        "type": "event_msg",
        "payload": {
            "type": "token_count",
            "info": {
                "last_token_usage": {
                    "input_tokens": input_tokens,
                    "cached_input_tokens": cached_input_tokens,
                    "output_tokens": output_tokens,
                    "total_tokens": input_tokens + output_tokens,
                    "reasoning_output_tokens": 0,
                }
            },
            "rate_limits": {
                "primary": {
                    "used_percent": used_percent,
                    "window_minutes": 300,
                    "resets_at": 1780728056,
                },
                "secondary": {
                    "used_percent": weekly_used_percent,
                    "window_minutes": 10080,
                    "resets_at": 1781141666,
                },
                "plan_type": "plus",
            },
        },
    }


def test_summary_account_uses_cached_topup_total():
    tmp_path = Path(tempfile.mkdtemp())
    original_data_dir = local_server.DATA_DIR
    original_database = local_server.DATABASE
    try:
        local_server.DATA_DIR = tmp_path
        local_server.DATABASE = tmp_path / "usage.sqlite3"
        local_server.init_db()

        account = {
            "ok": True,
            "username": "kitten",
            "balance": {
                "balance": 5.563856,
                "usedAmount": 94.360338,
                "totalRecharged": 99.924194,
                "rawBalance": 2781928,
                "rawUsedAmount": 47180169,
                "rawTotalRecharged": 49962097,
                "totalRechargedEstimated": True,
                "currency": "CNY",
            },
        }
        topup = {
            "ok": True,
            "count": 5,
            "totalAmount": 100,
            "totalMoney": 100,
            "rawTotalQuota": 50000000,
        }

        with sqlite3.connect(local_server.DATABASE) as db:
            db.execute(
                """
                insert into newapi_account_cache (
                    account_key, base_url, api_user, token_fingerprint, snapshot_json, updated_at
                ) values ('account', 'https://www.cctq.ai', '5781', 'hash', ?, 100)
                """,
                (json.dumps(account),),
            )
            db.execute(
                """
                insert into newapi_topup_cache (
                    topup_key, base_url, api_user, token_fingerprint, snapshot_json, updated_at
                ) values ('topup', 'https://www.cctq.ai', '5781', 'hash', ?, 101)
                """,
                (json.dumps(topup),),
            )

        summary = local_server.get_log_summary()

        assert summary["account"]["balance"]["totalRecharged"] == 100
        assert summary["account"]["balance"]["rawTotalRecharged"] == 50000000
        assert summary["account"]["balance"]["totalRechargedEstimated"] is False
        assert summary["topup"]["totalAmount"] == 100
    finally:
        local_server.DATA_DIR = original_data_dir
        local_server.DATABASE = original_database
        shutil.rmtree(tmp_path, ignore_errors=True)


def test_summary_uses_account_cache_for_requested_credentials():
    tmp_path = Path(tempfile.mkdtemp())
    original_data_dir = local_server.DATA_DIR
    original_database = local_server.DATABASE
    try:
        local_server.DATA_DIR = tmp_path
        local_server.DATABASE = tmp_path / "usage.sqlite3"
        local_server.init_db()

        requested_account = {
            "ok": True,
            "username": "current",
            "balance": {"balance": 18, "usedAmount": 2, "totalRecharged": 20},
        }
        other_account = {
            "ok": True,
            "username": "other",
            "balance": {"balance": 1, "usedAmount": 99, "totalRecharged": 100},
        }
        requested_topup = {"ok": True, "totalAmount": 20, "rawTotalQuota": 10000000}
        other_topup = {"ok": True, "totalAmount": 100, "rawTotalQuota": 50000000}

        with sqlite3.connect(local_server.DATABASE) as db:
            db.execute(
                """
                insert into newapi_account_cache (
                    account_key, base_url, api_user, token_fingerprint, snapshot_json, updated_at
                ) values (?, 'https://www.cctq.ai', '5781', ?, ?, 100)
                """,
                (
                    local_server.make_account_key("https://www.cctq.ai", "5781", "cur-tok"),
                    local_server.key_fingerprint("cur-tok"),
                    json.dumps(requested_account),
                ),
            )
            db.execute(
                """
                insert into newapi_account_cache (
                    account_key, base_url, api_user, token_fingerprint, snapshot_json, updated_at
                ) values (?, 'https://www.cctq.ai', '5781', ?, ?, 200)
                """,
                (
                    local_server.make_account_key("https://www.cctq.ai", "5781", "oth-tok"),
                    local_server.key_fingerprint("oth-tok"),
                    json.dumps(other_account),
                ),
            )
            db.execute(
                """
                insert into newapi_topup_cache (
                    topup_key, base_url, api_user, token_fingerprint, snapshot_json, updated_at
                ) values (?, 'https://www.cctq.ai', '5781', ?, ?, 100)
                """,
                (
                    local_server.make_account_key("https://www.cctq.ai", "5781", "cur-tok"),
                    local_server.key_fingerprint("cur-tok"),
                    json.dumps(requested_topup),
                ),
            )
            db.execute(
                """
                insert into newapi_topup_cache (
                    topup_key, base_url, api_user, token_fingerprint, snapshot_json, updated_at
                ) values (?, 'https://www.cctq.ai', '5781', ?, ?, 200)
                """,
                (
                    local_server.make_account_key("https://www.cctq.ai", "5781", "oth-tok"),
                    local_server.key_fingerprint("oth-tok"),
                    json.dumps(other_topup),
                ),
            )

        summary = local_server.get_log_summary(
            {
                "baseUrl": "https://www.cctq.ai",
                "apiUser": "5781",
                "accessToken": "cur-tok",
            }
        )

        assert summary["account"]["username"] == "current"
        assert summary["account"]["balance"]["totalRecharged"] == 20
        assert summary["topup"]["totalAmount"] == 20
    finally:
        local_server.DATA_DIR = original_data_dir
        local_server.DATABASE = original_database
        shutil.rmtree(tmp_path, ignore_errors=True)


def test_coverage_missing_seconds_tracks_remaining_backfill_window():
    tmp_path = Path(tempfile.mkdtemp())
    original_data_dir = local_server.DATA_DIR
    original_database = local_server.DATABASE
    try:
        local_server.DATA_DIR = tmp_path
        local_server.DATABASE = tmp_path / "usage.sqlite3"
        local_server.init_db()

        first_log_at = local_server.INITIAL_SYNC_START + 36_000
        scanned_through = local_server.INITIAL_SYNC_START + 21_600
        with sqlite3.connect(local_server.DATABASE) as db:
            db.execute(
                """
                insert into newapi_logs (
                    unique_id, created_at, input_tokens, cached_input_tokens,
                    output_tokens, total_tokens, raw_used_amount
                ) values ('first', ?, 1, 0, 0, 1, 1)
                """,
                (first_log_at,),
            )
            coverage = local_server.get_log_coverage(db, {"backfillUntil": scanned_through})

        assert coverage["complete"] is False
        assert coverage["missingBeforeSeconds"] == first_log_at - scanned_through
    finally:
        local_server.DATA_DIR = original_data_dir
        local_server.DATABASE = original_database
        shutil.rmtree(tmp_path, ignore_errors=True)


def test_coverage_complete_persists_after_backfill_done():
    tmp_path = Path(tempfile.mkdtemp())
    original_data_dir = local_server.DATA_DIR
    original_database = local_server.DATABASE
    try:
        local_server.DATA_DIR = tmp_path
        local_server.DATABASE = tmp_path / "usage.sqlite3"
        local_server.init_db()

        first_log_at = local_server.INITIAL_SYNC_START + 118_652
        with sqlite3.connect(local_server.DATABASE) as db:
            db.execute(
                """
                insert into newapi_logs (
                    unique_id, created_at, input_tokens, cached_input_tokens,
                    output_tokens, total_tokens, raw_used_amount
                ) values ('first', ?, 1, 0, 0, 1, 1)
                """,
                (first_log_at,),
            )
            db.execute(
                """
                insert into newapi_sync_state (
                    sync_key, base_url, latest_created_at, last_synced_at,
                    fail_count, blocked_until, backfill_until, backfill_complete
                ) values ('sync', 'https://www.cctq.ai', ?, 200, 0, null, null, 1)
                """,
                (first_log_at,),
            )
            sync = local_server.get_latest_sync_snapshot(db)
            coverage = local_server.get_log_coverage(db, sync)

        assert sync["backfillComplete"] is True
        assert sync["mode"] == "incremental"
        assert coverage["complete"] is True
        assert coverage["missingBeforeSeconds"] == 0
        assert local_server.get_log_coverage_for_sync()["complete"] is True
    finally:
        local_server.DATA_DIR = original_data_dir
        local_server.DATABASE = original_database
        shutil.rmtree(tmp_path, ignore_errors=True)


def test_mark_backfill_incomplete_clears_complete_flag():
    tmp_path = Path(tempfile.mkdtemp())
    original_data_dir = local_server.DATA_DIR
    original_database = local_server.DATABASE
    try:
        local_server.DATA_DIR = tmp_path
        local_server.DATABASE = tmp_path / "usage.sqlite3"
        local_server.init_db()

        with sqlite3.connect(local_server.DATABASE) as db:
            db.execute(
                """
                insert into newapi_sync_state (
                    sync_key, base_url, latest_created_at, last_synced_at,
                    fail_count, blocked_until, backfill_until, backfill_complete
                ) values ('sync', 'https://www.cctq.ai', 123, 200, 0, null, null, 1)
                """
            )

        local_server.mark_backfill_incomplete("sync", "some log windows reached the platform cap")

        with sqlite3.connect(local_server.DATABASE) as db:
            sync = local_server.get_latest_sync_snapshot(db)
            coverage = local_server.get_log_coverage(db, sync)
            row = db.execute(
                "select backfill_complete, backfill_warning from newapi_sync_state where sync_key = 'sync'"
            ).fetchone()

        assert row[0] == 0
        assert row[1] == "some log windows reached the platform cap"
        assert sync["backfillWarning"] == "some log windows reached the platform cap"
        assert coverage["warning"] == "some log windows reached the platform cap"
    finally:
        local_server.DATA_DIR = original_data_dir
        local_server.DATABASE = original_database
        shutil.rmtree(tmp_path, ignore_errors=True)


def test_sync_logs_marks_backfill_incomplete_when_window_hits_log_cap():
    tmp_path = Path(tempfile.mkdtemp())
    original_data_dir = local_server.DATA_DIR
    original_database = local_server.DATABASE
    original_refresh = local_server.refresh_account_and_topup
    original_fetch = local_server.fetch_self_log_page
    try:
        local_server.DATA_DIR = tmp_path
        local_server.DATABASE = tmp_path / "usage.sqlite3"
        local_server.init_db()

        first_log_at = local_server.INITIAL_SYNC_START + 7_200
        with sqlite3.connect(local_server.DATABASE) as db:
            db.execute(
                """
                insert into newapi_logs (
                    unique_id, created_at, input_tokens, cached_input_tokens,
                    output_tokens, total_tokens, raw_used_amount
                ) values ('first', ?, 1, 0, 0, 1, 1)
                """,
                (first_log_at,),
            )
            db.execute(
                """
                insert into newapi_sync_state (
                    sync_key, base_url, api_user, key_fingerprint, latest_created_at,
                    last_synced_at, fail_count, blocked_until, backfill_until, backfill_complete
                ) values (?, 'https://www.cctq.ai', '5781', ?, ?, 100, 0, null, null, 0)
                """,
                (
                    local_server.make_sync_key("https://www.cctq.ai", "5781", "token"),
                    local_server.key_fingerprint("token"),
                    first_log_at,
                ),
            )

        local_server.refresh_account_and_topup = lambda **kwargs: (None, None)

        def fake_fetch_self_log_page(**kwargs):
            page = kwargs["page"]
            page_size = kwargs["page_size"]
            if page > 10:
                return {"data": []}
            return {
                "data": [
                    {
                        "id": f"{page}-{index}",
                        "created_at": local_server.INITIAL_SYNC_START + page * 10 + index,
                        "prompt_tokens": 1,
                        "completion_tokens": 0,
                        "quota": 1,
                    }
                    for index in range(page_size)
                ]
            }

        local_server.fetch_self_log_page = fake_fetch_self_log_page
        result = local_server.sync_logs(
            {
                "baseUrl": "https://www.cctq.ai",
                "accessToken": "token",
                "newApiUser": "5781",
                "pageSize": 100,
                "endTimestamp": first_log_at,
            }
        )

        assert result["mode"] == "backfill"
        assert result["fetched"] == 1000
        assert result["capped"] is True
        assert "platform cap" in result["backfillWarning"]
        assert result["summary"]["coverage"]["complete"] is False
        assert "platform cap" in result["summary"]["coverage"]["warning"]
    finally:
        local_server.refresh_account_and_topup = original_refresh
        local_server.fetch_self_log_page = original_fetch
        local_server.DATA_DIR = original_data_dir
        local_server.DATABASE = original_database
        shutil.rmtree(tmp_path, ignore_errors=True)


def test_sync_logs_prefers_access_token_for_sync_key_when_available():
    tmp_path = Path(tempfile.mkdtemp())
    original_data_dir = local_server.DATA_DIR
    original_database = local_server.DATABASE
    original_refresh = local_server.refresh_account_and_topup
    original_fetch = local_server.fetch_self_log_page
    try:
        local_server.DATA_DIR = tmp_path
        local_server.DATABASE = tmp_path / "usage.sqlite3"
        local_server.init_db()
        local_server.refresh_account_and_topup = lambda **kwargs: (None, None)
        local_server.fetch_self_log_page = lambda **kwargs: {"data": []}

        local_server.sync_logs(
            {
                "baseUrl": "https://www.cctq.ai",
                "apiKey": "sk-model-key",
                "accessToken": "acct-tok",
                "newApiUser": "5781",
                "endTimestamp": local_server.INITIAL_SYNC_START + 60,
            }
        )

        with sqlite3.connect(local_server.DATABASE) as db:
            rows = db.execute("select sync_key from newapi_sync_state").fetchall()

        assert len(rows) == 1
        assert rows[0][0] == local_server.make_sync_key(
            "https://www.cctq.ai",
            "5781",
            "acct-tok",
        )
    finally:
        local_server.refresh_account_and_topup = original_refresh
        local_server.fetch_self_log_page = original_fetch
        local_server.DATA_DIR = original_data_dir
        local_server.DATABASE = original_database
        shutil.rmtree(tmp_path, ignore_errors=True)


def test_sync_logs_uses_global_latest_log_when_current_sync_state_is_missing():
    tmp_path = Path(tempfile.mkdtemp())
    original_data_dir = local_server.DATA_DIR
    original_database = local_server.DATABASE
    original_refresh = local_server.refresh_account_and_topup
    original_fetch = local_server.fetch_self_log_page
    try:
        local_server.DATA_DIR = tmp_path
        local_server.DATABASE = tmp_path / "usage.sqlite3"
        local_server.init_db()

        global_latest = local_server.INITIAL_SYNC_START + 200_000
        with sqlite3.connect(local_server.DATABASE) as db:
            db.execute(
                """
                insert into newapi_logs (
                    unique_id, created_at, input_tokens, cached_input_tokens,
                    output_tokens, total_tokens, raw_used_amount
                ) values ('latest', ?, 1, 0, 0, 1, 1)
                """,
                (global_latest,),
            )

        local_server.refresh_account_and_topup = lambda **kwargs: (None, None)
        requested_windows = []

        def fake_fetch_self_log_page(**kwargs):
            requested_windows.append((kwargs["start_timestamp"], kwargs["end_timestamp"]))
            return {"data": []}

        local_server.fetch_self_log_page = fake_fetch_self_log_page
        local_server.sync_logs(
            {
                "baseUrl": "https://www.cctq.ai",
                "accessToken": "new-tok",
                "newApiUser": "5781",
                "endTimestamp": global_latest + 120,
            }
        )

        assert requested_windows[0][0] == global_latest - local_server.SYNC_OVERLAP_SECONDS
    finally:
        local_server.refresh_account_and_topup = original_refresh
        local_server.fetch_self_log_page = original_fetch
        local_server.DATA_DIR = original_data_dir
        local_server.DATABASE = original_database
        shutil.rmtree(tmp_path, ignore_errors=True)


def test_coverage_for_sync_uses_requested_sync_key_not_latest_row():
    tmp_path = Path(tempfile.mkdtemp())
    original_data_dir = local_server.DATA_DIR
    original_database = local_server.DATABASE
    try:
        local_server.DATA_DIR = tmp_path
        local_server.DATABASE = tmp_path / "usage.sqlite3"
        local_server.init_db()

        first_log_at = local_server.INITIAL_SYNC_START + 36_000
        with sqlite3.connect(local_server.DATABASE) as db:
            db.execute(
                """
                insert into newapi_logs (
                    unique_id, created_at, input_tokens, cached_input_tokens,
                    output_tokens, total_tokens, raw_used_amount
                ) values ('first', ?, 1, 0, 0, 1, 1)
                """,
                (first_log_at,),
            )
            db.execute(
                """
                insert into newapi_sync_state (
                    sync_key, base_url, latest_created_at, last_synced_at,
                    fail_count, blocked_until, backfill_until, backfill_complete
                ) values ('current', 'https://www.cctq.ai', ?, 100, 0, null, ?, 0)
                """,
                (first_log_at, local_server.INITIAL_SYNC_START + 7_200),
            )
            db.execute(
                """
                insert into newapi_sync_state (
                    sync_key, base_url, latest_created_at, last_synced_at,
                    fail_count, blocked_until, backfill_until, backfill_complete
                ) values ('other-latest', 'https://www.cctq.ai', ?, 200, 0, null, null, 1)
                """,
                (first_log_at,),
            )

        coverage = local_server.get_log_coverage_for_sync("current")

        assert coverage["complete"] is False
        assert coverage["scannedThroughAt"] == local_server.INITIAL_SYNC_START + 7_200
    finally:
        local_server.DATA_DIR = original_data_dir
        local_server.DATABASE = original_database
        shutil.rmtree(tmp_path, ignore_errors=True)


def test_codex_token_events_are_stored_by_account_type():
    tmp_path = Path(tempfile.mkdtemp())
    original_data_dir = local_server.DATA_DIR
    original_database = local_server.DATABASE
    original_get_type = local_server.get_codex_account_type
    try:
        local_server.DATA_DIR = tmp_path
        local_server.DATABASE = tmp_path / "usage.sqlite3"
        local_server.init_db()

        local_server.save_codex_token_event(
            {
                "eventId": "api-1",
                "accountType": "api",
                "timestamp": "2026-06-06T01:00:00+00:00",
                "usage": {
                    "inputTokens": 100,
                    "cachedInputTokens": 80,
                    "outputTokens": 5,
                    "totalTokens": 105,
                },
            },
            {"raw": "api"},
        )
        local_server.save_codex_token_event(
            {
                "eventId": "official-1",
                "accountType": "official_login",
                "timestamp": "2026-06-06T01:00:01+00:00",
                "usage": {
                    "inputTokens": 50,
                    "cachedInputTokens": 10,
                    "outputTokens": 7,
                    "totalTokens": 57,
                },
            },
            {"raw": "official"},
        )

        local_server.get_codex_account_type = lambda: "api"
        api_summary = local_server.get_codex_token_summary()
        local_server.get_codex_account_type = lambda: "official_login"
        official_summary = local_server.get_codex_token_summary()

        assert api_summary["accountType"] == "api"
        assert api_summary["all"]["requestCount"] == 1
        assert api_summary["all"]["inputTokens"] == 100
        assert api_summary["all"]["cachedInputTokens"] == 80
        assert official_summary["accountType"] == "official_login"
        assert official_summary["all"]["requestCount"] == 1
        assert official_summary["all"]["inputTokens"] == 50
    finally:
        local_server.get_codex_account_type = original_get_type
        local_server.DATA_DIR = original_data_dir
        local_server.DATABASE = original_database
        shutil.rmtree(tmp_path, ignore_errors=True)


def test_codex_rate_limit_session_fallback_skips_empty_latest_events():
    tmp_path = Path(tempfile.mkdtemp())
    original_sessions = local_server.CODEX_SESSIONS
    try:
        sessions = tmp_path / "sessions" / "2026" / "06" / "06"
        sessions.mkdir(parents=True)
        session_file = sessions / "official.jsonl"
        valid = make_codex_token_event(
            "2026-06-06T01:00:00.000Z",
            input_tokens=100,
            cached_input_tokens=50,
            output_tokens=5,
            used_percent=28,
            weekly_used_percent=37,
        )
        empty = make_codex_token_event(
            "2026-06-06T02:00:00.000Z",
            input_tokens=100,
            cached_input_tokens=50,
            output_tokens=5,
            used_percent=0,
            weekly_used_percent=0,
        )
        empty["payload"]["rate_limits"]["primary"] = None
        empty["payload"]["rate_limits"]["secondary"] = None
        session_file.write_text(
            json.dumps(valid) + "\n" + json.dumps(empty) + "\n",
            encoding="utf-8",
        )
        local_server.CODEX_SESSIONS = tmp_path / "sessions"

        result = local_server.fetch_codex_rate_limits_from_session()

        assert result["source"] == "codex-session"
        assert result["quota"]["window5h"]["remainingPercent"] == 72
        assert result["quota"]["weekly"]["remainingPercent"] == 63
    finally:
        local_server.CODEX_SESSIONS = original_sessions
        shutil.rmtree(tmp_path, ignore_errors=True)


def test_codex_status_reports_api_key_match_fingerprint_from_auth_json():
    tmp_path = Path(tempfile.mkdtemp())
    original_codex_home = local_server.CODEX_HOME
    try:
        local_server.CODEX_HOME = tmp_path
        (tmp_path / "config.toml").write_text(
            "\n".join(
                [
                    'model_provider = "custom"',
                    '[model_providers.custom]',
                    'name = "custom"',
                    'base_url = "https://www.cctq.ai/v1"',
                ]
            ),
            encoding="utf-8",
        )
        (tmp_path / "auth.json").write_text(
            json.dumps({"OPENAI_API_KEY": "sk-current-codex-key"}),
            encoding="utf-8",
        )

        status = local_server.get_codex_status()

        assert status["accountType"] == "api"
        assert status["baseUrl"] == "https://www.cctq.ai/v1"
        assert status["apiKeyFingerprint"] == local_server.codex_api_key_match_fingerprint("sk-current-codex-key")
    finally:
        local_server.CODEX_HOME = original_codex_home
        shutil.rmtree(tmp_path, ignore_errors=True)


if __name__ == "__main__":
    test_summary_account_uses_cached_topup_total()
    test_summary_uses_account_cache_for_requested_credentials()
    test_coverage_missing_seconds_tracks_remaining_backfill_window()
    test_coverage_complete_persists_after_backfill_done()
    test_mark_backfill_incomplete_clears_complete_flag()
    test_sync_logs_marks_backfill_incomplete_when_window_hits_log_cap()
    test_sync_logs_prefers_access_token_for_sync_key_when_available()
    test_sync_logs_uses_global_latest_log_when_current_sync_state_is_missing()
    test_coverage_for_sync_uses_requested_sync_key_not_latest_row()
    test_codex_token_events_are_stored_by_account_type()
    test_codex_rate_limit_session_fallback_skips_empty_latest_events()
    test_codex_status_reports_api_key_match_fingerprint_from_auth_json()
    print("local server summary tests passed")

