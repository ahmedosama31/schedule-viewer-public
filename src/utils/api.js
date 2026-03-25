import { trackEvent } from './analytics';
import { API_BASE_URL } from './config';
import { triggerDeploymentRefresh } from './deploymentGuard';

export { API_BASE_URL };

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 120 * 1000; // 120 seconds

// Kept for UI/share/export labeling, not sent to backend.
export const DEFAULT_SEMESTER = 'spring26';

export const SEMESTERS = {
    spring26: { label: 'Spring 26', value: 'spring26' },
};

async function readJsonSafely(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

function maybeRefreshStaleClient(response, payload) {
    if (!response || response.status !== 403 || !payload || typeof payload !== 'object') return;

    const error = (payload.error || '').toString();
    const reason = (payload.reason || '').toString();
    if (error !== 'origin_not_allowed') return;

    if (reason === 'origin_not_allowed' || reason === 'comparer_origin_not_allowed') {
        triggerDeploymentRefresh('origin_policy_stale_client');
    }
}

async function requestJson(path) {
    const response = await fetch(`${API_BASE_URL}${path}`);
    const payload = await readJsonSafely(response);

    if (!response.ok) {
        maybeRefreshStaleClient(response, payload);
        throw new Error(payload?.error || 'Network error');
    }

    return payload;
}

/**
 * Fetch schedule with student metadata.
 * Uses /search-anonymous with numeric student ID lookups.
 */
export async function fetchSchedule(query) {
    if (!query) return [];

    const cacheKey = `schedule:${query}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return cached.data;
    }

    try {
        const startedAt = typeof performance !== 'undefined' && performance.now
            ? performance.now()
            : Date.now();
        const data = await requestJson(`/search-anonymous?query=${encodeURIComponent(query)}`);

        const endedAt = typeof performance !== 'undefined' && performance.now
            ? performance.now()
            : Date.now();
        const clientLatencyMs = endedAt - startedAt;
        const serverLatencyMs = Number.isFinite(data?.meta?.serverLatencyMs)
            ? data.meta.serverLatencyMs
            : undefined;
        const resultCount = Array.isArray(data?.courses) ? data.courses.length : 0;
        const success = typeof data?.meta?.success === 'boolean'
            ? data.meta.success
            : resultCount > 0;

        trackEvent({
            event: 'search_completed',
            client_latency_ms: clientLatencyMs,
            server_latency_ms: serverLatencyMs,
            result_count: resultCount,
            success,
        });

        cache.set(cacheKey, { ts: Date.now(), data });
        return data;
    } catch (err) {
        console.error('Failed to fetch schedule:', err);
        throw err;
    }
}

export async function fetchIndexLastUpdated() {
    try {
        const data = await requestJson('/api/metadata');
        return data.indexed_at ? new Date(data.indexed_at) : null;
    } catch (err) {
        console.error('Failed to fetch index timestamp:', err);
        return null;
    }
}
