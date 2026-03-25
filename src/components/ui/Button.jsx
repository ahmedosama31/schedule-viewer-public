import { motion } from 'framer-motion';
import { twMerge } from 'tailwind-merge';

const MotionButton = motion.button;

export function Button({ children, className, variant = 'primary', ...props }) {
    const baseStyles = 'px-6 py-3 rounded-full font-semibold shadow-lg transition-all duration-300 flex items-center justify-center gap-2';

    const variants = {
        primary: 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-[0_10px_24px_rgba(79,70,229,0.20)] dark:bg-indigo-500 dark:hover:bg-indigo-400',
        secondary: 'border border-indigo-100 bg-white/85 text-indigo-700 hover:bg-indigo-50 shadow-sm dark:border-indigo-900/50 dark:bg-zinc-900/85 dark:text-cyan-100 dark:hover:bg-zinc-800',
        ghost: 'bg-transparent text-zinc-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-cyan-100',
    };

    return (
        <MotionButton
            whileHover={{ scale: 1.04, translateY: -2 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
            className={twMerge(baseStyles, variants[variant], className)}
            {...props}
        >
            {children}
        </MotionButton>
    );
}
