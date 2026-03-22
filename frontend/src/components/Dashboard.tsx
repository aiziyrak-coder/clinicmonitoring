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
    <div className="flex flex-col items-end justify-center">
      <span className="text-sm font-bold text-zinc-200">{format(currentTime, 'HH:mm:ss')}</span>
      <span className="text-xs font-mono">{format(currentTime, 'dd MMM yyyy')}</span>
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
    <div className="min-h-screen text-zinc-300 font-sans selection:bg-emerald-500/30 relative">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-emerald-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
      >
        Asosiy mazmunga o&apos;tish
      </a>
      {/* Background: lokal zamonaviy operatsion xona / diagnostika interyeri */}
      <div className="fixed inset-0 z-0">
        <img 
          src="/bg-clinic-or.png" 
          alt="" 
          className="h-full w-full object-cover object-center opacity-100"
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
        <div
          className="absolute inset-0 bg-black/30 backdrop-blur-[8px] sm:backdrop-blur-[14px] pointer-events-none"
          aria-hidden
        />
      </div>

      {/* Content Wrapper */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 sm:px-6 py-4 bg-zinc-950/80 border-b border-zinc-800/50 backdrop-blur-md">
          <div className="flex items-center space-x-4">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl overflow-hidden border border-emerald-500/20 bg-zinc-900/80 shrink-0">
              <img src="/logo-fjsti.png" alt="" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-100 tracking-tight">ClinicMonitoring</h1>
              <div className="flex items-center space-x-2 flex-wrap">
                <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider max-w-[14rem] sm:max-w-none truncate">
                  {clinicName ?? 'Klinika'}
                </p>
                {username ? (
                  <span className="text-[10px] text-zinc-600 font-mono hidden sm:inline">· {username}</span>
                ) : null}
                <div
                  role="status"
                  aria-live="polite"
                  className={`flex items-center text-[10px] px-1.5 py-0.5 rounded-full border ${wsConnected ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}
                >
                  {wsConnected ? <Wifi className="w-3 h-3 mr-1" aria-hidden /> : <WifiOff className="w-3 h-3 mr-1" aria-hidden />}
                  {wsConnected ? 'Online' : 'Offline'}
                </div>
              </div>
            </div>
          </div>

        <div className="flex flex-1 min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-3 lg:flex-nowrap">
          {/* Search */}
          <div className="relative w-full min-w-[12rem] max-w-xs sm:w-auto">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-zinc-500" aria-hidden />
            </div>
            <input
              type="search"
              autoComplete="off"
              placeholder="Bemor qidirish..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Bemor bo'yicha qidiruv"
              className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block w-full sm:w-48 pl-10 p-2 outline-none transition-all sm:focus:w-64"
            />
          </div>

          <div className="h-6 w-px bg-zinc-800" />

          {/* Status Indicators */}
          <div className="flex flex-wrap gap-2">
            <button 
              type="button"
              onClick={() => setFilter('all')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${filter === 'all' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Barchasi ({patientList.length})
            </button>
            <button 
              type="button"
              onClick={() => setFilter('critical')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center ${filter === 'critical' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-zinc-400 hover:text-red-400'}`}
            >
              <span className="w-2 h-2 rounded-full bg-red-500 mr-2 animate-pulse" aria-hidden />
              Kritik ({criticalCount})
            </button>
            <button 
              type="button"
              onClick={() => setFilter('warning')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center ${filter === 'warning' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'text-zinc-400 hover:text-yellow-400'}`}
            >
              <span className="w-2 h-2 rounded-full bg-yellow-500 mr-2" aria-hidden />
              Ogohlantirish ({warningCount})
            </button>
            <button 
              type="button"
              onClick={() => setFilter('pinned')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center ${filter === 'pinned' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-zinc-400 hover:text-emerald-400'}`}
            >
              <Pin className="w-3 h-3 mr-2" aria-hidden />
              Qadalgan ({pinnedCount})
            </button>
          </div>

          <div className="h-6 w-px bg-zinc-800" />

          {/* Department Filter */}
          <select 
            value={departmentFilter} 
            onChange={(e) => setDepartmentFilter(e.target.value as DepartmentFilter)}
            aria-label="Bo'lim bo'yicha filtrlash"
            className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2 outline-none min-w-[10rem]"
          >
            <option value="all">Barcha bo'limlar</option>
            <option value="reanimatsiya">Reanimatsiya</option>
            <option value="palata">Umumiy palatalar</option>
          </select>

          <div className="h-6 w-px bg-zinc-800" />

          <div className="flex items-center space-x-4 text-zinc-400">
            <div className="flex items-center mr-2">
              <span className={`w-2 h-2 rounded-full mr-2 ${wsConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span className="text-xs font-mono">{wsConnected ? 'ONLAYN' : 'OFLAYN'}</span>
            </div>
            <Clock />
            
            <button
              type="button"
              onClick={() => setIsAiModalOpen(true)}
              className="px-3 py-1.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors flex items-center text-sm font-medium"
              title="O'lim holati aniqlandi"
            >
              <span className="w-2 h-2 rounded-full bg-red-500 mr-2 animate-pulse" aria-hidden />
              AI Prognoz
            </button>

            <button 
              type="button"
              onClick={() => setIsAdmitModalOpen(true)}
              className="p-2 rounded-full hover:bg-emerald-500/20 hover:text-emerald-400 transition-colors" 
              title="Yangi bemor qabul qilish"
              aria-label="Yangi bemor qabul qilish"
            >
              <UserPlus className="w-5 h-5" aria-hidden />
            </button>
            <button 
              type="button"
              onClick={toggleAudioMute} 
              className="p-2 rounded-full hover:bg-zinc-800 transition-colors" 
              title={isAudioMuted ? "Ovozni yoqish" : "Ovozni o'chirish"}
              aria-label={isAudioMuted ? "Signal ovozini yoqish" : "Signal ovozini o'chirish"}
            >
              {isAudioMuted ? <VolumeX className="w-5 h-5 text-red-500" aria-hidden /> : <Volume2 className="w-5 h-5 text-emerald-500" aria-hidden />}
            </button>
            <button 
              type="button"
              onClick={togglePrivacyMode} 
              className="p-2 rounded-full hover:bg-zinc-800 transition-colors" 
              title="Maxfiylik rejimi"
              aria-label={privacyMode ? "Maxfiylik rejimini o'chirish" : "Maxfiylik rejimini yoqish"}
              aria-pressed={privacyMode}
            >
              {privacyMode ? <EyeOff className="w-5 h-5 text-emerald-500" aria-hidden /> : <Eye className="w-5 h-5" aria-hidden />}
            </button>
            <button 
              type="button"
              onClick={() => setIsColorGuideOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-zinc-800/90 border border-zinc-700 text-zinc-200 hover:border-emerald-500/40 hover:bg-zinc-800 hover:text-emerald-300 transition-colors"
              title="Ranglar bo'yicha yo'riqnoma"
              aria-label="Ranglar bo'yicha to'liq yo'riqnoma"
            >
              <BookOpen className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Yo&apos;riqnoma</span>
            </button>
            <button 
              type="button"
              onClick={() => setIsSettingsModalOpen(true)}
              className="p-2 rounded-full hover:bg-zinc-800 transition-colors" 
              title="Sozlamalar"
              aria-label="Sozlamalar"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="p-2 rounded-full hover:bg-red-500/10 hover:text-red-400 transition-colors"
              title="Chiqish"
              aria-label="Tizimdan chiqish"
            >
              <LogOut className="w-5 h-5" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Grid */}
      <main id="main-content" tabIndex={-1} className="p-4 sm:p-6 flex-1 outline-none">
        {patientList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-zinc-500 px-4">
            {!wsConnected ? (
              <>
                <Activity className="w-12 h-12 mb-4 animate-pulse opacity-50" />
                <p className="text-lg font-medium">Telemetriya serveriga ulanmoqda...</p>
                <p className="text-sm font-mono mt-2">WebSocket kutilmoqda</p>
              </>
            ) : (
              <>
                <Users className="w-12 h-12 mb-4 opacity-40" />
                <p className="text-lg font-medium text-zinc-300">Hozircha bemor yo&apos;q</p>
                <p className="text-sm mt-2 text-center max-w-md">Bemor qabul qilish tugmasi orqali karavatni tanlang va bemorni ro&apos;yxatga qo&apos;shing.</p>
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
          <div className="flex flex-col items-center justify-center h-[60vh] text-zinc-500">
            <Users className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">Joriy filtrga mos bemorlar topilmadi.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Critical (Red) */}
            {criticalPatients.length > 0 && (
              <div>
                <h2 className="text-red-500 font-bold mb-4 flex items-center">
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
                <h2 className="text-yellow-500 font-bold mb-4 flex items-center">
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
                <h2 className="text-emerald-500 font-bold mb-4 flex items-center">
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
      <footer className="mt-auto py-3 px-6 border-t border-zinc-800/50 bg-zinc-950/80 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between text-[11px] text-zinc-500 z-40 shrink-0">
        <div className="flex items-center space-x-1">
          <span>&copy; 2026 ClinicMonitoring. Farg&apos;ona Jamoat Salomatligi Tibbiyot Instituti</span>
        </div>
        <div className="flex items-center space-x-4 mt-2 sm:mt-0">
          <span className="flex items-center">
            Ishlab chiqaruvchi: 
            <a href="https://cdcgroup.uz" target="_blank" rel="noopener noreferrer" className="ml-1 font-semibold text-zinc-400 hover:text-emerald-400 transition-colors">
              CDCGroup
            </a>
          </span>
          <span className="w-1 h-1 rounded-full bg-zinc-700"></span>
          <span className="flex items-center">
            Qo'llab-quvvatlovchi: 
            <a href="https://cdcgroup.uz" target="_blank" rel="noopener noreferrer" className="ml-1 font-semibold text-zinc-400 hover:text-purple-400 transition-colors">
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
