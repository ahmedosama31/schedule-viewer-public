import { API_BASE_URL } from './config';

const ANALYTICS_ENDPOINT = `${API_BASE_URL}/analytics/event`;

export const FEATURE_EVENTS = Object.freeze([
    'view_calendar',
    'view_list',
    'timing_toggle',
    'share_click',
    'download_click',
    'export_image',
]);

function roundNumber(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return Math.round(value * 100) / 100;
}

export function trackEvent(payload) {
    if (!payload || typeof payload !== 'object') return;

    const sanitized = {
        event: typeof payload.event === 'string' ? payload.event : '',
    };

    if (typeof payload.feature === 'string') sanitized.feature = payload.feature;

    const clientLatency = roundNumber(payload.client_latency_ms);
    if (typeof clientLatency === 'number') sanitized.client_latency_ms = clientLatency;

    const serverLatency = roundNumber(payload.server_latency_ms);
    if (typeof serverLatency === 'number') sanitized.server_latency_ms = serverLatency;

    if (typeof payload.result_count === 'number' && Number.isFinite(payload.result_count)) {
        sanitized.result_count = Math.max(0, Math.round(payload.result_count));
    }

    if (typeof payload.success === 'boolean') sanitized.success = payload.success;

    if (!sanitized.event) return;

    const body = JSON.stringify(sanitized);

    const sendBeaconFallback = () => {
        if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return;
        try {
            // Send plain text JSON for better cross-browser beacon compatibility.
            navigator.sendBeacon(ANALYTICS_ENDPOINT, body);
        } catch {
            // Best-effort telemetry only.
        }
    };

    if (typeof fetch === 'function') {
        void fetch(ANALYTICS_ENDPOINT, {
            method: 'POST',
            // Intentionally omit Content-Type so browser uses text/plain
            // and avoids CORS preflight in development.
            body,
            keepalive: true,
        }).catch(() => {
            sendBeaconFallback();
        });
        return;
    }

    sendBeaconFallback();
}
