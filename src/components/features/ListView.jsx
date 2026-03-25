import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Clock3, MapPin } from 'lucide-react';
import { getScheduleByDay, parseTime, formatTime } from '../../utils/schedule';

const DAYS_ORDER = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
const MotionArticle = motion.article;
const MotionDiv = motion.div;

const TYPE_CONFIG = {
    lecture: {
        label: 'LEC',
        accent: 'from-blue-500 to-cyan-400',
        badge: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700/80 dark:bg-blue-900/30 dark:text-blue-200'
    },
    tutorial: {
        label: 'TUT',
        accent: 'from-orange-500 to-amber-400',
        badge: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-700/80 dark:bg-orange-900/30 dark:text-orange-200'
    },
    lab: {
        label: 'LAB',
        accent: 'from-emerald-500 to-teal-400',
        badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/80 dark:bg-emerald-900/30 dark:text-emerald-200'
    }
};

function formatCourseTime(timeStr) {
    if (!timeStr || !timeStr.includes(' - ')) return timeStr;
    const [startStr, endStr] = timeStr.split(' - ').map(part => part.trim());
    const startMin = parseTime(startStr);
    const endMin = parseTime(endStr);
    if (startMin === null || endMin === null) return timeStr;
    return `${formatTime(startMin)} - ${formatTime(endMin)}`;
}

function getTypeConfig(type) {
    const normalized = (type || '').toLowerCase();
    if (normalized.includes('tutorial')) return TYPE_CONFIG.tutorial;
    if (normalized.includes('lab')) return TYPE_CONFIG.lab;
    return TYPE_CONFIG.lecture;
}

function getDaySummary(courses) {
    const times = courses
        .map(course => {
            if (!course.Time || !course.Time.includes(' - ')) return null;
            const [start, end] = course.Time.split(' - ');
            const startTime = parseTime(start);
            const endTime = parseTime(end);
            if (startTime === null || endTime === null) return null;
            return { start: startTime, end: endTime };
        })
        .filter(Boolean);

    if (times.length === 0) return null;
    const earliest = Math.min(...times.map(entry => entry.start));
    const latest = Math.max(...times.map(entry => entry.end));

    return {
        countLabel: `${courses.length} course${courses.length === 1 ? '' : 's'}`,
        rangeLabel: `${formatTime(earliest)} - ${formatTime(latest)}`,
    };
}

function getNormalizedSchedule(schedule) {
    if (!Array.isArray(schedule)) return [];

    return schedule.map(course => ({
        ...course,
        Time: course._originalTime || course.Time,
        _displayTime: formatCourseTime(course._originalTime || course.Time),
    }));
}

export function ListView({
    schedule,
    exportMode = false,
}) {
    const normalizedSchedule = getNormalizedSchedule(schedule);

    const Article = exportMode ? 'article' : MotionArticle;
    const TimeText = exportMode ? 'p' : MotionDiv;

    if (normalizedSchedule.length === 0) return null;

    const byDay = getScheduleByDay(normalizedSchedule);

    return (
        <div className={clsx(exportMode ? 'space-y-3' : 'space-y-4')}>
            {DAYS_ORDER.map(day => {
                const courses = (byDay[day] || []).map(entry => entry.course);
                if (courses.length === 0) return null;
                const summary = getDaySummary(courses);

                return (
                    <section
                        key={day}
                        className={clsx(
                            'overflow-hidden border shadow-sm',
                            exportMode
                                ? 'rounded-[24px] border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
                                : 'rounded-[32px] border-white/70 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/85'
                        )}
                    >
                        <div
                            className={clsx(
                                exportMode
                                    ? 'border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/90'
                                    : 'border-b border-white/70 bg-gradient-to-r from-white/95 via-white/85 to-zinc-50/85 px-4 py-4 dark:border-zinc-800 dark:from-zinc-950 dark:via-zinc-950/95 dark:to-zinc-900/90 sm:px-5'
                            )}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h4 className="text-xl font-bold tracking-tight text-zinc-950 dark:text-white">
                                        {day}
                                    </h4>
                                    {summary && (
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                                            <span>{summary.countLabel}</span>
                                            <span>•</span>
                                            <span>{summary.rangeLabel}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className={clsx(exportMode ? 'px-3 py-2' : 'px-4 py-2 sm:px-5 sm:py-2.5')}>
                            {courses.map((course, index) => {
                                const typeConfig = getTypeConfig(course.Type);
                                const primaryTime = course._displayTime;
                                const motionProps = exportMode
                                    ? {}
                                    : {
                                        initial: { opacity: 0, y: 12 },
                                        animate: { opacity: 1, y: 0 },
                                        transition: { delay: index * 0.04, duration: 0.24, ease: 'easeOut' },
                                    };

                                return (
                                    <Article
                                        key={`${day}-${course.Code}-${course.Type}-${index}`}
                                        {...motionProps}
                                        className={clsx(
                                            'relative overflow-hidden',
                                            exportMode
                                                ? clsx(index > 0 && 'border-t border-zinc-200 dark:border-zinc-800')
                                                : clsx(index > 0 && 'border-t border-white/60 dark:border-zinc-800/90')
                                        )}
                                    >
                                        <div className={clsx('absolute bottom-3 left-0 top-3 w-1.5 rounded-full bg-gradient-to-b', typeConfig.accent)} aria-hidden="true" />

                                        <div className={clsx(exportMode ? 'py-3 pl-4 pr-0' : 'py-4 pl-5 pr-0')}>
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="min-w-0 flex-1 space-y-3">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className={clsx('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wide', typeConfig.badge)}>
                                                            {typeConfig.label}
                                                        </span>
                                                        <span className="font-mono text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 sm:text-xs">
                                                            {course.Code}
                                                        </span>
                                                    </div>

                                                    <div className="space-y-1">
                                                        <p className="text-lg font-bold leading-tight text-zinc-950 dark:text-white sm:text-xl">
                                                            {course.Name}
                                                        </p>
                                                        {course.Location && (
                                                            <div className="flex items-start gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                                                                <MapPin size={14} className="mt-0.5 shrink-0" />
                                                                <span className="leading-5">{course.Location}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="sm:w-auto sm:min-w-[170px]">
                                                    <TimeText
                                                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 px-3 py-2 text-sm font-bold text-zinc-900 shadow-inner dark:bg-zinc-800 dark:text-zinc-100"
                                                    >
                                                        <Clock3 size={14} />
                                                        {primaryTime}
                                                    </TimeText>
                                                </div>
                                            </div>
                                        </div>
                                    </Article>
                                );
                            })}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
