import { useEffect, useState, memo, useMemo, useRef } from 'react';
import { useAuthStore } from '../authStore';
import { useStore } from '../store';
import { PatientMonitor } from './PatientMonitor';
import { Activity, Settings, Users, Eye, EyeOff, Search, UserPlus, Volume2, VolumeX, Wifi, WifiOff, Pin, BookOpen, LogOut } from 'lucide-react';
import { format } from 'date-fns';
import { PatientDetailsModal } from './PatientDetailsModal';
import { AdmitPatientModal } from './AdmitPatientModal';
import { useAudioAlarm } from '../hooks/useAudioAlarm';
import { SettingsModal } from './SettingsModal';
import { AiPredictionModal } from './AiPredictionModal';
import { ColorGuideModal } from './ColorGuideModal';

type DepartmentFilter = 'all' | 'reanimatsiya' | 'palata';

const Clock = memo(() => {
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-end justify-center shrink-0 leading-tight">
      <span className="text-xs sm:text-sm font-bold text-zinc-900 tabular-nums">{format(currentTime, 'HH:mm:ss')}</span>
      <span className="text-[10px] sm:text-xs font-mono text-zinc-600">{format(currentTime, 'dd MMM yyyy')}</span>
    </div>
  );
});

export function Dashboard() {
  useAudioAlarm(); // Initialize audio alarms

  const clinicName = useAuthStore((s) => s.clinicName);
  const username = useAuthStore((s) => s.username);
  const logoutAuth = useAuthStore((s) => s.logout);

  const { patients, wsConnected, connect, disconnect, privacyMode, togglePrivacyMode, searchQuery, setSearchQuery, isAudioMuted, toggleAudioMute } = useStore();
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'pinned'>('all');
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>('all');
  const [isAdmitModalOpen, setIsAdmitModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isColorGuideOpen, setIsColorGuideOpen] = useState(false);
  const [previousAiRiskCount, setPreviousAiRiskCount] = useState(0);
  const skipInitialAiNotification = useRef(true);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  const handleLogout = async () => {
    disconnect();
    await logoutAuth();
  };

  const patientList = useMemo(() => Object.values(patients), [patients]);

  useEffect(() => {
    const currentAiRiskCount = patientList.filter(p => p.aiRisk).length;
    if (skipInitialAiNotification.current) {
      skipInitialAiNotification.current = false;
      setPreviousAiRiskCount(currentAiRiskCount);
      return;
    }
    if (currentAiRiskCount > previousAiRiskCount) {
      setIsAiModalOpen(true);
    }
    setPreviousAiRiskCount(currentAiRiskCount);
  }, [patientList, previousAiRiskCount]);

  const filteredPatients = useMemo(() => {
    const filtered = patientList.filter(p => {
      // Search filter
      if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase()) && !p.id.toLowerCase().includes(searchQuery.toLowerCase())) return false;

      // Severity filter
      if (filter === 'critical' && p.alarm.level !== 'red') return false;
      if (filter === 'warning' && p.alarm.level !== 'yellow' && p.alarm.level !== 'blue' && p.alarm.level !== 'purple') return false;
      if (filter === 'pinned' && !p.isPinned) return false;
      
      // Department filter
      if (departmentFilter === 'reanimatsiya' && !p.room.toLowerCase().includes('reanimatsiya')) return false;
      if (departmentFilter === 'palata' && !p.room.toLowerCase().includes('palata')) return false;

      return true;
    });

    return filtered.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0;
    });
  }, [patientList, searchQuery, filter, departmentFilter]);

  const criticalCount = useMemo(() => patientList.filter(p => p.alarm.level === 'red').length, [patientList]);
  const warningCount = useMemo(() => patientList.filter(p => p.alarm.level === 'yellow' || p.alarm.level === 'blue' || p.alarm.level === 'purple').length, [patientList]);
  const pinnedCount = useMemo(() => patientList.filter(p => p.isPinned).length, [patientList]);

  const criticalPatients = useMemo(() => filteredPatients.filter(p => p.alarm.level === 'red'), [filteredPatients]);
  const warningPatients = useMemo(() => filteredPatients.filter(p => p.alarm.level === 'yellow' || p.alarm.level === 'blue' || p.alarm.level === 'purple'), [filteredPatients]);
  const stablePatients = useMemo(() => filteredPatients.filter(p => p.alarm.level === 'none'), [filteredPatients]);

  return (
    <div className="min-h-screen text-zinc-800 font-sans font-medium selection:bg-emerald-500/20 relative">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-emerald-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
      >
        Asosiy mazmunga o&apos;tish
      </a>
      {/* Background: 3 rangli och gradient animatsiya (rasm yo'q) */}
      <div
        className="fixed inset-0 z-0 dashboard-bg-animated pointer-events-none"
        aria-hidden
      />

      {/* Content Wrapper */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Top Navigation Bar — bitta gorizontal oqim: masshtab/joy yetmasa gorizontal scroll, tartib o'zgarmaydi */}
        <header className="sticky top-0 z-40 bg-white/95 border-b border-zinc-200 shadow-sm backdrop-blur-md">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 px-3 sm:px-4 py-2 sm:py-3">
            {/* Brand — qisqaradi, lekin tartibda qoladi */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0 max-w-[min(42vw,14rem)] sm:max-w-[18rem]">
              <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl overflow-hidden border border-emerald-200 bg-zinc-50 shadow-sm shrink-0">
                <img src="/logo-fjsti.png" alt="" className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-zinc-900 tracking-tight truncate">ClinicMonitoring</h1>
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-[10px] sm:text-xs text-zinc-600 font-mono uppercase tracking-wide truncate font-semibold">
                    {clinicName ?? 'Klinika'}
                  </p>
                  {username ? (
                    <span className="text-[10px] text-zinc-500 font-mono shrink-0 hidden md:inline">· {username}</span>
                  ) : null}
                  <div
                    role="status"
                    aria-live="polite"
                    className={`flex items-center shrink-0 text-[9px] sm:text-[10px] px-1 py-px sm:px-1.5 sm:py-0.5 rounded-full border font-semibold ${wsConnected ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}
                  >
                    {wsConnected ? <Wifi className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" aria-hidden /> : <WifiOff className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" aria-hidden />}
                    <span className="hidden min-[360px]:inline">{wsConnected ? 'Online' : 'Offline'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Asosiy panel: bir qator, nowrap + gorizontal scroll */}
            <div
              className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain py-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300"
              role="toolbar"
              aria-label="Boshqaruv paneli"
            >
              <div className="relative w-[7.5rem] shrink-0 sm:w-36 md:w-40">
                <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                  <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-zinc-500" aria-hidden />
                </div>
                <input
                  type="search"
                  autoComplete="off"
                  placeholder="Bemor qidirish..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Bemor bo'yicha qidiruv"
                  className="bg-white border border-zinc-300 text-zinc-900 text-xs sm:text-sm font-medium rounded-lg focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 w-full pl-8 pr-2 py-1.5 sm:py-2 outline-none shadow-sm"
                />
              </div>

              <div className="hidden sm:block h-5 w-px bg-zinc-200 shrink-0" aria-hidden />

              {/* Filtr tugmalari — doim yonma-yon */}
              <div className="flex shrink-0 flex-nowrap items-center gap-1 sm:gap-1.5">
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={`whitespace-nowrap rounded-full px-2 py-1 sm:px-2.5 sm:py-1.5 text-[11px] sm:text-xs font-semibold transition-colors ${filter === 'all' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'}`}
                >
                  Barchasi ({patientList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('critical')}
                  className={`whitespace-nowrap rounded-full px-2 py-1 sm:px-2.5 sm:py-1.5 text-[11px] sm:text-xs font-semibold transition-colors inline-flex items-center ${filter === 'critical' ? 'bg-red-50 text-red-800 ring-1 ring-red-200' : 'text-zinc-600 hover:text-red-700'}`}
                >
                  <span className="mr-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />
                  Kritik ({criticalCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('warning')}
                  className={`whitespace-nowrap rounded-full px-2 py-1 sm:px-2.5 sm:py-1.5 text-[11px] sm:text-xs font-semibold transition-colors inline-flex items-center ${filter === 'warning' ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200' : 'text-zinc-600 hover:text-amber-800'}`}
                >
                  <span className="mr-1 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500" aria-hidden />
                  Ogohlantirish ({warningCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('pinned')}
                  className={`whitespace-nowrap rounded-full px-2 py-1 sm:px-2.5 sm:py-1.5 text-[11px] sm:text-xs font-semibold transition-colors inline-flex items-center ${filter === 'pinned' ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200' : 'text-zinc-600 hover:text-emerald-800'}`}
                >
                  <Pin className="mr-0.5 h-3 w-3 shrink-0 sm:mr-1" aria-hidden />
                  Qadalgan ({pinnedCount})
                </button>
              </div>

              <div className="hidden md:block h-5 w-px bg-zinc-200 shrink-0" aria-hidden />

              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value as DepartmentFilter)}
                aria-label="Bo'lim bo'yicha filtrlash"
                className="shrink-0 rounded-lg border border-zinc-300 bg-white py-1 pl-2 pr-7 text-[11px] sm:text-xs font-medium text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 min-w-[8.5rem] sm:min-w-[10rem]"
              >
                <option value="all">Barcha bo&apos;limlar</option>
                <option value="reanimatsiya">Reanimatsiya</option>
                <option value="palata">Umumiy palatalar</option>
              </select>

              <div className="hidden lg:block h-5 w-px bg-zinc-200 shrink-0" aria-hidden />

              <div className="flex shrink-0 flex-nowrap items-center gap-1.5 sm:gap-2 text-zinc-700">
                <div className="hidden sm:flex items-center gap-1">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${wsConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <span className="whitespace-nowrap font-mono text-[10px] sm:text-xs">{wsConnected ? 'ONLAYN' : 'OFLAYN'}</span>
                </div>
                <Clock />

                <button
                  type="button"
                  onClick={() => setIsAiModalOpen(true)}
                  className="inline-flex shrink-0 items-center rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[11px] sm:text-xs font-semibold text-red-800 transition-colors hover:bg-red-100 sm:px-2.5 sm:py-1.5"
                  title="O'lim holati aniqlandi"
                >
                  <span className="mr-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />
                  <span className="hidden min-[400px]:inline">AI Prognoz</span>
                  <span className="min-[400px]:hidden">AI</span>
                </button>

                <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                  <button
                    type="button"
                    onClick={() => setIsAdmitModalOpen(true)}
                    className="rounded-full p-1.5 transition-colors hover:bg-emerald-50 hover:text-emerald-800 sm:p-2"
                    title="Yangi bemor qabul qilish"
                    aria-label="Yangi bemor qabul qilish"
                  >
                    <UserPlus className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={toggleAudioMute}
                    className="rounded-full p-1.5 transition-colors hover:bg-zinc-100 sm:p-2"
                    title={isAudioMuted ? 'Ovozni yoqish' : "Ovozni o'chirish"}
                    aria-label={isAudioMuted ? 'Signal ovozini yoqish' : "Signal ovozini o'chirish"}
                  >
                    {isAudioMuted ? <VolumeX className="h-4 w-4 text-red-500 sm:h-5 sm:w-5" aria-hidden /> : <Volume2 className="h-4 w-4 text-emerald-500 sm:h-5 sm:w-5" aria-hidden />}
                  </button>
                  <button
                    type="button"
                    onClick={togglePrivacyMode}
                    className="rounded-full p-1.5 transition-colors hover:bg-zinc-100 sm:p-2"
                    title="Maxfiylik rejimi"
                    aria-label={privacyMode ? "Maxfiylik rejimini o'chirish" : "Maxfiylik rejimini yoqish"}
                    aria-pressed={privacyMode}
                  >
                    {privacyMode ? <EyeOff className="h-4 w-4 text-emerald-500 sm:h-5 sm:w-5" aria-hidden /> : <Eye className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsColorGuideOpen(true)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-800 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-900 sm:gap-2 sm:px-2.5 sm:py-1.5 sm:text-xs"
                    title="Ranglar bo'yicha yo'riqnoma"
                    aria-label="Ranglar bo'yicha to'liq yo'riqnoma"
                  >
                    <BookOpen className="h-3.5 w-3.5 shrink-0 text-emerald-500 sm:h-4 sm:w-4" aria-hidden />
                    <span className="hidden sm:inline">Yo&apos;riqnoma</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSettingsModalOpen(true)}
                    className="rounded-full p-1.5 transition-colors hover:bg-zinc-100 sm:p-2"
                    title="Sozlamalar"
                    aria-label="Sozlamalar"
                  >
                    <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="rounded-full p-1.5 transition-colors hover:bg-red-500/10 hover:text-red-600 sm:p-2"
                    title="Chiqish"
                    aria-label="Tizimdan chiqish"
                  >
                    <LogOut className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

      {/* Main Content Grid */}
      <main id="main-content" tabIndex={-1} className="p-4 sm:p-6 flex-1 outline-none">
        {patientList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-zinc-600 px-4">
            {!wsConnected ? (
              <>
                <Activity className="w-12 h-12 mb-4 animate-pulse opacity-50" />
                <p className="text-lg font-medium">Telemetriya serveriga ulanmoqda...</p>
                <p className="text-sm font-mono mt-2">WebSocket kutilmoqda</p>
              </>
            ) : (
              <>
                <Users className="w-12 h-12 mb-4 opacity-40" />
                <p className="text-lg font-semibold text-zinc-900">Hozircha bemor yo&apos;q</p>
                <p className="text-sm mt-2 text-center max-w-md text-zinc-700">Bemor qabul qilish tugmasi orqali karavatni tanlang va bemorni ro&apos;yxatga qo&apos;shing.</p>
                <button
                  type="button"
                  onClick={() => setIsAdmitModalOpen(true)}
                  className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition-colors"
                >
                  <UserPlus className="w-5 h-5" />
                  Bemor qabul qilish
                </button>
              </>
            )}
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-zinc-600">
            <Users className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-semibold text-zinc-900">Joriy filtrga mos bemorlar topilmadi.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Critical (Red) */}
            {criticalPatients.length > 0 && (
              <div>
                <h2 className="text-red-700 font-bold mb-4 flex items-center">
                  <span className="w-2 h-2 rounded-full bg-red-500 mr-2 animate-pulse" />
                  Kritik Holat
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {criticalPatients.map(patient => (
                    <PatientMonitor key={patient.id} patient={patient} size="large" />
                  ))}
                </div>
              </div>
            )}

            {/* Warning (Yellow, Blue, Purple) */}
            {warningPatients.length > 0 && (
              <div>
                <h2 className="text-amber-800 font-bold mb-4 flex items-center">
                  <span className="w-2 h-2 rounded-full bg-yellow-500 mr-2" />
                  Ogohlantirish
                </h2>
                <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-[repeat(10,minmax(0,1fr))] gap-3">
                  {warningPatients.map(patient => (
                    <PatientMonitor key={patient.id} patient={patient} size="medium" />
                  ))}
                </div>
              </div>
            )}

            {/* Stable (None) */}
            {stablePatients.length > 0 && (
              <div>
                <h2 className="text-emerald-800 font-bold mb-4 flex items-center">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
                  Stabil Holat
                </h2>
                <div className="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-[repeat(15,minmax(0,1fr))] gap-2">
                  {stablePatients.map(patient => (
                    <PatientMonitor key={patient.id} patient={patient} size="small" />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto py-3 px-6 border-t border-zinc-200 bg-white/95 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between text-[11px] text-zinc-600 font-medium z-40 shrink-0">
        <div className="flex items-center space-x-1">
          <span>&copy; 2026 ClinicMonitoring. Farg&apos;ona Jamoat Salomatligi Tibbiyot Instituti</span>
        </div>
        <div className="flex items-center space-x-4 mt-2 sm:mt-0">
          <span className="flex items-center">
            Ishlab chiqaruvchi: 
            <a href="https://cdcgroup.uz" target="_blank" rel="noopener noreferrer" className="ml-1 font-bold text-zinc-800 hover:text-emerald-700 transition-colors">
              CDCGroup
            </a>
          </span>
          <span className="w-1 h-1 rounded-full bg-zinc-300"></span>
          <span className="flex items-center">
            Qo'llab-quvvatlovchi: 
            <a href="https://cdcgroup.uz" target="_blank" rel="noopener noreferrer" className="ml-1 font-bold text-zinc-800 hover:text-purple-700 transition-colors">
              CraDev Company
            </a>
          </span>
        </div>
      </footer>
      </div>

      {/* Modals */}
      <PatientDetailsModal />
      {isAdmitModalOpen && <AdmitPatientModal onClose={() => setIsAdmitModalOpen(false)} />}
      {isSettingsModalOpen && (
        <SettingsModal
          onClose={() => setIsSettingsModalOpen(false)}
          onOpenAdmitPatient={() => {
            setIsSettingsModalOpen(false);
            setIsAdmitModalOpen(true);
          }}
        />
      )}
      {isAiModalOpen && <AiPredictionModal onClose={() => setIsAiModalOpen(false)} />}
      {isColorGuideOpen && <ColorGuideModal onClose={() => setIsColorGuideOpen(false)} />}
    </div>
  );
}
