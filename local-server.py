from __future__ import annotations

import http.client
import hashlib
import json
import mimetypes
import os
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse


def resolve_app_root() -> Path:
    env_root = os.environ.get("CODEX_QUOTA_APP_ROOT")
    if env_root:
        return Path(env_root).resolve()
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def resolve_data_dir(app_root: Path) -> Path:
    env_data = os.environ.get("CODEX_QUOTA_DATA_DIR")
    if env_data:
        return Path(env_data).resolve()
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "CodexQuotaGlance" / "data"
    return app_root / "data"


APP_ROOT = resolve_app_root()
ROOT = Path(os.environ.get("CODEX_QUOTA_DIST_DIR") or APP_ROOT / "dist").resolve()
DATA_DIR = resolve_data_dir(APP_ROOT)
DATABASE = DATA_DIR / "newapi-usage.sqlite3"
REQUEST_DEBUG_LOG = DATA_DIR / "request-debug.log"
HOST = "127.0.0.1"
PORT = 1420
QUOTA_UNITS_PER_CNY = 500000
INITIAL_SYNC_START = 1780243200  # 2026-06-01 00:00:00 +08:00
SYNC_OVERLAP_SECONDS = 300
BACKFILL_WINDOW_SECONDS = 6 * 60 * 60
LOG_WINDOW_CAP = 1000
ACCOUNT_CACHE_TTL_SECONDS = 5 * 60
TOPUP_CACHE_TTL_SECONDS = 10 * 60
CODEX_HOME = Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")
CODEX_SESSIONS = CODEX_HOME / "sessions"
CODEX_SESSION_DISCOVERY_TTL_SECONDS = 5
CODEX_SESSION_DISCOVERY_CACHE: dict[str, object] = {"checked_at": 0.0, "path": None}
CODEX_TOKEN_EVENT_CACHE: dict[str, object] = {"path": None, "offset": 0, "latest_event": None}
CODEX_RATE_LIMIT_CACHE: dict[str, object] = {"checked_at": 0.0, "quota": None, "source": None, "message": None}
CODEX_RATE_LIMIT_CACHE_TTL_SECONDS = 30


class RateLimitedError(RuntimeError):
    def __init__(self, retry_after: str | None = None) -> None:
        super().__init__("rate limited")
        self.retry_after = parse_retry_after(retry_after)


class CapturingHTTPConnection(http.client.HTTPConnection):
    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.sent_chunks: list[bytes] = []

    def send(self, data) -> None:
        if isinstance(data, str):
            self.sent_chunks.append(data.encode("iso-8859-1", errors="replace"))
        else:
            self.sent_chunks.append(bytes(data))
        return super().send(data)


class CapturingHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.sent_chunks: list[bytes] = []

    def send(self, data) -> None:
        if isinstance(data, str):
            self.sent_chunks.append(data.encode("iso-8859-1", errors="replace"))
        else:
            self.sent_chunks.append(bytes(data))
        return super().send(data)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self) -> None:
        if self.path.startswith("/newapi-proxy"):
            self.proxy_new_api("GET")
            return
        if self.path.startswith("/local-api/newapi/logs/summary"):
            self.send_json(200, get_log_summary(self.read_summary_context()))
            return
        if self.path.startswith("/local-api/codex/token/latest"):
            self.send_json(200, get_latest_codex_token_usage())
            return
        if self.path.startswith("/local-api/codex/token/summary"):
            self.send_json(200, get_codex_token_summary())
            return
        if self.path.startswith("/local-api/codex/status"):
            self.send_json(200, get_codex_status())
            return
        self.serve_static()

    def do_POST(self) -> None:
        if self.path.startswith("/newapi-proxy"):
            self.proxy_new_api("POST")
            return
        if self.path.startswith("/local-api/newapi/logs/sync"):
            self.sync_newapi_logs()
            return
        if self.path.startswith("/local-api/newapi/diagnose"):
            self.diagnose_newapi()
            return
        self.send_text(404, "Not found")

    def log_message(self, format: str, *args: object) -> None:
        return

    def serve_static(self) -> None:
        parsed = urlparse(self.path)
        requested = "index.html" if parsed.path == "/" else parsed.path.lstrip("/")
        candidate = (ROOT / requested).resolve()
        root = ROOT.resolve()

        if not str(candidate).startswith(str(root)) or not candidate.exists() or candidate.is_dir():
            candidate = root / "index.html"

        content = candidate.read_bytes()
        content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        if candidate.suffix == ".js":
            content_type = "text/javascript"
        elif candidate.suffix == ".html":
            content_type = "text/html; charset=utf-8"
        elif candidate.suffix == ".css":
            content_type = "text/css; charset=utf-8"

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store" if candidate.name == "index.html" else "public, max-age=31536000")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def proxy_new_api(self, method: str) -> None:
        target = self.headers.get("X-NewAPI-Target")
        if not target:
            self.send_text(400, "Missing X-NewAPI-Target")
            return

        parsed = urlparse(target)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            self.send_text(400, "Unsupported target URL")
            return

        path = parsed.path or "/"
        if parsed.query:
            path = f"{path}?{parsed.query}"

        connection_class = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
        connection = connection_class(parsed.netloc, timeout=30)
        try:
            body = self.rfile.read(int(self.headers.get("Content-Length", "0") or "0"))
            connection.request(
                method,
                path,
                body=body if method != "GET" else None,
                headers={
                    "Authorization": self.headers.get("Authorization", ""),
                    "New-Api-User": self.headers.get("New-Api-User", ""),
                },
            )
            upstream = connection.getresponse()
            body = upstream.read()
            self.send_response(upstream.status)
            self.send_header("Content-Type", upstream.getheader("Content-Type", "application/json; charset=utf-8"))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            self.send_text(502, str(exc))
        finally:
            connection.close()

    def sync_newapi_logs(self) -> None:
        try:
            payload = self.read_json()
            result = sync_logs(payload)
            self.send_json(200, result)
        except Exception as exc:
            self.send_json(500, {"ok": False, "message": str(exc)})

    def diagnose_newapi(self) -> None:
        try:
            payload = self.read_json()
            result = diagnose_user_self(payload)
            self.send_json(200, result)
        except Exception as exc:
            self.send_json(500, {"ok": False, "message": str(exc)})

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def read_query(self) -> dict:
        parsed = urlparse(self.path)
        return {key: values[-1] for key, values in parse_qs(parsed.query).items() if values}

    def read_summary_context(self) -> dict:
        query = self.read_query()
        return {
            "baseUrl": self.headers.get("X-NewAPI-BaseURL") or query.get("baseUrl"),
            "accessToken": self.headers.get("X-NewAPI-AccessToken") or query.get("accessToken"),
            "apiUser": self.headers.get("X-NewAPI-User") or query.get("apiUser") or query.get("newApiUser"),
        }

    def send_json(self, status: int, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_text(self, status: int, text: str) -> None:
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DATABASE) as db:
        db.execute(
            """
            create table if not exists newapi_logs (
                unique_id text primary key,
                provider_log_id text,
                request_id text,
                created_at integer not null,
                token_name text,
                model_name text,
                group_name text,
                input_tokens integer not null default 0,
                cached_input_tokens integer not null default 0,
                output_tokens integer not null default 0,
                total_tokens integer not null default 0,
                raw_used_amount integer not null default 0,
                other_json text
            )
            """
        )
        db.execute("create index if not exists idx_newapi_logs_created_at on newapi_logs(created_at)")
        db.execute(
            """
            create table if not exists newapi_sync_state (
                sync_key text primary key,
                base_url text not null,
                api_user text,
                key_fingerprint text,
                latest_created_at integer,
                last_synced_at integer,
                fail_count integer default 0,
                blocked_until integer,
                backfill_until integer,
                backfill_complete integer default 0,
                backfill_warning text
            )
            """
        )
        db.execute(
            """
            create table if not exists newapi_account_cache (
                account_key text primary key,
                base_url text not null,
                api_user text,
                token_fingerprint text,
                snapshot_json text not null,
                updated_at integer not null
            )
            """
        )
        db.execute(
            """
            create table if not exists newapi_topup_cache (
                topup_key text primary key,
                base_url text not null,
                api_user text,
                token_fingerprint text,
                snapshot_json text not null,
                updated_at integer not null
            )
            """
        )
        ensure_column(db, "newapi_sync_state", "fail_count", "integer default 0")
        ensure_column(db, "newapi_sync_state", "blocked_until", "integer")
        ensure_column(db, "newapi_sync_state", "backfill_until", "integer")
        ensure_column(db, "newapi_sync_state", "backfill_complete", "integer default 0")
        ensure_column(db, "newapi_sync_state", "backfill_warning", "text")
        db.execute(
            """
            create table if not exists codex_token_events (
                event_id text primary key,
                account_type text not null,
                session_file text,
                event_timestamp integer not null,
                event_iso text,
                input_tokens integer not null default 0,
                cached_input_tokens integer not null default 0,
                output_tokens integer not null default 0,
                total_tokens integer not null default 0,
                reasoning_output_tokens integer not null default 0,
                raw_json text
            )
            """
        )
        db.execute("create index if not exists idx_codex_token_events_account_time on codex_token_events(account_type, event_timestamp)")


def ensure_column(db: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {row[1] for row in db.execute(f"pragma table_info({table})").fetchall()}
    if column not in columns:
        db.execute(f"alter table {table} add column {column} {definition}")


def sync_logs(payload: dict) -> dict:
    base_url = str(payload.get("baseUrl") or "").rstrip("/")
    api_key = str(payload.get("apiKey") or "")
    access_token = str(payload.get("accessToken") or "")
    api_user = str(payload.get("newApiUser") or "")
    token_name = str(payload.get("tokenName") or "")
    force_account_refresh = bool(payload.get("forceAccountRefresh"))
    account_cache_ttl = normalize_ttl(payload.get("accountCacheTtlSeconds"), ACCOUNT_CACHE_TTL_SECONDS)
    topup_cache_ttl = normalize_ttl(payload.get("topupCacheTtlSeconds"), TOPUP_CACHE_TTL_SECONDS)
    if not base_url or not (api_key.strip() or access_token.strip()):
        raise ValueError("baseUrl and apiKey/accessToken are required")

    init_db()
    sync_secret = access_token if access_token.strip() else api_key
    sync_key = make_sync_key(base_url, api_user, sync_secret)
    summary_context = {"baseUrl": base_url, "apiUser": api_user, "accessToken": access_token}
    blocked = get_sync_block(sync_key)
    now_ts = int(__import__("time").time())
    if blocked and blocked.get("blocked_until") and int(blocked["blocked_until"]) > now_ts:
        return {
            "ok": True,
            "mode": "backoff",
            "blockedUntil": int(blocked["blocked_until"]),
            "retryAfterSeconds": int(blocked["blocked_until"]) - now_ts,
            "fetched": 0,
            "inserted": 0,
            "insertedUsage": summarize_log_row_dicts([]),
            "summary": get_log_summary(summary_context),
        }
    sync_latest = get_latest_created_at(sync_key)
    latest = sync_latest
    seeded_from_global_latest = False
    if latest is None:
        latest = get_global_latest_created_at()
        seeded_from_global_latest = latest is not None
    coverage = get_log_coverage_for_sync(sync_key)
    backfill = not seeded_from_global_latest and coverage.get("complete") is False and coverage.get("firstCreatedAt")
    if backfill:
        start = max(INITIAL_SYNC_START, get_backfill_until(sync_key) or INITIAL_SYNC_START)
        if start >= int(coverage["firstCreatedAt"]) - SYNC_OVERLAP_SECONDS:
            mark_backfill_complete(sync_key)
            backfill = False
            start = max(0, (latest or INITIAL_SYNC_START) - (SYNC_OVERLAP_SECONDS if latest else 0))
            end = int(payload.get("endTimestamp") or __import__("time").time())
        else:
            end = min(
                start + BACKFILL_WINDOW_SECONDS,
                int(coverage["firstCreatedAt"]) + SYNC_OVERLAP_SECONDS,
                int(payload.get("endTimestamp") or __import__("time").time()),
            )
    else:
        start = max(0, (latest or INITIAL_SYNC_START) - (SYNC_OVERLAP_SECONDS if latest else 0))
        end = int(payload.get("endTimestamp") or __import__("time").time())
    inserted_rows: list[dict] = []
    fetched = 0
    page = 1
    page_size = int(payload.get("pageSize") or 100)
    log_window_cap = int(payload.get("logWindowCap") or LOG_WINDOW_CAP)
    page_limit_reached = False
    account_snapshot = None
    topup_snapshot = None

    mode = "backfill" if backfill else "incremental" if latest else "initial"
    if access_token.strip():
        try:
            account_snapshot, topup_snapshot = refresh_account_and_topup(
                base_url=base_url,
                access_token=access_token,
                api_user=api_user,
                force=force_account_refresh,
                account_ttl_seconds=account_cache_ttl,
                topup_ttl_seconds=topup_cache_ttl,
            )
        except RateLimitedError as exc:
            blocked_until = save_sync_failure(sync_key, base_url, api_user, sync_secret, latest, retry_after=exc.retry_after)
            return {
                "ok": True,
                "mode": "rate_limited",
                "blockedUntil": blocked_until,
                "retryAfterSeconds": max(0, blocked_until - int(__import__("time").time())),
                "fetched": 0,
                "inserted": 0,
                "insertedUsage": summarize_log_row_dicts([]),
                "account": None,
                "topup": topup_snapshot,
                "summary": get_log_summary(summary_context),
            }
        except Exception as exc:
            account_snapshot = {"ok": False, "message": str(exc)}
            topup_snapshot = get_latest_topup_cache()
    else:
        account_snapshot = {"ok": False, "message": "未配置系统访问令牌，余额未校准"}
        topup_snapshot = get_latest_topup_cache()
    try:
        while True:
            if not access_token.strip():
                raise RuntimeError("missing access token for account log")
            data = fetch_self_log_page(
                base_url=base_url,
                access_token=access_token,
                api_user=api_user,
                page=page,
                page_size=page_size,
                token_name=token_name,
                start_timestamp=start,
                end_timestamp=end,
            )
            items = normalize_log_items(data)
            if not items:
                break
            fetched += len(items)
            inserted_rows.extend(insert_logs(items))
            if len(items) < page_size:
                break
            page += 1
            if page > 500:
                page_limit_reached = True
                break
    except RateLimitedError as exc:
        blocked_until = save_sync_failure(sync_key, base_url, api_user, sync_secret, latest, retry_after=exc.retry_after)
        return {
            "ok": True,
            "mode": "rate_limited",
            "blockedUntil": blocked_until,
            "retryAfterSeconds": max(0, blocked_until - int(__import__("time").time())),
            "fetched": fetched,
            "inserted": len(inserted_rows),
            "insertedUsage": summarize_log_row_dicts(inserted_rows),
            "account": account_snapshot,
            "topup": topup_snapshot,
            "summary": get_log_summary(summary_context),
        }
    except Exception:
        mode = "fallback-token"
        page = 1
        try:
            if not api_key.strip():
                raise RuntimeError("missing api key for token log fallback")
            data = fetch_token_log_page(base_url=base_url, api_key=api_key, api_user=api_user)
            items = normalize_log_items(data)
            fetched = len(items)
            inserted_rows = insert_logs(items)
        except RateLimitedError as exc:
            blocked_until = save_sync_failure(sync_key, base_url, api_user, sync_secret, latest, retry_after=exc.retry_after)
            return {
                "ok": True,
                "mode": "rate_limited",
                "blockedUntil": blocked_until,
                "retryAfterSeconds": max(0, blocked_until - int(__import__("time").time())),
                "fetched": fetched,
                "inserted": len(inserted_rows),
                "insertedUsage": summarize_log_row_dicts(inserted_rows),
                "account": account_snapshot,
                "topup": topup_snapshot,
                "summary": get_log_summary(summary_context),
            }

    newest = get_global_latest_created_at()
    save_sync_state(sync_key, base_url, api_user, sync_secret, newest)
    capped = fetched >= log_window_cap or page_limit_reached
    backfill_warning = "some log windows reached the platform cap; logs may be truncated" if capped else None
    if mode == "backfill":
        first_after_sync = get_first_created_at_for_sync()
        if capped:
            mark_backfill_incomplete(sync_key, backfill_warning)
        elif first_after_sync is not None and end >= int(first_after_sync) - SYNC_OVERLAP_SECONDS:
            mark_backfill_complete(sync_key)
        else:
            save_backfill_until(sync_key, end if end > start else None)
    return {
        "ok": True,
        "mode": mode,
        "startTimestamp": start,
        "endTimestamp": end,
        "pages": page,
        "fetched": fetched,
        "inserted": len(inserted_rows),
        "capped": capped,
        "backfillWarning": backfill_warning,
        "insertedUsage": summarize_log_row_dicts(inserted_rows),
        "account": account_snapshot,
        "topup": topup_snapshot,
        "summary": get_log_summary(summary_context),
    }


def fetch_user_self_snapshot(*, base_url: str, access_token: str, api_user: str) -> dict:
    parsed = urlparse(base_url)
    connection_class = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    connection = connection_class(parsed.netloc, timeout=30)
    request_headers = new_api_auth_headers(access_token, api_user)
    debug_entry = build_request_debug_entry(
        source="sync-user-self",
        method="GET",
        url=f"{parsed.scheme}://{parsed.netloc}/api/user/self",
        token=access_token,
        api_user=api_user,
    )
    try:
        connection.request(
            "GET",
            "/api/user/self",
            headers=request_headers,
        )
        response = connection.getresponse()
        body = response.read().decode("utf-8", errors="replace")
        if response.status == 429:
            raise RateLimitedError(response.getheader("Retry-After"))
        if response.status >= 400:
            result = {"ok": False, "message": body[:200]}
            debug_entry["response"] = {"httpStatus": response.status, "message": result["message"]}
            append_request_debug(debug_entry)
            return result
        payload = json.loads(body)
        if isinstance(payload, dict) and payload.get("success") is False:
            result = {"ok": False, "message": string_or_none(payload.get("message")) or "user self failed"}
            debug_entry["response"] = {
                "httpStatus": response.status,
                "success": payload.get("success"),
                "message": result["message"],
            }
            append_request_debug(debug_entry)
            return result
        data = payload.get("data", payload) if isinstance(payload, dict) else {}
        quota = number_or_none(data.get("quota"))
        used_quota = number_or_none(data.get("used_quota") or data.get("usedQuota"))
        if quota is None:
            result = {"ok": False, "message": "missing quota"}
            debug_entry["response"] = {"httpStatus": response.status, "message": result["message"]}
            append_request_debug(debug_entry)
            return result
        raw_total = quota + used_quota if used_quota is not None else None
        result = {
            "ok": True,
            "username": string_or_none(data.get("username")),
            "displayName": string_or_none(data.get("display_name") or data.get("displayName")),
            "email": string_or_none(data.get("email")),
            "group": string_or_none(data.get("group")),
            "requestCount": number_or_none(data.get("request_count") or data.get("requestCount")),
            "balance": {
                "balance": quota / QUOTA_UNITS_PER_CNY,
                "usedAmount": used_quota / QUOTA_UNITS_PER_CNY if used_quota is not None else None,
                "totalRecharged": raw_total / QUOTA_UNITS_PER_CNY if raw_total is not None else None,
                "rawBalance": quota,
                "rawUsedAmount": used_quota,
                "rawTotalRecharged": raw_total,
                "totalRechargedEstimated": True,
                "currency": "CNY",
                "source": "provider",
                "estimated": False,
            },
        }
        debug_entry["response"] = {
            "httpStatus": response.status,
            "success": payload.get("success") if isinstance(payload, dict) else None,
            "message": payload.get("message") if isinstance(payload, dict) else "",
            "dataKeys": list(data.keys())[:40] if isinstance(data, dict) else [],
        }
        append_request_debug(debug_entry)
        return result
    finally:
        connection.close()


def fetch_topup_snapshot(*, base_url: str, access_token: str, api_user: str) -> dict:
    parsed = urlparse(base_url)
    connection_class = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    request_headers = new_api_auth_headers(access_token, api_user)
    page_size = 100
    page = 1
    all_items: list[dict] = []
    total = None

    while True:
        connection = connection_class(parsed.netloc, timeout=30)
        try:
            query = urlencode({"p": page, "page_size": page_size})
            connection.request(
                "GET",
                f"/api/user/topup/self?{query}",
                headers=request_headers,
            )
            response = connection.getresponse()
            body = response.read().decode("utf-8", errors="replace")
            if response.status == 429:
                raise RateLimitedError(response.getheader("Retry-After"))
            if response.status >= 400:
                return {"ok": False, "message": body[:200]}
            payload = json.loads(body)
            if isinstance(payload, dict) and payload.get("success") is False:
                return {"ok": False, "message": string_or_none(payload.get("message")) or "topup failed"}
            data = payload.get("data", payload) if isinstance(payload, dict) else {}
            items = normalize_topup_items(data)
            all_items.extend(items)
            total = number_or_none(data.get("total")) if isinstance(data, dict) else None
            if len(items) < page_size:
                break
            if total is not None and len(all_items) >= total:
                break
            page += 1
            if page > 100:
                break
        finally:
            connection.close()

    return summarize_topup_items(all_items, pages=page, total=total)


def normalize_topup_items(data: object) -> list[dict]:
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if isinstance(data, dict):
        for key in ("items", "data", "logs"):
            value = data.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return []


def summarize_topup_items(items: list[dict], pages: int | None = None, total: float | None = None) -> dict:
    successful = [item for item in items if str(item.get("status") or "").lower() == "success"]
    total_amount = sum(number_or_zero(item.get("amount")) for item in successful)
    total_money = sum(number_or_zero(item.get("money")) for item in successful)
    raw_total_quota = sum(number_or_zero(item.get("quota_granted")) for item in successful)
    latest_time = max([int(number_or_zero(item.get("create_time"))) for item in successful] or [0])
    return {
        "ok": True,
        "count": len(successful),
        "totalAmount": total_amount,
        "totalMoney": total_money,
        "rawTotalQuota": int(raw_total_quota) if raw_total_quota else int(total_amount * QUOTA_UNITS_PER_CNY),
        "latestCreatedAt": latest_time or None,
        "pages": pages,
        "providerTotal": total,
    }


def apply_topup_to_account(account: dict | None, topup: dict | None) -> dict | None:
    if not account or account.get("ok") is not True or not topup or topup.get("ok") is not True:
        return account
    total_amount = number_or_none(topup.get("totalAmount"))
    raw_total = number_or_none(topup.get("rawTotalQuota"))
    if total_amount is None and raw_total is None:
        return account
    balance = dict(account.get("balance") or {})
    if raw_total is None and total_amount is not None:
        raw_total = total_amount * QUOTA_UNITS_PER_CNY
    if total_amount is None and raw_total is not None:
        total_amount = raw_total / QUOTA_UNITS_PER_CNY
    balance["totalRecharged"] = total_amount
    balance["rawTotalRecharged"] = raw_total
    balance["totalRechargedEstimated"] = False
    return {**account, "balance": balance}


def refresh_account_and_topup(
    *,
    base_url: str,
    access_token: str,
    api_user: str,
    force: bool = False,
    account_ttl_seconds: int = ACCOUNT_CACHE_TTL_SECONDS,
    topup_ttl_seconds: int = TOPUP_CACHE_TTL_SECONDS,
) -> tuple[dict | None, dict | None]:
    account_snapshot = None if force else get_fresh_account_cache(account_ttl_seconds)
    topup_snapshot = None if force else get_fresh_topup_cache(topup_ttl_seconds)

    if account_snapshot is None:
        account_snapshot = fetch_user_self_snapshot(base_url=base_url, access_token=access_token, api_user=api_user)
        if account_snapshot and account_snapshot.get("ok") is True:
            save_account_cache(base_url, api_user, access_token, account_snapshot)

    if topup_snapshot is None:
        topup_snapshot = fetch_topup_snapshot(base_url=base_url, access_token=access_token, api_user=api_user)
        if topup_snapshot and topup_snapshot.get("ok") is True:
            save_topup_cache(base_url, api_user, access_token, topup_snapshot)
        else:
            topup_snapshot = get_latest_topup_cache()

    return apply_topup_to_account(account_snapshot, topup_snapshot), topup_snapshot


def diagnose_user_self(payload: dict) -> dict:
    base_url = str(payload.get("baseUrl") or "").rstrip("/")
    access_token = str(payload.get("accessToken") or "")
    api_user = str(payload.get("newApiUser") or "")
    if not base_url or not access_token:
        raise ValueError("baseUrl and accessToken are required")

    parsed = urlparse(base_url)
    connection_class = CapturingHTTPSConnection if parsed.scheme == "https" else CapturingHTTPConnection
    headers = new_api_auth_headers(access_token, api_user, apifox_like=True)
    debug_entry = build_request_debug_entry(
        method="GET",
        url=f"{parsed.scheme}://{parsed.netloc}/api/user/self",
        token=access_token,
        api_user=api_user,
        apifox_like=True,
    )
    connection = connection_class(parsed.netloc, timeout=30)
    try:
        connection.request("GET", "/api/user/self", "", headers=headers)
        raw_http_request = raw_request_text(connection.sent_chunks, access_token)
        response = connection.getresponse()
        body = response.read().decode("utf-8", errors="replace")
        parsed_body = {}
        data_keys: list[str] = []
        try:
            parsed_body = json.loads(body)
            data = parsed_body.get("data") if isinstance(parsed_body, dict) else None
            if isinstance(data, dict):
                data_keys = list(data.keys())
        except json.JSONDecodeError:
            parsed_body = {}
        result = {
            "ok": True,
            "request": {
                "url": f"{parsed.scheme}://{parsed.netloc}/api/user/self",
                "sentHeaders": masked_new_api_headers(access_token, api_user, apifox_like=True),
                "rawHttpRequest": raw_http_request,
                "diagnostics": new_api_header_diagnostics(access_token),
            },
            "response": {
                "httpStatus": response.status,
                "success": parsed_body.get("success") if isinstance(parsed_body, dict) else None,
                "message": parsed_body.get("message") if isinstance(parsed_body, dict) else body[:200],
                "dataKeys": data_keys[:40],
            },
        }
        debug_entry["rawHttpRequest"] = raw_http_request
        debug_entry["response"] = result["response"]
        append_request_debug(debug_entry)
        return result
    finally:
        connection.close()


def fetch_self_log_page(
    *,
    base_url: str,
    access_token: str,
    api_user: str,
    page: int,
    page_size: int,
    token_name: str,
    start_timestamp: int,
    end_timestamp: int,
) -> dict:
    parsed = urlparse(base_url)
    connection_class = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    query = urlencode(
        {
            "p": page,
            "page_size": page_size,
            "type": 0,
            "token_name": token_name,
            "model_name": "",
            "start_timestamp": start_timestamp,
            "end_timestamp": end_timestamp,
            "group": "",
            "request_id": "",
        }
    )
    connection = connection_class(parsed.netloc, timeout=30)
    try:
        connection.request(
            "GET",
            f"/api/log/self?{query}",
            headers=new_api_auth_headers(access_token, api_user),
        )
        response = connection.getresponse()
        body = response.read().decode("utf-8", errors="replace")
        if response.status == 429:
            raise RateLimitedError(response.getheader("Retry-After"))
        if response.status >= 400:
            raise RuntimeError(f"log sync failed: HTTP {response.status} {body[:200]}")
        return json.loads(body)
    finally:
        connection.close()


def fetch_token_log_page(*, base_url: str, api_key: str, api_user: str) -> dict:
    parsed = urlparse(base_url)
    connection_class = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    query = urlencode({"key": api_key})
    connection = connection_class(parsed.netloc, timeout=30)
    try:
        connection.request(
            "GET",
            f"/api/log/token?{query}",
            headers=new_api_auth_headers(api_key, api_user),
        )
        response = connection.getresponse()
        body = response.read().decode("utf-8", errors="replace")
        if response.status == 429:
            raise RateLimitedError(response.getheader("Retry-After"))
        if response.status >= 400:
            raise RuntimeError(f"token log sync failed: HTTP {response.status} {body[:200]}")
        return json.loads(body)
    finally:
        connection.close()


def normalize_log_items(payload: object) -> list[dict]:
    if isinstance(payload, dict):
        data = payload.get("data", payload)
        if isinstance(data, dict):
            for key in ("items", "logs", "data"):
                if isinstance(data.get(key), list):
                    return data[key]
        if isinstance(data, list):
            return data
    if isinstance(payload, list):
        return payload
    return []


def normalize_log_row(item: dict) -> dict:
    other = parse_other(item.get("other"))
    request_id = string_or_none(item.get("request_id"))
    provider_log_id = string_or_none(item.get("id"))
    created_at = int(number_or_zero(item.get("created_at")))
    input_tokens = int(number_or_zero(item.get("prompt_tokens") or item.get("input_tokens")))
    output_tokens = int(number_or_zero(item.get("completion_tokens") or item.get("output_tokens")))
    cached = int(
        number_or_zero(
            other.get("cache_tokens")
            or item.get("cached_tokens")
            or item.get("cached_input_tokens")
        )
    )
    unique_id = f"req:{request_id}" if request_id else f"id:{provider_log_id or f'{created_at}:{input_tokens}:{output_tokens}'}"
    return {
        "unique_id": unique_id,
        "provider_log_id": provider_log_id,
        "request_id": request_id,
        "created_at": created_at,
        "token_name": string_or_none(item.get("token_name")),
        "model_name": string_or_none(item.get("model_name")),
        "group_name": string_or_none(item.get("group")),
        "input_tokens": input_tokens,
        "cached_input_tokens": cached,
        "output_tokens": output_tokens,
        "total_tokens": int(number_or_zero(item.get("total_tokens")) or input_tokens + output_tokens),
        "raw_used_amount": int(number_or_zero(item.get("quota") or item.get("used_quota"))),
        "other_json": item.get("other") if isinstance(item.get("other"), str) else json.dumps(other, ensure_ascii=False),
    }


def insert_logs(items: list[dict]) -> list[dict]:
    rows = [normalize_log_row(item) for item in items]
    inserted_rows: list[dict] = []
    with sqlite3.connect(DATABASE) as db:
        for row in rows:
            cursor = db.execute(
                """
                insert or ignore into newapi_logs (
                    unique_id, provider_log_id, request_id, created_at, token_name, model_name,
                    group_name, input_tokens, cached_input_tokens, output_tokens, total_tokens,
                    raw_used_amount, other_json
                ) values (
                    :unique_id, :provider_log_id, :request_id, :created_at, :token_name, :model_name,
                    :group_name, :input_tokens, :cached_input_tokens, :output_tokens, :total_tokens,
                    :raw_used_amount, :other_json
                )
                """,
                row,
            )
            if cursor.rowcount:
                inserted_rows.append(row)
        return inserted_rows


def summarize_log_row_dicts(rows: list[dict]) -> dict:
    input_tokens = sum(int(row.get("input_tokens") or 0) for row in rows)
    cached = sum(int(row.get("cached_input_tokens") or 0) for row in rows)
    output = sum(int(row.get("output_tokens") or 0) for row in rows)
    total = sum(int(row.get("total_tokens") or 0) for row in rows)
    raw_used = sum(int(row.get("raw_used_amount") or 0) for row in rows)
    latest_created_at = max((int(row.get("created_at") or 0) for row in rows), default=None)
    return {
        "requestCount": len(rows),
        "inputTokens": input_tokens,
        "cachedInputTokens": cached,
        "outputTokens": output,
        "totalTokens": total,
        "rawUsedAmount": raw_used,
        "usedAmount": raw_used / QUOTA_UNITS_PER_CNY,
        "cacheHitRate": (cached / input_tokens * 100) if input_tokens else None,
        "latestCreatedAt": latest_created_at,
    }


def get_latest_codex_token_usage() -> dict:
    latest_file = find_latest_codex_session_file()
    if latest_file is None:
        return {"ok": True, "available": False}

    try:
        latest_event = read_latest_codex_token_event(latest_file)
    except OSError as exc:
        return {"ok": False, "available": False, "message": str(exc)}

    if latest_event is None:
        return {"ok": True, "available": False, "sessionFile": str(latest_file)}

    payload = latest_event.get("payload") or {}
    info = payload.get("info") or {}
    usage = info.get("last_token_usage") or {}
    rate_limits = payload.get("rate_limits") or {}
    timestamp = str(latest_event.get("timestamp") or "")
    event_id = hashlib.sha256(
        f"{latest_file}:{timestamp}:{json.dumps(usage, sort_keys=True)}:{json.dumps(rate_limits, sort_keys=True)}".encode("utf-8")
    ).hexdigest()
    event = {
        "ok": True,
        "available": True,
        "source": "codex",
        "eventId": event_id,
        "timestamp": timestamp,
        "accountType": get_codex_account_type(),
        "sessionFile": str(latest_file),
        "usage": {
            "inputTokens": int(number_or_zero(usage.get("input_tokens"))),
            "cachedInputTokens": int(number_or_zero(usage.get("cached_input_tokens"))),
            "outputTokens": int(number_or_zero(usage.get("output_tokens"))),
            "totalTokens": int(number_or_zero(usage.get("total_tokens"))),
            "reasoningOutputTokens": int(number_or_zero(usage.get("reasoning_output_tokens"))),
        },
        "quota": normalize_codex_rate_limits(rate_limits),
    }
    save_codex_token_event(event, latest_event)
    return event


def get_codex_rate_limits() -> dict:
    now = time.time()
    cached_quota = CODEX_RATE_LIMIT_CACHE.get("quota")
    if (
        isinstance(cached_quota, dict)
        and now - float(CODEX_RATE_LIMIT_CACHE.get("checked_at") or 0) < CODEX_RATE_LIMIT_CACHE_TTL_SECONDS
    ):
        return {
            "quota": cached_quota,
            "source": CODEX_RATE_LIMIT_CACHE.get("source") or "cache",
            "message": CODEX_RATE_LIMIT_CACHE.get("message"),
        }

    rpc_result = fetch_codex_rate_limits_rpc()
    if rpc_result.get("quota"):
        CODEX_RATE_LIMIT_CACHE.update({
            "checked_at": now,
            "quota": rpc_result["quota"],
            "source": rpc_result.get("source"),
            "message": rpc_result.get("message"),
        })
        return rpc_result

    session_result = fetch_codex_rate_limits_from_session()
    quota = session_result.get("quota") if isinstance(session_result.get("quota"), dict) else {}
    CODEX_RATE_LIMIT_CACHE.update({
        "checked_at": now,
        "quota": quota,
        "source": session_result.get("source"),
        "message": rpc_result.get("message") or session_result.get("message"),
    })
    return {
        "quota": quota,
        "source": session_result.get("source") or "codex-session",
        "message": rpc_result.get("message") or session_result.get("message"),
    }


def fetch_codex_rate_limits_rpc() -> dict:
    codex_path = find_codex_binary()
    if not codex_path:
        return {"quota": {}, "source": "codex-rpc", "message": "PATH 中找不到 codex"}

    process = None
    try:
        process = subprocess.Popen(
            [str(codex_path), "-s", "read-only", "-a", "untrusted", "app-server"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        stdout_lines: list[bytes] = []
        stdout_lock = threading.Lock()

        def read_stdout() -> None:
            assert process is not None and process.stdout is not None
            for line in iter(process.stdout.readline, b""):
                with stdout_lock:
                    stdout_lines.append(line)

        threading.Thread(target=read_stdout, daemon=True).start()
        request_id = 0

        def send_request(method: str, params: dict | None = None, timeout: float = 5.0) -> dict | None:
            nonlocal request_id
            assert process is not None and process.stdin is not None
            request_id += 1
            payload = {"id": request_id, "method": method, "params": params or {}}
            process.stdin.write((json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8"))
            process.stdin.flush()
            deadline = time.time() + timeout
            while time.time() < deadline:
                with stdout_lock:
                    for line in stdout_lines:
                        try:
                            message = json.loads(line.decode("utf-8", errors="replace").strip())
                        except json.JSONDecodeError:
                            continue
                        if message.get("id") == request_id:
                            return message
                time.sleep(0.05)
            return None

        def send_notification(method: str, params: dict | None = None) -> None:
            assert process is not None and process.stdin is not None
            payload = {"method": method, "params": params or {}}
            process.stdin.write((json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8"))
            process.stdin.flush()

        init = send_request("initialize", {"clientInfo": {"name": "codex-quota-glance", "version": "0.1.0"}})
        if not init or init.get("error"):
            return {"quota": {}, "source": "codex-rpc", "message": rpc_error_message(init, "初始化 Codex RPC 失败")}
        send_notification("initialized")

        limits = send_request("account/rateLimits/read")
        if not limits or limits.get("error"):
            return {"quota": {}, "source": "codex-rpc", "message": rpc_error_message(limits, "读取 Codex 余量失败")}
        rate_limits = ((limits.get("result") or {}).get("rateLimits") or {})
        return {
            "quota": normalize_codex_rate_limits_camel(rate_limits),
            "source": "codex-rpc",
            "message": None,
        }
    except Exception as exc:
        return {"quota": {}, "source": "codex-rpc", "message": f"Codex RPC 出错：{exc}"}
    finally:
        if process is not None:
            terminate_process(process)


def rpc_error_message(message: dict | None, fallback: str) -> str:
    error = message.get("error") if isinstance(message, dict) else None
    if isinstance(error, dict) and error.get("message"):
        return f"{fallback}：{error.get('message')}"
    return fallback


def find_codex_binary() -> Path | None:
    candidates: list[str | None] = []
    config = parse_codex_config(CODEX_HOME / "config.toml")
    env_section = config.get("mcp_servers.node_repl.env")
    if isinstance(env_section, dict):
        candidates.append(string_or_none(env_section.get("CODEX_CLI_PATH")))
    candidates.append(os.environ.get("CODEX_CLI_PATH"))
    candidates.append(shutil.which("codex"))

    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        bin_root = Path(local_app_data) / "OpenAI" / "Codex" / "bin"
        try:
            candidates.extend(str(path) for path in bin_root.glob("*\\codex.exe"))
        except OSError:
            pass

    for candidate in candidates:
        if not candidate:
            continue
        path = Path(str(candidate).strip("'\""))
        if path.exists() and path.is_file():
            return path
    return None


def terminate_process(process: subprocess.Popen, timeout: float = 2.0) -> None:
    try:
        if process.poll() is None:
            process.terminate()
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=timeout)
    except Exception:
        return


def fetch_codex_rate_limits_from_session() -> dict:
    latest_event = find_latest_codex_rate_limit_event()
    if not latest_event:
        return {"quota": {}, "source": "codex-session", "message": "会话中没有可用的官方余量记录"}
    rate_limits = ((latest_event.get("payload") or {}).get("rate_limits") or {})
    return {
        "quota": normalize_codex_rate_limits(rate_limits),
        "source": "codex-session",
        "message": None,
    }

    latest_file = find_latest_codex_session_file()
    if latest_file is None:
        return {"quota": {}, "source": "codex-session", "message": "未读取到 Codex 会话"}
    try:
        latest_event = read_latest_codex_token_event(latest_file)
    except OSError as exc:
        return {"quota": {}, "source": "codex-session", "message": str(exc)}
    if not latest_event:
        return {"quota": {}, "source": "codex-session", "message": "会话中没有 token_count"}
    rate_limits = ((latest_event.get("payload") or {}).get("rate_limits") or {})
    return {
        "quota": normalize_codex_rate_limits(rate_limits),
        "source": "codex-session",
        "message": None,
    }


def find_latest_codex_rate_limit_event(limit: int = 80) -> dict | None:
    latest_event = None
    latest_timestamp = -1.0
    for session_file in recent_codex_session_files(limit):
        try:
            with session_file.open("r", encoding="utf-8", errors="replace") as handle:
                for line in handle:
                    if '"token_count"' not in line or '"rate_limits"' not in line:
                        continue
                    try:
                        event = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    payload = event.get("payload") or {}
                    if payload.get("type") != "token_count":
                        continue
                    rate_limits = payload.get("rate_limits") or {}
                    if not has_usable_codex_rate_limits(rate_limits):
                        continue
                    timestamp = parse_iso_timestamp(str(event.get("timestamp") or "")) or 0
                    if timestamp >= latest_timestamp:
                        latest_timestamp = timestamp
                        latest_event = event
        except OSError:
            continue
    return latest_event


def has_usable_codex_rate_limits(rate_limits: dict) -> bool:
    if not isinstance(rate_limits, dict):
        return False
    return (
        has_usable_codex_rate_limit_window(rate_limits.get("primary"))
        or has_usable_codex_rate_limit_window(rate_limits.get("secondary"))
    )


def has_usable_codex_rate_limit_window(window: object) -> bool:
    if not isinstance(window, dict):
        return False
    return (
        number_or_none(window.get("used_percent")) is not None
        or number_or_none(window.get("resets_at")) is not None
        or number_or_none(window.get("window_minutes")) is not None
    )


def get_codex_account_type() -> str:
    config = parse_codex_config(CODEX_HOME / "config.toml")
    provider_id = string_or_none(config.get("model_provider"))
    provider = config.get(f"model_providers.{provider_id}") if provider_id else None
    provider = provider if isinstance(provider, dict) else {}
    base_url = string_or_none(provider.get("base_url"))
    custom_provider = bool(provider_id and provider_id not in {"openai", "chatgpt"})
    auth_exists = (CODEX_HOME / "auth.json").exists()
    return "api" if custom_provider or base_url else "official_login" if auth_exists else "api"


def save_codex_token_event(event: dict, raw_event: dict | None = None) -> None:
    if not event.get("eventId") or not event.get("usage"):
        return
    timestamp = parse_iso_timestamp(event.get("timestamp")) or __import__("time").time()
    usage = event.get("usage") or {}
    init_db()
    with sqlite3.connect(DATABASE) as db:
        db.execute(
            """
            insert or ignore into codex_token_events (
                event_id, account_type, session_file, event_timestamp, event_iso,
                input_tokens, cached_input_tokens, output_tokens, total_tokens,
                reasoning_output_tokens, raw_json
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(event.get("eventId")),
                str(event.get("accountType") or "api"),
                string_or_none(event.get("sessionFile")),
                int(timestamp),
                string_or_none(event.get("timestamp")),
                int(number_or_zero(usage.get("inputTokens"))),
                int(number_or_zero(usage.get("cachedInputTokens"))),
                int(number_or_zero(usage.get("outputTokens"))),
                int(number_or_zero(usage.get("totalTokens"))),
                int(number_or_zero(usage.get("reasoningOutputTokens"))),
                json.dumps(raw_event or event, ensure_ascii=False),
            ),
        )


def get_codex_token_summary(context: dict | None = None) -> dict:
    init_db()
    account_type = str((context or {}).get("accountType") or get_codex_account_type())
    now = __import__("datetime").datetime.now()
    day_start = int(now.replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
    day_end = day_start + 86400
    with sqlite3.connect(DATABASE) as db:
        db.row_factory = sqlite3.Row
        return {
            "ok": True,
            "accountType": account_type,
            "today": summarize_codex_token_rows(
                db,
                "where account_type = ? and event_timestamp >= ? and event_timestamp < ?",
                (account_type, day_start, day_end),
            ),
            "all": summarize_codex_token_rows(
                db,
                "where account_type = ?",
                (account_type,),
            ),
            "latestEventAt": get_latest_codex_event_at(db, account_type),
        }


def summarize_codex_token_rows(db: sqlite3.Connection, where_sql: str, params: tuple) -> dict:
    row = db.execute(
        f"""
        select
            count(*) as request_count,
            coalesce(sum(input_tokens), 0) as input_tokens,
            coalesce(sum(cached_input_tokens), 0) as cached_input_tokens,
            coalesce(sum(output_tokens), 0) as output_tokens,
            coalesce(sum(total_tokens), 0) as total_tokens,
            max(event_timestamp) as latest_event_at
        from codex_token_events
        {where_sql}
        """,
        params,
    ).fetchone()
    input_tokens = int(row["input_tokens"])
    cached = int(row["cached_input_tokens"])
    return {
        "requestCount": int(row["request_count"]),
        "inputTokens": input_tokens,
        "cachedInputTokens": cached,
        "outputTokens": int(row["output_tokens"]),
        "totalTokens": int(row["total_tokens"]),
        "rawUsedAmount": 0,
        "usedAmount": 0,
        "cacheHitRate": (cached / input_tokens * 100) if input_tokens else None,
        "latestLogAt": timestamp_to_iso(row["latest_event_at"]) if row["latest_event_at"] else None,
    }


def get_latest_codex_event_at(db: sqlite3.Connection, account_type: str) -> int | None:
    row = db.execute(
        "select max(event_timestamp) from codex_token_events where account_type = ?",
        (account_type,),
    ).fetchone()
    return int(row[0]) if row and row[0] else None


def read_latest_codex_token_event(session_file: Path) -> dict | None:
    cached_path = CODEX_TOKEN_EVENT_CACHE.get("path")
    cached_offset = int(number_or_zero(CODEX_TOKEN_EVENT_CACHE.get("offset")))
    latest_event = CODEX_TOKEN_EVENT_CACHE.get("latest_event")
    latest_event = latest_event if isinstance(latest_event, dict) else None

    try:
        size = session_file.stat().st_size
    except OSError:
        reset_codex_token_event_cache()
        raise

    if cached_path != session_file or size < cached_offset:
        cached_offset = 0
        latest_event = None

    with session_file.open("r", encoding="utf-8", errors="replace") as handle:
        if cached_offset > 0:
            handle.seek(cached_offset)
        for line in handle:
            if '"token_count"' not in line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            payload = event.get("payload") or {}
            if payload.get("type") == "token_count":
                latest_event = event
        CODEX_TOKEN_EVENT_CACHE["path"] = session_file
        CODEX_TOKEN_EVENT_CACHE["offset"] = handle.tell()
        CODEX_TOKEN_EVENT_CACHE["latest_event"] = latest_event

    return latest_event


def reset_codex_token_event_cache() -> None:
    CODEX_TOKEN_EVENT_CACHE["path"] = None
    CODEX_TOKEN_EVENT_CACHE["offset"] = 0
    CODEX_TOKEN_EVENT_CACHE["latest_event"] = None


def normalize_codex_rate_limits(rate_limits: dict) -> dict:
    if not isinstance(rate_limits, dict):
        return {}
    return {
        "window5h": normalize_codex_rate_limit_window(rate_limits.get("primary")),
        "weekly": normalize_codex_rate_limit_window(rate_limits.get("secondary")),
        "planType": string_or_none(rate_limits.get("plan_type")),
        "rateLimitReachedType": string_or_none(rate_limits.get("rate_limit_reached_type")),
    }


def normalize_codex_rate_limits_camel(rate_limits: dict) -> dict:
    if not isinstance(rate_limits, dict):
        return {}
    return {
        "window5h": normalize_codex_rate_limit_window_camel(rate_limits.get("primary")),
        "weekly": normalize_codex_rate_limit_window_camel(rate_limits.get("secondary")),
        "planType": string_or_none(rate_limits.get("planType")),
        "rateLimitReachedType": string_or_none(rate_limits.get("rateLimitReachedType")),
    }


def normalize_codex_rate_limit_window(window: dict | None) -> dict:
    if not isinstance(window, dict):
        return {}
    used_percent = number_or_none(window.get("used_percent"))
    window_minutes = number_or_none(window.get("window_minutes"))
    resets_at = number_or_none(window.get("resets_at"))
    remaining_percent = None if used_percent is None else max(0, min(100, 100 - used_percent))
    reset_in_seconds = None
    if resets_at is not None:
        reset_in_seconds = max(0, int(resets_at - __import__("time").time()))
    return {
        "usedPercent": used_percent,
        "remainingPercent": remaining_percent,
        "windowMinutes": window_minutes,
        "resetAt": timestamp_to_iso(resets_at),
        "resetInSeconds": reset_in_seconds,
    }


def normalize_codex_rate_limit_window_camel(window: dict | None) -> dict:
    if not isinstance(window, dict):
        return {}
    used_percent = number_or_none(window.get("usedPercent"))
    window_minutes = number_or_none(window.get("windowMinutes"))
    resets_at = number_or_none(window.get("resetsAt"))
    remaining_percent = None if used_percent is None else max(0, min(100, 100 - used_percent))
    reset_in_seconds = None
    if resets_at is not None:
        reset_in_seconds = max(0, int(resets_at - __import__("time").time()))
    return {
        "usedPercent": used_percent,
        "remainingPercent": remaining_percent,
        "windowMinutes": window_minutes,
        "resetAt": timestamp_to_iso(resets_at),
        "resetInSeconds": reset_in_seconds,
    }


def timestamp_to_iso(value: int | float | None) -> str | None:
    if value is None:
        return None
    try:
        return __import__("datetime").datetime.fromtimestamp(
            float(value),
            tz=__import__("datetime").timezone.utc,
        ).isoformat()
    except (OSError, OverflowError, ValueError):
        return None


def find_latest_codex_session_file() -> Path | None:
    if not CODEX_SESSIONS.exists():
        return None
    now = time.time()
    cached_path = CODEX_SESSION_DISCOVERY_CACHE.get("path")
    if (
        isinstance(cached_path, Path)
        and cached_path.exists()
        and now - float(CODEX_SESSION_DISCOVERY_CACHE.get("checked_at") or 0) < CODEX_SESSION_DISCOVERY_TTL_SECONDS
    ):
        return cached_path
    try:
        files = [path for path in CODEX_SESSIONS.rglob("*.jsonl") if path.is_file()]
    except OSError:
        return None
    if not files:
        CODEX_SESSION_DISCOVERY_CACHE["checked_at"] = now
        CODEX_SESSION_DISCOVERY_CACHE["path"] = None
        return None
    latest = max(files, key=lambda path: path.stat().st_mtime)
    CODEX_SESSION_DISCOVERY_CACHE["checked_at"] = now
    CODEX_SESSION_DISCOVERY_CACHE["path"] = latest
    return latest


def recent_codex_session_files(limit: int = 80) -> list[Path]:
    if not CODEX_SESSIONS.exists():
        return []
    try:
        files = [path for path in CODEX_SESSIONS.rglob("*.jsonl") if path.is_file()]
    except OSError:
        return []
    files.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    return files[: max(1, int(limit))]


def reset_codex_session_discovery_cache() -> None:
    CODEX_SESSION_DISCOVERY_CACHE["checked_at"] = 0.0
    CODEX_SESSION_DISCOVERY_CACHE["path"] = None


def get_latest_codex_activity() -> dict:
    latest_file = find_latest_codex_session_file()
    if latest_file is None:
        return {
            "status": "unknown",
            "label": "未读取到 Codex 会话",
            "needsHumanAttention": False,
            "completedTask": False,
        }
    try:
        activity = parse_codex_activity(latest_file)
    except OSError as exc:
        return {
            "status": "unknown",
            "label": str(exc),
            "needsHumanAttention": False,
            "completedTask": False,
            "sessionFile": str(latest_file),
        }
    activity["sessionFile"] = str(latest_file)
    return activity


def parse_codex_activity(session_file: Path) -> dict:
    activity: dict | None = None
    is_inside_turn = False
    waiting_for_plan_choice = False
    last_final_answer_at: float | None = None
    for line in recent_session_lines(session_file, max_bytes=512 * 1024):
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        update = codex_activity_update(
            event,
            is_inside_turn=is_inside_turn,
            waiting_for_plan_choice=waiting_for_plan_choice,
            last_final_answer_at=last_final_answer_at,
        )
        if not update:
            continue
        is_inside_turn = bool(update.get("isInsideTurn"))
        waiting_for_plan_choice = bool(update.get("waitingForPlanChoice"))
        if update.get("clearsFinalAnswer"):
            last_final_answer_at = None
        event_ts = parse_iso_timestamp(str(event.get("timestamp") or ""))
        if update.get("isFinalAnswer"):
            last_final_answer_at = event_ts
        activity = {
            "status": update["status"],
            "label": codex_activity_label(update["status"], bool(update.get("needsHumanAttention"))),
            "timestamp": event.get("timestamp"),
            "needsHumanAttention": bool(update.get("needsHumanAttention")),
            "completedTask": bool(update.get("completedTask")),
        }
    return activity or {
        "status": "finished",
        "label": "空闲",
        "needsHumanAttention": False,
        "completedTask": False,
    }


def codex_activity_update(
    event: dict,
    *,
    is_inside_turn: bool,
    waiting_for_plan_choice: bool,
    last_final_answer_at: float | None,
) -> dict | None:
    event_type = str(event.get("type") or "")
    payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    payload_type = str(payload.get("type") or "")
    event_ts = parse_iso_timestamp(str(event.get("timestamp") or ""))

    if payload.get("phase") == "final_answer":
        return activity_update("waiting_for_user", False, waiting_for_plan_choice, is_final_answer=True)
    if contains_human_waiting_signal(payload) or contains_human_review_signal(payload):
        return activity_update("waiting_for_user", True, waiting_for_plan_choice, needs_human_attention=True)
    if contains_auto_review_signal(payload):
        return activity_update("auto_reviewing", True, waiting_for_plan_choice)
    if is_tool_start_event(event_type, payload_type, payload):
        return activity_update("answering", True, False, clears_final_answer=True)

    if event_type == "event_msg":
        if payload_type == "task_started":
            return activity_update("waiting_for_user", True, False, clears_final_answer=True)
        if payload_type == "task_complete":
            if should_keep_final_answer_visible(last_final_answer_at, event_ts):
                return activity_update("waiting_for_user", False, waiting_for_plan_choice)
            if waiting_for_plan_choice:
                return activity_update("waiting_for_user", False, True, needs_human_attention=True)
            return activity_update("finished", False, False, completed_task=True)
        if payload_type in {"turn_aborted", "thread_rolled_back"}:
            return activity_update("finished", False, False, clears_final_answer=True)
        if payload_type == "user_message":
            return activity_update("waiting_for_user", True, False, clears_final_answer=True)
        if payload_type == "agent_message":
            if contains_plan_choice_signal(payload):
                return activity_update("waiting_for_user", False, True, needs_human_attention=True)
            if is_execution_commentary(payload):
                return activity_update("answering", True, False, clears_final_answer=True)
            return activity_update("answering", True, waiting_for_plan_choice) if is_inside_turn else None
        if payload_type in {"patch_apply_begin", "patch_apply_end"}:
            return activity_update("answering", True, False, clears_final_answer=True)
        if payload_type == "agent_message_delta":
            return activity_update("answering", True, waiting_for_plan_choice) if is_inside_turn else None
        if payload_type == "token_count":
            return None
        return activity_update("answering", True, waiting_for_plan_choice) if payload_type and is_inside_turn else None

    if event_type == "response_item":
        if contains_plan_choice_signal(payload):
            return activity_update("waiting_for_user", False, True, needs_human_attention=True)
        if payload_type == "function_call":
            needs_user = function_call_needs_user(payload)
            return activity_update(
                "waiting_for_user" if needs_user else "answering",
                True,
                needs_user,
                needs_human_attention=needs_user,
                clears_final_answer=True,
            )
        if payload_type in {"function_call_output", "custom_tool_call_output", "custom_tool_call", "web_search_call"}:
            return activity_update("answering", True, False, clears_final_answer=True)
        if payload_type == "reasoning":
            return activity_update("waiting_for_user", True, waiting_for_plan_choice) if is_inside_turn else None
        if payload_type == "message":
            if is_execution_commentary(payload):
                return activity_update("answering", True, False, clears_final_answer=True)
            return activity_update("answering", True, waiting_for_plan_choice) if is_inside_turn else None
        return activity_update("answering", True, waiting_for_plan_choice) if payload_type and is_inside_turn else None

    return None


def activity_update(
    status: str,
    is_inside_turn: bool,
    waiting_for_plan_choice: bool,
    *,
    is_final_answer: bool = False,
    clears_final_answer: bool = False,
    needs_human_attention: bool = False,
    completed_task: bool = False,
) -> dict:
    return {
        "status": status,
        "isInsideTurn": is_inside_turn,
        "waitingForPlanChoice": waiting_for_plan_choice,
        "isFinalAnswer": is_final_answer,
        "clearsFinalAnswer": clears_final_answer,
        "needsHumanAttention": needs_human_attention,
        "completedTask": completed_task,
    }


def codex_activity_label(status: str, needs_human_attention: bool = False) -> str:
    if status == "answering":
        return "执行中"
    if status == "waiting_for_user":
        return "等待授权" if needs_human_attention else "思考中"
    if status == "auto_reviewing":
        return "自动审核中"
    if status == "finished":
        return "空闲"
    return "未知"


def function_call_needs_user(payload: dict) -> bool:
    name = str(payload.get("name") or "")
    if name in {"request_user_input", "request_plugin_install"}:
        return True
    arguments = str(payload.get("arguments") or "")
    return "require_escalated" in arguments.lower() or "sandbox_permissions" in arguments.lower()


def is_tool_start_event(event_type: str, payload_type: str, payload: dict) -> bool:
    if function_call_needs_user(payload):
        return False
    if event_type in {"function_call", "custom_tool_call", "web_search_call", "patch_apply_begin"}:
        return True
    if payload_type in {"function_call", "custom_tool_call", "web_search_call", "patch_apply_begin"}:
        return True
    return str(payload.get("name") or "") in {"apply_patch", "exec_command", "write_stdin", "view_image"}


def contains_human_waiting_signal(payload: dict) -> bool:
    values = [payload.get("type"), payload.get("name")]
    if any(any(word in str(value).lower() for word in ("approval", "permission", "request_user_input")) for value in values):
        return True
    return function_call_needs_user(payload)


def contains_auto_review_signal(payload: dict) -> bool:
    return any("auto_review" in str(value).replace("-", "_").lower() for value in structured_string_values(payload))


def contains_human_review_signal(payload: dict) -> bool:
    if contains_auto_review_signal(payload):
        return False
    return any(
        marker in str(value).replace("-", "_").lower()
        for value in structured_string_values(payload)
        for marker in ("review_pending", "reviewing", "reviewer")
    )


def contains_plan_choice_signal(payload: dict) -> bool:
    return any("<proposed_plan>" in value.lower() or "实施此计划" in value for value in string_values(payload))


def is_execution_commentary(payload: dict) -> bool:
    if payload.get("phase") != "commentary":
        return False
    markers = ("apply_patch", "执行", "运行", "构建", "测试", "正在修改", "开始修改")
    return any(any(marker in value for marker in markers) for value in string_values(payload))


def structured_string_values(payload: dict) -> list[str]:
    keys = ("type", "name", "status", "reviewer", "approval_reviewer", "approvals_reviewer")
    return [str(payload.get(key) or "") for key in keys if payload.get(key) is not None]


def string_values(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [item for entry in value for item in string_values(entry)]
    if isinstance(value, dict):
        return [item for entry in value.values() for item in string_values(entry)]
    return []


def should_keep_final_answer_visible(final_answer_at: float | None, task_complete_at: float | None) -> bool:
    if final_answer_at is None or task_complete_at is None:
        return False
    return task_complete_at - final_answer_at <= 1 and time.time() - task_complete_at < 1.5


def recent_session_lines(session_file: Path, max_bytes: int) -> list[str]:
    with session_file.open("rb") as handle:
        handle.seek(0, 2)
        total = handle.tell()
        offset = max(0, total - max_bytes)
        handle.seek(offset)
        data = handle.read()
    if offset > 0:
        newline = data.find(b"\n")
        if newline >= 0:
            data = data[newline + 1:]
    return data.decode("utf-8", errors="replace").splitlines()


def parse_iso_timestamp(value: str) -> float | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        return __import__("datetime").datetime.fromisoformat(normalized).timestamp()
    except ValueError:
        return None


def get_codex_status() -> dict:
    config = parse_codex_config(CODEX_HOME / "config.toml")
    provider_id = string_or_none(config.get("model_provider"))
    provider = config.get(f"model_providers.{provider_id}") if provider_id else None
    provider = provider if isinstance(provider, dict) else {}
    base_url = string_or_none(provider.get("base_url"))
    api_key = get_codex_api_key(config, provider)
    provider_name = string_or_none(provider.get("name")) or provider_id
    model = string_or_none(config.get("model"))
    auth_exists = (CODEX_HOME / "auth.json").exists()
    custom_provider = bool(provider_id and provider_id not in {"openai", "chatgpt"})
    account_type = "api" if custom_provider or base_url else "official_login" if auth_exists else "api"
    activity = get_latest_codex_activity()
    rate_limits = get_codex_rate_limits() if account_type == "official_login" else {"quota": {}, "source": None, "message": None}
    return {
        "ok": True,
        "accountType": account_type,
        "providerName": provider_name,
        "model": model,
        "baseUrl": base_url,
        "apiKeyFingerprint": codex_api_key_match_fingerprint(api_key) if api_key else None,
        "quota": rate_limits.get("quota") or {},
        "quotaSource": rate_limits.get("source"),
        "quotaMessage": rate_limits.get("message"),
        "activity": activity,
        "source": str(CODEX_HOME / "config.toml"),
        "updatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    }


def get_codex_api_key(config: dict, provider: dict) -> str | None:
    candidates = [
        string_or_none(provider.get("api_key")),
        string_or_none(provider.get("apiKey")),
    ]
    env_key = string_or_none(provider.get("env_key") or provider.get("api_key_env"))
    if env_key:
        candidates.append(string_or_none(os.environ.get(env_key)))
    candidates.append(string_or_none(os.environ.get("OPENAI_API_KEY")))
    candidates.append(string_or_none(os.environ.get("CODEX_API_KEY")))

    auth_key = read_codex_auth_key()
    if auth_key:
        candidates.append(auth_key)

    for candidate in candidates:
        value = string_or_none(candidate)
        if value:
            return value
    return None


def read_codex_auth_key() -> str | None:
    auth_path = CODEX_HOME / "auth.json"
    if not auth_path.exists():
        return None
    try:
        data = json.loads(auth_path.read_text(encoding="utf-8", errors="replace"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    for key in ("OPENAI_API_KEY", "CODEX_API_KEY"):
        value = string_or_none(data.get(key))
        if value:
            return value
    return None


def codex_api_key_match_fingerprint(api_key: str) -> str:
    value = str(api_key or "")
    hash_value = 0x811C9DC5
    for char in value:
        hash_value ^= ord(char)
        hash_value = (hash_value * 0x01000193) & 0xFFFFFFFF
    return f"fnv1a:{hash_value:08x}"


def parse_codex_config(path: Path) -> dict:
    if not path.exists():
        return {}
    result: dict[str, object] = {}
    current_section: str | None = None
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return {}
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        section_match = re.match(r"^\[([^\]]+)\]$", stripped)
        if section_match:
            current_section = section_match.group(1).strip()
            result.setdefault(current_section, {})
            continue
        if "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = parse_toml_scalar(value.strip())
        if current_section:
            section = result.setdefault(current_section, {})
            if isinstance(section, dict):
                section[key] = value
        elif current_section is None:
            result[key] = value
    return result


def parse_toml_scalar(value: str) -> object:
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        return value[1:-1]
    if value.lower() == "true":
        return True
    if value.lower() == "false":
        return False
    return value


def get_log_summary(context: dict | None = None) -> dict:
    init_db()
    now = __import__("datetime").datetime.now()
    day_start = int(now.replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
    day_end = day_start + 86400
    base_url = str((context or {}).get("baseUrl") or "").rstrip("/")
    api_user = str((context or {}).get("apiUser") or (context or {}).get("newApiUser") or "")
    access_token = str((context or {}).get("accessToken") or "")
    with sqlite3.connect(DATABASE) as db:
        db.row_factory = sqlite3.Row
        sync_snapshot = get_latest_sync_snapshot(db)
        topup_snapshot = get_latest_topup_cache(db, base_url=base_url, api_user=api_user, access_token=access_token)
        account_snapshot = apply_topup_to_account(
            get_latest_account_cache(db, base_url=base_url, api_user=api_user, access_token=access_token),
            topup_snapshot,
        )
        return {
            "ok": True,
            "today": summarize_rows(db, "where created_at >= ? and created_at < ?", (day_start, day_end)),
            "all": summarize_rows(db, "", ()),
            "latestCreatedAt": get_global_latest_created_at(db),
            "coverage": get_log_coverage(db, sync_snapshot),
            "sync": sync_snapshot,
            "account": account_snapshot,
            "topup": topup_snapshot,
        }


def summarize_rows(db: sqlite3.Connection, where_sql: str, params: tuple) -> dict:
    row = db.execute(
        f"""
        select
            count(*) as request_count,
            coalesce(sum(input_tokens), 0) as input_tokens,
            coalesce(sum(cached_input_tokens), 0) as cached_input_tokens,
            coalesce(sum(output_tokens), 0) as output_tokens,
            coalesce(sum(total_tokens), 0) as total_tokens,
            coalesce(sum(raw_used_amount), 0) as raw_used_amount
        from newapi_logs
        {where_sql}
        """,
        params,
    ).fetchone()
    input_tokens = int(row["input_tokens"])
    cached = int(row["cached_input_tokens"])
    raw_used = int(row["raw_used_amount"])
    return {
        "requestCount": int(row["request_count"]),
        "inputTokens": input_tokens,
        "cachedInputTokens": cached,
        "outputTokens": int(row["output_tokens"]),
        "totalTokens": int(row["total_tokens"]),
        "rawUsedAmount": raw_used,
        "usedAmount": raw_used / QUOTA_UNITS_PER_CNY,
        "cacheHitRate": (cached / input_tokens * 100) if input_tokens else None,
    }


def get_latest_created_at(sync_key: str) -> int | None:
    with sqlite3.connect(DATABASE) as db:
        row = db.execute(
            "select latest_created_at from newapi_sync_state where sync_key = ?",
            (sync_key,),
        ).fetchone()
        return int(row[0]) if row and row[0] else None


def get_backfill_until(sync_key: str) -> int | None:
    with sqlite3.connect(DATABASE) as db:
        row = db.execute(
            "select backfill_until from newapi_sync_state where sync_key = ?",
            (sync_key,),
        ).fetchone()
        return int(row[0]) if row and row[0] else None


def save_backfill_until(sync_key: str, value: int | None) -> None:
    with sqlite3.connect(DATABASE) as db:
        db.execute(
            "update newapi_sync_state set backfill_until = ? where sync_key = ?",
            (value, sync_key),
        )


def clear_backfill_until(sync_key: str) -> None:
    save_backfill_until(sync_key, None)


def mark_backfill_complete(sync_key: str) -> None:
    with sqlite3.connect(DATABASE) as db:
        db.execute(
            "update newapi_sync_state set backfill_until = null, backfill_complete = 1, backfill_warning = null where sync_key = ?",
            (sync_key,),
        )


def mark_backfill_incomplete(sync_key: str, warning: str | None = None) -> None:
    with sqlite3.connect(DATABASE) as db:
        db.execute(
            "update newapi_sync_state set backfill_complete = 0, backfill_warning = ? where sync_key = ?",
            (warning, sync_key),
        )


def get_global_latest_created_at(db: sqlite3.Connection | None = None) -> int | None:
    close = False
    if db is None:
        db = sqlite3.connect(DATABASE)
        close = True
    try:
        row = db.execute("select max(created_at) from newapi_logs").fetchone()
        return int(row[0]) if row and row[0] else None
    finally:
        if close:
            db.close()


def get_first_created_at(db: sqlite3.Connection) -> int | None:
    row = db.execute("select min(created_at) from newapi_logs").fetchone()
    return int(row[0]) if row and row[0] else None


def get_first_created_at_for_sync() -> int | None:
    init_db()
    with sqlite3.connect(DATABASE) as db:
        return get_first_created_at(db)


def get_log_coverage(db: sqlite3.Connection, sync_snapshot: dict | None = None) -> dict:
    first = get_first_created_at(db)
    expected = INITIAL_SYNC_START
    scanned = number_or_none((sync_snapshot or {}).get("backfillUntil"))
    backfill_complete = bool((sync_snapshot or {}).get("backfillComplete"))
    warning = string_or_none((sync_snapshot or {}).get("backfillWarning"))
    complete_boundary = first if first is not None else get_global_latest_created_at(db)
    complete = False
    if complete_boundary is not None and not warning:
        complete = (
            backfill_complete
        ) or (
            first is not None and first <= expected + SYNC_OVERLAP_SECONDS
        ) or (
            scanned is not None and scanned >= complete_boundary - SYNC_OVERLAP_SECONDS
        )
    scanned_floor = scanned if scanned is not None else expected
    missing_start = max(expected, scanned_floor)
    missing = 0 if complete else max(0, (first or complete_boundary or expected) - missing_start)
    return {
        "complete": complete,
        "firstCreatedAt": first,
        "expectedStartAt": expected,
        "scannedThroughAt": scanned,
        "missingBeforeSeconds": missing,
        "warning": warning,
    }


def get_log_coverage_for_sync(sync_key: str | None = None) -> dict:
    init_db()
    with sqlite3.connect(DATABASE) as db:
        sync_snapshot = get_latest_sync_snapshot(db, sync_key)
        return get_log_coverage(db, sync_snapshot)


def get_latest_sync_snapshot(db: sqlite3.Connection, sync_key: str | None = None) -> dict | None:
    db.row_factory = sqlite3.Row
    if sync_key:
        row = db.execute(
            """
            select latest_created_at, last_synced_at, fail_count, blocked_until, backfill_until,
                   backfill_complete, backfill_warning
            from newapi_sync_state
            where sync_key = ?
            limit 1
            """,
            (sync_key,),
        ).fetchone()
    else:
        row = db.execute(
            """
            select latest_created_at, last_synced_at, fail_count, blocked_until, backfill_until,
                   backfill_complete, backfill_warning
            from newapi_sync_state
            order by last_synced_at desc
            limit 1
            """
        ).fetchone()
    if not row:
        return None
    blocked_until = row["blocked_until"]
    backfill_until = row["backfill_until"]
    backfill_complete = row["backfill_complete"] == 1
    first = get_first_created_at(db)
    backfill_done = (
        backfill_complete
    ) or (
        backfill_until is not None
        and first is not None
        and int(backfill_until) >= int(first) - SYNC_OVERLAP_SECONDS
    )
    mode = "backoff" if blocked_until else "backfill" if backfill_until and not backfill_done else "incremental"
    return {
        "mode": mode,
        "latestCreatedAt": row["latest_created_at"],
        "lastSyncedAt": row["last_synced_at"],
        "failCount": row["fail_count"],
        "blockedUntil": blocked_until,
        "backfillUntil": backfill_until,
        "backfillComplete": backfill_complete,
        "backfillWarning": string_or_none(row["backfill_warning"]),
    }


def save_sync_state(sync_key: str, base_url: str, api_user: str, api_key: str, latest: int | None) -> None:
    with sqlite3.connect(DATABASE) as db:
        db.execute(
            """
            insert into newapi_sync_state (
                sync_key, base_url, api_user, key_fingerprint, latest_created_at, last_synced_at,
                fail_count, blocked_until, backfill_until
            ) values (?, ?, ?, ?, ?, strftime('%s','now'), 0, null, null)
            on conflict(sync_key) do update set
                latest_created_at = excluded.latest_created_at,
                last_synced_at = excluded.last_synced_at,
                fail_count = 0,
                blocked_until = null
            """,
            (sync_key, base_url, api_user, key_fingerprint(api_key), latest),
        )


def save_account_cache(base_url: str, api_user: str, access_token: str, snapshot: dict) -> None:
    account_key = make_account_key(base_url, api_user, access_token)
    cached = {
        **snapshot,
        "cached": True,
        "cachedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    }
    with sqlite3.connect(DATABASE) as db:
        db.execute(
            """
            insert into newapi_account_cache (
                account_key, base_url, api_user, token_fingerprint, snapshot_json, updated_at
            ) values (?, ?, ?, ?, ?, strftime('%s','now'))
            on conflict(account_key) do update set
                snapshot_json = excluded.snapshot_json,
                updated_at = excluded.updated_at
            """,
            (
                account_key,
                base_url,
                api_user,
                key_fingerprint(access_token),
                json.dumps(cached, ensure_ascii=False, separators=(",", ":")),
            ),
        )


def save_topup_cache(base_url: str, api_user: str, access_token: str, snapshot: dict) -> None:
    topup_key = make_account_key(base_url, api_user, access_token)
    cached = {
        **snapshot,
        "cached": True,
        "updatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    }
    with sqlite3.connect(DATABASE) as db:
        db.execute(
            """
            insert into newapi_topup_cache (
                topup_key, base_url, api_user, token_fingerprint, snapshot_json, updated_at
            ) values (?, ?, ?, ?, ?, strftime('%s','now'))
            on conflict(topup_key) do update set
                snapshot_json = excluded.snapshot_json,
                updated_at = excluded.updated_at
            """,
            (
                topup_key,
                base_url,
                api_user,
                key_fingerprint(access_token),
                json.dumps(cached, ensure_ascii=False, separators=(",", ":")),
            ),
        )


def get_latest_account_cache(
    db: sqlite3.Connection,
    *,
    base_url: str = "",
    api_user: str = "",
    access_token: str = "",
) -> dict | None:
    account_key = make_account_key(base_url, api_user, access_token) if base_url and access_token else ""
    if account_key:
        row = db.execute(
            "select snapshot_json from newapi_account_cache where account_key = ? limit 1",
            (account_key,),
        ).fetchone()
    else:
        row = db.execute(
            "select snapshot_json from newapi_account_cache order by updated_at desc limit 1"
        ).fetchone()
    if not row:
        return None
    try:
        snapshot = json.loads(row[0])
        return snapshot if isinstance(snapshot, dict) else None
    except json.JSONDecodeError:
        return None


def get_fresh_account_cache(ttl_seconds: int) -> dict | None:
    init_db()
    cutoff = int(__import__("time").time()) - ttl_seconds
    with sqlite3.connect(DATABASE) as db:
        row = db.execute(
            "select snapshot_json from newapi_account_cache where updated_at >= ? order by updated_at desc limit 1",
            (cutoff,),
        ).fetchone()
        if not row:
            return None
        try:
            snapshot = json.loads(row[0])
            return snapshot if isinstance(snapshot, dict) else None
        except json.JSONDecodeError:
            return None


def get_latest_topup_cache(
    db: sqlite3.Connection | None = None,
    *,
    base_url: str = "",
    api_user: str = "",
    access_token: str = "",
) -> dict | None:
    close = False
    if db is None:
        init_db()
        db = sqlite3.connect(DATABASE)
        close = True
    try:
        topup_key = make_account_key(base_url, api_user, access_token) if base_url and access_token else ""
        if topup_key:
            row = db.execute(
                "select snapshot_json from newapi_topup_cache where topup_key = ? limit 1",
                (topup_key,),
            ).fetchone()
        else:
            row = db.execute(
                "select snapshot_json from newapi_topup_cache order by updated_at desc limit 1"
            ).fetchone()
        if not row:
            return None
        try:
            snapshot = json.loads(row[0])
            return snapshot if isinstance(snapshot, dict) else None
        except json.JSONDecodeError:
            return None
    finally:
        if close:
            db.close()


def get_fresh_topup_cache(ttl_seconds: int) -> dict | None:
    init_db()
    cutoff = int(__import__("time").time()) - ttl_seconds
    with sqlite3.connect(DATABASE) as db:
        row = db.execute(
            "select snapshot_json from newapi_topup_cache where updated_at >= ? order by updated_at desc limit 1",
            (cutoff,),
        ).fetchone()
        if not row:
            return None
        try:
            snapshot = json.loads(row[0])
            return snapshot if isinstance(snapshot, dict) else None
        except json.JSONDecodeError:
            return None


def get_sync_block(sync_key: str) -> dict | None:
    with sqlite3.connect(DATABASE) as db:
        db.row_factory = sqlite3.Row
        row = db.execute(
            "select fail_count, blocked_until from newapi_sync_state where sync_key = ?",
            (sync_key,),
        ).fetchone()
        return dict(row) if row else None


def save_sync_failure(
    sync_key: str,
    base_url: str,
    api_user: str,
    api_key: str,
    latest: int | None,
    retry_after: int | None = None,
) -> int:
    now_ts = int(__import__("time").time())
    state = get_sync_block(sync_key) or {}
    fail_count = int(state.get("fail_count") or 0) + 1
    delay = retry_after if retry_after and retry_after > 0 else backoff_seconds(fail_count)
    blocked_until = now_ts + delay
    with sqlite3.connect(DATABASE) as db:
        db.execute(
            """
            insert into newapi_sync_state (
                sync_key, base_url, api_user, key_fingerprint, latest_created_at, last_synced_at,
                fail_count, blocked_until
            ) values (?, ?, ?, ?, ?, strftime('%s','now'), ?, ?)
            on conflict(sync_key) do update set
                latest_created_at = coalesce(excluded.latest_created_at, newapi_sync_state.latest_created_at),
                last_synced_at = excluded.last_synced_at,
                fail_count = excluded.fail_count,
                blocked_until = excluded.blocked_until
            """,
            (sync_key, base_url, api_user, key_fingerprint(api_key), latest, fail_count, blocked_until),
        )
    return blocked_until


def backoff_seconds(fail_count: int) -> int:
    if fail_count <= 1:
        return 60
    if fail_count == 2:
        return 180
    return 300


def normalize_ttl(value: object, fallback: int) -> int:
    try:
        number = int(float(str(value)))
    except (TypeError, ValueError):
        return fallback
    return min(21600, max(60, number))


def parse_retry_after(value: str | None) -> int | None:
    try:
        number = int(str(value or "").strip())
    except ValueError:
        return None
    return number if number > 0 else None


def make_sync_key(base_url: str, api_user: str, api_key: str) -> str:
    return hashlib.sha256(f"{base_url}|{api_user}|{key_fingerprint(api_key)}".encode("utf-8")).hexdigest()


def make_account_key(base_url: str, api_user: str, access_token: str) -> str:
    return hashlib.sha256(f"{base_url}|{api_user}|{key_fingerprint(access_token)}".encode("utf-8")).hexdigest()


def key_fingerprint(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:16]


def parse_other(value: object) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def number_or_zero(value: object) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0


def number_or_none(value: object) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def string_or_none(value: object) -> str | None:
    if value is None:
        return None
    text = str(value)
    return text if text else None


def new_api_auth_headers(token: str, api_user: str, *, apifox_like: bool = False) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {str(token or '').strip()}",
        "New-Api-User": str(api_user or "").strip(),
    }
    if apifox_like:
        headers.update(
            {
                "User-Agent": "Apifox/1.0.0 (https://apifox.com)",
                "Accept": "*/*",
                "Connection": "keep-alive",
            }
        )
    return headers


def masked_new_api_headers(token: str, api_user: str, *, apifox_like: bool = False) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {mask_secret(str(token or '').strip())}",
        "New-Api-User": str(api_user or "").strip(),
    }
    if apifox_like:
        headers.update(
            {
                "User-Agent": "Apifox/1.0.0 (https://apifox.com)",
                "Accept": "*/*",
                "Connection": "keep-alive",
            }
        )
    return headers


def new_api_header_diagnostics(token: str) -> dict[str, object]:
    cleaned_token = str(token or "").strip()
    authorization = f"Bearer {cleaned_token}"
    hash_prefix = hashlib.sha256(cleaned_token.encode("utf-8")).hexdigest()[:16]
    return {
        "startsWithBearerSpace": authorization.startswith("Bearer "),
        "authorizationLength": len(authorization),
        "tokenTrimmedLength": len(cleaned_token),
        "tokenHashPrefix": hash_prefix,
        "apiKeyTrimmedLength": len(cleaned_token),
        "apiKeyHashPrefix": hash_prefix,
    }


def build_request_debug_entry(
    *,
    method: str,
    url: str,
    token: str,
    api_user: str,
    source: str | None = None,
    apifox_like: bool = False,
) -> dict:
    entry = {
        "time": int(time.time()),
        "method": method,
        "url": url,
        "sentHeaders": masked_new_api_headers(token, api_user, apifox_like=apifox_like),
        "diagnostics": new_api_header_diagnostics(token),
    }
    if source:
        entry["source"] = source
    return entry


def raw_request_text(sent_chunks: list[bytes], api_key: str) -> str:
    raw = b"".join(sent_chunks).decode("iso-8859-1", errors="replace")
    header_block = raw.split("\r\n\r\n", 1)[0]
    cleaned_key = str(api_key or "").strip()
    if cleaned_key:
        header_block = header_block.replace(cleaned_key, mask_secret(cleaned_key))
    return header_block


def mask_secret(value: str) -> str:
    text = str(value or "")
    if len(text) <= 8:
        return "****"
    return f"{text[:4]}...{text[-4:]}"


def append_request_debug(entry: dict) -> None:
    DATA_DIR.mkdir(exist_ok=True)
    with REQUEST_DEBUG_LOG.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")


def main() -> None:
    os.chdir(Path(__file__).resolve().parent)
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Codex Quota Glance listening at http://{HOST}:{PORT}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
