// Time parsing & formatting
export function parseTime(timeStr) {
    if (!timeStr) return null;
    const cleanTime = timeStr.trim();
    const isPM = cleanTime.toUpperCase().includes('PM');
    const isAM = cleanTime.toUpperCase().includes('AM');

    const timeOnly = cleanTime.replace(/\s*[AaPp][Mm]\s*$/, '');
    const parts = timeOnly.split(':');

    if (parts.length !== 2) return null;

    let hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);

    if (isNaN(hours) || isNaN(minutes)) return null;

    if (isPM && hours !== 12) {
        hours += 12;
    } else if (isAM && hours === 12) {
        hours = 0;
    } else if (!isPM && !isAM) {
        if (hours >= 1 && hours <= 7) hours += 12;
    }

    return hours * 60 + minutes;
}

export function formatTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const hour12 = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
    const period = hours < 12 ? 'AM' : 'PM';
    return `${hour12}:${mins.toString().padStart(2, '0')} ${period}`;
}

export function buildMatchKey(course) {
    if (!course) return '';
    const keyTime = (course._originalTime || course.Time || '').trim();
    return [
        (course.Day || '').trim(),
        keyTime,
        (course.Code || '').trim(),
        (course.Type || '').trim().toLowerCase(),
        (course.Location || '').trim().toLowerCase(),
        (course.Link || '').trim(),
    ].join('|');
}

export function getScheduleByDay(schedule) {
    const byDay = {};
    const days = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
    days.forEach(day => byDay[day] = []);

    if (!Array.isArray(schedule)) return byDay;

    schedule.forEach(course => {
        if (course.Time && course.Time.includes(' - ')) {
            const [startStr, endStr] = course.Time.split(' - ');
            const startTime = parseTime(startStr);
            const endTime = parseTime(endStr);
            if (startTime !== null && endTime !== null) {
                const universityStart = 8 * 60;
                const universityEnd = 19 * 60;
                if (startTime >= universityStart && endTime <= universityEnd && startTime < endTime) {
                    byDay[course.Day].push({ start: startTime, end: endTime, course: course });
                }
            }
        }
    });
    days.forEach(day => byDay[day].sort((a, b) => a.start - b.start));
    return byDay;
}

export function removeDuplicateCourses(schedule) {
    if (!Array.isArray(schedule)) return [];
    const seen = new Set();
    return schedule.filter(course => {
        const courseKey = `${course.Code}|${course.Type}|${course.Day}|${course.Time}`;
        if (seen.has(courseKey)) return false;
        seen.add(courseKey);
        return true;
    });
}

export function sortSchedule(s) {
    if (!Array.isArray(s)) return [];
    const order = { Saturday: 0, Sunday: 1, Monday: 2, Tuesday: 3, Wednesday: 4, Thursday: 5, Friday: 6 };
    const convert = t => {
        if (!t) return 0;
        const p = t.split(":");
        if (p.length !== 2) return 0;
        let h = parseInt(p[0], 10), m = parseInt(p[1], 10);
        if (isNaN(h) || isNaN(m)) return 0;
        if ((h >= 1 && h <= 7) || h === 12) {
            if (h !== 12) h += 12;
        }
        return h + m / 60;
    };
    return [...s].sort((a, b) => {
        if (a.Day !== b.Day) return (order[a.Day] ?? 7) - (order[b.Day] ?? 7);
        const tA = a.Time.split(" - ")[0], tB = b.Time.split(" - ")[0];
        return convert(tA) - convert(tB);
    });
}
