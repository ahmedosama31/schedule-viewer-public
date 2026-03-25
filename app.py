"""Flask backend for Schedule Viewer.

Serves exact student-ID schedule lookups from a prebuilt JSON index and stores
viewer/admin activity in append-only JSONL logs.
"""

import json
import math
import os
import re
import time
import uuid
from datetime import datetime, timedelta
from urllib.parse import urlsplit

from flask import Flask, abort, jsonify, request
from flask_cors import CORS

# --- FLASK APP SETUP ---
app = Flask(__name__)
CORS(app, allow_headers=['Content-Type', 'X-Admin-Password'])

# --- CONFIGURATION ---
# Viewer backend is single-semester, single-index by design.
INDEX_FILE = os.environ.get('INDEX_FILE', 'search_index_sp26.json')
SEMESTER_LABEL = os.environ.get('SEMESTER_LABEL', 'spring26')
SEARCH_LOG_FILE = os.environ.get('SEARCH_LOG_FILE', 'search_logs.jsonl')
ANALYTICS_LOG_FILE = os.environ.get('ANALYTICS_LOG_FILE', 'analytics_events.jsonl')
ADMIN_TOKEN = (os.environ.get('ADMIN_TOKEN') or '').strip()

# --- Origin policy ---
DEFAULT_VIEWER_FRONTEND_ORIGIN = 'https://sched-viewer.pages.dev'
DEFAULT_COMPARER_FRONTEND_ORIGIN = 'https://schedule-match.pages.dev'
DEV_FRONTEND_ORIGINS = {
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
}

DEFAULT_ADMIN_LOG_LIMIT = 100000
MAX_ADMIN_LOG_LIMIT = 200000
SESSION_TIMEOUT_SEC = 30 * 60
MAX_ANALYTICS_LATENCY_MS = 10 * 60 * 1000
ALLOWED_ANALYTICS_EVENTS = {'search_completed', 'feature_used'}
FEATURE_EVENT_ORDER = [
    'view_calendar',
    'view_list',
    'timing_toggle',
    'share_click',
    'download_click',
    'export_image',
]
ALLOWED_FEATURE_EVENTS = set(FEATURE_EVENT_ORDER)
FEATURE_ADOPTION_START_LOCAL = datetime(2026, 2, 20, 16, 20)

# --- IN-MEMORY CACHE ---
INDEX_DATA = None


def _env_flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ('1', 'true', 'yes', 'on')


def _normalize_origin(value: str) -> str:
    text = (value or '').strip()
    if not text:
        return ''
    try:
        parsed = urlsplit(text)
    except Exception:
        return ''
    if not parsed.scheme or not parsed.netloc:
        return ''
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"


def _parse_origin_list(raw: str, default_values):
    text = (raw or '').strip()
    if not text:
        return set(default_values)
    parsed = {_normalize_origin(part) for part in text.split(',')}
    parsed = {origin for origin in parsed if origin}
    return parsed or set(default_values)


VIEWER_FRONTEND_ORIGIN = _normalize_origin(
    os.environ.get('VIEWER_FRONTEND_ORIGIN', DEFAULT_VIEWER_FRONTEND_ORIGIN)
) or DEFAULT_VIEWER_FRONTEND_ORIGIN
COMPARER_FRONTEND_ORIGIN = _normalize_origin(
    os.environ.get('COMPARER_FRONTEND_ORIGIN', DEFAULT_COMPARER_FRONTEND_ORIGIN)
) or DEFAULT_COMPARER_FRONTEND_ORIGIN
ENFORCE_ORIGIN_POLICY = _env_flag('ENFORCE_ORIGIN_POLICY', True)
ALLOW_EMPTY_ORIGIN = _env_flag('ALLOW_EMPTY_ORIGIN', False)
VIEWER_ALLOWED_ORIGINS = _parse_origin_list(
    os.environ.get('ALLOWED_FRONTEND_ORIGINS', ''),
    {VIEWER_FRONTEND_ORIGIN, *DEV_FRONTEND_ORIGINS},
)
VIEWER_PREVIEW_HOST_PATTERN = re.compile(r'^(?:[a-z0-9-]+\.)+sched-viewer\.pages\.dev$')


def load_index_if_needed():
    """Load the viewer search index into memory once."""
    global INDEX_DATA

    if INDEX_DATA is None:
        try:
            with open(INDEX_FILE, 'r', encoding='utf-8') as f:
                INDEX_DATA = json.load(f)
            print(f'Loaded viewer index: {INDEX_FILE}')
        except FileNotFoundError:
            print(f'ERROR: index file not found: {INDEX_FILE}')
            return None

    return INDEX_DATA


def _append_jsonl(filepath: str, entry: dict):
    """Append a single JSON line to a log file."""
    try:
        log_dir = os.path.dirname(os.path.abspath(filepath))
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir, exist_ok=True)
        with open(filepath, 'a', encoding='utf-8') as f:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')
    except Exception as e:
        print(f'Failed to write log to {filepath}:', e)


def append_log(entry: dict):
    _append_jsonl(SEARCH_LOG_FILE, entry)


def append_analytics_event(entry: dict):
    _append_jsonl(ANALYTICS_LOG_FILE, entry)


def _parse_log_line(line: str):
    """Parse one JSONL log line into a dict."""
    text = (line or '').strip()
    if not text:
        return None
    try:
        entry = json.loads(text)
    except Exception:
        return None
    return entry if isinstance(entry, dict) else None


def _safe_int(value, default=None):
    try:
        return int(value)
    except Exception:
        return default


def _coerce_int(value):
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except Exception:
        return None


def _coerce_float(value):
    if isinstance(value, bool):
        return None
    try:
        return float(value)
    except Exception:
        return None


def _coerce_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {'true', '1', 'yes'}:
            return True
        if lowered in {'false', '0', 'no'}:
            return False
    return None


def _clamp_int(value: int, minimum: int, maximum: int):
    return max(minimum, min(maximum, value))


def _require_admin():
    """Simple header token auth for admin-only endpoints."""
    if not ADMIN_TOKEN:
        abort(503, description='Admin endpoints are disabled until ADMIN_TOKEN is configured.')
    password = request.headers.get('X-Admin-Password', '')
    if password != ADMIN_TOKEN:
        abort(403)


def _entry_id(line_no: int, entry: dict):
    """Use native id when present; fallback id for legacy lines without id."""
    return entry.get('id') or f'legacy@{line_no}'


def _client_ip():
    xff = request.headers.get('X-Forwarded-For', request.remote_addr)
    return xff.split(',')[0].strip() if xff else (request.remote_addr or '')


def _request_trace() -> dict:
    return {
        'origin': _normalize_origin(request.headers.get('Origin', '')),
        'referer': _normalize_origin(request.headers.get('Referer', '')),
        'host': request.headers.get('Host', '') or '',
        'xf_host': request.headers.get('X-Forwarded-Host', '') or '',
        'xf_proto': request.headers.get('X-Forwarded-Proto', '') or '',
        'path': request.path or '',
        'method': request.method or '',
    }


def _request_origin(trace: dict) -> str:
    return (trace.get('origin') or trace.get('referer') or '').strip()


def _is_allowed_viewer_preview_origin(origin: str) -> bool:
    normalized = _normalize_origin(origin)
    if not normalized:
        return False
    try:
        parsed = urlsplit(normalized)
    except Exception:
        return False
    host = (parsed.netloc or '').lower()
    return bool(VIEWER_PREVIEW_HOST_PATTERN.fullmatch(host))


def _origin_error_response(caller_origin: str, reason: str):
    return jsonify({
        'error': 'origin_not_allowed',
        'origin': caller_origin or '',
        'reason': reason,
        'allowed': sorted(VIEWER_ALLOWED_ORIGINS),
    }), 403


def _base_search_log_entry(
    *,
    source: str,
    query: str,
    student: str,
    trace: dict,
    route_action: str = 'served',
    blocked: bool = False,
    block_reason: str = '',
    redirect_target: str = '',
):
    return {
        'id': uuid.uuid4().hex,
        'ts': int(time.time()),
        'ip': _client_ip(),
        'query': query,
        'student': student,
        'semester': SEMESTER_LABEL,
        'ua': request.headers.get('User-Agent', ''),
        'source': source,
        'origin': trace.get('origin', ''),
        'referer': trace.get('referer', ''),
        'host': trace.get('host', ''),
        'xf_host': trace.get('xf_host', ''),
        'xf_proto': trace.get('xf_proto', ''),
        'path': trace.get('path', ''),
        'method': trace.get('method', ''),
        'route_action': route_action,
        'blocked': bool(blocked),
        'block_reason': block_reason or '',
        'redirect_target': redirect_target or '',
    }


def _log_origin_policy_decision(
    *,
    trace: dict,
    route_action: str,
    blocked: bool,
    block_reason: str = '',
):
    query = (request.args.get('query', '') or '').strip()
    try:
        append_log(_base_search_log_entry(
            source='viewer',
            query=query,
            student=query,
            trace=trace,
            route_action=route_action,
            blocked=blocked,
            block_reason=block_reason,
        ))
    except Exception as e:
        print('Origin policy logging error:', e)


def _enforce_viewer_public_origin() -> dict:
    trace = _request_trace()
    caller_origin = _request_origin(trace)

    if not ENFORCE_ORIGIN_POLICY:
        return {'ok': True, 'trace': trace, 'caller_origin': caller_origin}

    if not caller_origin:
        if ALLOW_EMPTY_ORIGIN:
            return {'ok': True, 'trace': trace, 'caller_origin': caller_origin}
        _log_origin_policy_decision(
            trace=trace,
            route_action='blocked',
            blocked=True,
            block_reason='missing_origin',
        )
        return {'ok': False, 'response': _origin_error_response(caller_origin, 'missing_origin')}

    if caller_origin in VIEWER_ALLOWED_ORIGINS:
        return {'ok': True, 'trace': trace, 'caller_origin': caller_origin}

    if _is_allowed_viewer_preview_origin(caller_origin) and caller_origin != COMPARER_FRONTEND_ORIGIN:
        return {'ok': True, 'trace': trace, 'caller_origin': caller_origin}

    block_reason = 'comparer_origin_not_allowed' if caller_origin == COMPARER_FRONTEND_ORIGIN else 'origin_not_allowed'
    _log_origin_policy_decision(
        trace=trace,
        route_action='blocked',
        blocked=True,
        block_reason=block_reason,
    )
    return {'ok': False, 'response': _origin_error_response(caller_origin, block_reason)}


def _visitor_key(ip: str, ua: str):
    safe_ip = ip or 'unknown'
    safe_ua = ua or '(unknown)'
    return f'{safe_ip}|{safe_ua}'


def _to_local_datetime(ts_sec: int, tz_offset_min: int):
    return datetime.utcfromtimestamp(ts_sec + tz_offset_min * 60)


def _local_datetime_to_ts(local_dt: datetime, tz_offset_min: int):
    epoch_utc = datetime(1970, 1, 1)
    local_epoch_delta_sec = int((local_dt - epoch_utc).total_seconds())
    return local_epoch_delta_sec - (tz_offset_min * 60)


def _format_day_label(dt_obj):
    return f'{dt_obj.month:02d}/{dt_obj.day:02d}'


def _percentile(values, p: float):
    if not values:
        return None

    ordered = sorted(values)
    if len(ordered) == 1:
        return round(ordered[0], 2)

    rank = (len(ordered) - 1) * p
    lower = math.floor(rank)
    upper = math.ceil(rank)
    if lower == upper:
        return round(ordered[lower], 2)

    weight = rank - lower
    return round(ordered[lower] * (1 - weight) + ordered[upper] * weight, 2)


def _is_within_window(ts, start_ts, end_ts):
    if ts > end_ts:
        return False
    if start_ts is not None and ts < start_ts:
        return False
    return True


def _derive_result_and_success(entry: dict, search_index: dict):
    result_count = _coerce_int(entry.get('result_count'))
    success = _coerce_bool(entry.get('success'))

    if result_count is None:
        query = (entry.get('query') or '').strip()
        if is_valid_student_id_query(query):
            hits = search_index.get(query, [])
            result_count = len(hits) if isinstance(hits, list) else 0

    if success is None and result_count is not None:
        success = result_count > 0

    return result_count, success


def _delete_log_by_id(log_id: str) -> int:
    if not os.path.exists(SEARCH_LOG_FILE):
        return 0

    try:
        with open(SEARCH_LOG_FILE, 'r', encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
    except Exception:
        return 0

    deleted = 0
    new_lines = []

    for line_no, line in enumerate(lines):
        entry = _parse_log_line(line)
        if not entry:
            new_lines.append(line)
            continue

        current_id = _entry_id(line_no, entry)
        if current_id == log_id and deleted == 0:
            deleted = 1
            continue

        new_lines.append(line)

    if deleted:
        try:
            with open(SEARCH_LOG_FILE, 'w', encoding='utf-8') as f:
                f.writelines(new_lines)
        except Exception:
            return 0

    return deleted


def _delete_logs_by_ip(ip: str) -> int:
    if not ip or not os.path.exists(SEARCH_LOG_FILE):
        return 0

    try:
        with open(SEARCH_LOG_FILE, 'r', encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
    except Exception:
        return 0

    deleted = 0
    new_lines = []

    for line in lines:
        entry = _parse_log_line(line)
        if not entry:
            new_lines.append(line)
            continue

        if entry.get('ip', '') == ip:
            deleted += 1
            continue

        new_lines.append(line)

    if deleted:
        try:
            with open(SEARCH_LOG_FILE, 'w', encoding='utf-8') as f:
                f.writelines(new_lines)
        except Exception:
            return 0

    return deleted


def _load_search_entries():
    entries = []
    if not os.path.exists(SEARCH_LOG_FILE):
        return entries

    try:
        with open(SEARCH_LOG_FILE, 'r', encoding='utf-8', errors='replace') as f:
            for line_no, line in enumerate(f):
                raw = _parse_log_line(line)
                if not raw:
                    continue

                ts = _coerce_int(raw.get('ts'))
                if ts is None or ts < 0:
                    continue

                entries.append({
                    'id': _entry_id(line_no, raw),
                    'ts': ts,
                    'ip': raw.get('ip', '') or '',
                    'query': raw.get('query', '') or '',
                    'student': raw.get('student', '') or '',
                    'semester': raw.get('semester', SEMESTER_LABEL) or SEMESTER_LABEL,
                    'ua': raw.get('ua', '') or '',
                    'source': raw.get('source', 'viewer') or 'viewer',
                    'result_count': _coerce_int(raw.get('result_count')),
                    'success': _coerce_bool(raw.get('success')),
                    'server_latency_ms': _coerce_float(raw.get('server_latency_ms')),
                    'origin': raw.get('origin', '') or '',
                    'referer': raw.get('referer', '') or '',
                    'host': raw.get('host', '') or '',
                    'xf_host': raw.get('xf_host', '') or '',
                    'xf_proto': raw.get('xf_proto', '') or '',
                    'path': raw.get('path', '') or '',
                    'method': raw.get('method', '') or '',
                    'route_action': raw.get('route_action', '') or '',
                    'blocked': _coerce_bool(raw.get('blocked')),
                    'block_reason': raw.get('block_reason', '') or '',
                    'redirect_target': raw.get('redirect_target', '') or '',
                })
    except Exception as e:
        print('Failed to load search entries:', e)

    return entries


def _load_analytics_entries():
    entries = []
    if not os.path.exists(ANALYTICS_LOG_FILE):
        return entries

    try:
        with open(ANALYTICS_LOG_FILE, 'r', encoding='utf-8', errors='replace') as f:
            for line_no, line in enumerate(f):
                raw = _parse_log_line(line)
                if not raw:
                    continue

                ts = _coerce_int(raw.get('ts'))
                if ts is None or ts < 0:
                    continue

                event_name = (raw.get('event') or '').strip()
                if event_name not in ALLOWED_ANALYTICS_EVENTS:
                    continue

                feature = (raw.get('feature') or '').strip()
                if event_name == 'feature_used' and feature not in ALLOWED_FEATURE_EVENTS:
                    continue

                entries.append({
                    'id': _entry_id(line_no, raw),
                    'ts': ts,
                    'event': event_name,
                    'feature': feature if feature else None,
                    'ip': raw.get('ip', '') or '',
                    'ua': raw.get('ua', '') or '',
                    'source': raw.get('source', 'viewer') or 'viewer',
                    'semester': raw.get('semester', SEMESTER_LABEL) or SEMESTER_LABEL,
                    'client_latency_ms': _coerce_float(raw.get('client_latency_ms')),
                    'server_latency_ms': _coerce_float(raw.get('server_latency_ms')),
                    'result_count': _coerce_int(raw.get('result_count')),
                    'success': _coerce_bool(raw.get('success')),
                })
    except Exception as e:
        print('Failed to load analytics entries:', e)

    return entries


def _build_search_meta(started_at: float, result_count: int, success: bool):
    server_latency_ms = round((time.perf_counter() - started_at) * 1000, 2)
    return {
        'serverLatencyMs': server_latency_ms,
        'resultCount': int(result_count),
        'success': bool(success),
    }


def _compute_admin_analytics(window_mode: str, tz_offset_min: int):
    now_ts = int(time.time())
    start_ts = None
    if window_mode == '30':
        start_ts = now_ts - 30 * 24 * 60 * 60

    search_entries = _load_search_entries()
    analytics_entries = _load_analytics_entries()
    filtered_search = [entry for entry in search_entries if _is_within_window(entry['ts'], start_ts, now_ts)]
    filtered_search = [entry for entry in filtered_search if not entry.get('blocked')]
    filtered_events = [entry for entry in analytics_entries if _is_within_window(entry['ts'], start_ts, now_ts)]
    today_day_key = _to_local_datetime(now_ts, tz_offset_min).date().isoformat()

    index_data = load_index_if_needed() or {}
    search_index = index_data.get('index', {}) if isinstance(index_data, dict) else {}

    total_searches = len(filtered_search)
    unique_visitors = set()
    hourly_counts = [0] * 24
    daily_search_counts = {}
    daily_hourly_counts = {}
    day_unique_ids = {}
    window_unique_ids = set()
    success_count = 0
    no_result_count = 0
    server_latency_samples = []
    server_latency_from_events = []
    client_latency_samples = []
    activity = []

    # Build first-seen lookup from all loaded search logs (not window-filtered)
    # so "new ID" classification remains correct in 30-day mode.
    first_seen_by_id = {}
    for entry in search_entries:
        query = (entry.get('query') or '').strip()
        if not is_valid_student_id_query(query):
            continue

        ts = entry['ts']
        current_first = first_seen_by_id.get(query)
        if current_first is None or ts < current_first:
            first_seen_by_id[query] = ts

    for entry in filtered_search:
        ts = entry['ts']
        local_dt = _to_local_datetime(ts, tz_offset_min)
        day_key = local_dt.date().isoformat()
        visitor = _visitor_key(entry.get('ip', ''), entry.get('ua', ''))
        unique_visitors.add(visitor)

        result_count, success = _derive_result_and_success(entry, search_index)
        if success is not None:
            if success:
                success_count += 1
            else:
                no_result_count += 1

        server_latency_ms = entry.get('server_latency_ms')
        if server_latency_ms is not None and 0 <= server_latency_ms <= MAX_ANALYTICS_LATENCY_MS:
            server_latency_samples.append(server_latency_ms)

        hourly_counts[local_dt.hour] += 1
        daily_search_counts[day_key] = daily_search_counts.get(day_key, 0) + 1
        day_hour_buckets = daily_hourly_counts.setdefault(day_key, [0] * 24)
        day_hour_buckets[local_dt.hour] += 1
        query = (entry.get('query') or '').strip()
        if is_valid_student_id_query(query):
            window_unique_ids.add(query)
            day_unique_ids.setdefault(day_key, set()).add(query)
        activity.append({
            'ts': ts,
            'visitor': visitor,
            'kind': 'search',
            'day_key': day_key,
        })

    for entry in filtered_events:
        ts = entry['ts']
        local_dt = _to_local_datetime(ts, tz_offset_min)
        day_key = local_dt.date().isoformat()
        visitor = _visitor_key(entry.get('ip', ''), entry.get('ua', ''))

        if entry['event'] == 'search_completed':
            client_latency_ms = entry.get('client_latency_ms')
            if client_latency_ms is not None and 0 <= client_latency_ms <= MAX_ANALYTICS_LATENCY_MS:
                client_latency_samples.append(client_latency_ms)

            event_server_latency_ms = entry.get('server_latency_ms')
            if event_server_latency_ms is not None and 0 <= event_server_latency_ms <= MAX_ANALYTICS_LATENCY_MS:
                server_latency_from_events.append(event_server_latency_ms)

        activity.append({
            'ts': ts,
            'visitor': visitor,
            'kind': 'event',
            'event': entry['event'],
            'feature': entry.get('feature'),
            'day_key': day_key,
        })

    if not server_latency_samples and server_latency_from_events:
        server_latency_samples = server_latency_from_events

    adoption_start_ts = _local_datetime_to_ts(FEATURE_ADOPTION_START_LOCAL, tz_offset_min)

    activity.sort(key=lambda item: item['ts'])
    visitor_state = {}
    next_session_id = 1
    all_search_sessions = set()
    adoption_search_sessions = set()
    session_features = {}
    day_search_sessions = {}
    day_feature_sessions = {}
    for event in activity:
        visitor = event['visitor']
        ts = event['ts']
        state = visitor_state.get(visitor)

        if not state or (ts - state['last_ts']) > SESSION_TIMEOUT_SEC:
            session_id = next_session_id
            next_session_id += 1
        else:
            session_id = state['session_id']

        visitor_state[visitor] = {'session_id': session_id, 'last_ts': ts}
        if event['kind'] == 'search':
            all_search_sessions.add(session_id)
            if ts < adoption_start_ts:
                continue

            day_key = event['day_key']
            adoption_search_sessions.add(session_id)
            day_search_sessions.setdefault(day_key, set()).add(session_id)
            continue

        if ts < adoption_start_ts:
            continue

        if event.get('event') != 'feature_used':
            continue

        feature = event.get('feature')
        if feature not in ALLOWED_FEATURE_EVENTS:
            continue

        day_key = event['day_key']
        session_features.setdefault(session_id, set()).add(feature)
        day_feature_sessions.setdefault(day_key, {}).setdefault(feature, set()).add(session_id)

    search_session_count = len(all_search_sessions)
    adoption_search_session_count = len(adoption_search_sessions)
    adoption = {}
    for feature in FEATURE_EVENT_ORDER:
        adopted_session_count = 0
        for session_id in adoption_search_sessions:
            if feature in session_features.get(session_id, set()):
                adopted_session_count += 1

        adoption[feature] = {
            'sessions': adopted_session_count,
            'rate': round((adopted_session_count / adoption_search_session_count) * 100, 2)
            if adoption_search_session_count
            else None,
        }

    # Today-centric adoption snapshot (local to admin timezone).
    today_day_session_set = day_search_sessions.get(today_day_key, set())
    today_denominator_sessions = len(today_day_session_set)
    today_feature_map = day_feature_sessions.get(today_day_key, {})
    adoption_today_features = {}
    for feature in FEATURE_EVENT_ORDER:
        today_feature_sessions = today_feature_map.get(feature, set())
        adopted_count = len(today_feature_sessions & today_day_session_set) if today_denominator_sessions else 0
        adoption_today_features[feature] = {
            'sessions': adopted_count,
            'rate': round((adopted_count / today_denominator_sessions) * 100, 2)
            if today_denominator_sessions
            else None,
        }

    if window_mode == '30':
        end_date = _to_local_datetime(now_ts, tz_offset_min).date()
        start_date = end_date - timedelta(days=29)
    else:
        timestamps = [entry['ts'] for entry in filtered_search] + [entry['ts'] for entry in filtered_events]
        if timestamps:
            start_date = _to_local_datetime(min(timestamps), tz_offset_min).date()
            end_date = _to_local_datetime(max(timestamps), tz_offset_min).date()
        else:
            end_date = _to_local_datetime(now_ts, tz_offset_min).date()
            start_date = end_date

    searches_by_day = []
    searches_by_hour_by_day = []
    feature_rates_by_day = []
    id_stats_by_day = []
    current_date = start_date
    while current_date <= end_date:
        day_key = current_date.isoformat()
        label = _format_day_label(current_date)
        day_session_set = day_search_sessions.get(day_key, set())
        day_session_count = len(day_session_set)

        searches_by_day.append({
            'key': day_key,
            'label': label,
            'count': daily_search_counts.get(day_key, 0),
        })

        day_hour_buckets = daily_hourly_counts.get(day_key, [0] * 24)
        searches_by_hour_by_day.append({
            'key': day_key,
            'label': label,
            'total': daily_search_counts.get(day_key, 0),
            'hours': [
                {'hour': hour, 'count': day_hour_buckets[hour]}
                for hour in range(24)
            ],
        })

        day_feature_counts = {}
        day_feature_rates = {}
        feature_map = day_feature_sessions.get(day_key, {})
        for feature in FEATURE_EVENT_ORDER:
            session_set = feature_map.get(feature, set())
            adopted_count = len(session_set & day_session_set) if day_session_count else 0
            day_feature_counts[feature] = adopted_count
            day_feature_rates[feature] = round((adopted_count / day_session_count) * 100, 2) if day_session_count else None

        feature_rates_by_day.append({
            'key': day_key,
            'label': label,
            'sessions': day_session_count,
            'counts': day_feature_counts,
            'rates': day_feature_rates,
        })

        unique_ids_for_day = day_unique_ids.get(day_key, set())
        new_unique_ids_count = 0
        returning_unique_ids_count = 0
        for student_id in unique_ids_for_day:
            first_seen_ts = first_seen_by_id.get(student_id)
            if first_seen_ts is None:
                continue
            first_seen_day_key = _to_local_datetime(first_seen_ts, tz_offset_min).date().isoformat()
            if first_seen_day_key == day_key:
                new_unique_ids_count += 1
            elif first_seen_day_key < day_key:
                returning_unique_ids_count += 1

        id_stats_by_day.append({
            'key': day_key,
            'label': label,
            'uniqueIds': len(unique_ids_for_day),
            'newUniqueIds': new_unique_ids_count,
            'returningUniqueIds': returning_unique_ids_count,
        })
        current_date += timedelta(days=1)

    today_id_stats = next((item for item in id_stats_by_day if item.get('key') == today_day_key), None)
    if not today_id_stats:
        today_label = _format_day_label(_to_local_datetime(now_ts, tz_offset_min))
        today_id_stats = {
            'key': today_day_key,
            'label': today_label,
            'uniqueIds': 0,
            'newUniqueIds': 0,
            'returningUniqueIds': 0,
        }

    eligible_searches = success_count + no_result_count
    latency_client = {
        'p50': _percentile(client_latency_samples, 0.50),
        'p95': _percentile(client_latency_samples, 0.95),
        'samples': len(client_latency_samples),
    }
    latency_server = {
        'p50': _percentile(server_latency_samples, 0.50),
        'p95': _percentile(server_latency_samples, 0.95),
        'samples': len(server_latency_samples),
    }

    return {
        'generatedAt': now_ts * 1000,
        'window': {
            'mode': window_mode,
            'startTs': start_ts * 1000 if start_ts is not None else None,
            'endTs': now_ts * 1000,
        },
        'kpis': {
            'totalSearches': total_searches,
            'successCount': success_count,
            'noResultCount': no_result_count,
            'successRate': round((success_count / eligible_searches) * 100, 2) if eligible_searches else None,
            'noResultRate': round((no_result_count / eligible_searches) * 100, 2) if eligible_searches else None,
            'uniqueVisitors': len(unique_visitors),
            'uniqueSessions': search_session_count,
            'latency': {
                'client': latency_client,
                'server': latency_server,
            },
            'adoptionRates': {
                'denominatorSessions': adoption_search_session_count,
                'features': adoption,
            },
            'adoptionRatesToday': {
                'dayKey': today_day_key,
                'label': today_id_stats.get('label'),
                'denominatorSessions': today_denominator_sessions,
                'features': adoption_today_features,
            },
            'idStats': {
                'uniqueIdsWindow': len(window_unique_ids),
                'today': {
                    'dayKey': today_day_key,
                    'uniqueIds': today_id_stats.get('uniqueIds', 0),
                    'newUniqueIds': today_id_stats.get('newUniqueIds', 0),
                    'returningUniqueIds': today_id_stats.get('returningUniqueIds', 0),
                },
            },
        },
        'trends': {
            'features': FEATURE_EVENT_ORDER,
            'searchesByDay': searches_by_day,
            'searchesByHour': [
                {'hour': hour, 'count': hourly_counts[hour]}
                for hour in range(24)
            ],
            'searchesByHourByDay': searches_by_hour_by_day,
            'featureRatesByDay': feature_rates_by_day,
            'idStatsByDay': id_stats_by_day,
        },
    }


def is_valid_student_id_query(query: str) -> bool:
    """Schedule Viewer only accepts numeric student IDs."""
    return query.isdigit() and 5 <= len(query) <= 20


# --- API ENDPOINTS ---


@app.route('/api/metadata')
def get_metadata():
    policy = _enforce_viewer_public_origin()
    if not policy['ok']:
        return policy['response']
    data = load_index_if_needed()
    if not data:
        return jsonify({'error': 'Index not loaded'}), 500
    return jsonify(data.get('metadata', {}))


@app.route('/search-anonymous', methods=['GET'])
def search_anonymous():
    """
    Anonymous schedule search used by Schedule Viewer.
    - Exact lookup only
    - Numeric student ID only
    - Returns student metadata when found
    """
    policy = _enforce_viewer_public_origin()
    if not policy['ok']:
        return policy['response']
    trace = policy['trace']

    request_started = time.perf_counter()
    index_data = load_index_if_needed()

    if not index_data:
        return jsonify({'error': f'Search index not found: {INDEX_FILE}'}), 500

    exact_query = request.args.get('query', '').strip()
    if not exact_query:
        meta = _build_search_meta(request_started, 0, False)
        return jsonify({'courses': [], 'student': None, 'meta': meta})

    if not is_valid_student_id_query(exact_query):
        meta = _build_search_meta(request_started, 0, False)
        return jsonify({'courses': [], 'student': None, 'meta': meta})

    courses_map = index_data.get('courses', {})
    search_index = index_data.get('index', {})
    students_map = index_data.get('students', {})
    student_index = index_data.get('student_index', {})

    found_course_ids = search_index.get(exact_query, [])
    results = [courses_map[course_id] for course_id in found_course_ids if course_id in courses_map]

    matched_student = None
    student_codes = student_index.get(exact_query, [])
    if student_codes:
        first_code = student_codes[0]
        raw_student = students_map.get(first_code)
        if raw_student:
            matched_student = {
                'Code': raw_student.get('Code', exact_query),
                'NameEn': raw_student.get('NameEn', '') or '',
                'NameAr': raw_student.get('NameAr', '') or '',
            }

    result_count = len(results)
    success = result_count > 0
    meta = _build_search_meta(request_started, result_count, success)

    try:
        entry = _base_search_log_entry(
            source='viewer',
            query=exact_query,
            student=exact_query,
            trace=trace,
            route_action='served',
            blocked=False,
        )
        entry['result_count'] = result_count
        entry['success'] = success
        entry['server_latency_ms'] = meta['serverLatencyMs']
        append_log(entry)
    except Exception as e:
        print('Logging error:', e)

    return jsonify({'courses': results, 'student': matched_student, 'meta': meta})


@app.route('/analytics/event', methods=['POST'])
def analytics_event():
    policy = _enforce_viewer_public_origin()
    if not policy['ok']:
        return policy['response']
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raw_body = request.get_data(cache=False, as_text=True)
        if raw_body:
            try:
                parsed = json.loads(raw_body)
                if isinstance(parsed, dict):
                    payload = parsed
            except Exception:
                payload = None

    if not isinstance(payload, dict):
        return jsonify({'error': 'Invalid JSON payload'}), 400

    event_name = (payload.get('event') or '').strip()
    if event_name not in ALLOWED_ANALYTICS_EVENTS:
        return jsonify({'error': 'Invalid event'}), 400

    event = {
        'id': uuid.uuid4().hex,
        'ts': int(time.time()),
        'event': event_name,
        'ip': _client_ip(),
        'ua': request.headers.get('User-Agent', ''),
        'semester': SEMESTER_LABEL,
        'source': 'viewer',
    }

    if event_name == 'feature_used':
        feature = (payload.get('feature') or '').strip()
        if feature not in ALLOWED_FEATURE_EVENTS:
            return jsonify({'error': 'Invalid feature'}), 400
        event['feature'] = feature
    else:
        client_latency_ms = _coerce_float(payload.get('client_latency_ms'))
        if client_latency_ms is not None and 0 <= client_latency_ms <= MAX_ANALYTICS_LATENCY_MS:
            event['client_latency_ms'] = round(client_latency_ms, 2)

        server_latency_ms = _coerce_float(payload.get('server_latency_ms'))
        if server_latency_ms is not None and 0 <= server_latency_ms <= MAX_ANALYTICS_LATENCY_MS:
            event['server_latency_ms'] = round(server_latency_ms, 2)

        result_count = _coerce_int(payload.get('result_count'))
        if result_count is not None and result_count >= 0:
            event['result_count'] = result_count

        success = _coerce_bool(payload.get('success'))
        if success is not None:
            event['success'] = success

    append_analytics_event(event)
    return jsonify({'ok': True})


@app.route('/admin/logs', methods=['GET', 'DELETE'])
def admin_logs():
    _require_admin()

    if request.method == 'DELETE':
        log_id = request.args.get('id', '').strip()
        ip = request.args.get('ip', '').strip()

        if log_id:
            deleted = _delete_log_by_id(log_id)
            return jsonify({'deleted': deleted})

        if ip:
            deleted = _delete_logs_by_ip(ip)
            return jsonify({'deleted': deleted})

        return jsonify({'error': 'Provide id or ip'}), 400

    limit_raw = request.args.get('limit', str(DEFAULT_ADMIN_LOG_LIMIT))
    limit = _safe_int(limit_raw, DEFAULT_ADMIN_LOG_LIMIT)
    limit = _clamp_int(limit, 1, MAX_ADMIN_LOG_LIMIT)
    entries = []

    try:
        if os.path.exists(SEARCH_LOG_FILE):
            with open(SEARCH_LOG_FILE, 'r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()

            for line_no in range(len(lines) - 1, -1, -1):
                entry = _parse_log_line(lines[line_no])
                if not entry:
                    continue

                ts = _coerce_int(entry.get('ts'))
                timestamp_ms = ts * 1000 if ts is not None else 0
                entries.append({
                    'id': _entry_id(line_no, entry),
                    'timestamp': timestamp_ms,
                    'ip': entry.get('ip', ''),
                    'query': entry.get('query', ''),
                    'student': entry.get('student', ''),
                    'semester': entry.get('semester', SEMESTER_LABEL),
                    'ua': entry.get('ua', ''),
                    'source': entry.get('source', 'viewer') or 'viewer',
                    'result_count': _coerce_int(entry.get('result_count')),
                    'success': _coerce_bool(entry.get('success')),
                    'server_latency_ms': _coerce_float(entry.get('server_latency_ms')),
                    'origin': entry.get('origin', ''),
                    'referer': entry.get('referer', ''),
                    'host': entry.get('host', ''),
                    'xfHost': entry.get('xf_host', ''),
                    'xfProto': entry.get('xf_proto', ''),
                    'path': entry.get('path', ''),
                    'method': entry.get('method', ''),
                    'routeAction': entry.get('route_action', ''),
                    'blocked': _coerce_bool(entry.get('blocked')),
                    'blockReason': entry.get('block_reason', ''),
                    'redirectTarget': entry.get('redirect_target', ''),
                })

                if len(entries) >= limit:
                    break
    except Exception as e:
        print('Failed to read logs:', e)

    query_counts = {}
    ip_counts = {}
    for entry in entries:
        query = entry['query']
        ip = entry['ip']
        query_counts[query] = query_counts.get(query, 0) + 1
        ip_counts[ip] = ip_counts.get(ip, 0) + 1

    top_queries = [
        {'query': q, 'count': c}
        for q, c in sorted(query_counts.items(), key=lambda x: x[1], reverse=True)
    ]
    top_ips = [
        {'ip': ip, 'count': c}
        for ip, c in sorted(ip_counts.items(), key=lambda x: x[1], reverse=True)
    ]

    return jsonify({
        'logs': entries,
        'stats': {
            'topQueries': top_queries,
            'topIPs': top_ips,
        },
    })


@app.route('/admin/analytics', methods=['GET'])
def admin_analytics():
    _require_admin()

    window = (request.args.get('window', '30') or '').strip().lower()
    if window not in {'30', 'all'}:
        return jsonify({'error': 'window must be 30 or all'}), 400

    tz_offset_min = _safe_int(request.args.get('tz_offset_min', '0'), 0)
    tz_offset_min = _clamp_int(tz_offset_min, -14 * 60, 14 * 60)
    return jsonify(_compute_admin_analytics(window, tz_offset_min))


@app.route('/admin/resolve-id', methods=['GET'])
def admin_resolve_id():
    """Resolve a student ID to names. Admin-only."""
    _require_admin()

    student_id = request.args.get('id', '').strip()
    if not student_id:
        return jsonify({'error': 'Missing id'}), 400

    index_data = load_index_if_needed()
    if not index_data:
        return jsonify({'error': 'Index not available'}), 500

    students_map = index_data.get('students', {})
    student_index = index_data.get('student_index', {})

    student_codes = student_index.get(student_id, [])
    if not student_codes:
        return jsonify({'id': student_id, 'nameEn': None, 'nameAr': None, 'found': False})

    raw = students_map.get(student_codes[0])
    if not raw:
        return jsonify({'id': student_id, 'nameEn': None, 'nameAr': None, 'found': False})

    return jsonify({
        'id': student_id,
        'nameEn': raw.get('NameEn', ''),
        'nameAr': raw.get('NameAr', ''),
        'found': True,
    })


if __name__ == '__main__':
    app.run(debug=True, port=5001)
