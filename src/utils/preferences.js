export const STORAGE_KEYS = {
    lastStudentId: 'sv_last_student_id_v1',
};

function safeGetItem(key) {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return null;
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeSetItem(key, value) {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return;
        window.localStorage.setItem(key, value);
    } catch {
        // Fail silently when storage is unavailable.
    }
}

export function getSavedStudentId() {
    const value = safeGetItem(STORAGE_KEYS.lastStudentId);
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed || null;
}

export function setSavedStudentId(studentId) {
    const trimmed = (studentId || '').trim();
    if (!trimmed) return;
    safeSetItem(STORAGE_KEYS.lastStudentId, trimmed);
}
