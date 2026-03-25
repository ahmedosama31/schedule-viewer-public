import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

export function SearchForm({ onSearch, loading, semester, initialQuery = '', compact = false }) {
    const [query, setQuery] = useState(initialQuery);

    const handleSubmit = (e) => {
        e.preventDefault();
        const trimmed = query.trim();
        if (!trimmed) return;
        onSearch(trimmed, semester);
    };

    if (compact) {
        return (
            <form onSubmit={handleSubmit} className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1">
                        <Input
                            id="student-id"
                            placeholder="Search another student ID"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={20}
                            autoComplete="off"
                            autoFocus
                            className="h-11 rounded-2xl border-zinc-200/90 bg-white/90 px-4 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70"
                        />
                    </div>
                    <Button
                        type="submit"
                        disabled={loading || !query.trim()}
                        className="min-h-11 shrink-0 rounded-2xl px-4 py-2.5 text-sm"
                    >
                        {loading ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <Search size={18} />
                        )}
                        {loading ? 'Searching...' : 'Update'}
                    </Button>
                </div>
            </form>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-3xl">
                    Find your classes instantly
                </h1>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                    <Input
                        id="student-id"
                        label="Student ID"
                        placeholder="e.g. 1240923"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={20}
                        autoComplete="off"
                        autoFocus
                        className="h-12 rounded-2xl border-zinc-200/90 bg-white/90 px-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70"
                    />
                </div>
                <Button
                    type="submit"
                    disabled={loading || !query.trim()}
                    className="min-h-12 shrink-0 rounded-2xl px-5 py-3 text-sm sm:text-base"
                >
                    {loading ? (
                        <Loader2 size={18} className="animate-spin" />
                    ) : (
                        <Search size={18} />
                    )}
                    {loading ? 'Searching...' : 'Show Schedule'}
                </Button>
            </div>
        </form>
    );
}
