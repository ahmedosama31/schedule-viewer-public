import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, CreditCard, Hash, Layers3, CalendarRange } from 'lucide-react';
import clsx from 'clsx';

const MotionDiv = motion.div;

function getUniqueCourseCount(schedule) {
    if (!Array.isArray(schedule)) return 0;
    return new Set(schedule.map(course => course?.Code).filter(Boolean)).size;
}

function getActiveDayCount(schedule) {
    if (!Array.isArray(schedule)) return 0;
    return new Set(schedule.map(course => course?.Day).filter(Boolean)).size;
}

export function StudentInfo({ student, schedule, creditsData }) {
    const [showBreakdown, setShowBreakdown] = useState(false);

    const summary = useMemo(() => {
        let totalCredits = null;
        let hasUnknown = false;
        const breakdown = [];

        if (schedule && creditsData && Object.keys(creditsData).length > 0) {
            const seen = new Set();
            const uniqueCourses = [];
            for (const c of schedule) {
                if (c?.Code && !seen.has(c.Code)) {
                    seen.add(c.Code);
                    uniqueCourses.push(c);
                }
            }

            totalCredits = 0;
            for (const course of uniqueCourses) {
                const credits = creditsData[course.Code];
                if (credits !== undefined) {
                    totalCredits += credits;
                    breakdown.push({ code: course.Code, name: course.Name, credits });
                } else {
                    hasUnknown = true;
                    breakdown.push({ code: course.Code, name: course.Name, credits: null });
                }
            }
        }

        return { totalCredits, hasUnknown, breakdown };
    }, [schedule, creditsData]);

    const studentCode = student?.Code || '';
    const studentNameEn = (student?.NameEn || '').trim();
    const studentNameAr = (student?.NameAr || '').trim();
    const uniqueCourses = getUniqueCourseCount(schedule);
    const activeDays = getActiveDayCount(schedule);

    const chipClass = 'inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/78 px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm backdrop-blur dark:border-zinc-700/70 dark:bg-zinc-950/72 dark:text-zinc-300';

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-3">
                    <div className="space-y-1">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-500">
                            Student overview
                        </div>
                        {studentNameEn ? (
                            <div className="text-xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-2xl">
                                {studentNameEn}
                            </div>
                        ) : (
                            <div className="text-xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-2xl">
                                Schedule loaded
                            </div>
                        )}
                        {studentNameAr && (
                            <div dir="rtl" className="text-sm text-zinc-600 dark:text-zinc-400 sm:text-base">
                                {studentNameAr}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <span className={clsx(chipClass, 'font-mono')}>
                            <Hash size={13} />
                            {studentCode}
                        </span>
                        {uniqueCourses > 0 && (
                            <span className={chipClass}>
                                <Layers3 size={13} />
                                {uniqueCourses} courses
                            </span>
                        )}
                        {activeDays > 0 && (
                            <span className={chipClass}>
                                <CalendarRange size={13} />
                                {activeDays} active days
                            </span>
                        )}
                    </div>
                </div>

                {summary.totalCredits !== null && (
                    <div className="w-full lg:w-auto lg:min-w-[188px]">
                        <button
                            type="button"
                            onClick={() => setShowBreakdown(v => !v)}
                            className="group flex w-full items-center justify-between rounded-3xl border border-white/70 bg-white/80 px-4 py-3 text-left shadow-sm backdrop-blur transition-all hover:border-zinc-300 hover:bg-white dark:border-zinc-700/80 dark:bg-zinc-950/70 dark:hover:border-zinc-600 dark:hover:bg-zinc-950"
                        >
                            <div>
                                <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-500">
                                    <CreditCard size={12} />
                                    Credit hours
                                </div>
                                <div className="mt-1 text-2xl font-bold leading-none text-zinc-950 dark:text-white">
                                    {summary.totalCredits}{summary.hasUnknown ? '+' : ''}
                                </div>
                            </div>
                            <div className="rounded-full border border-zinc-200 bg-zinc-50 p-2 text-zinc-500 transition-colors group-hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:group-hover:text-white">
                                {showBreakdown ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </div>
                        </button>
                    </div>
                )}
            </div>

            <AnimatePresence initial={false}>
                {showBreakdown && summary.breakdown.length > 0 && (
                    <MotionDiv
                        initial={{ opacity: 0, height: 0, y: -4 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -4 }}
                        className="overflow-hidden"
                    >
                        <div className="rounded-3xl border border-white/70 bg-white/75 p-3 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70">
                            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-500">
                                Credit breakdown
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                {summary.breakdown.map(item => (
                                    <div key={item.code} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-zinc-50/90 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/70">
                                        <div className="min-w-0">
                                            <div className="font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                                {item.code}
                                            </div>
                                            <div className="truncate text-xs text-zinc-500 dark:text-zinc-500">
                                                {item.name}
                                            </div>
                                        </div>
                                        <span className={clsx(
                                            'shrink-0 rounded-full px-2.5 py-1 text-xs font-bold',
                                            item.credits === null
                                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                                                : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                                        )}>
                                            {item.credits === null ? '?' : `${item.credits} cr`}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </MotionDiv>
                )}
            </AnimatePresence>
        </div>
    );
}
