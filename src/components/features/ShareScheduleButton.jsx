import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Share2 } from 'lucide-react';
import clsx from 'clsx';
import { trackEvent } from '../../utils/analytics';

const FEEDBACK_RESET_MS = 2200;

function copyWithFallback(text) {
    if (typeof document === 'undefined') return false;

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'absolute';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();

    let copied = false;
    try {
        copied = document.execCommand('copy');
    } catch {
        copied = false;
    } finally {
        document.body.removeChild(textArea);
    }

    return copied;
}

async function copyToClipboard(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            return copyWithFallback(text);
        }
    }

    return copyWithFallback(text);
}

function buildShareUrl(studentCode, semester) {
    const url = new URL(window.location.href);
    url.pathname = '/';
    url.hash = '';
    url.searchParams.set('s', studentCode);
    url.searchParams.set('sem', semester);
    return url.toString();
}

function getLabel(status) {
    if (status === 'sharing') return 'Sharing...';
    if (status === 'copied') return 'Link copied';
    if (status === 'shared') return 'Shared';
    if (status === 'failed') return 'Share failed';
    return 'Share';
}

export function ShareScheduleButton({ student, semester, hasSchedule }) {
    const [status, setStatus] = useState('idle');
    const feedbackTimeoutRef = useRef(null);
    const studentCode = (student?.Code || '').trim();
    const canShare = Boolean(hasSchedule && studentCode);
    const isSharing = status === 'sharing';

    useEffect(() => {
        if (!['copied', 'shared', 'failed'].includes(status)) return undefined;
        feedbackTimeoutRef.current = setTimeout(() => setStatus('idle'), FEEDBACK_RESET_MS);
        return () => feedbackTimeoutRef.current && clearTimeout(feedbackTimeoutRef.current);
    }, [status]);

    useEffect(() => () => feedbackTimeoutRef.current && clearTimeout(feedbackTimeoutRef.current), []);

    const handleShareClick = async () => {
        if (!canShare || isSharing) return;
        trackEvent({ event: 'feature_used', feature: 'share_click' });
        setStatus('sharing');
        const shareUrl = buildShareUrl(studentCode, semester);

        const tryClipboardShare = async () => {
            const copied = await copyToClipboard(shareUrl);
            setStatus(copied ? 'copied' : 'failed');
        };

        if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
            try {
                await navigator.share({ title: 'Schedule Viewer', text: `Schedule for student ${studentCode}`, url: shareUrl });
                setStatus('shared');
                return;
            } catch (error) {
                if (error?.name === 'AbortError') {
                    setStatus('idle');
                    return;
                }
                await tryClipboardShare();
                return;
            }
        }

        await tryClipboardShare();
    };

    return (
        <button
            type="button"
            onClick={handleShareClick}
            disabled={!canShare || isSharing}
            className={clsx(
                'inline-flex min-h-10 items-center gap-2 rounded-2xl border px-3.5 py-2 text-sm font-semibold transition-all shadow-sm',
                canShare && !isSharing
                    ? 'border-white/70 bg-white/80 text-zinc-800 backdrop-blur hover:bg-white dark:border-zinc-700 dark:bg-zinc-950/70 dark:text-zinc-100 dark:hover:bg-zinc-900'
                    : 'cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500'
            )}
            title="Share schedule link"
        >
            {isSharing ? <LoaderCircle size={15} className="animate-spin" /> : <Share2 size={15} />}
            {getLabel(status)}
        </button>
    );
}
