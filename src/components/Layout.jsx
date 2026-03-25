import { useEffect, useState } from 'react';
import { fetchIndexLastUpdated } from '../utils/api';

export function Layout({ children }) {
    const [lastUpdated, setLastUpdated] = useState(null);

    useEffect(() => {
        fetchIndexLastUpdated().then(date => {
            setLastUpdated(date);
        });
    }, []);

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.08),_transparent_22%),radial-gradient(circle_at_85%_10%,_rgba(34,211,238,0.06),_transparent_18%),linear-gradient(to_bottom,_#fafcff,_#ffffff)] text-zinc-900 dark:bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.12),_transparent_24%),radial-gradient(circle_at_85%_10%,_rgba(34,211,238,0.08),_transparent_20%),linear-gradient(to_bottom,_#05070c,_#0a0d14)] dark:text-zinc-100 flex flex-col">
            <header className="glass-header sticky top-0 z-50 border-b border-white/50 dark:border-zinc-800/80">
                <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
                    <a href="/" className="flex min-w-0 items-center gap-3 group">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-indigo-100/80 bg-gradient-to-br from-white to-cyan-50 shadow-sm backdrop-blur dark:border-cyan-900/30 dark:bg-gradient-to-br dark:from-zinc-900 dark:to-cyan-950/40">
                            <img
                                src="/schedule-icon.svg"
                                alt="Schedule Viewer icon"
                                className="h-6 w-6 flex-shrink-0"
                            />
                        </div>
                        <div className="min-w-0">
                            <div className="truncate text-base font-semibold tracking-tight text-zinc-950 transition-opacity group-hover:opacity-80 dark:text-zinc-50 sm:text-lg">
                                Schedule Viewer
                            </div>
                            <div className="truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400 sm:text-xs">
                                By Ahmed Osama
                            </div>
                        </div>
                    </a>

                </div>
            </header>

            <main className="flex-1 px-4 py-5 sm:px-6 sm:py-8">
                <div className="mx-auto max-w-6xl">
                    {children}
                </div>
            </main>

            <footer className="px-4 pb-6 pt-2 sm:px-6">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/60 bg-white/75 px-4 py-3 text-center text-sm text-zinc-500 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-500">
                    <span className="font-medium text-zinc-600 dark:text-zinc-400">Schedule Viewer</span>
                    {lastUpdated && (
                        <>
                            <span className="hidden text-zinc-300 dark:text-zinc-700 sm:inline">•</span>
                            <span className="text-xs">
                                Data updated {lastUpdated.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                        </>
                    )}
                </div>
            </footer>
        </div>
    );
}
