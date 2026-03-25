import { twMerge } from 'tailwind-merge';

export function Input({ label, className, id, ...props }) {
    return (
        <div className="relative group">
            {label && (
                <label
                    htmlFor={id}
                    className="mb-1 ml-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                    {label}
                </label>
            )}
            <div className="rounded-xl transition-shadow duration-300 focus-within:shadow-[0_0_0_4px_rgba(59,130,246,0.10),0_8px_28px_rgba(79,70,229,0.18)]">
                <input
                    id={id}
                    className={twMerge(
                        'w-full rounded-xl border border-zinc-200/90 bg-white text-zinc-900',
                        'px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white',
                        'transition-all duration-300 focus:border-cyan-400 focus:outline-none dark:focus:border-cyan-500',
                        'placeholder:text-zinc-400 dark:placeholder:text-zinc-500 hover:border-indigo-300 dark:hover:border-indigo-700',
                        className
                    )}
                    {...props}
                />
            </div>
        </div>
    );
}
