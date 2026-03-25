import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../ui/Card';
import { ArrowLeft, ArrowRight, Clock3 } from 'lucide-react';
import { getScheduleByDay, parseTime, formatTime } from '../../utils/schedule';
import clsx from 'clsx';

const START_HOUR = 8;
const END_HOUR = 19;
const HOUR_HEIGHT = 64;
const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
const MotionDiv = motion.div;
const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];

const CALENDAR_TYPE_STYLES = {
    lecture: {
        surface: 'bg-blue-100/95 dark:bg-blue-900/35',
        border: 'border-blue-300 dark:border-blue-700',
        text: 'text-blue-950 dark:text-blue-100',
    },
    tutorial: {
        surface: 'bg-orange-100/95 dark:bg-orange-900/35',
        border: 'border-orange-300 dark:border-orange-700',
        text: 'text-orange-950 dark:text-orange-100',
    },
    lab: {
        surface: 'bg-emerald-100/95 dark:bg-emerald-900/35',
        border: 'border-emerald-300 dark:border-emerald-700',
        text: 'text-emerald-950 dark:text-emerald-100',
    },
};

function getCalendarTypeStyle(type) {
    const normalized = (type || '').toLowerCase();
    if (normalized.includes('tutorial')) return CALENDAR_TYPE_STYLES.tutorial;
    if (normalized.includes('lab')) return CALENDAR_TYPE_STYLES.lab;
    return CALENDAR_TYPE_STYLES.lecture;
}

function formatCourseTime(timeStr) {
    if (!timeStr || !timeStr.includes(' - ')) return timeStr;
    const [startStr, endStr] = timeStr.split(' - ').map(part => part.trim());
    const startMin = parseTime(startStr);
    const endMin = parseTime(endStr);
    if (startMin === null || endMin === null) return timeStr;
    return `${formatTime(startMin)} - ${formatTime(endMin)}`;
}

export function CalendarView({ schedule }) {
    const normalizedSchedule = useMemo(() => (
        Array.isArray(schedule)
            ? schedule.map(course => ({
                ...course,
                Time: course._originalTime || course.Time,
            }))
            : []
    ), [schedule]);

    const byDay = getScheduleByDay(normalizedSchedule);
    const activeDays = DAYS.filter(d => byDay[d]?.length > 0);
    const [activeDay, setActiveDay] = useState(null);
    const [swipeDirection, setSwipeDirection] = useState(0);

    const selectedDay = activeDays.includes(activeDay) ? activeDay : (activeDays[0] || null);
    const selectedIndex = activeDays.indexOf(selectedDay);

    if (activeDays.length === 0) {
        return (
            <Card className="rounded-3xl text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">No scheduled days to display.</p>
            </Card>
        );
    }

    const getCourseStyle = (course) => {
        const timeStr = course.Time;
        if (!timeStr || !timeStr.includes(' - ')) return null;
        const startMin = parseTime(timeStr.split(' - ')[0]);
        const endMin = parseTime(timeStr.split(' - ')[1]);
        if (startMin === null || endMin === null) return null;
        return {
            top: ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT,
            height: ((endMin - startMin) / 60) * HOUR_HEIGHT,
        };
    };

    const goToDay = (index) => {
        if (index < 0 || index >= activeDays.length) return;
        setSwipeDirection(index > selectedIndex ? 1 : -1);
        setActiveDay(activeDays[index]);
    };

    const handleSwipe = (_, info) => {
        const threshold = 50;
        if (info.offset.x > threshold && selectedIndex > 0) goToDay(selectedIndex - 1);
        if (info.offset.x < -threshold && selectedIndex < activeDays.length - 1) goToDay(selectedIndex + 1);
    };

    const TimeGrid = () => (
        <div className="absolute inset-0 pointer-events-none z-0">
            {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, i) => (
                <div key={i} className="absolute w-full border-t border-zinc-200/80 dark:border-zinc-800/60" style={{ top: i * HOUR_HEIGHT }} />
            ))}
        </div>
    );

    const TimetableBlock = ({ course }) => {
        const style = getCourseStyle(course);
        const blockTypeStyle = getCalendarTypeStyle(course.Type);
        if (!style) return null;

        return (
            <div className="absolute z-10 px-1" style={{ ...style, left: '0%', width: '100%' }}>
                <MotionDiv
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={clsx('h-full w-full overflow-hidden rounded-2xl border p-2 shadow-sm', blockTypeStyle.surface, blockTypeStyle.border, blockTypeStyle.text)}
                >
                    <div className="truncate text-[11px] font-bold uppercase tracking-wide opacity-85">{course.Code}</div>
                    <div className="mt-0.5 truncate text-sm font-semibold leading-tight">{course.Name}</div>
                    <MotionDiv
                        className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold text-zinc-900 shadow-sm dark:bg-zinc-900/85 dark:text-zinc-100"
                    >
                        <Clock3 size={11} />
                        <span className="truncate">{formatCourseTime(course.Time)}</span>
                    </MotionDiv>
                </MotionDiv>
            </div>
        );
    };

    const renderDayColumn = (day) => {
        const courses = (byDay[day] || []).map(c => c.course);
        return (
            <div className="relative w-full" style={{ height: TOTAL_HEIGHT }}>
                <TimeGrid />
                {courses.map((course, idx) => <TimetableBlock key={`${day}-${idx}`} course={course} />)}
            </div>
        );
    };

    return (
        <div className="space-y-4">
            <div className="hidden md:block overflow-x-auto pb-4 px-1 no-scrollbar">
                <div className="grid min-w-[1024px] overflow-hidden rounded-[28px] border border-white/70 bg-white/70 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70" style={{ gridTemplateColumns: `64px repeat(${activeDays.length}, 1fr)` }}>
                    <div className="border-r border-zinc-200/80 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/45">
                        <div className="flex h-12 items-center justify-center border-b border-zinc-200/80 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">Time</div>
                        <div className="relative" style={{ height: TOTAL_HEIGHT }}>
                            {Array.from({ length: END_HOUR - START_HOUR }).map((_, i) => (
                                <div key={i} className="absolute w-full pr-2 text-right text-xs font-medium text-zinc-400" style={{ top: i * HOUR_HEIGHT + 4 }}>
                                    {`${i + START_HOUR}:00`}
                                </div>
                            ))}
                        </div>
                    </div>
                    {activeDays.map((day, i) => (
                        <div key={day} className={clsx('min-w-[170px]', i !== activeDays.length - 1 && 'border-r border-zinc-200/80 dark:border-zinc-800')}>
                            <div className="flex h-12 items-center justify-center border-b border-zinc-200/80 bg-zinc-50/70 text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/45 dark:text-zinc-300">
                                {day}
                            </div>
                            {renderDayColumn(day)}
                        </div>
                    ))}
                </div>
            </div>

            <div className="md:hidden space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-3xl border border-white/70 bg-white/80 px-3 py-3 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
                    <button type="button" onClick={() => goToDay(selectedIndex - 1)} disabled={selectedIndex <= 0} className="rounded-full border border-zinc-200 bg-zinc-50 p-2 text-zinc-700 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                        <ArrowLeft size={16} />
                    </button>
                    <div className="min-w-0 text-center">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-500">Calendar day</div>
                        <div className="text-lg font-bold tracking-tight text-zinc-950 dark:text-white">{selectedDay}</div>
                    </div>
                    <button type="button" onClick={() => goToDay(selectedIndex + 1)} disabled={selectedIndex >= activeDays.length - 1} className="rounded-full border border-zinc-200 bg-zinc-50 p-2 text-zinc-700 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                        <ArrowRight size={16} />
                    </button>
                </div>

                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {activeDays.map((day, index) => (
                        <button
                            key={day}
                            type="button"
                            onClick={() => goToDay(index)}
                            className={clsx(
                                'whitespace-nowrap rounded-full border px-3 py-2 text-sm font-semibold transition-all',
                                selectedDay === day
                                    ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                                    : 'border-white/70 bg-white/70 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/70 dark:text-zinc-400'
                            )}
                        >
                            {day}
                        </button>
                    ))}
                </div>

                <AnimatePresence mode="wait" initial={false}>
                    {selectedDay && (
                        <MotionDiv
                            key={selectedDay}
                            initial={{ opacity: 0, x: swipeDirection >= 0 ? 40 : -40 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: swipeDirection >= 0 ? -40 : 40 }}
                            transition={{ duration: 0.22, ease: 'easeOut' }}
                            drag="x"
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={0.14}
                            onDragEnd={handleSwipe}
                            style={{ touchAction: 'pan-y' }}
                        >
                            <Card className="overflow-hidden rounded-[30px] border-white/70 bg-white/80 p-0 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80" hoverLift={false}>
                                <div className="relative">
                                    <div className="absolute left-0 top-0 bottom-0 w-14 border-r border-zinc-200/80 bg-zinc-50/90 dark:border-zinc-800 dark:bg-zinc-900/60">
                                        {Array.from({ length: END_HOUR - START_HOUR }).map((_, i) => (
                                            <div key={i} className="absolute w-full pr-2 text-right text-[10px] font-medium text-zinc-400" style={{ top: i * HOUR_HEIGHT + 4 }}>
                                                {`${i + START_HOUR}:00`}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="ml-14 px-1 py-1">
                                        {renderDayColumn(selectedDay)}
                                    </div>
                                </div>
                            </Card>
                        </MotionDiv>
                    )}
                </AnimatePresence>

                <p className="text-center text-[11px] font-medium text-zinc-400">Swipe left or right to switch days</p>
            </div>
        </div>
    );
}
