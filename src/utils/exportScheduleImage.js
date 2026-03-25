import { toPng } from 'html-to-image';

function sanitizeFilename(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return 'schedule-export';
    return normalized
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
}

function downloadDataUrl(dataUrl, filename) {
    if (typeof document === 'undefined') return;

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
}

async function tryShareImage(dataUrl, filename) {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof File === 'undefined') {
        return false;
    }

    try {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const file = new File([blob], filename, { type: 'image/png' });

        if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
            return false;
        }

        await navigator.share({
            files: [file],
            title: filename,
        });

        return true;
    } catch (error) {
        if (error?.name === 'AbortError') {
            return true;
        }
        return false;
    }
}

function isIosDevice() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const isIos = /iPad|iPhone|iPod/.test(ua)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return isIos;
}

export async function exportScheduleImage({ target, filename }) {
    if (!target) {
        throw new Error('Export target not found.');
    }

    if (typeof document !== 'undefined' && document.fonts?.ready) {
        try {
            await document.fonts.ready;
        } catch {
            // Ignore font readiness failures.
        }
    }

    const width = target.scrollWidth || target.offsetWidth || target.clientWidth;
    const height = target.scrollHeight || target.offsetHeight || target.clientHeight;
    if (!width || !height) {
        throw new Error('Export target has no visible size.');
    }

    const safeFilename = `${sanitizeFilename(filename || 'schedule')}.png`;
    const dataUrl = await toPng(target, {
        width,
        height,
        pixelRatio: 2,
        cacheBust: true,
        style: {
            transform: 'scale(1)',
            transformOrigin: 'top left',
        },
    });

    const shared = isIosDevice() ? await tryShareImage(dataUrl, safeFilename) : false;
    if (!shared) {
        downloadDataUrl(dataUrl, safeFilename);
    }
}
