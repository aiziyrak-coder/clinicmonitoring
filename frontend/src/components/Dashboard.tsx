import { useEffect, useState, memo, useMemo, useRef } from 'react';
import { useAuthStore } from '../authStore';
import { useStore } from '../store';
import { PatientMonitor } from './PatientMonitor';
import { Activity, Settings, Users, Eye, EyeOff, Search, UserPlus, Volume2, VolumeX, Wifi, BookOpen, LogOut, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { PatientDetailsModal } from './PatientDetailsModal';
import { AdmitPatientModal } from './AdmitPatientModal';
import { useAudioAlarm } from '../hooks/useAudioAlarm';
import { SettingsModal } from './SettingsModal';
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
  useAudioAlarm();

  const clinicName = useAuthStore((s) => s.clinicName);
  const username = useAuthStore((s) => s.username);
  const logoutAuth = useAuthStore((s) => s.logout);

  const { patients, wsConnected, connect, disconnect, privacyMode, togglePrivacyMode, searchQuery, setSearchQuery, isAudioMuted, toggleAudioMute } = useStore();
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'pinned'>('all');
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>('all');
  const [isAdmitModalOpen, setIsAdmitModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isColorGuideOpen, setIsColorGuideOpen] = useState(false);

  // Dark mode ni o'chirish — har doim light mode
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('theme');
  }, []);

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

  const filteredPatients = useMemo(() => {
    const filtered = patientList.filter(p => {
      if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase()) && !p.id.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filter === 'critical' && p.alarm.level !== 'red') return false;
      if (filter === 'warning' && p.alarm.level !== 'yellow' && p.alarm.level !== 'blue' && p.alarm.level !== 'purple') return false;
      if (filter === 'pinned' && !p.isPinned) return false;
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

  const hasEmergency = useStore(state => state.hasEmergency());

  return (
    <div className={`min-h-screen bg-zinc-50 ${hasEmergency ? 'emergency-pulse border-4 border-red-500/50' : ''}`}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-emerald-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
      >
        Asosiy mazmunga o&apos;tish
      </a>

      {/* Background gradient animatsiya */}
      <div
        className="fixed inset-0 z-0 dashboard-bg-animated pointer-events-none"
        aria-hidden
      />

      {/* Content Wrapper */}
      <div className="relative z-10 min-h-screen flex flex-col">

        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-40 bg-white/90 border-b border-zinc-200 shadow-sm backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-[100vw] min-w-0 flex-col gap-2 px-3 py-2 sm:px-4 sm:py-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-4">

            {/* Chap: logo + klinika nomi */}
            <div className="flex min-w-0 shrink-0 items-start gap-2 sm:gap-3 lg:max-w-[min(100%,28rem)] xl:max-w-[32rem]">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-emerald-200 bg-zinc-50 shadow-sm sm:h-10 sm:w-10 sm:rounded-xl">
                <img src="/logo-fjsti.png" alt="" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-base font-bold tracking-tight text-zinc-900 sm:text-lg">ClinicMonitoring</h1>
                <p className="mt-0.5 break-words text-[10px] font-semibold uppercase leading-snug tracking-wide text-zinc-600 sm:text-[11px]">
                  {clinicName ?? 'Klinika'}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {username ? (
                    <span className="font-mono text-[10px] text-zinc-500 sm:text-[11px]">{username}</span>
                  ) : null}
                  <div
                    role="status"
                    aria-live="polite"
                    className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold sm:text-[10px] ${wsConnected ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}
                  >
                    {wsConnected ? <Wifi className="mr-0.5 h-2.5 w-2.5 sm:h-3 sm:w-3" aria-hidden /> : <WifiOff className="mr-0.5 h-2.5 w-2.5 sm:h-3 sm:w-3" aria-hidden />}
                    {wsConnected ? 'Online' : 'Offline'}
                  </div>
                </div>
              </div>
            </div>

            {/* Markaz: qidiruv + filtrlar */}
            <div
              className="flex min-w-0 flex-1 items-center justify-center gap-1.5 overflow-x-auto overflow-y-hidden py-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] sm:gap-2 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300"
              role="toolbar"
              aria-label="Qidiruv va filtrlash"
            >
              <div className="relative w-[8rem] shrink-0 sm:w-40 md:w-44">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2">
                  <Search className="h-3.5 w-3.5 text-zinc-500 sm:h-4 sm:w-4" aria-hidden />
                </div>
                <input
                  type="search"
                  autoComplete="off"
                  placeholder="Bemor qidirish..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Bemor bo'yicha qidiruv"
                  className="w-full rounded-lg border border-zinc-300 bg-white py-1.5 pl-8 pr-2 text-xs font-medium text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 sm:py-2 sm:text-sm"
                />
              </div>

              <div className="hidden h-5 w-px shrink-0 bg-zinc-200 sm:block" aria-hidden />

              <div className="flex shrink-0 flex-nowrap items-center gap-1 sm:gap-1.5">
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={`whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold transition-colors sm:px-2.5 sm:py-1.5 sm:text-xs ${filter === 'all' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'}`}
                >
                  Barchasi ({patientList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('critical')}
                  className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold transition-colors sm:px-2.5 sm:py-1.5 sm:text-xs ${filter === 'critical' ? 'bg-red-50 text-red-800 ring-1 ring-red-200' : 'text-zinc-600 hover:text-red-700'}`}
                >
                  <span className="mr-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />
                  Kritik ({criticalCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('warning')}
                  className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold transition-colors sm:px-2.5 sm:py-1.5 sm:text-xs ${filter === 'warning' ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200' : 'text-zinc-600 hover:text-amber-800'}`}
                >
                  <span className="mr-1 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500" aria-hidden />
                  Ogohlantirish ({warningCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('pinned')}
                  className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold transition-colors sm:px-2.5 sm:py-1.5 sm:text-xs ${filter === 'pinned' ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200' : 'text-zinc-600 hover:text-emerald-800'}`}
                >
                  <Pin className="mr-0.5 h-3 w-3 shrink-0 sm:mr-1" aria-hidden />
                  Qadalgan ({pinnedCount})
                </button>
              </div>

              <div className="hidden h-5 w-px shrink-0 bg-zinc-200 md:block" aria-hidden />

              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value as DepartmentFilter)}
                aria-label="Bo'lim bo'yicha filtrlash"
                className="min-w-[8.5rem] shrink-0 rounded-lg border border-zinc-300 bg-white py-1 pl-2 pr-7 text-[11px] font-medium text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 sm:min-w-[10rem] sm:text-xs"
              >
                <option value="all">Barcha bo&apos;limlar</option>
                <option value="reanimatsiya">Reanimatsiya</option>
                <option value="palata">Umumiy palatalar</option>
              </select>
            </div>

            {/* O'ng: holat, soat, tugmalar */}
            <div className="flex min-w-0 shrink-0 flex-nowrap items-center justify-end gap-1.5 overflow-x-auto py-0.5 sm:gap-2 lg:justify-end lg:pl-1">
              <div className="hidden items-center gap-1 sm:flex">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${wsConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <span className="whitespace-nowrap font-mono text-[10px] text-zinc-700 sm:text-xs">{wsConnected ? 'ONLAYN' : 'OFLAYN'}</span>
              </div>
              <Clock />
              <div className="flex items-center gap-0.5 sm:gap-1">
                <button
                  type="button"
                  onClick={() => setIsAdmitModalOpen(true)}
                  className="rounded-full p-1.5 transition-colors hover:bg-emerald-50 hover:text-emerald-800 sm:p-2"
                  title="Yangi bemor qabul qilish"
                  aria-label="Yangi bemor qabul qilish"
                >
                  <UserPlus className="h-4 w-4 text-zinc-700 sm:h-5 sm:w-5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={toggleAudioMute}
                <button
                  type="button"
                  onClick={togglePrivacyMode}
                  className="rounded-full p-1.5 transition-colors hover:bg-zinc-100 sm:p-2"
                  title="Maxfiylik rejimi"
                  aria-label={privacyMode ? "Maxfiylik rejimini o'chirish" : "Maxfiylik rejimini yoqish"}
                  aria-pressed={privacyMode}
                >
                  {privacyMode ? <EyeOff className="h-4 w-4 text-emerald-600 sm:h-5 sm:w-5" aria-hidden /> : <Eye className="h-4 w-4 text-zinc-600 sm:h-5 sm:w-5" aria-hidden />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsColorGuideOpen(true)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-800 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-900 sm:gap-2 sm:px-2.5 sm:py-1.5 sm:text-xs"
                  title="Ranglar bo'yicha yo'riqnoma"
                  aria-label="Ranglar bo'yicha to'liq yo'riqnoma"
                >
                  <BookOpen className="h-3.5 w-3.5 shrink-0 text-emerald-600 sm:h-4 sm:w-4" aria-hidden />
                  <span className="hidden sm:inline">Yo&apos;riqnoma</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsSettingsModalOpen(true)}
                  className="rounded-full p-1.5 transition-colors hover:bg-zinc-100 sm:p-2"
                  title="Sozlamalar"
                  aria-label="Sozlamalar"
                >
                  <Settings className="h-4 w-4 text-zinc-700 sm:h-5 sm:w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="rounded-full p-1.5 transition-colors hover:bg-red-50 hover:text-red-600 sm:p-2"
                  title="Chiqish"
                  aria-label="Tizimdan chiqish"
                >
                  <LogOut className="h-4 w-4 text-zinc-700 sm:h-5 sm:w-5" aria-hidden />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Stats Bar */}
        <div className="px-4 pt-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {/* Total Patients */}
            <div className="glass-card-premium p-3 rounded-xl border border-white/20 shadow-sm flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Users className="w-5 h-5 text-emerald-700" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Bemorlar</p>
                <p className="text-xl font-black text-zinc-900">{patientList.length}</p>
              </div>
            </div>

            {/* Critical */}
            <div className={`glass-card-premium p-3 rounded-xl border border-white/20 shadow-sm flex items-center gap-3 ${criticalCount > 0 ? 'ring-2 ring-red-500/50 animate-pulse' : ''}`}>
              <div className={`p-2 rounded-lg ${criticalCount > 0 ? 'bg-red-100' : 'bg-zinc-100'}`}>
                <Activity className={`w-5 h-5 ${criticalCount > 0 ? 'text-red-700' : 'text-zinc-400'}`} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Kritik</p>
                <p className={`text-xl font-black ${criticalCount > 0 ? 'text-red-700' : 'text-zinc-900'}`}>{criticalCount}</p>
              </div>
            </div>

            {/* Warning */}
            <div className="glass-card-premium p-3 rounded-xl border border-white/20 shadow-sm flex items-center gap-3">
              <div className={`p-2 rounded-lg ${warningCount > 0 ? 'bg-amber-100' : 'bg-zinc-100'}`}>
                <RefreshCw className={`w-5 h-5 ${warningCount > 0 ? 'text-amber-700' : 'text-zinc-400'}`} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Ogohlantirish</p>
                <p className="text-xl font-black text-zinc-900">{warningCount}</p>
              </div>
            </div>

            {/* Connection */}
            <div className="glass-card-premium p-3 rounded-xl border border-white/20 shadow-sm items-center gap-3 hidden lg:flex">
              <div className={`p-2 rounded-lg ${wsConnected ? 'bg-emerald-100' : 'bg-red-100'}`}>
                <Wifi className={`w-5 h-5 ${wsConnected ? 'text-emerald-700' : 'text-red-700'}`} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Tizim holati</p>
                <p className={`text-sm font-black uppercase ${wsConnected ? 'text-emerald-700' : 'text-red-700'}`}>
                  {wsConnected ? 'Ishlayapti' : "Aloqa yo'q"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main id="main-content" tabIndex={-1} className="p-4 sm:p-6 flex-1 outline-none">
          {patientList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[60vh] text-zinc-600 px-4">
              {!wsConnected ? (
                <>
                  <Activity className="w-12 h-12 mb-4 animate-pulse opacity-50" />
                  <p className="text-lg font-medium text-zinc-800">Telemetriya serveriga ulanmoqda...</p>
                  <p className="text-sm font-mono mt-2 text-zinc-600">WebSocket kutilmoqda</p>
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
            <span className="w-1 h-1 rounded-full bg-zinc-300" />
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
      {isColorGuideOpen && <ColorGuideModal onClose={() => setIsColorGuideOpen(false)} />}
    </div>
  );
}
