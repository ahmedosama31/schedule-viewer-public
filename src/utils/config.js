const DEFAULT_API_BASE_URL = 'https://osa316.pythonanywhere.com';

const normalizeBaseUrl = (value) => (value || '').trim().replace(/\/+$/, '');

export const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL) || DEFAULT_API_BASE_URL;
