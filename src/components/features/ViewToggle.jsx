import { List, CalendarDays } from 'lucide-react';
import clsx from 'clsx';

export function ViewToggle({ view, onViewChange }) {
    const baseClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl px-3.5 py-2 text-sm font-semibold transition-all';

    return (
        <div className="flex items-center justify-center">
            <div className="inline-flex items-center gap-1 rounded-2xl border border-zinc-200/80 bg-white/75 p-1 shadow-sm backdrop-blur dark:border-zinc-700/80 dark:bg-zinc-950/70">
                <button
                    type="button"
                    onClick={() => onViewChange('list')}
                    className={clsx(
                        baseClass,
                        'min-w-[88px]',
                        view === 'list'
                            ? 'bg-gradient-to-r from-indigo-600 to-cyan-500 text-white shadow-[0_8px_24px_rgba(79,70,229,0.28)]'
                            : 'text-zinc-500 hover:text-indigo-700 dark:text-zinc-400 dark:hover:text-cyan-100'
                    )}
                >
                    <List size={14} />
                    List
                </button>
                <button
                    type="button"
                    onClick={() => onViewChange('calendar')}
                    className={clsx(
                        baseClass,
                        'min-w-[102px]',
                        view === 'calendar'
                            ? 'bg-zinc-900 text-white shadow dark:bg-zinc-100 dark:text-zinc-950'
                            : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100'
                    )}
                >
                    <CalendarDays size={14} />
                    Calendar
                </button>
            </div>
        </div>
    );
}
