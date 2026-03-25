import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { motion } from 'framer-motion';
import { API_BASE_URL } from '../../utils/config';

const MotionDiv = motion.div;
const MotionP = motion.p;

const RESOLVED_NAMES_CACHE_KEY = 'sv_admin_resolved_names_v1';
const FEATURE_LABELS = {
    view_calendar: 'Calendar View',
    view_list: 'List View',
    timing_toggle: 'Timing Toggle',
    share_click: 'Share',
    download_click: 'Download',
    export_image: 'Export Image',
};
const ANALYTICS_WINDOW_OPTIONS = [
    { value: '30', label: 'Last 30 Days' },
    { value: 'all', label: 'ALL' },
];
const ADMIN_SECTIONS = [
    { key: 'analytics', label: 'Analytics' },
    { key: 'activity', label: 'Activity' },
];
const EMPTY_ARRAY = [];
const DEFAULT_FEATURE_KEYS = Object.keys(FEATURE_LABELS);
const IP_FOCUS_HIGHLIGHT_MS = 8000;

function toEpochMs(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
}

function formatPercent(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
    return `${value.toFixed(2)}%`;
}

function formatLatency(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
    return `${value.toFixed(2)} ms`;
}

function formatHourRange(hour) {
    const safeHour = Number.isInteger(hour) ? hour : 0;
    const padded = String(safeHour).padStart(2, '0');
    return `${padded}:00 - ${padded}:59`;
}

function normalizeResolvedEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    return {
        loading: false,
        found: Boolean(entry.found),
        nameEn: typeof entry.nameEn === 'string' ? entry.nameEn : '',
        nameAr: typeof entry.nameAr === 'string' ? entry.nameAr : '',
    };
}

function loadResolvedNamesCache() {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return {};
        const raw = window.localStorage.getItem(RESOLVED_NAMES_CACHE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const normalized = {};
        for (const [studentId, entry] of Object.entries(parsed)) {
            const safeEntry = normalizeResolvedEntry(entry);
            if (safeEntry) normalized[studentId] = safeEntry;
        }
        return normalized;
    } catch {
        return {};
    }
}

function persistResolvedNamesCache(resolvedNames) {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return;
        const persistable = {};
        for (const [studentId, entry] of Object.entries(resolvedNames || {})) {
            const safeEntry = normalizeResolvedEntry(entry);
            if (safeEntry) persistable[studentId] = safeEntry;
        }
        window.localStorage.setItem(RESOLVED_NAMES_CACHE_KEY, JSON.stringify(persistable));
    } catch {
        // Ignore storage failures.
    }
}

export function Admin() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);
    const [deletingLogId, setDeletingLogId] = useState(null);
    const [deletingIp, setDeletingIp] = useState(null);
    // 'ip' = grouped by IP (default), 'time' = flat chronological
    const [sortMode, setSortMode] = useState('ip');
    const [searchQuery, setSearchQuery] = useState('');
    const [focusedIp, setFocusedIp] = useState('');
    const [pendingJumpIp, setPendingJumpIp] = useState('');
    const [ipLimit, setIpLimit] = useState(50);
    const [timeLimit, setTimeLimit] = useState(100);
    const [analyticsWindow, setAnalyticsWindow] = useState('30');
    const [selectedDayKey, setSelectedDayKey] = useState('');
    const [analytics, setAnalytics] = useState(null);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);
    const [analyticsError, setAnalyticsError] = useState('');
    const [showJumpTop, setShowJumpTop] = useState(false);
    const [isTopQueriesExpanded, setIsTopQueriesExpanded] = useState(false);
    const [expandedIps, setExpandedIps] = useState({});
    const deferredSearchQuery = useDeferredValue(searchQuery);
    // Map of studentId -> { nameEn, nameAr, loading, found }
    const [resolvedNames, setResolvedNames] = useState(() => loadResolvedNamesCache());
    const resolvedNamesRef = useRef(resolvedNames);
    const ipSectionRefs = useRef({});

    const adminEndpoint = `${API_BASE_URL}/admin/logs`;
    const resolveEndpoint = `${API_BASE_URL}/admin/resolve-id`;
    const analyticsEndpoint = `${API_BASE_URL}/admin/analytics`;
    const sectionRaw = (searchParams.get('section') || 'analytics').trim().toLowerCase();
    const activeSection = sectionRaw === 'activity' ? 'activity' : 'analytics';

    const setAdminSection = (section) => {
        const safeSection = section === 'activity' ? 'activity' : 'analytics';
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('section', safeSection);
        setSearchParams(nextParams);
    };

    useEffect(() => {
        resolvedNamesRef.current = resolvedNames;
        persistResolvedNamesCache(resolvedNames);
    }, [resolvedNames]);

    useEffect(() => {
        if (sectionRaw === 'analytics' || sectionRaw === 'activity') return;
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('section', 'analytics');
        setSearchParams(nextParams, { replace: true });
    }, [sectionRaw, searchParams, setSearchParams]);

    const resolveId = async (studentId, authPassword, force = false) => {
        if (!studentId || !authPassword) return;

        const existing = resolvedNamesRef.current[studentId];
        if (!force && existing && !existing.loading) return;

        setResolvedNames(prev => ({
            ...prev,
            [studentId]: { ...(prev[studentId] || {}), loading: true }
        }));

        try {
            const response = await fetch(
                `${resolveEndpoint}?id=${encodeURIComponent(studentId)}`,
                { headers: { 'X-Admin-Password': authPassword } }
            );
            if (!response.ok) throw new Error('Failed to resolve ID');
            const data = await response.json();
            setResolvedNames(prev => ({
                ...prev,
                [studentId]: {
                    loading: false,
                    found: Boolean(data.found),
                    nameEn: data.nameEn || '',
                    nameAr: data.nameAr || '',
                }
            }));
        } catch {
            setResolvedNames(prev => ({
                ...prev,
                [studentId]: existing
                    ? { ...existing, loading: false }
                    : { loading: false, found: false, nameEn: '', nameAr: '' }
            }));
        }
    };

    const resolveAll = async (logsToResolve = logs, authPassword = password.trim(), force = false) => {
        const uniqueIds = [...new Set((logsToResolve || []).map(l => l.query).filter(Boolean))];
        for (const id of uniqueIds) {
            await resolveId(id, authPassword, force);
        }
    };

    const LOG_FETCH_LIMIT = 100000;

    const loadLogs = async (authPassword = password.trim()) => {
        if (!authPassword) return [];
        setIsLoading(true);
        try {
            const response = await fetch(`${adminEndpoint}?limit=${LOG_FETCH_LIMIT}`, {
                headers: { 'X-Admin-Password': authPassword }
            });
            if (!response.ok) throw new Error('Failed to fetch logs');
            const data = await response.json();
            const nextLogs = data.logs || [];
            setLogs(nextLogs);
            void resolveAll(nextLogs, authPassword);
            return nextLogs;
        } catch (error) {
            console.error('Error loading logs:', error);
            alert('Failed to load logs. Please check your connection.');
            return [];
        } finally {
            setIsLoading(false);
        }
    };

    const loadAnalytics = async (authPassword = password.trim(), windowMode = analyticsWindow) => {
        if (!authPassword) return null;
        setAnalyticsLoading(true);
        setAnalyticsError('');
        try {
            const tzOffsetMin = -new Date().getTimezoneOffset();
            const response = await fetch(
                `${analyticsEndpoint}?window=${encodeURIComponent(windowMode)}&tz_offset_min=${tzOffsetMin}`,
                { headers: { 'X-Admin-Password': authPassword } }
            );
            if (!response.ok) throw new Error('Failed to fetch analytics');
            const data = await response.json();
            setAnalytics(data);
            return data;
        } catch (error) {
            console.error('Error loading analytics:', error);
            setAnalyticsError('Failed to load analytics.');
            return null;
        } finally {
            setAnalyticsLoading(false);
        }
    };

    const handleRefreshActiveSection = async () => {
        if (activeSection === 'activity') {
            setPendingJumpIp('');
            setFocusedIp('');
            await loadLogs(password.trim());
            return;
        }
        await loadAnalytics(password.trim(), analyticsWindow);
    };

    useEffect(() => {
        if (!isAuthenticated) return;
        void loadLogs(password.trim());
    }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!isAuthenticated) return;
        void loadAnalytics(password.trim(), analyticsWindow);
    }, [analyticsWindow, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const days = (analytics?.trends?.searchesByDay || EMPTY_ARRAY)
            .map(item => item.key)
            .filter(Boolean)
            .sort();

        if (!days.length) {
            if (selectedDayKey) setSelectedDayKey('');
            return;
        }

        if (selectedDayKey && days.includes(selectedDayKey)) return;

        const todayKey = analytics?.kpis?.adoptionRatesToday?.dayKey || analytics?.kpis?.idStats?.today?.dayKey || '';
        if (todayKey && days.includes(todayKey)) {
            setSelectedDayKey(todayKey);
            return;
        }

        setSelectedDayKey(days[days.length - 1]);
    }, [analytics, selectedDayKey]);

    useEffect(() => {
        const onScroll = () => {
            const y = window.scrollY || document.documentElement.scrollTop || 0;
            setShowJumpTop(y > 500);
        };

        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const handleLogin = async () => {
        const trimmed = password.trim();
        if (!trimmed) {
            setLoginError('Please enter the admin password.');
            return;
        }
        setLoginLoading(true);
        setLoginError('');
        try {
            const response = await fetch(`${adminEndpoint}?limit=1`, {
                headers: { 'X-Admin-Password': trimmed }
            });
            if (response.ok) {
                setPassword(trimmed);
                setIsAuthenticated(true);
            } else if (response.status === 401 || response.status === 403) {
                setLoginError('Incorrect password. Please try again.');
            } else {
                setLoginError('Server error. Please try again later.');
            }
        } catch {
            setLoginError('Could not reach the server. Check your connection.');
        } finally {
            setLoginLoading(false);
        }
    };

    const deleteLog = async (log) => {
        if (!log?.id) return;
        if (!window.confirm('Are you sure you want to permanently delete this log?')) return;
        setDeletingLogId(log.id);
        try {
            const res = await fetch(`${adminEndpoint}?id=${log.id}`, {
                method: 'DELETE',
                headers: { 'X-Admin-Password': password.trim() }
            });
            if (res.ok) {
                setLogs(prev => prev.filter(l => l.id !== log.id));
            } else {
                alert('Failed to delete log.');
            }
        } catch {
            alert('Error deleting log.');
        } finally {
            setDeletingLogId(null);
        }
    };

    const deleteIpLogs = async (ip) => {
        if (!ip) return;
        if (!window.confirm(`Are you sure you want to permanently delete all logs from IP ${ip}?`)) return;
        setDeletingIp(ip);
        try {
            const res = await fetch(`${adminEndpoint}?ip=${ip}`, {
                method: 'DELETE',
                headers: { 'X-Admin-Password': password.trim() }
            });
            if (res.ok) {
                setLogs(prev => prev.filter(l => l.ip !== ip));
            } else {
                alert('Failed to delete IP logs.');
            }
        } catch {
            alert('Error deleting IP logs.');
        } finally {
            setDeletingIp(null);
        }
    };

    const normalizedSearchQuery = useMemo(
        () => deferredSearchQuery.trim().toLowerCase(),
        [deferredSearchQuery]
    );

    // Filter logs by search query (ID, IP, semester, resolved English name, or Arabic name)
    const filteredLogs = useMemo(() => {
        if (!normalizedSearchQuery) return logs;
        return logs.filter(log => {
            if ((log.query || '').toLowerCase().includes(normalizedSearchQuery)) return true;
            if ((log.ip || '').toLowerCase().includes(normalizedSearchQuery)) return true;
            if ((log.semester || '').toLowerCase().includes(normalizedSearchQuery)) return true;
            const resolved = resolvedNames[log.query];
            if (resolved?.found) {
                if (resolved.nameEn.toLowerCase().includes(normalizedSearchQuery)) return true;
                if (resolved.nameAr.toLowerCase().includes(normalizedSearchQuery)) return true;
            }
            return false;
        });
    }, [logs, normalizedSearchQuery, resolvedNames]);

    const matchedIpSummaries = useMemo(() => {
        const query = normalizedSearchQuery;
        if (!query || !filteredLogs.length) return EMPTY_ARRAY;

        const grouped = {};
        filteredLogs.forEach(log => {
            const ip = log.ip || 'unknown';
            const ts = toEpochMs(log.timestamp);
            if (!grouped[ip]) {
                grouped[ip] = {
                    ip,
                    count: 0,
                    latest: 0,
                    uniqueQueries: new Set(),
                };
            }
            grouped[ip].count += 1;
            if (ts > grouped[ip].latest) grouped[ip].latest = ts;
            if (log.query) grouped[ip].uniqueQueries.add(log.query);
        });

        return Object.values(grouped)
            .map(item => ({
                ip: item.ip,
                count: item.count,
                latest: item.latest,
                uniqueQueries: item.uniqueQueries.size,
            }))
            .sort((a, b) => b.count - a.count || b.latest - a.latest);
    }, [normalizedSearchQuery, filteredLogs]);

    const stats = useMemo(() => {
        if (!filteredLogs.length) return null;
        const queryCounts = {};
        const ipCounts = {};
        filteredLogs.forEach(entry => {
            const q = entry.query || '(empty)';
            const ip = entry.ip || 'unknown';
            queryCounts[q] = (queryCounts[q] || 0) + 1;
            ipCounts[ip] = (ipCounts[ip] || 0) + 1;
        });
        return {
            topQueries: Object.entries(queryCounts).map(([q, c]) => ({ query: q, count: c })).sort((a, b) => b.count - a.count),
            topIPs: Object.entries(ipCounts).map(([ip, c]) => ({ ip, count: c })).sort((a, b) => b.count - a.count),
        };
    }, [filteredLogs]);
    const topQueries = stats?.topQueries?.slice(0, 15) || EMPTY_ARRAY;
    const topQueryLeader = topQueries[0] || null;

    const analyticsKpis = analytics?.kpis || null;
    const analyticsTrends = analytics?.trends || null;
    const searchesByDay = analyticsTrends?.searchesByDay || EMPTY_ARRAY;
    const searchesByHour = analyticsTrends?.searchesByHour || EMPTY_ARRAY;
    const searchesByHourByDay = analyticsTrends?.searchesByHourByDay || EMPTY_ARRAY;
    const featureRatesByDay = analyticsTrends?.featureRatesByDay || EMPTY_ARRAY;
    const idStatsByDay = analyticsTrends?.idStatsByDay || EMPTY_ARRAY;
    const featureKeys = analyticsTrends?.features || DEFAULT_FEATURE_KEYS;
    const idStatsKpis = analyticsKpis?.idStats || null;

    const availableDays = useMemo(
        () => [...searchesByDay].sort((a, b) => (a.key || '').localeCompare(b.key || '')),
        [searchesByDay]
    );
    const availableDayKeys = useMemo(() => availableDays.map(item => item.key), [availableDays]);
    const selectedDayIndex = useMemo(
        () => availableDayKeys.findIndex(key => key === selectedDayKey),
        [availableDayKeys, selectedDayKey]
    );
    const canGoPrevDay = selectedDayIndex > 0;
    const canGoNextDay = selectedDayIndex >= 0 && selectedDayIndex < availableDayKeys.length - 1;

    const searchesByDayMap = useMemo(
        () => Object.fromEntries(searchesByDay.map(item => [item.key, item])),
        [searchesByDay]
    );
    const searchesByHourByDayMap = useMemo(
        () => Object.fromEntries(searchesByHourByDay.map(item => [item.key, item])),
        [searchesByHourByDay]
    );
    const featureRatesByDayMap = useMemo(
        () => Object.fromEntries(featureRatesByDay.map(item => [item.key, item])),
        [featureRatesByDay]
    );
    const idStatsByDayMap = useMemo(
        () => Object.fromEntries(idStatsByDay.map(item => [item.key, item])),
        [idStatsByDay]
    );

    const selectedSearchDay = searchesByDayMap[selectedDayKey] || null;
    const selectedHourlyDay = searchesByHourByDayMap[selectedDayKey] || null;
    const selectedFeatureDay = featureRatesByDayMap[selectedDayKey] || null;
    const selectedIdDay = idStatsByDayMap[selectedDayKey] || null;
    const selectedDayLabel = selectedSearchDay?.label || selectedHourlyDay?.label || selectedFeatureDay?.label || selectedIdDay?.label || 'N/A';

    const currentHourlyBuckets = selectedHourlyDay?.hours || searchesByHour;

    const selectedAdoptionDenominator = selectedFeatureDay?.sessions ?? 0;
    const selectedAdoptionFeatures = useMemo(() => {
        const mapped = {};
        featureKeys.forEach(feature => {
            mapped[feature] = {
                sessions: selectedFeatureDay?.counts?.[feature] ?? 0,
                rate: selectedFeatureDay?.rates?.[feature] ?? null,
            };
        });
        return mapped;
    }, [selectedFeatureDay, featureKeys]);

    const selectedIdStats = selectedIdDay || {
        uniqueIds: 0,
        newUniqueIds: 0,
        returningUniqueIds: 0,
    };

    const maxDailySearchCount = useMemo(
        () => Math.max(1, ...searchesByDay.map(item => item.count || 0)),
        [searchesByDay]
    );

    const searchesByDayRecentFirst = useMemo(
        () => [...searchesByDay].sort((a, b) => (b.key || '').localeCompare(a.key || '')),
        [searchesByDay]
    );

    const idStatsByDayRecentFirst = useMemo(
        () => [...idStatsByDay].sort((a, b) => (b.key || '').localeCompare(a.key || '')),
        [idStatsByDay]
    );

    const maxHourlySearchCount = useMemo(
        () => Math.max(1, ...currentHourlyBuckets.map(item => item.count || 0)),
        [currentHourlyBuckets]
    );

    const maxIdUniqueCount = useMemo(
        () => Math.max(1, ...idStatsByDay.map(item => item.uniqueIds || 0)),
        [idStatsByDay]
    );

    const logsByIP = useMemo(() => {
        const grouped = {};
        filteredLogs.forEach(log => {
            const ip = log.ip || 'unknown';
            if (!grouped[ip]) grouped[ip] = [];
            grouped[ip].push(log);
        });
        Object.values(grouped).forEach(list => list.sort((a, b) => toEpochMs(b.timestamp) - toEpochMs(a.timestamp)));
        return grouped;
    }, [filteredLogs]);

    const sortedIPs = useMemo(() =>
        Object.keys(logsByIP).sort((a, b) => toEpochMs(logsByIP[b]?.[0]?.timestamp) - toEpochMs(logsByIP[a]?.[0]?.timestamp)),
        [logsByIP]
    );
    const showInitialLogsLoading = isLoading && logs.length === 0;

    const visibleIpList = useMemo(() => {
        if (!sortedIPs.length) return EMPTY_ARRAY;

        const firstChunk = sortedIPs.slice(0, ipLimit);
        if (!focusedIp || firstChunk.includes(focusedIp) || !sortedIPs.includes(focusedIp)) {
            return firstChunk;
        }

        const rest = sortedIPs
            .filter(ip => ip !== focusedIp)
            .slice(0, Math.max(ipLimit - 1, 0));

        return [focusedIp, ...rest];
    }, [sortedIPs, ipLimit, focusedIp]);

    // Flat list sorted by time (newest first)
    const logsByTime = useMemo(() =>
        [...filteredLogs].sort((a, b) => toEpochMs(b.timestamp) - toEpochMs(a.timestamp)),
        [filteredLogs]
    );

    const formatDateTime = (ts) => {
        const parsed = toEpochMs(ts);
        return parsed ? new Date(parsed).toLocaleString() : 'Unknown';
    };

    const openIpActivity = (ip) => {
        if (!ip) return;
        if (activeSection !== 'activity') setAdminSection('activity');
        setFocusedIp(ip);
        setPendingJumpIp(ip);
        setSortMode('ip');
        if (searchQuery.trim()) {
            setSearchQuery('');
        }
    };

    const handleSearchQueryChange = (nextValue) => {
        const hasQuery = nextValue.trim().length > 0;
        if (hasQuery) {
            setIpLimit(50);
            setTimeLimit(100);
            setFocusedIp('');
            setPendingJumpIp('');
        }
        setSearchQuery(nextValue);
    };

    const jumpToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const toggleIpExpanded = (ip) => {
        if (!ip) return;
        setExpandedIps(prev => ({ ...prev, [ip]: !prev[ip] }));
    };

    const selectPreviousDay = () => {
        if (!canGoPrevDay) return;
        setSelectedDayKey(availableDayKeys[selectedDayIndex - 1]);
    };

    const selectNextDay = () => {
        if (!canGoNextDay) return;
        setSelectedDayKey(availableDayKeys[selectedDayIndex + 1]);
    };

    // Reset pagination when search changes
    useEffect(() => {
        setIpLimit(50);
        setTimeLimit(100);
        if (searchQuery.trim()) {
            setFocusedIp('');
            setPendingJumpIp('');
        }
    }, [searchQuery]);

    useEffect(() => {
        if (!pendingJumpIp || sortMode !== 'ip' || activeSection !== 'activity') return;

        const target = ipSectionRefs.current[pendingJumpIp];
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        // Always consume pending jumps so they cannot fire unexpectedly later (e.g. after refresh).
        setPendingJumpIp('');
    }, [pendingJumpIp, sortMode, visibleIpList, activeSection]);

    useEffect(() => {
        if (!focusedIp) return;

        const timeoutId = setTimeout(() => {
            setFocusedIp(current => (current === focusedIp ? '' : current));
        }, IP_FOCUS_HIGHLIGHT_MS);

        return () => clearTimeout(timeoutId);
    }, [focusedIp]);

    const NameBadge = ({ studentId }) => {
        const resolved = resolvedNames[studentId];
        if (!resolved) return <span className="text-xs text-gray-400 italic">Resolving...</span>;
        if (resolved.loading) return <span className="text-xs text-gray-400 italic">Resolving...</span>;
        if (!resolved.found) return <span className="text-xs text-gray-400 italic">Not found</span>;
        return (
            <span className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                {resolved.nameEn}{resolved.nameAr ? ` · ${resolved.nameAr}` : ''}
            </span>
        );
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center px-4">
                <Card className="max-w-md w-full">
                    <h1 className="text-2xl font-bold mb-2 text-center text-zinc-900 dark:text-zinc-100">Admin Login</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center mb-6">
                        Password is verified against the server.
                    </p>
                    <div className="space-y-4">
                        <Input
                            type="password"
                            label="Password"
                            value={password}
                            onChange={e => { setPassword(e.target.value); setLoginError(''); }}
                            onKeyDown={e => e.key === 'Enter' && !loginLoading && handleLogin()}
                            placeholder="Enter admin password"
                            autoFocus
                        />
                        {loginError && (
                            <MotionP
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-sm text-red-600 dark:text-red-400 text-center"
                            >
                                {loginError}
                            </MotionP>
                        )}
                        <Button onClick={handleLogin} className="w-full" disabled={loginLoading}>
                            {loginLoading ? 'Verifying...' : 'Login'}
                        </Button>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 py-8 px-4">
            <div className="container mx-auto max-w-5xl">
                <MotionDiv initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
                    <h1 className="text-3xl font-bold mb-1">Viewer Logs</h1>
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm">Search activity from Schedule Viewer</p>
                </MotionDiv>

                <Card className="mb-6">
                    <div className="inline-flex rounded-xl border border-zinc-200 dark:border-zinc-800 p-1 bg-zinc-50 dark:bg-zinc-900">
                        {ADMIN_SECTIONS.map(section => (
                            <button
                                key={section.key}
                                type="button"
                                onClick={() => setAdminSection(section.key)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                    activeSection === section.key
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                }`}
                            >
                                {section.label}
                            </button>
                        ))}
                    </div>
                </Card>

                {activeSection === 'activity' && (
                <Card className="mb-6">
                    <div className="flex flex-wrap gap-3 items-center">
                        <Button onClick={handleRefreshActiveSection} disabled={isLoading}>
                            {isLoading ? 'Loading...' : 'Refresh Activity'}
                        </Button>
                        {isLoading && (
                            <div className="inline-flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                                <span
                                    className="h-3.5 w-3.5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"
                                    aria-hidden="true"
                                />
                                Loading logs...
                            </div>
                        )}
                        {logs.length > 0 && (
                            <>
                                <Button
                                    variant="secondary"
                                    onClick={() => resolveAll(logs, password.trim(), true)}
                                    disabled={isLoading}
                                >
                                    Re-resolve IDs
                                </Button>
                                <span className="text-sm text-zinc-500">
                                    {searchQuery.trim()
                                        ? `${filteredLogs.length} of ${logs.length} searches`
                                        : `${logs.length} searches`
                                    } · {sortedIPs.length} unique IPs
                                </span>
                            </>
                        )}
                    </div>

                    {/* Sort & Archive controls */}
                    {logs.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 items-center">
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mr-1">Sort by:</span>
                            <button
                                onClick={() => setSortMode('ip')}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${sortMode === 'ip'
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                    }`}
                            >
                                IP
                            </button>
                            <button
                                onClick={() => setSortMode('time')}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${sortMode === 'time'
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                    }`}
                            >
                                Timing
                            </button>
                        </div>
                    )}

                    {/* Search filter */}
                    {logs.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => handleSearchQueryChange(e.target.value)}
                                placeholder="Search by ID, name, IP, or semester..."
                                className="w-full sm:max-w-sm px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                            {searchQuery.trim() && filteredLogs.length === 0 && (
                                <p className="text-xs text-zinc-400 mt-1">No logs match your search.</p>
                            )}
                            {searchQuery.trim() && matchedIpSummaries.length > 0 && (
                                <div className="mt-3 space-y-2">
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                        Matching IPs ({matchedIpSummaries.length}) · Jump to full IP activity
                                    </p>
                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                        {matchedIpSummaries.slice(0, 20).map(item => (
                                            <div
                                                key={item.ip}
                                                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800"
                                            >
                                                <div className="text-xs text-zinc-500 dark:text-zinc-400 flex flex-wrap items-center gap-2">
                                                    <span className="font-mono text-zinc-700 dark:text-zinc-200">{item.ip}</span>
                                                    <span>{item.count} matched logs</span>
                                                    <span>{item.uniqueQueries} unique IDs</span>
                                                    <span>Last: {formatDateTime(item.latest)}</span>
                                                </div>
                                                <Button
                                                    variant="secondary"
                                                    className="px-3 py-1 text-xs"
                                                    onClick={() => openIpActivity(item.ip)}
                                                >
                                                    Open IP Activity
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </Card>
                )}

                {activeSection === 'analytics' && (
                <Card className="mb-6">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                        <div>
                            <h2 className="text-lg font-bold">Analytics</h2>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Server-side KPIs and trends from all logs
                            </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                            {ANALYTICS_WINDOW_OPTIONS.map(option => (
                                <button
                                    key={option.value}
                                    onClick={() => setAnalyticsWindow(option.value)}
                                    disabled={analyticsLoading}
                                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${analyticsWindow === option.value
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                        }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                            <Button onClick={handleRefreshActiveSection} disabled={analyticsLoading}>
                                {analyticsLoading ? 'Loading...' : 'Refresh Analytics'}
                            </Button>
                        </div>
                    </div>

                    {analyticsError && (
                        <p className="text-sm text-red-500 dark:text-red-400 mb-3">{analyticsError}</p>
                    )}

                    {analyticsLoading && !analyticsKpis && (
                        <div className="space-y-3">
                            <div className="inline-flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                                <span
                                    className="h-4 w-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"
                                    aria-hidden="true"
                                />
                                Loading analytics...
                            </div>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                {Array.from({ length: 4 }).map((_, idx) => (
                                    <div
                                        key={`analytics-skeleton-${idx}`}
                                        className="h-20 rounded-xl bg-zinc-100 dark:bg-zinc-900 animate-pulse border border-zinc-100 dark:border-zinc-800"
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {analyticsKpis && (
                        <>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-3 border border-zinc-100 dark:border-zinc-800">
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Total Searches</p>
                                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{analyticsKpis.totalSearches}</p>
                                </div>
                                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-3 border border-zinc-100 dark:border-zinc-800">
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Success Rate</p>
                                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{formatPercent(analyticsKpis.successRate)}</p>
                                </div>
                                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-3 border border-zinc-100 dark:border-zinc-800">
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">No-result Rate</p>
                                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{formatPercent(analyticsKpis.noResultRate)}</p>
                                </div>
                                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-3 border border-zinc-100 dark:border-zinc-800">
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Visitors / Sessions</p>
                                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                                        {analyticsKpis.uniqueVisitors} / {analyticsKpis.uniqueSessions}
                                    </p>
                                </div>
                                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-3 border border-zinc-100 dark:border-zinc-800">
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Unique IDs (Window)</p>
                                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                                        {idStatsKpis?.uniqueIdsWindow ?? 0}
                                    </p>
                                </div>
                                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-3 border border-zinc-100 dark:border-zinc-800">
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Unique IDs (Selected Day)</p>
                                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                                        {selectedIdStats.uniqueIds ?? 0}
                                    </p>
                                </div>
                                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-3 border border-zinc-100 dark:border-zinc-800">
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">New Unique IDs (Selected Day)</p>
                                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                                        {selectedIdStats.newUniqueIds ?? 0}
                                    </p>
                                </div>
                                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-3 border border-zinc-100 dark:border-zinc-800">
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Returning Unique IDs (Selected Day)</p>
                                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                                        {selectedIdStats.returningUniqueIds ?? 0}
                                    </p>
                                </div>
                                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-3 border border-zinc-100 dark:border-zinc-800 col-span-2 lg:col-span-2">
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Client Latency (p50 / p95)</p>
                                    <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                                        {formatLatency(analyticsKpis.latency?.client?.p50)} / {formatLatency(analyticsKpis.latency?.client?.p95)}
                                    </p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                        Samples: {analyticsKpis.latency?.client?.samples ?? 0}
                                    </p>
                                </div>
                                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-3 border border-zinc-100 dark:border-zinc-800 col-span-2 lg:col-span-2">
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Server Latency (p50 / p95)</p>
                                    <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                                        {formatLatency(analyticsKpis.latency?.server?.p50)} / {formatLatency(analyticsKpis.latency?.server?.p95)}
                                    </p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                        Samples: {analyticsKpis.latency?.server?.samples ?? 0}
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-3 border border-zinc-100 dark:border-zinc-800 mb-5">
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                    <span className="font-semibold text-zinc-700 dark:text-zinc-200">Unique:</span> distinct IDs searched on selected day.{' '}
                                    <span className="font-semibold text-zinc-700 dark:text-zinc-200">New:</span> first-ever seen on selected day.{' '}
                                    <span className="font-semibold text-zinc-700 dark:text-zinc-200">Returning:</span> first seen before selected day and searched again on selected day.
                                </p>
                            </div>

                            {availableDayKeys.length > 0 && (
                                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-3 border border-zinc-100 dark:border-zinc-800 mb-5">
                                    <div className="flex items-center justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-semibold">Selected Day</p>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                                {selectedDayLabel} ({selectedDayKey || 'N/A'})
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={selectPreviousDay}
                                                disabled={!canGoPrevDay}
                                                className="px-2 py-1 rounded text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 disabled:opacity-40"
                                                aria-label="Previous day"
                                            >
                                                Prev
                                            </button>
                                            <button
                                                type="button"
                                                onClick={selectNextDay}
                                                disabled={!canGoNextDay}
                                                className="px-2 py-1 rounded text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 disabled:opacity-40"
                                                aria-label="Next day"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-4 border border-zinc-100 dark:border-zinc-800 mb-5">
                                <div className="flex items-center justify-between gap-2 mb-3">
                                    <div>
                                        <h3 className="text-sm font-semibold">Core Feature Adoption Rates</h3>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                            Day: {selectedDayLabel} ({selectedDayKey || 'N/A'})
                                        </p>
                                    </div>
                                </div>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                                    Session denominator: {selectedAdoptionDenominator}
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                                    {featureKeys.map(feature => {
                                        const featureStats = selectedAdoptionFeatures?.[feature];
                                        return (
                                            <div key={feature} className="rounded-lg bg-white dark:bg-zinc-950 p-2 border border-zinc-100 dark:border-zinc-800">
                                                <p className="text-xs text-zinc-500 dark:text-zinc-400">{FEATURE_LABELS[feature] || feature}</p>
                                                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                                    {formatPercent(featureStats?.rate)}
                                                </p>
                                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                                    Sessions: {featureStats?.sessions ?? 0}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-4 border border-zinc-100 dark:border-zinc-800">
                                    <h3 className="text-sm font-semibold mb-3">Searches by Day</h3>
                                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                        {searchesByDayRecentFirst.map(item => (
                                            <button
                                                key={item.key}
                                                type="button"
                                                onClick={() => setSelectedDayKey(item.key)}
                                                className={`w-full text-left p-1 rounded ${item.key === selectedDayKey ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
                                            >
                                                <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                                                    <span>{item.label}</span>
                                                    <span>{item.count}</span>
                                                </div>
                                                <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${item.key === selectedDayKey ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-indigo-500 dark:bg-indigo-400'}`}
                                                        style={{ width: `${(item.count / maxDailySearchCount) * 100}%` }}
                                                    />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-4 border border-zinc-100 dark:border-zinc-800">
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                        <h3 className="text-sm font-semibold">Searches by Hour</h3>
                                        <span className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                                            {selectedDayLabel} · {selectedHourlyDay?.total ?? selectedSearchDay?.count ?? 0} searches
                                        </span>
                                    </div>
                                    <div className="h-24 flex items-end gap-1">
                                        {currentHourlyBuckets.map(item => (
                                            <div key={item.hour} className="group flex-1 h-full flex items-end relative">
                                                <div
                                                    className="w-full rounded-t-sm bg-emerald-500/80 dark:bg-emerald-400/70"
                                                    style={{ height: `${Math.max((item.count / maxHourlySearchCount) * 100, item.count ? 8 : 2)}%` }}
                                                />
                                                <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 text-white opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap">
                                                    {formatHourRange(item.hour)} · {item.count}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-2 flex justify-between text-[10px] text-zinc-400">
                                        <span>00</span>
                                        <span>06</span>
                                        <span>12</span>
                                        <span>18</span>
                                        <span>23</span>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-4 border border-zinc-100 dark:border-zinc-800 mt-4">
                                <h3 className="text-sm font-semibold mb-3">ID Cohorts by Day</h3>
                                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                    {idStatsByDayRecentFirst.map(item => (
                                        <button
                                            key={item.key}
                                            type="button"
                                            onClick={() => setSelectedDayKey(item.key)}
                                            className={`w-full text-left p-1 rounded ${item.key === selectedDayKey ? 'bg-sky-50 dark:bg-sky-900/20' : ''}`}
                                        >
                                            <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                                                <span>{item.label}</span>
                                                <span>
                                                    Unique {item.uniqueIds ?? 0} · New {item.newUniqueIds ?? 0} · Returning {item.returningUniqueIds ?? 0}
                                                </span>
                                            </div>
                                            <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-500 ${item.key === selectedDayKey ? 'bg-sky-600 dark:bg-sky-400' : 'bg-sky-500 dark:bg-sky-400'}`}
                                                    style={{ width: `${((item.uniqueIds || 0) / maxIdUniqueCount) * 100}%` }}
                                                />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-4 border border-zinc-100 dark:border-zinc-800 mt-4">
                                <h3 className="text-sm font-semibold mb-3">Feature-rate Trends</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {featureKeys.map(feature => (
                                        <div key={feature} className="rounded-lg bg-white dark:bg-zinc-950 p-3 border border-zinc-100 dark:border-zinc-800">
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                                                {FEATURE_LABELS[feature] || feature}
                                            </p>
                                            <div className="h-20 flex items-end gap-1">
                                                {featureRatesByDay.map(item => {
                                                    const rate = item?.rates?.[feature];
                                                    const count = item?.counts?.[feature] ?? 0;
                                                    const isSelected = item?.key === selectedDayKey;
                                                    return (
                                                        <div key={`${feature}-${item.key}`} className="group flex-1 h-full flex items-end relative">
                                                            <div
                                                                className={`w-full rounded-t-sm ${isSelected ? 'bg-indigo-600/90 dark:bg-indigo-400/90' : 'bg-indigo-400/85 dark:bg-indigo-300/75'}`}
                                                                style={{ height: `${Math.max(typeof rate === 'number' ? rate : 0, rate ? 8 : 2)}%` }}
                                                            />
                                                            <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] px-1 py-0.5 rounded bg-zinc-900 text-white opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap">
                                                                {typeof rate === 'number' ? `${rate.toFixed(2)}%` : 'N/A'} · {count}/{item.sessions || 0}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </Card>
                )}

                {activeSection === 'activity' && (
                <>
                {/* Top queries */}
                {stats && (
                    <Card className="mb-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-bold">Top IDs Searched</h2>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {topQueries.length} most-searched IDs
                                    {topQueryLeader ? ` · #1 ${topQueryLeader.query} (${topQueryLeader.count})` : ''}
                                </p>
                            </div>
                            <button
                                onClick={() => setIsTopQueriesExpanded(prev => !prev)}
                                className="self-start sm:self-auto px-3 py-1 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                            >
                                {isTopQueriesExpanded ? 'Hide' : 'Expand'}
                            </button>
                        </div>
                        {isTopQueriesExpanded && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
                                {topQueries.map(item => (
                                    <div key={item.query} className="flex justify-between items-center p-2 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-mono text-sm text-zinc-800 dark:text-zinc-200">{item.query}</span>
                                            {resolvedNames[item.query]?.found && (
                                                <span className="text-xs text-zinc-500">{resolvedNames[item.query].nameEn}</span>
                                            )}
                                        </div>
                                        <span className="font-bold text-indigo-600 dark:text-indigo-400 ml-2">{item.count}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                )}

                {/* ── Sort by IP view ── */}
                {sortMode === 'ip' && sortedIPs.length > 0 && (
                    <Card hoverLift={false}>
                        <h2 className="text-lg font-bold mb-4">Activity by IP</h2>
                        <div className="space-y-6">
                            {visibleIpList.map((ip) => {
                                const ipLogs = logsByIP[ip];
                                const lastSeen = toEpochMs(ipLogs?.[0]?.timestamp);
                                const uniqueIds = new Set(ipLogs.map(l => l.query).filter(Boolean)).size;
                                const isDeletingIp = deletingIp === ip;
                                const isFocusedIp = focusedIp === ip;
                                const isIpExpanded = Boolean(expandedIps[ip]);
                                const hiddenLogCount = Math.max((ipLogs?.length || 0) - 1, 0);
                                const visibleIpLogs = isIpExpanded ? ipLogs : ipLogs.slice(0, 1);
                                return (
                                    <MotionDiv
                                        key={ip}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.12 }}
                                        ref={node => {
                                            if (node) ipSectionRefs.current[ip] = node;
                                            else delete ipSectionRefs.current[ip];
                                        }}
                                        className={`border-l-4 pl-4 py-1 border-indigo-400 rounded-r-md ${isFocusedIp ? 'bg-indigo-50/70 dark:bg-indigo-900/20' : ''}`}
                                    >
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-mono font-bold text-sm">{ip}</span>
                                                <span className="bg-indigo-500 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                                                    {ipLogs.length} searches
                                                </span>
                                                <span className="text-xs text-zinc-400">{uniqueIds} unique IDs</span>
                                                <span className="text-xs text-zinc-400">Last: {formatDateTime(lastSeen)}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {hiddenLogCount > 0 && (
                                                    <button
                                                        onClick={() => toggleIpExpanded(ip)}
                                                        className="px-3 py-1 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                                                    >
                                                        {isIpExpanded ? 'Collapse' : `Expand (${hiddenLogCount} more)`}
                                                    </button>
                                                )}
                                                <Button
                                                    variant="secondary"
                                                    className="px-3 py-1 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20 dark:text-red-400"
                                                    onClick={() => deleteIpLogs(ip)}
                                                    disabled={isDeletingIp}
                                                >
                                                    {isDeletingIp ? 'Deleting...' : 'Delete IP'}
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            {visibleIpLogs.map((log, idx) => {
                                                const isDeleting = deletingLogId === log.id;
                                                return (
                                                    <div key={log.id ?? `${ip}-${idx}`} className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm bg-zinc-50 dark:bg-zinc-900 p-2.5 rounded ${isDeleting ? 'opacity-50' : ''}`}>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="text-xs text-zinc-400 font-mono whitespace-nowrap">
                                                                {formatDateTime(log.timestamp)}
                                                            </span>
                                                            <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200">
                                                                {log.query || '(empty)'}
                                                            </span>
                                                            {log.query && <NameBadge studentId={log.query} />}
                                                            {log.semester && (
                                                                <span className="text-xs bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 px-1.5 py-0.5 rounded">
                                                                    {log.semester}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            className="px-2 py-1 text-xs shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                            onClick={() => deleteLog(log)}
                                                            disabled={isDeleting}
                                                        >
                                                            {isDeleting ? '...' : 'Delete'}
                                                        </Button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </MotionDiv>
                                );
                            })}
                        </div>
                        {sortedIPs.length > ipLimit && (
                            <div className="mt-4 flex items-center gap-3">
                                <button
                                    onClick={() => {
                                        setPendingJumpIp('');
                                        setFocusedIp('');
                                        setIpLimit(n => n + 50);
                                    }}
                                    className="px-4 py-1.5 rounded-full text-sm font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                                >
                                    Load 50 more
                                </button>
                                <span className="text-xs text-zinc-400">
                                    Showing {Math.min(ipLimit, sortedIPs.length)} of {sortedIPs.length} IPs
                                </span>
                                <button
                                    onClick={() => {
                                        setPendingJumpIp('');
                                        setFocusedIp('');
                                        setIpLimit(sortedIPs.length);
                                    }}
                                    className="text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                                >
                                    Show all
                                </button>
                            </div>
                        )}
                    </Card>
                )}

                {/* ── Sort by Timing view ── */}
                {sortMode === 'time' && logsByTime.length > 0 && (
                    <Card hoverLift={false}>
                        <h2 className="text-lg font-bold mb-4">Activity by Time</h2>
                        <div className="space-y-1.5">
                            {logsByTime.slice(0, timeLimit).map((log, idx) => {
                                const isDeleting = deletingLogId === log.id;
                                return (
                                    <MotionDiv
                                        key={log.id || idx}
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: Math.min(idx * 0.01, 0.3) }}
                                        className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm bg-zinc-50 dark:bg-zinc-900 p-2.5 rounded border-l-4 border-indigo-300 ${isDeleting ? 'opacity-50' : ''}`}
                                    >
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-xs text-zinc-400 font-mono whitespace-nowrap">
                                                {formatDateTime(log.timestamp)}
                                            </span>
                                            <span className="font-mono text-xs bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 px-1.5 py-0.5 rounded">
                                                {log.ip}
                                            </span>
                                            <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200">
                                                {log.query || '(empty)'}
                                            </span>
                                            {log.query && <NameBadge studentId={log.query} />}
                                            {log.semester && (
                                                <span className="text-xs bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 px-1.5 py-0.5 rounded">
                                                    {log.semester}
                                                </span>
                                            )}
                                        </div>
                                        <Button
                                            variant="ghost"
                                            className="px-2 py-1 text-xs shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                            onClick={() => deleteLog(log)}
                                            disabled={isDeleting}
                                        >
                                            {isDeleting ? '...' : 'Delete'}
                                        </Button>
                                    </MotionDiv>
                                );
                            })}
                        </div>
                        {logsByTime.length > timeLimit && (
                            <div className="mt-4 flex items-center gap-3">
                                <button
                                    onClick={() => setTimeLimit(n => n + 100)}
                                    className="px-4 py-1.5 rounded-full text-sm font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                                >
                                    Load 100 more
                                </button>
                                <span className="text-xs text-zinc-400">
                                    Showing {timeLimit} of {logsByTime.length} entries
                                </span>
                                <button
                                    onClick={() => setTimeLimit(logsByTime.length)}
                                    className="text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                                >
                                    Show all
                                </button>
                            </div>
                        )}
                    </Card>
                )}

                {showInitialLogsLoading && (
                    <Card hoverLift={false} className="mb-6">
                        <div className="inline-flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                            <span
                                className="h-4 w-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"
                                aria-hidden="true"
                            />
                            Loading activity logs...
                        </div>
                        <div className="mt-4 space-y-2">
                            {Array.from({ length: 6 }).map((_, idx) => (
                                <div
                                    key={`logs-skeleton-${idx}`}
                                    className="h-10 rounded-lg bg-zinc-100 dark:bg-zinc-900 animate-pulse border border-zinc-100 dark:border-zinc-800"
                                />
                            ))}
                        </div>
                    </Card>
                )}
                </>
                )}
            </div>

            {showJumpTop && (
                <button
                    type="button"
                    onClick={jumpToTop}
                    className="fixed bottom-6 right-6 z-40 px-4 py-2 rounded-full text-sm font-semibold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                    aria-label="Jump to top"
                    title="Jump to top"
                >
                    Top
                </button>
            )}
        </div>
    );
}


