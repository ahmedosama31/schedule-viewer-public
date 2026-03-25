// Timing mode constants
export const TIMING_MODES = {
    DEFAULT: 'default',
    RAMADAN: 'ramadan'
};

function parseTimeStr(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.trim().split(':');
    if (parts.length !== 2) return null;
    let hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return null;

    if (hours >= 1 && hours <= 7) {
        hours += 12;
    }

    return { hours, minutes };
}

function toMinutes(hours, minutes) {
    return hours * 60 + minutes;
}

function fromMinutes(totalMinutes) {
    return {
        hours: Math.floor(totalMinutes / 60),
        minutes: totalMinutes % 60
    };
}

function formatTimeStr(hour, minute) {
    const period = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 || 12;
    return `${h}:${minute.toString().padStart(2, '0')} ${period}`;
}

export function getRamadanStartTime(defaultStartHour) {
    const mapping = {
        8: { hour: 8, minute: 0 },
        9: { hour: 8, minute: 45 },
        10: { hour: 9, minute: 30 },
        11: { hour: 10, minute: 15 },
        12: { hour: 11, minute: 0 },
        13: { hour: 11, minute: 45 },
        14: { hour: 12, minute: 30 },
        15: { hour: 13, minute: 15 },
        16: { hour: 14, minute: 0 },
        17: { hour: 14, minute: 45 },
        18: { hour: 15, minute: 30 },
        19: { hour: 16, minute: 15 }
    };
    return mapping[defaultStartHour] || null;
}

export function convertTimeToRamadan(timeStr) {
    if (!timeStr || !timeStr.includes(' - ')) return timeStr;

    const [startStr, endStr] = timeStr.split(' - ').map(s => s.trim());
    const startParsed = parseTimeStr(startStr);
    const endParsed = parseTimeStr(endStr);

    if (!startParsed || !endParsed) return timeStr;

    const ramadanStart = getRamadanStartTime(startParsed.hours);
    if (!ramadanStart) return timeStr;

    const startMinutes = toMinutes(startParsed.hours, startParsed.minutes);
    const endMinutes = toMinutes(endParsed.hours, endParsed.minutes);
    const durationMinutes = endMinutes - startMinutes;

    const slots = Math.ceil(durationMinutes / 60);
    const ramadanDuration = slots * 45;

    const ramadanStartMinutes = toMinutes(ramadanStart.hour, ramadanStart.minute);
    const ramadanEndMinutes = ramadanStartMinutes + ramadanDuration;
    const ramadanEnd = fromMinutes(ramadanEndMinutes);

    return `${formatTimeStr(ramadanStart.hour, ramadanStart.minute)} - ${formatTimeStr(ramadanEnd.hours, ramadanEnd.minutes)}`;
}

export function convertCourseTimings(courses, mode) {
    if (!courses || !Array.isArray(courses) || mode !== TIMING_MODES.RAMADAN) {
        return courses;
    }

    return courses.map(course => ({
        ...course,
        Time: convertTimeToRamadan(course.Time),
        _originalTime: course._originalTime || course.Time
    }));
}

export function getTimingModeLabel(mode) {
    return mode === TIMING_MODES.RAMADAN ? 'Ramadan' : 'Original';
}
