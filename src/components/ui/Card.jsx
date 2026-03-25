import { motion } from 'framer-motion';
import { twMerge } from 'tailwind-merge';

const MotionDiv = motion.div;

export function Card({ children, className, delay = 0, hoverLift = true, ...props }) {
    return (
        <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={hoverLift ? { scale: 1.01, y: -3 } : undefined}
            transition={{ duration: 0.4, delay, ease: 'easeOut' }}
            className={twMerge(
                'rounded-2xl border p-6 transition-all duration-300',
                'border-white/70 bg-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur',
                'dark:border-zinc-800 dark:bg-zinc-950/75 dark:shadow-[0_12px_40px_rgba(2,6,23,0.45)]',
                hoverLift && 'hover:border-indigo-100 hover:shadow-[0_14px_32px_rgba(99,102,241,0.08)] dark:hover:border-indigo-900/40 dark:hover:shadow-[0_14px_36px_rgba(8,47,73,0.22)]',
                className
            )}
            {...props}
        >
            {children}
        </MotionDiv>
    );
}
