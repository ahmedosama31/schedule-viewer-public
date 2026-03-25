import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileDown, Image as ImageIcon, LoaderCircle } from 'lucide-react';
import clsx from 'clsx';
import { exportSchedulePdf } from '../../utils/exportSchedulePdf';
import { exportScheduleImage } from '../../utils/exportScheduleImage';
import { trackEvent } from '../../utils/analytics';

function sanitizeFilenamePart(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return 'unknown';
    return normalized
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
}

function buildExportFilename({ student, semester }) {
    const studentId = student?.Code || 'unknown';
    return ['schedule', sanitizeFilenamePart(studentId), sanitizeFilenamePart(semester || 'semester'), 'original'].join('-');
}

export function ExportMenu({ schedule, student, semester, imageTargetRef }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [isExportingImage, setIsExportingImage] = useState(false);
    const wrapperRef = useRef(null);
    const hasSchedule = Array.isArray(schedule) && schedule.length > 0;
    const isBusy = isExportingPdf || isExportingImage;

    useEffect(() => {
        if (!isOpen) return undefined;

        const handleClickOutside = (event) => {
            if (!wrapperRef.current) return;
            if (!wrapperRef.current.contains(event.target)) setIsOpen(false);
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setIsOpen(false);
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    const handleToggle = () => {
        if (!hasSchedule || isBusy) return;
        setIsOpen(prev => !prev);
    };

    const handlePdfExport = async () => {
        if (!hasSchedule || isBusy) return;
        trackEvent({ event: 'feature_used', feature: 'download_click' });
        setIsOpen(false);
        setIsExportingPdf(true);
        try {
            await exportSchedulePdf({ schedule, student, semester });
        } catch (error) {
            console.error('Failed to export schedule as PDF:', error);
            window.alert('Unable to export PDF right now. Please try again.');
        } finally {
            setIsExportingPdf(false);
        }
    };

    const handleImageExport = async () => {
        if (!hasSchedule || isBusy) return;
        trackEvent({ event: 'feature_used', feature: 'export_image' });
        setIsOpen(false);
        setIsExportingImage(true);
        try {
            const target = imageTargetRef?.current;
            if (!target) throw new Error('Image export target not found.');
            const filename = buildExportFilename({ student, semester });
            await exportScheduleImage({ target, filename });
        } catch (error) {
            console.error('Failed to export schedule as image:', error);
            window.alert('Unable to export image right now. Please try again.');
        } finally {
            setIsExportingImage(false);
        }
    };

    return (
        <div className={clsx('relative', isOpen ? 'z-[90]' : 'z-30')} ref={wrapperRef}>
            <button
                type="button"
                onClick={handleToggle}
                disabled={!hasSchedule || isBusy}
                className={clsx(
                    'inline-flex min-h-10 items-center gap-2 rounded-2xl border px-3.5 py-2 text-sm font-semibold transition-all shadow-sm',
                    hasSchedule && !isBusy
                        ? 'border-white/70 bg-white/80 text-zinc-800 backdrop-blur hover:bg-white dark:border-zinc-700 dark:bg-zinc-950/70 dark:text-zinc-100 dark:hover:bg-zinc-900'
                        : 'cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500'
                )}
                title="Export schedule"
                aria-haspopup="menu"
                aria-expanded={isOpen}
            >
                {isBusy ? <LoaderCircle size={15} className="animate-spin" /> : <FileDown size={15} />}
                Download
                <ChevronDown size={14} className={clsx('transition-transform', isOpen && 'rotate-180')} />
            </button>

            {isOpen && (
                <div role="menu" className="absolute right-0 z-[100] mt-2 w-52 rounded-2xl border border-zinc-200 bg-white/95 p-1.5 text-sm shadow-xl backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
                    <button
                        type="button"
                        role="menuitem"
                        onClick={handlePdfExport}
                        disabled={isBusy}
                        className={clsx(
                            'flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-medium transition-colors',
                            isBusy ? 'cursor-not-allowed text-zinc-400' : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:hover:text-white'
                        )}
                    >
                        {isExportingPdf ? <LoaderCircle size={14} className="animate-spin" /> : <FileDown size={14} />}
                        {isExportingPdf ? 'Exporting PDF...' : 'Export PDF'}
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        onClick={handleImageExport}
                        disabled={isBusy}
                        className={clsx(
                            'flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-medium transition-colors',
                            isBusy ? 'cursor-not-allowed text-zinc-400' : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:hover:text-white'
                        )}
                    >
                        {isExportingImage ? <LoaderCircle size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                        {isExportingImage ? 'Exporting image...' : 'Download image'}
                    </button>
                </div>
            )}
        </div>
    );
}
