import { Heart, Clock, X, Battery, UserCircle, Droplets, RefreshCw, Brain, Pin } from 'lucide-react';
import { PatientData, useStore } from '../store';
import { cn } from '../lib/utils';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { uz } from 'date-fns/locale';

interface PatientMonitorProps {
  patient: PatientData;
  size?: 'large' | 'medium' | 'small';
}

export const PatientMonitor = React.memo(function PatientMonitor({ patient, size = 'large' }: PatientMonitorProps) {
  const { vitals, alarm, alarmLimits, scheduledCheck, deviceBattery, doctor } = patient;
  const privacyMode = useStore(state => state.privacyMode);
  const setSchedule = useStore(state => state.setSchedule);
  const clearAlarm = useStore(state => state.clearAlarm);
  const measureNibp = useStore(state => state.measureNibp);
  const setSelectedPatientId = useStore(state => state.setSelectedPatientId);
  const togglePinPatient = useStore(state => state.togglePinPatient);
  
  const [showScheduleMenu, setShowScheduleMenu] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const scheduleMenuRef = useRef<HTMLDivElement>(null);

  const nextCheckTime = scheduledCheck?.nextCheckTime;

  const closeScheduleMenu = useCallback(() => setShowScheduleMenu(false), []);

  useEffect(() => {
    if (!showScheduleMenu) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = scheduleMenuRef.current;
      if (el && !el.contains(e.target as Node)) {
        closeScheduleMenu();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeScheduleMenu();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showScheduleMenu, closeScheduleMenu]);

  useEffect(() => {
    if (!nextCheckTime) {
      setTimeLeft(null);
      return;
    }
    
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((nextCheckTime - Date.now()) / 1000));
      setTimeLeft(remaining);
    }, 1000);
    
    // Initial call
    const remaining = Math.max(0, Math.ceil((nextCheckTime - Date.now()) / 1000));
    setTimeLeft(remaining);
    
    return () => clearInterval(interval);
  }, [nextCheckTime]);

  const alarmStyles = {
    none: 'border-zinc-200 bg-white hover:bg-zinc-50 shadow-md shadow-zinc-200/50',
    blue: 'border-blue-400 bg-blue-50 animate-pulse hover:bg-blue-100 shadow-md shadow-blue-100/80',
    yellow: 'border-amber-400 bg-amber-50 animate-pulse hover:bg-amber-100 shadow-md shadow-amber-100/80',
    red: 'border-red-500 bg-red-50 animate-pulse shadow-lg shadow-red-200/60 hover:bg-red-100',
    purple: 'border-purple-500 bg-purple-50 animate-pulse shadow-lg shadow-purple-200/60 hover:bg-purple-100',
  };

  const maskedName = privacyMode
    ? (patient.name || '').replace(/([A-ZА-ЯЁ]\.\s[A-ZА-ЯЁ]).*/u, '$1***')
    : patient.name;

  const handleSetSchedule = (e: React.MouseEvent, seconds: number) => {
    e.stopPropagation();
    setSchedule(patient.id, seconds * 1000);
    setShowScheduleMenu(false);
  };

  // Define sizes
  const isSmall = size === 'small';
  const isMedium = size === 'medium';
  const isLarge = size === 'large';

  return (
    <div 
      role="button"
      tabIndex={0}
      aria-label={`${maskedName}, ${patient.room ?? ''}. Batafsil uchun bosing.`}
      onClick={() => setSelectedPatientId(patient.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setSelectedPatientId(patient.id);
        }
      }}
      className={cn(
        "relative flex flex-col rounded-xl border transition-all duration-300 cursor-pointer group",
        alarmStyles[alarm.level],
        isSmall ? "p-1 h-[120px]" : isMedium ? "p-1.5 h-[180px]" : "p-2 h-[240px]"
      )}
    >
      {/* Header */}
      <div className={cn("flex justify-between items-start shrink-0", isSmall ? "mb-0.5" : "mb-1.5")}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <h3 className={cn(
              "font-bold text-zinc-900 group-hover:text-emerald-800 transition-colors truncate",
              isSmall ? "text-[10px]" : isMedium ? "text-xs" : "text-sm"
            )}>
              {maskedName}
            </h3>
              {patient.aiRisk && (
              <div className="flex items-center justify-center w-4 h-4 rounded-full bg-red-500/20 border border-red-500/50 animate-pulse shrink-0" title="AI Prognoz: O'lim xavfi">
                <Brain className="w-2.5 h-2.5 text-red-500" />
              </div>
            )}
            {patient.isPinned && (
              <Pin className="w-3 h-3 text-emerald-400 shrink-0 fill-emerald-400" />
            )}
          </div>
          {!isSmall && (
            <div className="flex items-center space-x-1 mt-0.5">
              <p className="text-[8px] text-zinc-700 font-mono bg-zinc-100 px-1 py-0.5 rounded truncate font-medium">{patient.room}</p>
              {isLarge && (
                <div className="flex items-center text-[9px] text-zinc-600 min-w-0" title="Mas'ul shifokor / Hamshira">
                  <UserCircle className="w-2.5 h-2.5 mr-1 shrink-0" />
                  <span className="truncate">{doctor} / {patient.assignedNurse}</span>
                </div>
              )}
            </div>
          )}
          {isSmall && <p className="text-[8px] text-zinc-600 truncate font-medium">{patient.room}</p>}
        </div>
        
        <div className="flex flex-col items-end space-y-0.5 ml-1 shrink-0 max-w-[50%]">
          {alarm.level !== 'none' && (
            <div className={cn(
              "rounded-full font-bold uppercase tracking-wider flex items-center max-w-full",
              isSmall ? "px-1 text-[7px]" : "px-1.5 py-0.5 text-[8px]",
              alarm.level === 'red' ? 'bg-red-500 text-white' :
              alarm.level === 'yellow' ? 'bg-yellow-500 text-black' :
              alarm.level === 'purple' ? 'bg-purple-500 text-white' :
              'bg-blue-500 text-white'
            )}>
              {!isSmall && (
                <span className="truncate">{alarm.message || 'DIQQAT'}</span>
              )}
              {isSmall && '!'}
              {alarm.level === 'purple' && !isSmall && (
                <button 
                  type="button"
                  onClick={(e) => { e.stopPropagation(); clearAlarm(patient.id); }} 
                  className="ml-1 hover:text-zinc-800 shrink-0"
                  aria-label="Signalni tozalash"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          )}
          
          {!isSmall && (
            <div className="flex space-x-1 items-center mt-0.5">
              <div className={cn(
                "flex items-center justify-center rounded px-1.5 py-0.5 border text-[9px] font-bold",
                patient.news2Score >= 7 ? "bg-red-100 border-red-300 text-red-800" :
                patient.news2Score >= 5 ? "bg-orange-100 border-orange-300 text-orange-900" :
                patient.news2Score >= 1 ? "bg-amber-100 border-amber-300 text-amber-900" :
                "bg-emerald-100 border-emerald-300 text-emerald-900"
              )} title="NEWS2 Bali">
                N: {patient.news2Score}
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); togglePinPatient(patient.id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-zinc-200 rounded text-zinc-600 hover:text-zinc-900"
                title={patient.isPinned ? "Qadashni bekor qilish" : "Qadab qo'yish"}
              >
                <Pin className={cn("w-3 h-3", patient.isPinned && "fill-emerald-400 text-emerald-400 opacity-100")} />
              </button>
              {deviceBattery > 0 ? (
                <div className="flex items-center text-zinc-600" title={`Quvvat: ${Math.round(deviceBattery)}%`}>
                  <Battery className={cn("w-2.5 h-2.5", deviceBattery < 20 ? "text-red-500 animate-pulse" : "")} />
                </div>
              ) : (
                <span className="text-[9px] text-zinc-600 font-mono" title="Qurilmadan batareya ma'lumoti hali yo'q">
                  —
                </span>
              )}
              <div className="relative flex items-center">
                {timeLeft !== null && (
                  <span className="text-[10px] text-purple-700 mr-1 font-mono font-semibold">
                    {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                  </span>
                )}
                <button 
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowScheduleMenu(!showScheduleMenu); }}
                  className={cn(
                    "text-zinc-600 hover:text-purple-700 transition-colors",
                    scheduledCheck ? "text-purple-800" : ""
                  )} 
                  title="Rejali tekshiruv"
                  aria-expanded={showScheduleMenu}
                  aria-haspopup="true"
                >
                  <Clock className="w-2.5 h-2.5" />
                </button>
                
                {showScheduleMenu && (
                  <div
                    ref={scheduleMenuRef}
                    role="menu"
                    className="absolute right-0 mt-2 w-32 bg-white border border-zinc-200 rounded-md shadow-lg z-20 overflow-hidden"
                  >
                    <div className="px-3 py-2 text-xs font-bold text-zinc-700 border-b border-zinc-200">Interval</div>
                    <button type="button" role="menuitem" onClick={(e) => handleSetSchedule(e, 10)} className="w-full text-left px-3 py-2 text-sm text-zinc-900 font-medium hover:bg-zinc-100">10 soniya</button>
                    <button type="button" role="menuitem" onClick={(e) => handleSetSchedule(e, 30)} className="w-full text-left px-3 py-2 text-sm text-zinc-900 font-medium hover:bg-zinc-100">30 soniya</button>
                    <button type="button" role="menuitem" onClick={(e) => handleSetSchedule(e, 60)} className="w-full text-left px-3 py-2 text-sm text-zinc-900 font-medium hover:bg-zinc-100">1 daqiqa</button>
                    <button type="button" role="menuitem" onClick={(e) => handleSetSchedule(e, 0)} className="w-full text-left px-3 py-2 text-sm text-red-700 font-medium hover:bg-red-50 border-t border-zinc-200">O'chirish</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Numerics Grid */}
      <div className={cn(
        "flex-1 grid gap-0.5 min-h-0 mt-1",
        isSmall ? "grid-cols-2" : isMedium ? "grid-cols-2 grid-rows-2" : "grid-cols-3 grid-rows-2"
      )}>
        
        {/* HR */}
        <div className={cn(
          "bg-emerald-50/90 rounded flex flex-col justify-between border border-emerald-200 overflow-hidden",
          isSmall ? "p-0.5" : "p-1.5",
          isLarge && "col-span-1 row-span-2"
        )}>
          <div className="flex justify-between items-start shrink-0">
            <span className={cn("text-emerald-800 font-bold truncate pr-1", isSmall ? "text-[7px]" : "text-[9px]")}>YUCh</span>
            {!isSmall && <Heart className={cn("w-2.5 h-2.5 text-emerald-700 shrink-0", vitals.hr > 0 ? 'animate-pulse' : '')} />}
          </div>
          <div className="flex items-baseline justify-end flex-1 min-h-0 items-center">
            <span className={cn(
              "font-bold text-emerald-800 font-mono tracking-tighter truncate leading-none",
              isSmall ? "text-sm" : isMedium ? "text-xl" : "text-3xl"
            )}>
              {vitals.hr === 0 ? '---' : vitals.hr}
            </span>
          </div>
          {!isSmall && (
            <div className="flex justify-between text-[8px] text-emerald-700/80 font-mono shrink-0 font-medium">
              <span>{alarmLimits?.hr?.low ?? '—'}</span>
              <span>{alarmLimits?.hr?.high ?? '—'}</span>
            </div>
          )}
        </div>

        {/* SpO2 */}
        <div className={cn(
          "bg-cyan-50/90 rounded flex flex-col justify-between border border-cyan-200 overflow-hidden",
          isSmall ? "p-0.5" : "p-1.5",
          isLarge && "col-span-1 row-span-2"
        )}>
          <div className="flex justify-between items-start shrink-0">
            <span className={cn("text-cyan-900 font-bold truncate pr-1", isSmall ? "text-[7px]" : "text-[9px]")}>SpO2%</span>
            {!isSmall && <Droplets className="w-2.5 h-2.5 text-cyan-700 shrink-0" />}
          </div>
          <div className="flex items-baseline justify-end flex-1 min-h-0 items-center">
            <span className={cn(
              "font-bold text-cyan-800 font-mono tracking-tighter truncate leading-none",
              isSmall ? "text-sm" : isMedium ? "text-xl" : "text-3xl"
            )}>
              {vitals.spo2 === 0 ? '---' : vitals.spo2}
            </span>
          </div>
          {!isSmall && (
            <div className="flex justify-between text-[8px] text-cyan-800/80 font-mono shrink-0 font-medium">
              <span>{alarmLimits?.spo2?.low ?? '—'}</span>
              <span>{alarmLimits?.spo2?.high ?? '—'}</span>
            </div>
          )}
        </div>

        {/* NIBP */}
        <div className={cn(
          "bg-zinc-100 rounded flex flex-col justify-between border border-zinc-300 relative group/nibp overflow-hidden",
          isSmall ? "p-0.5 col-span-2" : "p-1.5",
          isMedium && "col-span-2",
          isLarge && "col-span-1 row-span-1"
        )}>
          <div className="flex justify-between items-start shrink-0">
            <span className={cn("text-zinc-800 font-bold truncate pr-1", isSmall ? "text-[7px]" : "text-[9px]")}>AQB</span>
            {!isSmall && (
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); measureNibp(patient.id); }}
                className="opacity-0 group-hover/nibp:opacity-100 transition-opacity p-0.5 bg-white rounded border border-zinc-300 text-zinc-800 hover:bg-zinc-50 shrink-0"
                title="O'lchash"
                aria-label="Qon bosimini o'lchash"
              >
                <RefreshCw className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
          <div className="flex flex-col items-end justify-center flex-1 min-h-0 overflow-hidden">
            <div className="flex items-baseline truncate max-w-full">
              <span className={cn(
                "font-bold text-zinc-900 font-mono tracking-tighter truncate leading-none",
                isSmall ? "text-xs" : isMedium ? "text-lg" : "text-xl"
              )}>
                {vitals.nibpSys === 0 ? '---' : vitals.nibpSys}
              </span>
              <span className="text-zinc-500 mx-0.5 shrink-0 text-xs">/</span>
              <span className={cn(
                "font-bold text-zinc-900 font-mono tracking-tighter truncate leading-none",
                isSmall ? "text-xs" : isMedium ? "text-lg" : "text-xl"
              )}>
                {vitals.nibpDia === 0 ? '---' : vitals.nibpDia}
              </span>
            </div>
            {!isSmall && (
              <span className="text-[8px] text-zinc-600 mt-0.5 truncate max-w-full shrink-0 font-medium">
                {vitals.nibpTime ? formatDistanceToNow(vitals.nibpTime, { addSuffix: true, locale: uz }) : "O'lchanmagan"}
              </span>
            )}
          </div>
        </div>

        {/* RR & Temp (Only for Large) */}
        {isLarge && (
          <div className="flex gap-0.5 col-span-1 row-span-1 min-h-0">
            <div className="flex-1 bg-amber-50 rounded p-1 flex flex-col justify-between border border-amber-300 overflow-hidden">
              <span className="text-amber-900 font-bold text-[9px] shrink-0 truncate">NCh</span>
              <div className="flex items-baseline justify-end flex-1 min-h-0 items-center">
                <span className="text-lg font-bold text-amber-900 font-mono tracking-tighter truncate leading-none">
                  {vitals.rr === 0 ? '---' : vitals.rr}
                </span>
              </div>
            </div>
            <div className="flex-1 bg-orange-50 rounded p-1 flex flex-col justify-between border border-orange-300 overflow-hidden">
              <span className="text-orange-900 font-bold text-[9px] shrink-0 truncate">Harorat</span>
              <div className="flex items-baseline justify-end flex-1 min-h-0 items-center">
                <span className="text-lg font-bold text-orange-900 font-mono tracking-tighter truncate leading-none">
                  {typeof vitals.temp === 'number' && vitals.temp > 0 && !Number.isNaN(vitals.temp)
                    ? vitals.temp.toFixed(1)
                    : '---'}
                </span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
});
