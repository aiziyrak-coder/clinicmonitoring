import React, { useState, useMemo, useCallback, useLayoutEffect, Component, ErrorInfo, ReactNode } from 'react';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { useStore, AlarmLimits, mergeAlarmLimits } from '../store';
import { X, Download, Activity, Heart, Battery, UserCircle, Calendar, Stethoscope, UserMinus, Settings2, LineChart as ChartIcon, Save, AlertTriangle, Pill, FlaskConical, FileText, Plus } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

function CustomConfirm({ isOpen, title, message, onConfirm, onCancel }: { isOpen: boolean, title: string, message: string, onConfirm: () => void, onCancel: () => void }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="presentation" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-labelledby="confirm-discharge-title"
        className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-sm p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center space-x-3 mb-4 text-red-400">
          <AlertTriangle className="w-6 h-6" aria-hidden />
          <h3 id="confirm-discharge-title" className="text-lg font-bold">{title}</h3>
        </div>
        <p className="text-zinc-300 mb-6">{message}</p>
        <div className="flex justify-end space-x-3">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-zinc-400 hover:text-white transition-colors">Yo'q</button>
          <button type="button" onClick={onConfirm} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">Ha, chiqarish</button>
        </div>
      </div>
    </div>
  );
}

interface PatientDetailsErrorBoundaryProps {
  children: ReactNode;
}

interface PatientDetailsErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<PatientDetailsErrorBoundaryProps, PatientDetailsErrorBoundaryState> {
  declare readonly props: Readonly<PatientDetailsErrorBoundaryProps>;

  state: PatientDetailsErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): PatientDetailsErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("PatientDetailsModal Error:", error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-red-500 rounded-xl w-full max-w-lg p-6 shadow-2xl">
            <h2 className="text-red-500 text-xl font-bold mb-4">Xatolik yuz berdi</h2>
            <p className="text-zinc-300 mb-4">Bemor ma'lumotlarini yuklashda xatolik yuz berdi.</p>
            <pre className="bg-black p-4 rounded text-red-400 text-xs overflow-auto max-h-40">
              {this.state.error?.toString()}
            </pre>
            <div className="mt-6 flex justify-end">
              <button 
                type="button"
                onClick={() => window.location.reload()} 
                className="px-4 py-2 bg-zinc-800 text-white rounded hover:bg-zinc-700"
              >
                Sahifani yangilash
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function PatientDetailsModal() {
  const selectedPatientId = useStore(state => state.selectedPatientId);
  const patients = useStore(state => state.patients);
  const patient = selectedPatientId ? patients[selectedPatientId] : null;

  if (!selectedPatientId || !patient) return null;

  return (
    <ErrorBoundary>
      <PatientDetailsModalContent patientId={selectedPatientId} />
    </ErrorBoundary>
  );
}

function PatientDetailsModalContent({ patientId }: { patientId: string }) {
  const setSelectedPatientId = useStore(state => state.setSelectedPatientId);
  const dischargePatient = useStore(state => state.dischargePatient);
  const updateLimits = useStore(state => state.updateLimits);
  const patients = useStore(state => state.patients);
  const privacyMode = useStore(state => state.privacyMode);

  const [activeTab, setActiveTab] = useState<'overview' | 'limits' | 'medications' | 'labs' | 'notes'>('overview');
  const [localLimits, setLocalLimits] = useState<AlarmLimits | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [newNote, setNewNote] = useState('');
  const addClinicalNote = useStore(state => state.addClinicalNote);

  const patient = patients[patientId];

  const closeModal = useCallback(() => setSelectedPatientId(null), [setSelectedPatientId]);

  const handleModalEscape = useCallback(() => {
    if (confirmOpen) {
      setConfirmOpen(false);
    } else {
      closeModal();
    }
  }, [confirmOpen, closeModal]);

  useModalDismiss(true, handleModalEscape);

  React.useEffect(() => {
    setActiveTab('overview');
    setLocalLimits(null);
    setNewNote('');
    setConfirmOpen(false);
  }, [patientId]);

  React.useLayoutEffect(() => {
    if (activeTab !== 'limits' || !patient) return;
    setLocalLimits(mergeAlarmLimits(patient.alarmLimits));
  }, [activeTab, patientId, patient?.alarmLimits, patient]);

  const chartData = useMemo(() => {
    if (!patient) return [];
    return (patient.history || []).map(h => ({
      time: h.timestamp ? format(new Date(h.timestamp), 'HH:mm:ss') : '',
      hr: Math.round(h.hr),
      spo2: Math.round(h.spo2)
    }));
  }, [patient?.history]);

  const noHl7VitalsYet = useMemo(() => {
    if (!patient) return false;
    const v = patient.vitals;
    const h = patient.history || [];
    const flat =
      !v ||
      ((v.hr || 0) === 0 && (v.spo2 || 0) === 0 && (v.nibpSys || 0) === 0);
    return flat && h.length === 0;
  }, [patient?.vitals, patient?.history]);

  if (!patient) return null;

  const maskedName = privacyMode
    ? (patient.name || '').replace(/([A-ZА-ЯЁ]\.\s[A-ZА-ЯЁ]).*/u, '$1***')
    : (patient.name || 'Noma\'lum');
  const vitals = patient.vitals || { hr: 0, spo2: 0, nibpSys: 0, nibpDia: 0, rr: 0, temp: 0, nibpTime: 0 };
  const alarm = patient.alarm || { level: 'none' };

  const handleExport = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Vaqt,YUCh,SpO2,AQB Sys,AQB Dia\n"
      + (patient.history || []).map(h => `${new Date(h.timestamp).toISOString()},${h.hr.toFixed(0)},${h.spo2.toFixed(0)},${h.nibpSys.toFixed(0)},${h.nibpDia.toFixed(0)}`).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `bemor_${patient.id}_tarix.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDischarge = () => {
    setConfirmOpen(true);
  };

  const confirmDischarge = () => {
    dischargePatient(patient.id);
    setSelectedPatientId(null);
    setConfirmOpen(false);
  };

  const handleSaveLimits = () => {
    if (localLimits) {
      updateLimits(patient.id, localLimits);
      setActiveTab('overview');
    }
  };

  const handleLimitChange = (param: keyof AlarmLimits, bound: 'low' | 'high', value: string) => {
    if (!localLimits) return;
    const num = parseInt(value, 10);
    if (isNaN(num)) return;
    
    setLocalLimits({
      ...localLimits,
      [param]: {
        ...localLimits[param],
        [bound]: num
      }
    });
  };

  const handleAddNote = () => {
    if (newNote.trim()) {
      addClinicalNote(patient.id, {
        text: newNote,
        author: 'Dr. Admin' // Mock author
      });
      setNewNote('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="presentation"
      onClick={closeModal}
    >
      <CustomConfirm 
        isOpen={confirmOpen}
        title="Bemorni chiqarish"
        message="Haqiqatan ham ushbu bemorga javob bermoqchimisiz?"
        onConfirm={confirmDischarge}
        onCancel={() => setConfirmOpen(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-details-title"
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-800 sticky top-0 bg-zinc-900/90 backdrop-blur z-10">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500">
              <UserCircle className="w-8 h-8" aria-hidden />
            </div>
            <div>
              <h2 id="patient-details-title" className="text-2xl font-bold text-zinc-100">{maskedName}</h2>
              <div className="flex items-center space-x-3 text-sm text-zinc-400 mt-1">
                <span className="flex items-center"><Activity className="w-4 h-4 mr-1" /> ID: {patient.id}</span>
                <span className="flex items-center"><Calendar className="w-4 h-4 mr-1" /> Qabul: {patient.admissionDate ? format(new Date(patient.admissionDate), 'dd.MM.yyyy HH:mm') : 'Noma\'lum'}</span>
              </div>
              {alarm.level !== 'none' && (
                <div className={`mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  alarm.level === 'red' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                  alarm.level === 'yellow' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                  alarm.level === 'purple' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                  'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                }`}>
                  <span className={`w-2 h-2 rounded-full mr-2 animate-pulse ${
                    alarm.level === 'red' ? 'bg-red-500' :
                    alarm.level === 'yellow' ? 'bg-yellow-500' :
                    alarm.level === 'purple' ? 'bg-purple-500' :
                    'bg-blue-500'
                  }`} />
                  {alarm.message || 'DIQQAT'} {alarm.patientId ? `(ID: ${alarm.patientId})` : ''}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button type="button" onClick={handleDischarge} className="flex items-center px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors text-sm font-medium border border-red-500/20">
              <UserMinus className="w-4 h-4 mr-2" aria-hidden />
              Javob berish
            </button>
            <button type="button" onClick={handleExport} className="flex items-center px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors text-sm font-medium">
              <Download className="w-4 h-4 mr-2" aria-hidden />
              Eksport (CSV)
            </button>
            <button type="button" onClick={closeModal} className="p-2 text-zinc-400 hover:text-white bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-colors" aria-label="Yopish">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex border-b border-zinc-800 overflow-x-auto" role="tablist" aria-label="Bemor bo'limlari">
          <button 
            type="button"
            role="tab"
            aria-selected={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3 text-sm font-medium flex items-center whitespace-nowrap transition-colors ${activeTab === 'overview' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-400/5' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
          >
            <ChartIcon className="w-4 h-4 mr-2" aria-hidden />
            Umumiy & Trendlar
          </button>
          <button 
            type="button"
            role="tab"
            aria-selected={activeTab === 'limits'}
            onClick={() => setActiveTab('limits')}
            className={`px-6 py-3 text-sm font-medium flex items-center whitespace-nowrap transition-colors ${activeTab === 'limits' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-400/5' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
          >
            <Settings2 className="w-4 h-4 mr-2" aria-hidden />
            Signal Chegaralari
          </button>
          <button 
            type="button"
            role="tab"
            aria-selected={activeTab === 'medications'}
            onClick={() => setActiveTab('medications')}
            className={`px-6 py-3 text-sm font-medium flex items-center whitespace-nowrap transition-colors ${activeTab === 'medications' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-400/5' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
          >
            <Pill className="w-4 h-4 mr-2" aria-hidden />
            Dori-darmonlar
          </button>
          <button 
            type="button"
            role="tab"
            aria-selected={activeTab === 'labs'}
            onClick={() => setActiveTab('labs')}
            className={`px-6 py-3 text-sm font-medium flex items-center whitespace-nowrap transition-colors ${activeTab === 'labs' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-400/5' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
          >
            <FlaskConical className="w-4 h-4 mr-2" aria-hidden />
            Laboratoriya
          </button>
          <button 
            type="button"
            role="tab"
            aria-selected={activeTab === 'notes'}
            onClick={() => setActiveTab('notes')}
            className={`px-6 py-3 text-sm font-medium flex items-center whitespace-nowrap transition-colors ${activeTab === 'notes' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-400/5' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
          >
            <FileText className="w-4 h-4 mr-2" aria-hidden />
            Qaydlar
          </button>
        </div>

        <div className="p-6 space-y-6">
          
          {activeTab === 'overview' ? (
            <>
              {noHl7VitalsYet && (
                <div
                  role="status"
                  className="rounded-xl border border-cyan-500/25 bg-cyan-950/40 p-4 text-sm text-cyan-100"
                >
                  <p className="font-semibold text-cyan-200 mb-1">Vitallar hali kelmagan</p>
                  <p className="text-zinc-300">
                    HL7 ulanishi bo‘lishi mumkin, lekin serverga OBX ichida YUCh/SpO2 kabi qiymatlar
                    yetib kelmayapti — odatda sensorlar ulanmagan (masalan, ECG lead off, SpO2 yo‘q) yoki
                    monitor HL7 da faqat xizmat xabarlarini yuboradi.                     Monitorda raqamlar ko‘rinib turib,
                    bu yerda bo‘lmasa, serverda <span className="font-mono text-zinc-400">journalctl -u clinicmonitoring-daphne</span> da
                    «HL7: vitallar ajratilmadi» / «vitallar qabul qilindi» qatorlarini tekshiring. Kerak bo‘lsa
                    backend <span className="font-mono text-zinc-400">.env</span> da
                    <span className="font-mono text-zinc-400">HL7_LOG_RAW_PREVIEW=true</span> (vaqtincha), Daphne qayta ishga tushiring — logda xom HL7 ko‘rinadi (maxfiylik!).
                  </p>
                </div>
              )}
              {/* Info Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700/50">
                  <div className="flex items-center text-zinc-400 mb-2">
                    <Stethoscope className="w-4 h-4 mr-2" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Tashxis</span>
                  </div>
                  <p className="text-zinc-200 font-medium">{patient.diagnosis}</p>
                </div>
                <div className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700/50">
                  <div className="flex items-center text-zinc-400 mb-2">
                    <UserCircle className="w-4 h-4 mr-2" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Shifokor / Hamshira</span>
                  </div>
                  <p className="text-zinc-200 font-medium">{patient.doctor} <br/><span className="text-sm text-zinc-400">{patient.assignedNurse}</span></p>
                </div>
                <div className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700/50">
                  <div className="flex items-center text-zinc-400 mb-2">
                    <Activity className="w-4 h-4 mr-2" />
                    <span className="text-xs font-semibold uppercase tracking-wider">NEWS2 Bali</span>
                  </div>
                  <p className={`text-2xl font-bold ${
                    (patient.news2Score || 0) >= 7 ? 'text-red-500' :
                    (patient.news2Score || 0) >= 5 ? 'text-orange-500' :
                    (patient.news2Score || 0) >= 1 ? 'text-yellow-500' :
                    'text-emerald-500'
                  }`}>{patient.news2Score || 0}</p>
                </div>
                <div className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700/50">
                  <div className="flex items-center text-zinc-400 mb-2">
                    <Battery className="w-4 h-4 mr-2" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Qurilma Quvvati</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-full bg-zinc-700 rounded-full h-2.5 mr-3">
                      <div className={`h-2.5 rounded-full ${(patient.deviceBattery || 0) > 20 ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${patient.deviceBattery || 0}%` }}></div>
                    </div>
                    <span className="text-zinc-200 font-mono text-sm">{Math.round(patient.deviceBattery || 0)}%</span>
                  </div>
                </div>
              </div>

              {/* Charts */}
              <div className="bg-zinc-800/30 p-5 rounded-xl border border-zinc-700/50">
                <h3 className="text-lg font-semibold text-zinc-200 mb-4 flex items-center">
                  <Heart className="w-5 h-5 mr-2 text-emerald-500" />
                  Tarixiy Trendlar (Oxirgi 5 daqiqa)
                </h3>
                <div className="w-full min-w-0 min-h-[256px] h-64 shrink-0">
                  <ResponsiveContainer width="100%" height={256} debounce={80}>
                    <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                      <XAxis dataKey="time" stroke="#a1a1aa" fontSize={12} tickMargin={10} />
                      <YAxis yAxisId="left" stroke="#10b981" fontSize={12} domain={['auto', 'auto']} />
                      <YAxis yAxisId="right" orientation="right" stroke="#06b6d4" fontSize={12} domain={[80, 100]} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                        itemStyle={{ fontWeight: 500 }}
                      />
                      <Line yAxisId="left" type="monotone" dataKey="hr" name="YUCh" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                      <Line yAxisId="right" type="monotone" dataKey="spo2" name="SpO2" stroke="#06b6d4" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          ) : activeTab === 'limits' ? (
            <div className="bg-zinc-800/30 p-6 rounded-xl border border-zinc-700/50">
              <h3 className="text-lg font-semibold text-zinc-200 mb-6 flex items-center">
                <Settings2 className="w-5 h-5 mr-2 text-emerald-500" aria-hidden />
                Signal Chegaralarini Sozlash
              </h3>
              
              {!localLimits && (
                <p className="text-sm text-zinc-500 mb-4">Chegaralar yuklanmoqda...</p>
              )}

              {localLimits && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* HR Limits */}
                    <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800">
                      <div className="flex items-center text-emerald-400 mb-4">
                        <Heart className="w-4 h-4 mr-2" />
                        <span className="font-medium">Yurak Urib Turishi (YUCh)</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="flex-1">
                          <label className="block text-xs text-zinc-500 mb-1">Pastki chegara</label>
                          <input type="number" value={localLimits.hr.low} onChange={(e) => handleLimitChange('hr', 'low', e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-emerald-500" />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs text-zinc-500 mb-1">Yuqori chegara</label>
                          <input type="number" value={localLimits.hr.high} onChange={(e) => handleLimitChange('hr', 'high', e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-emerald-500" />
                        </div>
                      </div>
                    </div>

                    {/* SpO2 Limits */}
                    <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800">
                      <div className="flex items-center text-cyan-400 mb-4">
                        <Activity className="w-4 h-4 mr-2" />
                        <span className="font-medium">Saturatsiya (SpO2)</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="flex-1">
                          <label className="block text-xs text-zinc-500 mb-1">Pastki chegara</label>
                          <input type="number" value={localLimits.spo2.low} onChange={(e) => handleLimitChange('spo2', 'low', e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-cyan-500" />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs text-zinc-500 mb-1">Yuqori chegara</label>
                          <input type="number" value={localLimits.spo2.high} onChange={(e) => handleLimitChange('spo2', 'high', e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-cyan-500" />
                        </div>
                      </div>
                    </div>

                    {/* NIBP Sys Limits */}
                    <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800">
                      <div className="flex items-center text-zinc-300 mb-4">
                        <Activity className="w-4 h-4 mr-2" />
                        <span className="font-medium">Sistolik Qon Bosimi</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="flex-1">
                          <label className="block text-xs text-zinc-500 mb-1">Pastki chegara</label>
                          <input type="number" value={localLimits.nibpSys.low} onChange={(e) => handleLimitChange('nibpSys', 'low', e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-500" />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs text-zinc-500 mb-1">Yuqori chegara</label>
                          <input type="number" value={localLimits.nibpSys.high} onChange={(e) => handleLimitChange('nibpSys', 'high', e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-500" />
                        </div>
                      </div>
                    </div>

                    {/* NIBP Dia Limits */}
                    <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800">
                      <div className="flex items-center text-zinc-400 mb-4">
                        <Activity className="w-4 h-4 mr-2" />
                        <span className="font-medium">Diastolik Qon Bosimi</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="flex-1">
                          <label className="block text-xs text-zinc-500 mb-1">Pastki chegara</label>
                          <input type="number" value={localLimits.nibpDia.low} onChange={(e) => handleLimitChange('nibpDia', 'low', e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-500" />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs text-zinc-500 mb-1">Yuqori chegara</label>
                          <input type="number" value={localLimits.nibpDia.high} onChange={(e) => handleLimitChange('nibpDia', 'high', e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-500" />
                        </div>
                      </div>
                    </div>

                  </div>

                  <div className="flex justify-end pt-4 border-t border-zinc-800">
                    <button 
                      type="button"
                      onClick={handleSaveLimits}
                      className="flex items-center px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors font-medium"
                    >
                      <Save className="w-4 h-4 mr-2" aria-hidden />
                      Saqlash
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'medications' ? (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-zinc-100 flex items-center">
                <Pill className="w-5 h-5 mr-2 text-emerald-400" />
                Dori-darmonlar
              </h3>
              {patient.medications && patient.medications.length > 0 ? (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm text-zinc-400">
                    <thead className="bg-zinc-800/50 text-xs uppercase text-zinc-500">
                      <tr>
                        <th className="px-4 py-3">Nomi</th>
                        <th className="px-4 py-3">Dozasi</th>
                        <th className="px-4 py-3">Tezligi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {patient.medications.map(med => (
                        <tr key={med.id} className="hover:bg-zinc-800/30">
                          <td className="px-4 py-3 font-medium text-zinc-200">{med.name}</td>
                          <td className="px-4 py-3">{med.dose}</td>
                          <td className="px-4 py-3">{med.rate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-zinc-500 italic">Dori-darmonlar belgilanmagan.</p>
              )}
            </div>
          ) : activeTab === 'labs' ? (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-zinc-100 flex items-center">
                <FlaskConical className="w-5 h-5 mr-2 text-emerald-400" />
                Laboratoriya Natijalari
              </h3>
              {patient.labs && patient.labs.length > 0 ? (
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm text-zinc-400">
                    <thead className="bg-zinc-800/50 text-xs uppercase text-zinc-500">
                      <tr>
                        <th className="px-4 py-3">Tahlil</th>
                        <th className="px-4 py-3">Natija</th>
                        <th className="px-4 py-3">Vaqt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {patient.labs.map(lab => (
                        <tr key={lab.id} className="hover:bg-zinc-800/30">
                          <td className="px-4 py-3 font-medium text-zinc-200">{lab.name}</td>
                          <td className={`px-4 py-3 font-bold ${lab.isAbnormal ? 'text-red-400' : 'text-emerald-400'}`}>
                            {lab.value} {lab.unit}
                          </td>
                          <td className="px-4 py-3">{lab.time ? format(new Date(lab.time), 'dd.MM HH:mm') : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-zinc-500 italic">Laboratoriya natijalari yo'q.</p>
              )}
            </div>
          ) : activeTab === 'notes' ? (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-zinc-100 flex items-center">
                <FileText className="w-5 h-5 mr-2 text-emerald-400" />
                Klinik Qaydlar
              </h3>
              
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Yangi qayd qo'shish..."
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-200 focus:outline-none focus:border-emerald-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                />
                <button 
                  type="button"
                  onClick={handleAddNote}
                  disabled={!newNote.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center"
                >
                  <Plus className="w-4 h-4 mr-1" aria-hidden /> Qo'shish
                </button>
              </div>

              <div className="space-y-3">
                {patient.notes && patient.notes.length > 0 ? (
                  [...patient.notes].reverse().map(note => (
                    <div key={note.id} className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium text-zinc-300">{note.author}</span>
                        <span className="text-xs text-zinc-500">{note.time ? format(new Date(note.time), 'dd.MM.yyyy HH:mm') : ''}</span>
                      </div>
                      <p className="text-zinc-400 text-sm">{note.text}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-zinc-500 italic">Qaydlar mavjud emas.</p>
                )}
              </div>
            </div>
          ) : null}

        </div>
      </div>
    </div>
  );
}
