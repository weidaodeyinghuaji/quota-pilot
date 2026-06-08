from __future__ import annotations

import argparse
import importlib.util
import os
import time
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOCAL_SERVER_PATH = ROOT / "local-server.py"
DEFAULT_START = 1780243200  # 2026-06-01 00:00:00 +08:00


def load_local_server():
    spec = importlib.util.spec_from_file_location("local_server", LOCAL_SERVER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {LOCAL_SERVER_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def plan_child_windows(
    start: int,
    end: int,
    *,
    fetched: int,
    page_size: int,
    min_window_seconds: int = 60,
) -> list[tuple[int, int]]:
    if fetched < page_size or end <= start or end - start <= min_window_seconds:
        return []
    windows: list[tuple[int, int]] = []
    cursor = start
    while cursor < end:
        next_end = min(end, cursor + min_window_seconds)
        windows.append((cursor, next_end))
        cursor = next_end
    return windows


def iter_windows(start: int, end: int, window_seconds: int):
    cursor = start
    while cursor < end:
        next_end = min(end, cursor + window_seconds)
        yield cursor, next_end
        cursor = next_end


def parse_timestamp(value: str | None, fallback: int) -> int:
    if not value:
        return fallback
    text = value.strip()
    if text.lower() == "now":
        return int(time.time())
    if text.isdigit():
        return int(text)
    return int(datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp())


def format_ts(value: int) -> str:
    return datetime.fromtimestamp(value).strftime("%Y-%m-%d %H:%M:%S")


def fetch_window(local_server, args, start: int, end: int):
    page = 1
    fetched = 0
    inserted_rows = []
    while page <= args.max_pages:
        data = local_server.fetch_self_log_page(
            base_url=args.base_url,
            access_token=args.access_token,
            api_user=args.api_user,
            page=page,
            page_size=args.page_size,
            token_name=args.token_name,
            start_timestamp=start,
            end_timestamp=end,
        )
        items = local_server.normalize_log_items(data)
        if not items:
            break
        fetched += len(items)
        inserted_rows.extend(local_server.insert_logs(items))
        if len(items) < args.page_size:
            break
        page += 1
    return {"fetched": fetched, "inserted_rows": inserted_rows, "pages": page}


def sync_window(local_server, args, start: int, end: int):
    if args.dry_run:
        print(f"[dry-run] {format_ts(start)} -> {format_ts(end)}")
        return {"fetched": 0, "inserted": 0, "windows": 1, "capped": False}

    result = fetch_window(local_server, args, start, end)
    inserted = len(result["inserted_rows"])
    print(
        f"[window] {format_ts(start)} -> {format_ts(end)} "
        f"fetched={result['fetched']} inserted={inserted} pages={result['pages']}"
    )
    children = plan_child_windows(
        start,
        end,
        fetched=result["fetched"],
        page_size=args.split_threshold,
        min_window_seconds=args.min_window_seconds,
    )
    if not children:
        capped = result["fetched"] >= args.split_threshold and end - start <= args.min_window_seconds
        if result["fetched"] >= args.split_threshold and end - start <= args.min_window_seconds:
            print(
                f"[warn] {format_ts(start)} -> {format_ts(end)} still reached "
                f"{args.split_threshold} logs; this minute may be capped by the platform"
            )
        if args.sleep_seconds > 0:
            time.sleep(args.sleep_seconds)
        return {"fetched": result["fetched"], "inserted": inserted, "windows": 1, "capped": capped}

    print(f"[split] {format_ts(start)} -> {format_ts(end)} into {len(children)} windows")
    total = {"fetched": 0, "inserted": 0, "windows": 0, "capped": False}
    for child_start, child_end in children:
        child = sync_window(local_server, args, child_start, child_end)
        total["fetched"] += child["fetched"]
        total["inserted"] += child["inserted"]
        total["windows"] += child["windows"]
        total["capped"] = total["capped"] or bool(child.get("capped"))
    return total


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Initialize New API logs into SQLite with adaptive windows.")
    parser.add_argument("--base-url", default=os.environ.get("NEWAPI_BASE_URL", "https://www.cctq.ai"))
    parser.add_argument("--access-token", default=os.environ.get("NEWAPI_ACCESS_TOKEN", ""))
    parser.add_argument("--api-user", default=os.environ.get("NEWAPI_USER", ""))
    parser.add_argument("--token-name", default=os.environ.get("NEWAPI_TOKEN_NAME", ""))
    parser.add_argument("--start", default=os.environ.get("NEWAPI_LOG_START", str(DEFAULT_START)))
    parser.add_argument("--end", default=os.environ.get("NEWAPI_LOG_END", "now"))
    parser.add_argument("--page-size", type=int, default=100)
    parser.add_argument("--max-pages", type=int, default=10)
    parser.add_argument("--split-threshold", type=int, default=1000)
    parser.add_argument("--window-seconds", type=int, default=3600)
    parser.add_argument("--min-window-seconds", type=int, default=60)
    parser.add_argument("--sleep-seconds", type=float, default=0.25)
    parser.add_argument("--dry-run", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    args.base_url = str(args.base_url).rstrip("/")
    args.start = parse_timestamp(str(args.start), DEFAULT_START)
    args.end = parse_timestamp(str(args.end), int(time.time()))

    if not args.dry_run and (not args.base_url or not args.access_token or not args.api_user):
        raise SystemExit("--base-url, --access-token and --api-user are required")
    if args.end <= args.start:
        raise SystemExit("--end must be after --start")

    local_server = load_local_server()
    local_server.init_db()
    total = {"fetched": 0, "inserted": 0, "windows": 0, "capped": False}
    try:
        for start, end in iter_windows(args.start, args.end, args.window_seconds):
            result = sync_window(local_server, args, start, end)
            total["fetched"] += result["fetched"]
            total["inserted"] += result["inserted"]
            total["windows"] += result["windows"]
            total["capped"] = total["capped"] or bool(result.get("capped"))
    except local_server.RateLimitedError as exc:
        retry = f" retry_after={exc.retry_after}" if exc.retry_after else ""
        print(f"[rate-limited] stopped{retry}")
        return 2

    if not args.dry_run:
        sync_key = local_server.make_sync_key(args.base_url, args.api_user, args.access_token)
        newest = local_server.get_global_latest_created_at()
        local_server.save_sync_state(sync_key, args.base_url, args.api_user, args.access_token, newest)
        if total["capped"]:
            warning = "some log windows reached the platform cap; logs may be truncated"
            print(f"[warn] {warning}; backfill was not marked complete")
            if hasattr(local_server, "mark_backfill_incomplete"):
                local_server.mark_backfill_incomplete(sync_key, warning)
        else:
            local_server.mark_backfill_complete(sync_key)
        summary = local_server.get_log_summary()
        print(f"[done] windows={total['windows']} fetched={total['fetched']} inserted={total['inserted']}")
        print(f"[summary] all_used={summary['all']['usedAmount']:.6f} today_used={summary['today']['usedAmount']:.6f}")
    else:
        print(f"[done] dry-run windows={total['windows']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
