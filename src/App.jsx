import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Layout } from './components/Layout';
import { SearchForm } from './components/features/SearchForm';
import { CalendarView } from './components/features/CalendarView';
import { ListView } from './components/features/ListView';
import { ViewToggle } from './components/features/ViewToggle';
import { ExportMenu } from './components/features/ExportMenu';
import { ShareScheduleButton } from './components/features/ShareScheduleButton';
import { StudentInfo } from './components/features/StudentInfo';
import { Admin } from './components/features/Admin';
import { Card } from './components/ui/Card';
import { fetchSchedule, DEFAULT_SEMESTER } from './utils/api';
import { trackEvent } from './utils/analytics';
import { removeDuplicateCourses, sortSchedule } from './utils/schedule';
import { loadCreditsData } from './utils/credits';
import { startDeploymentGuard } from './utils/deploymentGuard';
import { getSavedStudentId, setSavedStudentId } from './utils/preferences';

const MotionDiv = motion.div;
const STUDENT_ID_REGEX = /^\d{5,20}$/;

function MainApp() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [schedule, setSchedule] = useState([]);
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState('calendar');
  const [semester] = useState(searchParams.get('sem') || DEFAULT_SEMESTER);
  const [creditsData, setCreditsData] = useState({});
  const [hasSearched, setHasSearched] = useState(Boolean(searchParams.get('s') || getSavedStudentId()));
  const exportListRef = useRef(null);
  const initialQuery = searchParams.get('s') || getSavedStudentId() || '';

  useEffect(() => {
    loadCreditsData().then(setCreditsData);
  }, []);

  useEffect(() => {
    const s = searchParams.get('s');
    if (s) {
      doSearch(s, semester);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (isMobile) setView('list');
  }, []);
  const doSearch = async (query, sem) => {
    const normalizedQuery = query.trim();
    setHasSearched(true);

    if (!STUDENT_ID_REGEX.test(normalizedQuery)) {
      setError('Please enter a valid numeric student ID.');
      setSchedule([]);
      setStudent(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchSchedule(normalizedQuery);
      const courses = removeDuplicateCourses(sortSchedule(data.courses || []));
      setSchedule(courses);
      setStudent(data.student || { Code: normalizedQuery });
      setSearchParams({ s: normalizedQuery, sem });
    } catch {
      setError('Failed to load schedule. Please try again.');
      setSchedule([]);
      setStudent(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (query, sem) => {
    const normalizedQuery = query.trim();
    setSavedStudentId(normalizedQuery);
    doSearch(normalizedQuery, sem);
  };

  const handleViewChange = (nextView) => {
    if (nextView === view) return;
    setView(nextView);
    trackEvent({ event: 'feature_used', feature: nextView === 'calendar' ? 'view_calendar' : 'view_list' });
  };

  const hasResults = schedule.length > 0;

  return (
    <Layout>
      <div className="space-y-5 sm:space-y-7">
        <Card className={hasResults ? 'surface-card p-4 sm:p-4' : 'surface-card p-5 sm:p-6'} hoverLift={!hasResults}>
          <SearchForm
            onSearch={handleSearch}
            loading={loading}
            semester={semester}
            initialQuery={initialQuery}
            compact={hasResults}
          />
        </Card>

        {error && (
          <MotionDiv
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-red-200 bg-red-50/90 p-4 text-sm text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/25 dark:text-red-300"
          >
            {error}
          </MotionDiv>
        )}

        <AnimatePresence>
          {hasResults && (
            <MotionDiv initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-0 space-y-4 sm:space-y-5">
              <Card className="surface-card relative z-30 space-y-4 overflow-visible p-4 sm:p-5" hoverLift={false}>
                <StudentInfo student={student} schedule={schedule} creditsData={creditsData} />

                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    <ViewToggle view={view} onViewChange={handleViewChange} />
                    <ExportMenu
                      schedule={schedule}
                      student={student}
                      semester={semester}
                      imageTargetRef={exportListRef}
                    />
                    <ShareScheduleButton student={student} semester={semester} hasSchedule={hasResults} />
                </div>
              </Card>

              <AnimatePresence mode="wait">
                {view === 'list' ? (
                  <MotionDiv
                    key="list"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                    className="relative z-10"
                  >
                    <Card className="surface-card overflow-visible rounded-[32px] p-3 sm:p-4" hoverLift={false}>
                      <ListView schedule={schedule} />
                    </Card>
                  </MotionDiv>
                ) : (
                  <MotionDiv
                    key="calendar"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="relative z-10"
                  >
                    <CalendarView schedule={schedule} />
                  </MotionDiv>
                )}
              </AnimatePresence>

              <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0 z-[-1]">
                <div ref={exportListRef} className="w-[840px] bg-white p-3 text-zinc-900 dark:bg-black dark:text-zinc-100">
                  <ListView schedule={schedule} exportMode />
                </div>
              </div>
            </MotionDiv>
          )}
        </AnimatePresence>

        {!hasResults && !loading && !error && !hasSearched && (
          <MotionDiv
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-10 text-center text-zinc-400 dark:text-zinc-600 sm:py-14"
          >
            <p className="text-lg font-semibold text-zinc-600 dark:text-zinc-300">Enter your student ID to load your schedule</p>
            <p className="mt-1 text-sm">View your original university schedule in list or calendar format.</p>
          </MotionDiv>
        )}
      </div>
    </Layout>
  );
}

export default function App() {
  useEffect(() => {
    const stopGuard = startDeploymentGuard();
    return stopGuard;
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  );
}
