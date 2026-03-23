import { useState, useEffect, useCallback } from 'react';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { X, Server, Building2, MonitorSmartphone, Users, Plus, Trash2, Edit2, Info, AlertTriangle, Radio, UserPlus, Wifi } from 'lucide-react';
import { authedFetch } from '../authStore';
import { useStore } from '../store';
import { AddDeviceFromScreenModal } from './AddDeviceFromScreenModal';

interface SettingsModalProps {
  onClose: () => void;
  /** Sozlamalardan bemor qabul oynasini ochish */
  onOpenAdmitPatient?: () => void;
}

// Custom Dialogs to replace prompt/confirm in iframe
function CustomPrompt({ isOpen, title, fields, onSubmit, onCancel }: { isOpen: boolean, title: string, fields: {name: string, label: string, placeholder?: string}[], onSubmit: (data: any) => void, onCancel: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  
  useEffect(() => {
    if (isOpen) setValues({});
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-md p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <h3 className="text-lg font-bold text-white mb-4">{title}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(values); }}>
          <div className="space-y-4 mb-6">
            {fields.map(f => (
              <div key={f.name}>
                <label className="block text-sm text-zinc-400 mb-1">{f.label}</label>
                <input 
                  type="text" 
                  value={values[f.name] || ''}
                  onChange={e => setValues({...values, [f.name]: e.target.value})}
                  placeholder={f.placeholder}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-white focus:border-emerald-500 outline-none"
                  autoFocus={fields[0].name === f.name}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end space-x-3">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-zinc-400 hover:text-white transition-colors">Bekor qilish</button>
            <button type="submit" className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors">Saqlash</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CustomConfirm({ isOpen, title, message, onConfirm, onCancel }: { isOpen: boolean, title: string, message: string, onConfirm: () => void, onCancel: () => void }) {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-sm p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
      >
        <div className="flex items-center space-x-3 mb-4 text-red-400">
          <AlertTriangle className="w-6 h-6" />
          <h3 className="text-lg font-bold">{title}</h3>
        </div>
        <p className="text-zinc-300 mb-6">{message}</p>
        <div className="flex justify-end space-x-3">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-zinc-400 hover:text-white transition-colors">Yo'q</button>
          <button type="button" onClick={onConfirm} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">Ha, o'chirish</button>
        </div>
      </div>
    </div>
  );
}

export function SettingsModal({ onClose, onOpenAdmitPatient }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'structure' | 'devices' | 'patients' | 'integration'>('structure');
  const [data, setData] = useState<any>({ departments: [], rooms: [], beds: [], devices: [] });
  const { patients, dischargePatient } = useStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingDeviceId, setCheckingDeviceId] = useState<string | null>(null);
  const [markingOnlineId, setMarkingOnlineId] = useState<string | null>(null);
  const [handshakeSavingId, setHandshakeSavingId] = useState<string | null>(null);
  const [connectionCheck, setConnectionCheck] = useState<{
    deviceId: string;
    allOk: boolean;
    summary: string;
    warnings: string[];
    hints: string[];
    checkTone: 'success' | 'warning' | 'info';
    hl7: Record<string, unknown>;
    hl7Diagnostic: Record<string, unknown>;
    firewallHints: string[];
    assignment: { bedAssigned: boolean; patientOnBed: boolean };
    secondsSinceLastMessage: number | null;
    isReceivingData: boolean;
  } | null>(null);

  // Dialog states
  const [promptConfig, setPromptConfig] = useState<{isOpen: boolean, title: string, fields: any[], onSubmit: (data: any) => void} | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void} | null>(null);
  const [showAddDeviceFromScreen, setShowAddDeviceFromScreen] = useState(false);

  const fetchData = async (signal?: AbortSignal) => {
    try {
      const res = await authedFetch('/api/infrastructure/', { signal });
      if (!res.ok) throw new Error("Ma'lumotlarni yuklashda xatolik");
      const json = await res.json();
      setData(json);
      setConnectionCheck(null);
      setLoading(false);
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      console.error(e);
      setError(e.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, []);

  const closeDialogs = () => {
    setPromptConfig(null);
    setConfirmConfig(null);
  };

  const handleSettingsEscape = useCallback(() => {
    if (showAddDeviceFromScreen) {
      setShowAddDeviceFromScreen(false);
      return;
    }
    if (promptConfig || confirmConfig) {
      setPromptConfig(null);
      setConfirmConfig(null);
    } else {
      onClose();
    }
  }, [showAddDeviceFromScreen, promptConfig, confirmConfig, onClose]);

  useModalDismiss(true, handleSettingsEscape);

  const checkDeviceConnection = async (deviceId: string) => {
    setCheckingDeviceId(deviceId);
    setError(null);
    setConnectionCheck(null);
    try {
      const res = await authedFetch(`/api/devices/${deviceId}/connection-check/`);
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        setError('Server javabi noto‘g‘ri');
        return;
      }
      if (res.status === 404) {
        setError('Qurilma topilmadi');
        return;
      }
      if (!res.ok) {
        setError(`So'rov xatosi (${res.status})`);
        return;
      }
      if (data.success === false && typeof data.error === 'string') {
        setError(data.detail ? `${data.error}: ${String(data.detail)}` : data.error);
        return;
      }
      const toneRaw = data.checkTone;
      const checkTone: 'success' | 'warning' | 'info' =
        toneRaw === 'success' || toneRaw === 'warning' || toneRaw === 'info'
          ? toneRaw
          : Boolean(data.allOk)
            ? 'success'
            : Array.isArray(data.warnings) && (data.warnings as string[]).length > 0
              ? 'warning'
              : 'info';
      setConnectionCheck({
        deviceId,
        allOk: Boolean(data.allOk),
        summary: String(data.summary ?? ''),
        warnings: Array.isArray(data.warnings) ? (data.warnings as string[]) : [],
        hints: Array.isArray(data.hints) ? (data.hints as string[]) : [],
        checkTone,
        hl7: typeof data.hl7 === 'object' && data.hl7 !== null ? (data.hl7 as Record<string, unknown>) : {},
        hl7Diagnostic:
          typeof data.hl7Diagnostic === 'object' && data.hl7Diagnostic !== null
            ? (data.hl7Diagnostic as Record<string, unknown>)
            : {},
        firewallHints: Array.isArray(data.firewallHints) ? (data.firewallHints as string[]) : [],
        assignment: {
          bedAssigned: Boolean((data.assignment as { bedAssigned?: boolean })?.bedAssigned),
          patientOnBed: Boolean((data.assignment as { patientOnBed?: boolean })?.patientOnBed),
        },
        secondsSinceLastMessage:
          typeof data.secondsSinceLastMessage === 'number' ? data.secondsSinceLastMessage : null,
        isReceivingData: Boolean(data.isReceivingData),
      });
    } catch {
      setError('Tarmoq xatosi — backend ishlayotganini tekshiring.');
    } finally {
      setCheckingDeviceId(null);
    }
  };

  const markDeviceOnlineTest = async (deviceId: string) => {
    setMarkingOnlineId(deviceId);
    setError(null);
    try {
      const res = await authedFetch(`/api/devices/${deviceId}/mark-online/`, { method: 'POST' });
      if (!res.ok) {
        const raw = await res.text();
        setError(`Onlayn belgilashda xato: ${res.status} ${raw.slice(0, 200)}`);
        return;
      }
      await fetchData();
    } catch {
      setError('Tarmoq xatosi — backend ishlayotganini tekshiring.');
    } finally {
      setMarkingOnlineId(null);
    }
  };

  const addDepartment = () => {
    setPromptConfig({
      isOpen: true,
      title: "Yangi bo'lim qo'shish",
      fields: [{ name: 'name', label: "Bo'lim nomi", placeholder: "Masalan: Reanimatsiya" }],
      onSubmit: async (vals) => {
        if (!vals.name) return closeDialogs();
        try {
          await authedFetch('/api/departments/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: vals.name }) });
          closeDialogs();
          fetchData();
        } catch (e) {
          console.error(e);
          setError("Xatolik yuz berdi");
        }
      }
    });
  };

  const deleteDepartment = (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "Bo'limni o'chirish",
      message: "Rostdan ham bu bo'limni o'chirmoqchimisiz?",
      onConfirm: async () => {
        try {
          await authedFetch(`/api/departments/${id}/`, { method: 'DELETE' });
          closeDialogs();
          fetchData();
        } catch (e) {
          console.error(e);
          setError("Xatolik yuz berdi");
        }
      }
    });
  };

  const addRoom = (deptId: string) => {
    setPromptConfig({
      isOpen: true,
      title: "Yangi palata qo'shish",
      fields: [{ name: 'name', label: "Palata nomi", placeholder: "Masalan: Palata-1" }],
      onSubmit: async (vals) => {
        if (!vals.name) return closeDialogs();
        try {
          await authedFetch('/api/rooms/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: vals.name, departmentId: deptId }) });
          closeDialogs();
          fetchData();
        } catch (e) {
          console.error(e);
          setError("Xatolik yuz berdi");
        }
      }
    });
  };

  const deleteRoom = (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "Palatani o'chirish",
      message: "Rostdan ham bu palatani o'chirmoqchimisiz?",
      onConfirm: async () => {
        try {
          await authedFetch(`/api/rooms/${id}/`, { method: 'DELETE' });
          closeDialogs();
          fetchData();
        } catch (e) {
          console.error(e);
          setError("Xatolik yuz berdi");
        }
      }
    });
  };

  const addBed = (roomId: string) => {
    setPromptConfig({
      isOpen: true,
      title: "Yangi joy qo'shish",
      fields: [{ name: 'name', label: "Joy nomi", placeholder: "Masalan: Joy-1" }],
      onSubmit: async (vals) => {
        if (!vals.name) return closeDialogs();
        try {
          await authedFetch('/api/beds/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: vals.name, roomId }) });
          closeDialogs();
          fetchData();
        } catch (e) {
          console.error(e);
          setError("Xatolik yuz berdi");
        }
      }
    });
  };

  const deleteBed = (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "Joyni o'chirish",
      message: "Rostdan ham bu joyni o'chirmoqchimisiz?",
      onConfirm: async () => {
        try {
          await authedFetch(`/api/beds/${id}/`, { method: 'DELETE' });
          closeDialogs();
          fetchData();
        } catch (e) {
          console.error(e);
          setError("Xatolik yuz berdi");
        }
      }
    });
  };

  const openAddDeviceFromScreen = () => {
    setError(null);
    setShowAddDeviceFromScreen(true);
  };

  const assignBedToDevice = (deviceId: string) => {
    setPromptConfig({
      isOpen: true,
      title: "Qurilmani joyga biriktirish",
      fields: [{ name: 'bedId', label: "Joy ID si", placeholder: "Masalan: b1" }],
      onSubmit: async (vals) => {
        if (!vals.bedId) return closeDialogs();
        try {
          await authedFetch(`/api/devices/${deviceId}/`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bedId: vals.bedId }) });
          closeDialogs();
          fetchData();
        } catch (e) {
          console.error(e);
          setError("Xatolik yuz berdi");
        }
      }
    });
  };

  const deleteDevice = (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "Qurilmani o'chirish",
      message: "Rostdan ham bu qurilmani o'chirmoqchimisiz?",
      onConfirm: async () => {
        try {
          await authedFetch(`/api/devices/${id}/`, { method: 'DELETE' });
          closeDialogs();
          fetchData();
        } catch (e) {
          console.error(e);
          setError("Xatolik yuz berdi");
        }
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="presentation"
      onClick={onClose}
    >
      
      {promptConfig && <CustomPrompt {...promptConfig} onCancel={closeDialogs} />}
      {confirmConfig && <CustomConfirm {...confirmConfig} onCancel={closeDialogs} />}
      {showAddDeviceFromScreen && (
        <AddDeviceFromScreenModal
          infrastructure={{
            departments: data.departments ?? [],
            rooms: data.rooms ?? [],
            beds: data.beds ?? [],
          }}
          onClose={() => setShowAddDeviceFromScreen(false)}
          onSuccess={() => {
            setError(null);
            void fetchData();
          }}
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <Server className="w-6 h-6 text-emerald-500" aria-hidden />
            </div>
            <div>
              <h2 id="settings-modal-title" className="text-xl font-bold text-white">Tizim Sozlamalari</h2>
              <p className="text-sm text-zinc-400">Infratuzilma, qurilmalar va integratsiya</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors" aria-label="Yopish">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 border-r border-zinc-800 bg-zinc-900/30 p-4 space-y-2">
            <button
              onClick={() => setActiveTab('structure')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'structure' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
            >
              <Building2 className="w-5 h-5" />
              <span className="font-medium">Tuzilma</span>
            </button>
            <button
              onClick={() => setActiveTab('devices')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'devices' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
            >
              <MonitorSmartphone className="w-5 h-5" />
              <span className="font-medium">Qurilmalar</span>
            </button>
            <button
              onClick={() => setActiveTab('patients')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'patients' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
            >
              <Users className="w-5 h-5" />
              <span className="font-medium">Bemorlar</span>
            </button>
            <button
              onClick={() => setActiveTab('integration')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'integration' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
            >
              <Info className="w-5 h-5" />
              <span className="font-medium">Integratsiya</span>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-zinc-950">
            {error && (
              <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center">
                <AlertTriangle className="w-5 h-5 mr-3" />
                {error}
              </div>
            )}
            {loading ? (
              <div className="flex items-center justify-center h-full text-zinc-500">Yuklanmoqda...</div>
            ) : (
              <>
                {/* Structure Tab */}
                {activeTab === 'structure' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium text-white">Kasalxona Tuzilmasi</h3>
                      <button onClick={addDepartment} className="flex items-center px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm">
                        <Plus className="w-4 h-4 mr-1" /> Bo'lim qo'shish
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      {data.departments.map((dept: any) => (
                        <div key={dept.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-md font-bold text-emerald-400">{dept.name} (ID: {dept.id})</h4>
                            <div className="flex space-x-2">
                              <button onClick={() => addRoom(dept.id)} className="p-1.5 text-zinc-400 hover:text-emerald-400 bg-zinc-800 rounded-md"><Plus className="w-4 h-4" /></button>
                              <button onClick={() => deleteDepartment(dept.id)} className="p-1.5 text-zinc-400 hover:text-red-400 bg-zinc-800 rounded-md"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {data.rooms.filter((r: any) => r.departmentId === dept.id).map((room: any) => (
                              <div key={room.id} className="bg-zinc-950 border border-zinc-800/50 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium text-zinc-200">{room.name}</span>
                                  <div className="flex space-x-2">
                                    <button onClick={() => addBed(room.id)} className="p-1 text-zinc-500 hover:text-emerald-400"><Plus className="w-3 h-3" /></button>
                                    <button onClick={() => deleteRoom(room.id)} className="p-1 text-zinc-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {data.beds.filter((b: any) => b.roomId === room.id).map((bed: any) => (
                                    <div key={bed.id} className="flex items-center px-2 py-1 bg-zinc-900 rounded text-xs text-zinc-400 border border-zinc-800">
                                      {bed.name} (ID: {bed.id})
                                      <button onClick={() => deleteBed(bed.id)} className="ml-2 text-zinc-600 hover:text-red-400"><X className="w-3 h-3" /></button>
                                    </div>
                                  ))}
                                  {data.beds.filter((b: any) => b.roomId === room.id).length === 0 && (
                                    <span className="text-xs text-zinc-600 italic">Joylar yo'q</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Devices Tab */}
                {activeTab === 'devices' && (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-lg font-medium text-white">Bemor Monitorlari</h3>
                      <div className="flex flex-wrap items-center gap-2">
                        {onOpenAdmitPatient && (
                          <button
                            type="button"
                            onClick={() => onOpenAdmitPatient()}
                            className="flex items-center px-3 py-1.5 bg-zinc-800 text-zinc-200 rounded-lg hover:bg-zinc-700 transition-colors text-sm border border-zinc-600"
                          >
                            <UserPlus className="w-4 h-4 mr-1" /> Bemor qabul qilish
                          </button>
                        )}
                        <button type="button" onClick={openAddDeviceFromScreen} className="flex items-center px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm">
                          <Plus className="w-4 h-4 mr-1" /> Qurilma qo'shish
                        </button>
                      </div>
                    </div>

                    {data.geminiConfigured !== true && (
                      <div
                        role="status"
                        className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100"
                      >
                        <div className="font-bold text-amber-200 mb-1">GEMINI_API_KEY (rasm tahlili)</div>
                        <p className="text-zinc-300 mb-2">
                          «Qurilma qo&apos;shish» (ekran rasmi) uchun serverda{' '}
                          <code className="text-emerald-400">GEMINI_API_KEY</code> bo&apos;lishi kerak — Google AI
                          Studio kaliti.
                        </p>
                        <p className="text-zinc-400 text-xs font-mono">
                          Masofadan:{' '}
                          <span className="text-zinc-200">
                            set DEPLOY_GEMINI_KEY=&lt;kalit&gt; &amp;&amp; set SSH_PASSWORD=... &amp;&amp; python
                            deploy/deploy_remote.py update
                          </span>
                        </p>
                        <p className="text-zinc-500 text-xs mt-2">
                          Yoki serverda: <code>/opt/clinicmonitoring/backend/.env</code> —{' '}
                          <code>GEMINI_API_KEY=...</code>, keyin{' '}
                          <code>systemctl restart clinicmonitoring-daphne</code>
                        </p>
                      </div>
                    )}

                    {connectionCheck && (
                      <div
                        role="status"
                        aria-live="polite"
                        className={`rounded-xl border p-4 text-sm ${
                          connectionCheck.checkTone === 'success'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                            : connectionCheck.checkTone === 'warning'
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-100'
                              : 'bg-sky-500/10 border-sky-500/25 text-sky-100'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-white mb-1">
                              Ulanish tekshiruvi:{' '}
                              {connectionCheck.checkTone === 'success'
                                ? 'OK'
                                : connectionCheck.checkTone === 'warning'
                                  ? 'Diqqat'
                                  : "Ma'lumot"}
                            </div>
                            <p className="text-zinc-300 mb-2">{connectionCheck.summary}</p>
                            <ul className="list-disc list-inside space-y-1 text-zinc-400">
                              <li>
                                Ma'lumot oqimi:{' '}
                                {connectionCheck.isReceivingData ? (
                                  <span className="text-emerald-400">chegara ichida</span>
                                ) : (
                                  <span className="text-amber-400">yo'q yoki kechikkan</span>
                                )}
                                {connectionCheck.secondsSinceLastMessage != null && (
                                  <span className="ml-1 font-mono">
                                    (oxirgi: ~{Math.round(connectionCheck.secondsSinceLastMessage)}s oldin)
                                  </span>
                                )}
                              </li>
                              <li>
                                Joy:{' '}
                                {connectionCheck.assignment.bedAssigned ? (
                                  <span className="text-emerald-400">biriktirilgan</span>
                                ) : (
                                  <span className="text-amber-400">yo'q</span>
                                )}
                                {' · '}
                                Bemor:{' '}
                                {connectionCheck.assignment.patientOnBed ? (
                                  <span className="text-emerald-400">bor</span>
                                ) : (
                                  <span className="text-amber-400">yo'q</span>
                                )}
                              </li>
                              <li>
                                HL7 port (server):{' '}
                                {String(connectionCheck.hl7.listenPort ?? '—')} —{' '}
                                {connectionCheck.hl7.localPortAcceptsConnections ? (
                                  <span className="text-emerald-400">tinglanmoqda</span>
                                ) : (
                                  <span className="text-amber-400">ochiq emas</span>
                                )}
                                {connectionCheck.hl7.bindError ? (
                                  <span className="block text-red-400 mt-1 text-xs">
                                    Bind xato: {String(connectionCheck.hl7.bindError)}
                                  </span>
                                ) : null}
                              </li>
                              <li className="text-zinc-500">
                                Server HL7 stat: TCP faqat (
                                {String(connectionCheck.hl7Diagnostic.tcpSessionsWithoutHl7Payload ?? 0)}) · HL7
                                bayt kelgan (
                                {String(connectionCheck.hl7Diagnostic.tcpSessionsWithHl7Payload ?? 0)})
                                {typeof connectionCheck.hl7Diagnostic.lastPayloadAtMs === 'number' && (
                                  <span className="ml-1 font-mono">
                                    · oxirgi HL7:{' '}
                                    {new Date(
                                      connectionCheck.hl7Diagnostic.lastPayloadAtMs as number,
                                    ).toLocaleString()}
                                  </span>
                                )}
                              </li>
                              {connectionCheck.hl7Diagnostic.lastEmptySessionTcpBytes != null && (
                                <li className="text-zinc-500 text-xs mt-1">
                                  Oxirgi bo&apos;sh HL7 sessiya: TCP qabul{' '}
                                  <span className="font-mono text-zinc-400">
                                    {String(connectionCheck.hl7Diagnostic.lastEmptySessionTcpBytes)}
                                  </span>{' '}
                                  bayt — peer{' '}
                                  <span className="font-mono">
                                    {String(connectionCheck.hl7Diagnostic.lastEmptySessionPeer ?? '—')}
                                  </span>
                                  {Number(connectionCheck.hl7Diagnostic.lastEmptySessionTcpBytes) === 0
                                    ? ' (qurilma yubormagan yoki darhol yopilgan)'
                                    : ' (MSH topilmadi — format yoki kodlash)'}
                                </li>
                              )}
                              {typeof connectionCheck.hl7Diagnostic.lastTcpRawBytesHex === 'string' &&
                                connectionCheck.hl7Diagnostic.lastTcpRawBytesHex.length > 0 && (
                                  <li className="text-amber-200/85 text-xs mt-1 break-all">
                                    MSH yo‘q, lekin TCP bayt kelgan (hex qisqa):{' '}
                                    {String(connectionCheck.hl7Diagnostic.lastTcpRawBytesHex).slice(0, 64)}
                                    … — server .env: <span className="font-mono">HL7_LOG_RAW_TCP_RECV=true</span>
                                  </li>
                                )}
                            </ul>
                            {connectionCheck.firewallHints.length > 0 && (
                              <p className="mt-2 text-xs text-zinc-500 border-t border-zinc-700/50 pt-2">
                                <span className="font-semibold text-zinc-400">Firewall:</span>{' '}
                                {connectionCheck.firewallHints.join(' ')}
                              </p>
                            )}
                            {connectionCheck.hints.length > 0 && (
                              <ul className="mt-3 list-disc list-inside text-zinc-500 space-y-1 text-xs">
                                {connectionCheck.hints.map((h, i) => (
                                  <li key={`hint-${i}-${h.slice(0, 20)}`}>{h}</li>
                                ))}
                              </ul>
                            )}
                            {connectionCheck.warnings.length > 0 && (
                              <ul className="mt-3 list-disc list-inside text-amber-200/90 space-y-1">
                                {connectionCheck.warnings.map((w, i) => (
                                  <li key={`${i}-${w.slice(0, 24)}`}>{w}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setConnectionCheck(null)}
                            className="text-zinc-500 hover:text-white shrink-0"
                            aria-label="Yopish"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left text-zinc-400">
                        <thead className="text-xs text-zinc-500 uppercase bg-zinc-900/50 border-b border-zinc-800">
                          <tr>
                            <th className="px-4 py-3">ID / Model</th>
                            <th className="px-4 py-3">Tarmoq / HL7</th>
                            <th className="px-4 py-3">Biriktirilgan joy</th>
                            <th className="px-4 py-3">Holati</th>
                            <th className="px-4 py-3 text-right">Amallar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.devices.map((device: any) => (
                            <tr key={device.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/30">
                              <td className="px-4 py-3">
                                <div className="font-medium text-zinc-200">{device.model}</div>
                                <div className="text-xs font-mono text-zinc-500">{device.id}</div>
                              </td>
                              <td className="px-4 py-3 font-mono text-xs">
                                <div>{device.ipAddress}</div>
                                <div className="text-zinc-600">{device.macAddress || "—"}</div>
                                <div className="text-emerald-500/90 mt-1">
                                  HL7 :{device.hl7Port ?? 6006}
                                  {device.serverTargetIp ? ` → ${device.serverTargetIp}` : ""}
                                </div>
                                {device.hl7Enabled !== false && (
                                  <label className="block mt-2 text-[10px] text-zinc-500 leading-tight">
                                    HL7 salom (handshake)
                                    <select
                                      className="mt-0.5 w-full max-w-[12rem] bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-zinc-300 text-[10px]"
                                      value={
                                        device.hl7ConnectHandshake === null ||
                                        device.hl7ConnectHandshake === undefined
                                          ? 'inherit'
                                          : device.hl7ConnectHandshake
                                            ? 'on'
                                            : 'off'
                                      }
                                      onChange={async (e) => {
                                        const v = e.target.value;
                                        const body =
                                          v === 'inherit'
                                            ? { hl7ConnectHandshake: null }
                                            : { hl7ConnectHandshake: v === 'on' };
                                        setHandshakeSavingId(device.id);
                                        setError(null);
                                        try {
                                          const res = await authedFetch(`/api/devices/${device.id}/`, {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(body),
                                          });
                                          if (!res.ok) throw new Error("Saqlanmadi");
                                          await fetchData();
                                        } catch (err) {
                                          console.error(err);
                                          setError("HL7 salom sozlamasi saqlanmadi");
                                        } finally {
                                          setHandshakeSavingId(null);
                                        }
                                      }}
                                      disabled={handshakeSavingId === device.id}
                                    >
                                      <option value="inherit">Muhit (.env)</option>
                                      <option value="on">Yoqish (K12 tavsiya)</option>
                                      <option value="off">O&apos;chirish</option>
                                    </select>
                                  </label>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {device.bedId ? (
                                  <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">{device.bedId}</span>
                                ) : (
                                  <span className="text-zinc-600 italic">Biriktirilmagan</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center">
                                  <div className={`w-2 h-2 rounded-full mr-2 ${device.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                                  {device.status === 'online' ? 'Onlayn' : 'Oflayn'}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right space-x-1">
                                <button
                                  type="button"
                                  onClick={() => void markDeviceOnlineTest(device.id)}
                                  disabled={markingOnlineId === device.id}
                                  className="p-1.5 text-zinc-400 hover:text-emerald-400 bg-zinc-800 rounded-md disabled:opacity-50"
                                  title="Sinov: onlayn belgilash (HL7 tarmog'i hali ulanmagan bo'lsa)"
                                >
                                  <Wifi className={`w-4 h-4 ${markingOnlineId === device.id ? 'animate-pulse' : ''}`} aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void checkDeviceConnection(device.id)}
                                  disabled={checkingDeviceId === device.id}
                                  className="p-1.5 text-zinc-400 hover:text-cyan-400 bg-zinc-800 rounded-md disabled:opacity-50"
                                  title="Ulanish va ma'lumot oqimini tekshirish"
                                >
                                  <Radio className={`w-4 h-4 ${checkingDeviceId === device.id ? 'animate-pulse' : ''}`} aria-hidden />
                                </button>
                                <button onClick={() => assignBedToDevice(device.id)} className="p-1.5 text-zinc-400 hover:text-blue-400 bg-zinc-800 rounded-md" title="Joyga biriktirish"><Edit2 className="w-4 h-4" /></button>
                                <button onClick={() => deleteDevice(device.id)} className="p-1.5 text-zinc-400 hover:text-red-400 bg-zinc-800 rounded-md"><Trash2 className="w-4 h-4" /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Patients Tab */}
                {activeTab === 'patients' && (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-medium text-white">Faol Bemorlar</h3>
                        <p className="text-sm text-zinc-500">Yangi bemorni quyidagi tugma orqali yoki asosiy ekran sarlavhasidagi ikon orqali qabul qiling.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {onOpenAdmitPatient && (
                          <button
                            type="button"
                            onClick={() => onOpenAdmitPatient()}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 text-sm font-medium shadow-lg shadow-emerald-900/20"
                          >
                            <UserPlus className="w-4 h-4" />
                            Bemor qabul qilish
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            useStore.getState().setAllSchedules(60000);
                            closeDialogs();
                          }}
                          className="px-4 py-2 bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition-colors text-sm border border-emerald-500/20"
                        >
                          Barchasiga 1 daqiqalik tekshiruv
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {Object.values(patients).map((patient: any) => (
                        <div key={patient.id} className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
                          <div>
                            <h4 className="font-bold text-zinc-200">{patient.name} <span className="text-xs font-mono text-zinc-500 ml-2">({patient.id})</span></h4>
                            <p className="text-sm text-zinc-400">{patient.room} • {patient.diagnosis}</p>
                          </div>
                          <button 
                            onClick={() => {
                              setConfirmConfig({
                                isOpen: true,
                                title: "Bemorni chiqarish",
                                message: "Rostdan ham bu bemorni chiqarib yubormoqchimisiz?",
                                onConfirm: () => {
                                  dischargePatient(patient.id);
                                  closeDialogs();
                                }
                              });
                            }}
                            className="px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors text-sm border border-red-500/20"
                          >
                            Chiqarish
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Integration Tab */}
                {activeTab === 'integration' && (
                  <div className="space-y-6 text-zinc-300">
                    <h3 className="text-lg font-medium text-white">Qurilmalarni Tizimga Ulash (Integratsiya)</h3>
                    
                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                      <h4 className="font-bold text-blue-400 mb-2">HL7 (port 6006) va server</h4>
                      <p className="text-sm leading-relaxed">
                        Qurilma ekranida <strong>Server IP</strong> va <strong>port</strong> (odatda 6006) ko‘rsatiladi — bu manzilga HL7 MLLP orqali ulanadi.
                        ClinicMonitoring backend <code className="text-emerald-400">0.0.0.0:6006</code> da tinglaydi (muhit: <code className="text-emerald-400">HL7_LISTEN_PORT</code>).
                        Firewallda 6006-portni oching. Qurilma ro‘yxatida <strong>qurilma lokal IP</strong>si saqlanadi; TCP ulanish shu manzil bo‘yicha taniladi.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <h4 className="font-bold text-zinc-200">1-qadam: Tarmoqqa ulash</h4>
                      <p className="text-sm text-zinc-400">Monitorni tarmoqqa ulang va unga statik IP manzil bering (Masalan: <code>192.168.1.105</code>). Bu IP manzilni "Qurilmalar" bo'limidan tizimga kiriting.</p>

                      <h4 className="font-bold text-zinc-200">2-qadam: Ma'lumotlarni yuborish (API)</h4>
                      <p className="text-sm text-zinc-400">Agar qurilma yoki oraliq server (Gateway) REST API orqali ma'lumot yuborsa, quyidagi manzilga POST so'rov yuborishi kerak:</p>
                      
                      <div className="bg-black p-4 rounded-lg border border-zinc-800 font-mono text-sm">
                        <div className="text-emerald-400 mb-2">POST /api/device/[IP_MANZIL]/vitals</div>
                        <div className="text-zinc-500">Content-Type: application/json</div>
                        <br/>
                        <div className="text-zinc-300">
                          {`{
  "hr": 75,
  "spo2": 98,
  "nibpSys": 120,
  "nibpDia": 80,
  "rr": 16,
  "temp": 36.6,
  "ecg": [0.1, 0.2, 1.5, -0.3, ...] // 250Hz ma'lumot
}`}
                        </div>
                      </div>

                      <h4 className="font-bold text-zinc-200">3-qadam: Bemorga biriktirish</h4>
                      <p className="text-sm text-zinc-400">
                        Qurilma tizimga qo'shilgandan so'ng, uni ma'lum bir "Joy"ga (Bed) biriktirasiz. 
                        Bemor shu joyga yotqizilganda, tizim avtomatik ravishda qurilmadan kelayotgan ma'lumotlarni bemor profiliga bog'laydi.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
