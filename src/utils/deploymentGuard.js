const DEPLOY_REFRESH_KEY = 'sched_viewer_deploy_refresh_target';
const ENTRY_SCRIPT_REGEX = /<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["'][^>]*>/gi;

function normalizePath(raw) {
    if (!raw) return '';
    try {
        const url = new URL(raw, window.location.origin);
        return url.pathname;
    } catch {
        return '';
    }
}

function getCurrentEntryPath() {
    const script = document.querySelector('script[type="module"][src*="/assets/"]');
    if (!script) return '';
    return normalizePath(script.getAttribute('src') || script.src || '');
}

function extractEntryPathFromHtml(html) {
    if (!html) return '';
    ENTRY_SCRIPT_REGEX.lastIndex = 0;
    let match;
    while ((match = ENTRY_SCRIPT_REGEX.exec(html)) !== null) {
        const candidate = normalizePath(match[1]);
        if (candidate.includes('/assets/') && candidate.endsWith('.js')) {
            return candidate;
        }
    }
    return '';
}

export function triggerDeploymentRefresh(reason = 'deploy_update', token = '') {
    const target = `${String(reason || 'deploy_update')}::${String(token || '')}`;
    try {
        const previous = sessionStorage.getItem(DEPLOY_REFRESH_KEY) || '';
        if (previous === target) return;
        sessionStorage.setItem(DEPLOY_REFRESH_KEY, target);
    } catch {
        // Ignore storage errors and continue.
    }

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('__updated', String(Date.now()));
    window.location.replace(nextUrl.toString());
}

export function startDeploymentGuard({ intervalMs = 90_000 } = {}) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return () => { };
    if (import.meta.env.DEV) return () => { };

    let disposed = false;
    let inFlight = false;

    const checkForUpdate = async () => {
        if (disposed || inFlight) return;
        const currentEntry = getCurrentEntryPath();
        if (!currentEntry) return;

        inFlight = true;
        try {
            const response = await fetch(`/?__deploy_check=${Date.now()}`, {
                cache: 'no-store',
                credentials: 'same-origin',
            });
            if (!response.ok) return;
            const html = await response.text();
            const latestEntry = extractEntryPathFromHtml(html);
            if (!latestEntry || latestEntry === currentEntry) return;
            triggerDeploymentRefresh('new_frontend_build', latestEntry);
        } catch {
            // Best-effort check; ignore transient failures.
        } finally {
            inFlight = false;
        }
    };

    const timerId = window.setInterval(checkForUpdate, Math.max(30_000, intervalMs));
    const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            checkForUpdate();
        }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    checkForUpdate();

    return () => {
        disposed = true;
        window.clearInterval(timerId);
        document.removeEventListener('visibilitychange', onVisibilityChange);
    };
}
