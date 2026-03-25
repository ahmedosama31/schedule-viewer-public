import { SEMESTERS } from './api';
import { parseTime, formatTime } from './schedule';

const DAYS_ORDER = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];

const TYPE_CONFIG = {
    lecture: {
        accent: [59, 130, 246],
        label: 'Lec',
    },
    lab: {
        accent: [16, 185, 129],
        label: 'Lab',
    },
    tutorial: {
        accent: [249, 115, 22],
        label: 'Tut',
    },
    fallback: {
        accent: [161, 161, 170],
        label: 'Cls',
    },
};

const LAYOUT_PROFILES = [
    {
        headerHeightFirst: 82,
        headerHeightContinuation: 52,
        headerGapAfter: 12,
        titleY: 24,
        bylineOffsetY: 12,
        metaY: 52,
        generatedY: 68,
        dayHeaderFontSize: 10.5,
        daySummaryFontSize: 8,
        dayHeaderTextY: 11,
        dayHeaderLineY: 16,
        dayHeaderAdvance: 20,
        rowHeightWithLocation: 39,
        rowHeightWithoutLocation: 35,
        rowGap: 4,
        dayGap: 4,
        rowRightWidth: 168,
        codeFontSize: 9,
        codeY: 14,
        nameFontSize: 9.5,
        nameY: 14,
        typeFontSize: 8,
        detailY: 27,
        locationFontSize: 8,
        timeBadgeHeight: 20,
        timeFontSize: 10,
    },
    {
        headerHeightFirst: 74,
        headerHeightContinuation: 48,
        headerGapAfter: 10,
        titleY: 22,
        bylineOffsetY: 11,
        metaY: 47,
        generatedY: 61,
        dayHeaderFontSize: 10,
        daySummaryFontSize: 7.8,
        dayHeaderTextY: 10,
        dayHeaderLineY: 15,
        dayHeaderAdvance: 18,
        rowHeightWithLocation: 35,
        rowHeightWithoutLocation: 32,
        rowGap: 3,
        dayGap: 3,
        rowRightWidth: 164,
        codeFontSize: 8.6,
        codeY: 13,
        nameFontSize: 9,
        nameY: 13,
        typeFontSize: 7.4,
        detailY: 24,
        locationFontSize: 7.4,
        timeBadgeHeight: 18,
        timeFontSize: 9.2,
    },
    {
        headerHeightFirst: 68,
        headerHeightContinuation: 45,
        headerGapAfter: 9,
        titleY: 21,
        bylineOffsetY: 10,
        metaY: 42,
        generatedY: 56,
        dayHeaderFontSize: 9.6,
        daySummaryFontSize: 7.4,
        dayHeaderTextY: 9,
        dayHeaderLineY: 14,
        dayHeaderAdvance: 17,
        rowHeightWithLocation: 33,
        rowHeightWithoutLocation: 30,
        rowGap: 2,
        dayGap: 2,
        rowRightWidth: 160,
        codeFontSize: 8.2,
        codeY: 12,
        nameFontSize: 8.6,
        nameY: 12,
        typeFontSize: 7,
        detailY: 22,
        locationFontSize: 7,
        timeBadgeHeight: 17,
        timeFontSize: 8.7,
    },
];

const ARABIC_FONT_FILE = 'NotoNaskhArabic-Regular.ttf';
const ARABIC_FONT_NAME = 'NotoNaskhArabic';
let arabicFontBinaryPromise = null;

function hasArabicCharacters(value) {
    return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(String(value || ''));
}

function getArabicFontUrl() {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '/');
    return `${base}fonts/${ARABIC_FONT_FILE}`;
}

function arrayBufferToBinaryString(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let result = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        result += String.fromCharCode(...chunk);
    }
    return result;
}

async function loadArabicFontBinary() {
    if (!arabicFontBinaryPromise) {
        arabicFontBinaryPromise = fetch(getArabicFontUrl())
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load Arabic font: ${response.status}`);
                }
                return response.arrayBuffer();
            })
            .then(arrayBufferToBinaryString);
    }
    return arabicFontBinaryPromise;
}

async function ensureArabicFont(doc) {
    try {
        const fontList = doc.getFontList();
        if (!fontList[ARABIC_FONT_NAME]) {
            const binary = await loadArabicFontBinary();
            doc.addFileToVFS(ARABIC_FONT_FILE, binary);
            doc.addFont(ARABIC_FONT_FILE, ARABIC_FONT_NAME, 'normal', 400, 'Identity-H');
        }
        return true;
    } catch (error) {
        console.error('Failed to initialize Arabic PDF font:', error);
        return false;
    }
}

function normalizeLocation(location) {
    const value = String(location || '').trim();
    if (!value || value === '-----') return '';
    return value;
}

function getTypeConfig(type) {
    const normalized = String(type || '').toLowerCase();
    if (normalized.includes('lab')) return TYPE_CONFIG.lab;
    if (normalized.includes('tutorial')) return TYPE_CONFIG.tutorial;
    if (normalized.includes('lecture')) return TYPE_CONFIG.lecture;
    return TYPE_CONFIG.fallback;
}

function getCourseTypeLabel(type) {
    return getTypeConfig(type).label;
}

function getCourseRowHeight(course, layout) {
    return normalizeLocation(course.Location)
        ? layout.rowHeightWithLocation
        : layout.rowHeightWithoutLocation;
}

function getStartMinutes(timeRange) {
    if (!timeRange || !timeRange.includes(' - ')) return Number.POSITIVE_INFINITY;
    const [startTime] = timeRange.split(' - ');
    const parsed = parseTime(startTime);
    return parsed === null ? Number.POSITIVE_INFINITY : parsed;
}

function formatTimeRange(timeRange) {
    if (!timeRange || !timeRange.includes(' - ')) return timeRange || '-';
    const [startTime, endTime] = timeRange.split(' - ').map(value => value.trim());
    const startMinutes = parseTime(startTime);
    const endMinutes = parseTime(endTime);
    if (startMinutes === null || endMinutes === null) return timeRange;
    return `${formatTime(startMinutes)} - ${formatTime(endMinutes)}`;
}

function getDaySummary(courses) {
    const times = courses
        .map(course => {
            if (!course.Time || !course.Time.includes(' - ')) return null;
            const [startTime, endTime] = course.Time.split(' - ');
            const start = parseTime(startTime);
            const end = parseTime(endTime);
            if (start === null || end === null) return null;
            return { start, end };
        })
        .filter(Boolean);

    if (times.length === 0) return null;

    const earliest = Math.min(...times.map(entry => entry.start));
    const latest = Math.max(...times.map(entry => entry.end));
    const courseCount = courses.length;

    return `${courseCount} ${courseCount === 1 ? 'course' : 'courses'} | ${formatTime(earliest)} - ${formatTime(latest)}`;
}

function groupScheduleByDay(schedule) {
    const byDay = DAYS_ORDER.reduce((acc, day) => {
        acc[day] = [];
        return acc;
    }, {});

    schedule.forEach(course => {
        if (byDay[course.Day]) {
            byDay[course.Day].push(course);
        }
    });

    DAYS_ORDER.forEach(day => {
        byDay[day].sort((a, b) => getStartMinutes(a.Time) - getStartMinutes(b.Time));
    });

    return DAYS_ORDER
        .map(day => ({ day, courses: byDay[day] }))
        .filter(entry => entry.courses.length > 0);
}

function sanitizeFilenamePart(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return 'unknown';
    return normalized
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
}

function getSemesterLabel(semester) {
    if (!semester) return 'N/A';
    return SEMESTERS[semester]?.label || semester;
}

function getModeLabel() {
    return 'Original Timings';
}

function formatGeneratedTimestamp(date) {
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(date);
}

function estimateBodyHeight(groupedSchedule, layout) {
    return groupedSchedule.reduce((total, { courses }) => {
        const rowsHeight = courses.reduce(
            (sum, course) => sum + getCourseRowHeight(course, layout) + layout.rowGap,
            0
        );
        return total + layout.dayHeaderAdvance + rowsHeight + layout.dayGap;
    }, 0);
}

function pickLayoutProfile({ groupedSchedule, pageHeight }) {
    const headerTop = 24;
    const contentBottom = pageHeight - 32;

    for (const layout of LAYOUT_PROFILES) {
        const bodyStart = headerTop + layout.headerHeightFirst + layout.headerGapAfter;
        const availableHeight = contentBottom - bodyStart;
        const neededHeight = estimateBodyHeight(groupedSchedule, layout);
        if (neededHeight <= availableHeight) {
            return layout;
        }
    }

    return LAYOUT_PROFILES[LAYOUT_PROFILES.length - 1];
}

function truncateToWidth(doc, text, maxWidth) {
    const value = String(text || '');
    if (doc.getTextWidth(value) <= maxWidth) return value;

    let output = value;
    while (output.length > 0 && doc.getTextWidth(`${output}...`) > maxWidth) {
        output = output.slice(0, -1);
    }

    return output ? `${output}...` : '';
}

function drawPageBackground(doc, pageWidth, pageHeight) {
    doc.setFillColor(9, 9, 11);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
}

function drawHeader(doc, {
    margin,
    pageWidth,
    studentId,
    semesterLabel,
    modeLabel,
    generatedAtText,
    layout,
    continuation = false,
}) {
    const headerTop = 24;
    const headerHeight = continuation ? layout.headerHeightContinuation : layout.headerHeightFirst;
    const headerWidth = pageWidth - margin * 2;

    doc.setFillColor(24, 24, 27);
    doc.setDrawColor(63, 63, 70);
    doc.roundedRect(margin, headerTop, headerWidth, headerHeight, 10, 10, 'FD');

    const titleText = continuation ? 'Schedule Viewer (Continued)' : 'Schedule Viewer';
    const titleX = margin + 14;
    const titleY = headerTop + layout.titleY;

    doc.setTextColor(244, 244, 245);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text(titleText, titleX, titleY);

    if (!continuation) {
        const bylineText = 'by Ahmed Osama';
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(161, 161, 170);
        doc.text(bylineText, titleX + 1, titleY + layout.bylineOffsetY);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(161, 161, 170);
    doc.text(
        `Student ID: ${studentId}   |   Semester: ${semesterLabel}   |   ${modeLabel}`,
        margin + 14,
        headerTop + layout.metaY
    );

    if (!continuation) {
        doc.setFontSize(8);
        doc.text(`Generated: ${generatedAtText}`, margin + 14, headerTop + layout.generatedY);
    }

    const badgeText = timingModeBadgeText(modeLabel);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const badgeWidth = doc.getTextWidth(badgeText) + 14;
    const badgeX = margin + headerWidth - badgeWidth - 12;
    const badgeY = headerTop + 14;
    const badgeColor = modeLabel.includes('Ramadan') ? [217, 119, 6] : [79, 70, 229];

    doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
    doc.roundedRect(badgeX, badgeY, badgeWidth, 16, 8, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(badgeText, badgeX + 7, badgeY + 11);

    return headerTop + headerHeight + layout.headerGapAfter;
}

function timingModeBadgeText(modeLabel) {
    return modeLabel.includes('Ramadan') ? 'RAMADAN' : 'ORIGINAL';
}

function drawDayHeader(doc, { margin, contentWidth, day, summary, y, layout }) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(layout.dayHeaderFontSize);
    doc.setTextColor(228, 228, 231);
    doc.text(day.toUpperCase(), margin, y + layout.dayHeaderTextY);

    if (summary) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(layout.daySummaryFontSize);
        doc.setTextColor(100, 116, 139);
        const summaryText = truncateToWidth(doc, summary, contentWidth * 0.58);
        doc.text(summaryText, margin + contentWidth, y + layout.dayHeaderTextY, { align: 'right' });
    }

    doc.setDrawColor(63, 63, 70);
    doc.setLineWidth(0.8);
    doc.line(margin, y + layout.dayHeaderLineY, margin + contentWidth, y + layout.dayHeaderLineY);

    return y + layout.dayHeaderAdvance;
}

function drawCourseRow(doc, { margin, contentWidth, y, course, arabicFontReady, layout }) {
    const typeConfig = getTypeConfig(course.Type);
    const typeLabel = getCourseTypeLabel(course.Type);
    const rowHeight = getCourseRowHeight(course, layout);
    const rowRightWidth = layout.rowRightWidth;

    doc.setFillColor(24, 24, 27);
    doc.setDrawColor(63, 63, 70);
    doc.roundedRect(margin, y, contentWidth, rowHeight, 8, 8, 'FD');

    doc.setFillColor(typeConfig.accent[0], typeConfig.accent[1], typeConfig.accent[2]);
    doc.roundedRect(margin + 1, y + 1, 4, rowHeight - 2, 2, 2, 'F');

    const separatorX = margin + contentWidth - rowRightWidth;
    doc.setDrawColor(63, 63, 70);
    doc.line(separatorX, y + 1, separatorX, y + rowHeight - 1);

    const codeX = margin + 12;
    const codeY = y + layout.codeY;
    const nameX = margin + 58;
    const location = normalizeLocation(course.Location);
    const nameMaxWidth = separatorX - nameX - 8;
    const detailY = y + layout.detailY;
    const detailAreaWidth = separatorX - nameX - 8;

    doc.setFont('courier', 'bold');
    doc.setFontSize(layout.codeFontSize);
    doc.setTextColor(161, 161, 170);
    doc.text(truncateToWidth(doc, course.Code || '-', 44), codeX, codeY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(layout.nameFontSize);
    doc.setTextColor(244, 244, 245);
    doc.text(truncateToWidth(doc, course.Name || '-', nameMaxWidth), nameX, y + layout.nameY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(layout.typeFontSize);
    doc.setTextColor(typeConfig.accent[0], typeConfig.accent[1], typeConfig.accent[2]);
    doc.text(typeLabel, nameX, detailY);

    if (location) {
        const typeWidth = doc.getTextWidth(typeLabel);
        const locationStartX = nameX + typeWidth + 10;
        const locationWidth = separatorX - locationStartX - 8;

        if (arabicFontReady && hasArabicCharacters(location) && locationWidth > 20) {
            const previousR2L = doc.getR2L();
            doc.setFont(ARABIC_FONT_NAME, 'normal');
            doc.setFontSize(layout.locationFontSize);
            doc.setTextColor(113, 113, 122);
            doc.setR2L(true);
            const processed = doc.processArabic(location);
            const clipped = truncateToWidth(doc, processed, locationWidth);
            doc.text(clipped, separatorX - 8, detailY, {
                align: 'right',
                isInputRtl: true,
                isOutputRtl: true,
            });
            doc.setR2L(previousR2L);
        } else {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(layout.locationFontSize);
            doc.setTextColor(113, 113, 122);
            const detailsText = `Location: ${location}`;
            doc.text(truncateToWidth(doc, detailsText, detailAreaWidth), nameX, detailY);
        }
    }

    const rightX = separatorX + 8;
    const rightWidth = rowRightWidth - 16;
    const timeText = formatTimeRange(course.Time);
    const timeBadgeHeight = layout.timeBadgeHeight;
    const timeBadgeY = y + ((rowHeight - timeBadgeHeight) / 2);

    doc.setFillColor(39, 39, 42);
    doc.roundedRect(rightX, timeBadgeY, rightWidth, timeBadgeHeight, 5, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(layout.timeFontSize);
    doc.setTextColor(212, 212, 216);
    doc.text(
        truncateToWidth(doc, timeText, rightWidth - 8),
        rightX + rightWidth / 2,
        timeBadgeY + Math.round(timeBadgeHeight * 0.65),
        { align: 'center' }
    );

    return rowHeight;
}

function drawFooters(doc, { margin, pageWidth, pageHeight, generatedAtText }) {
    const totalPages = doc.getNumberOfPages();
    for (let pageIndex = 1; pageIndex <= totalPages; pageIndex += 1) {
        doc.setPage(pageIndex);
        doc.setDrawColor(63, 63, 70);
        doc.setLineWidth(0.8);
        doc.line(margin, pageHeight - 26, pageWidth - margin, pageHeight - 26);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(113, 113, 122);
        doc.text(`Generated ${generatedAtText}`, margin, pageHeight - 11);
        doc.text(`Page ${pageIndex} of ${totalPages}`, pageWidth - margin, pageHeight - 11, { align: 'right' });
    }
}

function isIosSafari() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const isIos = /iPad|iPhone|iPod/.test(ua)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = ua.includes('Safari')
        && !/(CriOS|FxiOS|EdgiOS|OPiOS|Android)/.test(ua);
    return isIos && isSafari;
}

async function trySharePdfFile(blob, filename) {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof File === 'undefined') {
        return false;
    }

    try {
        const file = new File([blob], filename, { type: 'application/pdf' });
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
        console.warn('Unable to share generated PDF file:', error);
        return false;
    }
}

function downloadBlob(blob, filename) {
    if (typeof document === 'undefined') return;

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.type = 'application/octet-stream';
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

async function saveGeneratedPdf(doc, filename) {
    const pdfFilename = `${filename}.pdf`;

    if (!isIosSafari()) {
        doc.save(pdfFilename);
        return;
    }

    const blob = doc.output('blob');

    const shared = await trySharePdfFile(blob, pdfFilename);
    if (shared) {
        return;
    }

    const forcedDownloadBlob = new Blob([blob], { type: 'application/octet-stream' });
    downloadBlob(forcedDownloadBlob, pdfFilename);
}

export async function exportSchedulePdf({ schedule, student, semester }) {
    if (!Array.isArray(schedule) || schedule.length === 0) {
        throw new Error('Cannot export an empty schedule.');
    }

    const convertedSchedule = (schedule || []).map(course => ({
        ...course,
        Time: course._originalTime || course.Time,
    }));
    const groupedSchedule = groupScheduleByDay(convertedSchedule);
    const generatedAt = new Date();
    const generatedAtText = formatGeneratedTimestamp(generatedAt);
    const studentId = student?.Code || 'Unknown';
    const semesterLabel = getSemesterLabel(semester);
    const modeLabel = getModeLabel();

    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const arabicFontReady = await ensureArabicFont(doc);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 28;
    const layout = pickLayoutProfile({ groupedSchedule, pageHeight });
    const contentWidth = pageWidth - margin * 2;
    const contentBottom = pageHeight - 32;

    let isContinuation = false;
    drawPageBackground(doc, pageWidth, pageHeight);
    let y = drawHeader(doc, {
        margin,
        pageWidth,
        studentId,
        semesterLabel,
        modeLabel,
        generatedAtText,
        layout,
        continuation: isContinuation,
    });

    const startNewPage = () => {
        doc.addPage();
        isContinuation = true;
        drawPageBackground(doc, pageWidth, pageHeight);
        y = drawHeader(doc, {
            margin,
            pageWidth,
            studentId,
            semesterLabel,
            modeLabel,
            generatedAtText,
            layout,
            continuation: true,
        });
    };

    groupedSchedule.forEach(({ day, courses }) => {
        const summary = getDaySummary(courses);
        if (y + layout.dayHeaderAdvance > contentBottom) {
            startNewPage();
        }

        y = drawDayHeader(doc, { margin, contentWidth, day, summary, y, layout });

        courses.forEach(course => {
            const rowHeight = getCourseRowHeight(course, layout);
            if (y + rowHeight > contentBottom) {
                startNewPage();
                y = drawDayHeader(doc, {
                    margin,
                    contentWidth,
                    day: `${day} (cont.)`,
                    summary: null,
                    y,
                    layout,
                });
            }

            const drawnHeight = drawCourseRow(doc, { margin, contentWidth, y, course, arabicFontReady, layout });
            y += drawnHeight + layout.rowGap;
        });

        y += layout.dayGap;
    });

    drawFooters(doc, { margin, pageWidth, pageHeight, generatedAtText });

    const filename = [
        'schedule',
        sanitizeFilenamePart(studentId),
        sanitizeFilenamePart(semester || 'semester'),
        'original',
    ].join('-');

    await saveGeneratedPdf(doc, filename);
}









