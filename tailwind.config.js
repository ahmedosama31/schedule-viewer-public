/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: '#18181b', // zinc-900
                    hover: '#27272a',   // zinc-800
                    soft: '#f4f4f5',    // zinc-100
                },
                dark: {
                    bg: '#09090b',      // zinc-950
                    surface: '#18181b', // zinc-900
                    text: '#e4e4e7',    // zinc-200
                    muted: '#a1a1aa',   // zinc-400
                },
                light: {
                    bg: '#fafafa',      // zinc-50
                    surface: '#ffffff',
                    text: '#18181b',    // zinc-900
                    muted: '#52525b',   // zinc-600
                }
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease-out forwards',
                'slide-up': 'slideUp 0.5s ease-out forwards',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { opacity: '0', transform: 'translateY(20px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                }
            }
        },
    },
    plugins: [],
}
