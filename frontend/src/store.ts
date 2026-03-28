import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { getWebSocketMonitoringUrl, apiUrl } from './lib/api';

export interface VitalSigns {
  hr: number;
  spo2: number;
  nibpSys: number;
  nibpDia: number;
  rr: number;
  temp: number;
  nibpTime?: number;
}

export interface AlarmLimits {
  hr: { low: number; high: number };
  spo2: { low: number; high: number };
  nibpSys: { low: number; high: number };
  nibpDia: { low: number; high: number };
  rr: { low: number; high: number };
  temp: { low: number; high: number };
}

/** API `{}` yoki qisman bo‘lsa ham — Signal chegaralari formasi uchun to‘liq obyekt. */
export const DEFAULT_ALARM_LIMITS: AlarmLimits = {
  hr: { low: 50, high: 120 },
  spo2: { low: 90, high: 100 },
  nibpSys: { low: 90, high: 160 },
  nibpDia: { low: 50, high: 100 },
  rr: { low: 8, high: 30 },
  temp: { low: 35.5, high: 38.5 },
};

export function mergeAlarmLimits(raw: unknown): AlarmLimits {
  const out: AlarmLimits = JSON.parse(JSON.stringify(DEFAULT_ALARM_LIMITS)) as AlarmLimits;
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, { low?: unknown; high?: unknown }>;
  (Object.keys(out) as (keyof AlarmLimits)[]).forEach((key) => {
    const patch = o[key as string];
    if (patch && typeof patch === 'object') {
      const low = Number(patch.low);
      const high = Number(patch.high);
      if (Number.isFinite(low) && Number.isFinite(high)) {
        out[key] = { low, high };
      }
    }
  });
  return out;
}

export interface AlarmState {
  level: 'none' | 'blue' | 'yellow' | 'red' | 'purple';
  message?: string;
  patientId?: string;
}

export interface VitalHistory {
  timestamp: number;
  hr: number;
  spo2: number;
  nibpSys: number;
  nibpDia: number;
}

export interface AiRisk {
  probability: number;
  estimatedTime: string;
  reasons: string[];
  recommendations: string[];
}

export interface Medication {
  id: string;
  name: string;
  dose: string;
  rate?: string;
}

export interface LabResult {
  id: string;
  name: string;
  value: string;
  unit: string;
  time: number;
  isAbnormal: boolean;
}

export interface ClinicalNote {
  id: string;
  text: string;
  author: string;
  time: number;
}

export interface PatientData {
  id: string;
  name: string;
  room: string;
  diagnosis: string;
  doctor: string;
  assignedNurse: string;
  deviceBattery: number;
  admissionDate: number;
  vitals: VitalSigns;
  alarm: AlarmState;
  alarmLimits: AlarmLimits;
  scheduledCheck?: {
    intervalMs: number;
    nextCheckTime: number;
  };
  aiRisk?: AiRisk;
  history: VitalHistory[];
  news2Score: number;
  isPinned: boolean;
  medications: Medication[];
  labs: LabResult[];
  notes: ClinicalNote[];
}

/** Single patient payload from `vitals_update` WebSocket messages. */
export interface VitalsUpdatePayload {
  id: string;
  vitals: VitalSigns;
  alarm: AlarmState;
  alarmLimits?: AlarmLimits;
  scheduledCheck?: PatientData['scheduledCheck'];
  deviceBattery?: number;
  aiRisk?: AiRisk;
  history?: VitalHistory[];
  news2Score?: number;
  isPinned?: boolean;
  medications?: Medication[];
  labs?: LabResult[];
  notes?: ClinicalNote[];
}

function sendWs(ws: WebSocket | null, payload: Record<string, unknown>) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

interface AppState {
  patients: Record<string, PatientData>;
  socket: WebSocket | null;
  /** True when the WebSocket is open (Django Channels `/ws/monitoring/`). */
  wsConnected: boolean;
  privacyMode: boolean;
  searchQuery: string;
  selectedPatientId: string | null;
  isAudioMuted: boolean;
  errorMessage: string | null;
  togglePrivacyMode: () => void;
  setSearchQuery: (q: string) => void;
  setSelectedPatientId: (id: string | null) => void;
  toggleAudioMute: () => void;
  setErrorMessage: (msg: string | null) => void;
  togglePinPatient: (patientId: string) => void;
  addClinicalNote: (patientId: string, note: Omit<ClinicalNote, 'id' | 'time'>) => void;
  acknowledgeAlarm: (patientId: string) => void;
  setSchedule: (patientId: string, intervalMs: number) => void;
  setAllSchedules: (intervalMs: number) => void;
  clearAlarm: (patientId: string) => void;
  updateLimits: (patientId: string, limits: Partial<AlarmLimits>) => void;
  measureNibp: (patientId: string) => void;
  admitPatient: (data: Partial<PatientData> & { bedId?: string }) => void;
  dischargePatient: (patientId: string) => void;
  loadPatientsFromAPI: () => Promise<void>;
  connect: () => void;
  disconnect: () => void;
  hasEmergency: () => boolean;
}

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let manualDisconnect = false;

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      patients: {},
      socket: null,
      wsConnected: false,
      privacyMode: false,
      searchQuery: '',
      selectedPatientId: null,
      isAudioMuted: false,
      errorMessage: null,
  togglePrivacyMode: () => set((state) => ({ privacyMode: !state.privacyMode })),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSelectedPatientId: (id) => set({ selectedPatientId: id }),
  toggleAudioMute: () => set((state) => ({ isAudioMuted: !state.isAudioMuted })),
  setErrorMessage: (msg) => set({ errorMessage: msg }),

  togglePinPatient: (patientId) => {
    sendWs(get().socket, { action: 'toggle_pin', patientId });
  },
  addClinicalNote: (patientId, note) => {
    sendWs(get().socket, { action: 'add_note', patientId, note });
  },
  acknowledgeAlarm: (patientId) => {
    sendWs(get().socket, { action: 'acknowledge_alarm', patientId });
  },

  setSchedule: (patientId, intervalMs) => {
    sendWs(get().socket, { action: 'set_schedule', patientId, intervalMs });
  },
  setAllSchedules: (intervalMs) => {
    sendWs(get().socket, { action: 'set_all_schedules', intervalMs });
  },
  clearAlarm: (patientId) => {
    sendWs(get().socket, { action: 'clear_alarm', patientId });
  },
  updateLimits: (patientId, limits) => {
    sendWs(get().socket, { action: 'update_limits', patientId, limits });
  },
  measureNibp: (patientId) => {
    sendWs(get().socket, { action: 'measure_nibp', patientId });
  },
  admitPatient: (data) => {
    sendWs(get().socket, { action: 'admit_patient', ...data });
  },
  dischargePatient: (patientId) => {
    sendWs(get().socket, { action: 'discharge_patient', patientId });
  },

  loadPatientsFromAPI: async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      const response = await fetch(apiUrl('/patients/'), {
        headers: {
          'Authorization': `Token ${token}`
        }
      });
      
      if (response.ok) {
        const patients = await response.json();
        set((state) => ({
          patients: patients.reduce((acc, p) => {
            acc[p.id] = p;
            return acc;
          }, {} as Record<string, PatientData>)
        }));
        console.log(`✅ Loaded ${patients.length} patients from API`);
      } else {
        console.error('❌ Failed to load patients from API:', response.status);
      }
    } catch (error) {
      console.error('Error loading patients:', error);
    }
  },
  
  connect: () => {
    const existing = get().socket;
    if (
      existing &&
      (existing.readyState === WebSocket.OPEN ||
        existing.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    manualDisconnect = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // Load patients from API first
    get().loadPatientsFromAPI();

    const ws = new WebSocket(getWebSocketMonitoringUrl());

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as {
          type: string;
          patients?: PatientData[];
          updates?: VitalsUpdatePayload[];
          patient?: PatientData;
          patientId?: string;
        };

        if (msg.type === 'patient_refresh' && msg.patient) {
          const full = msg.patient;
          set((state) => ({
            patients: { ...state.patients, [full.id]: full },
          }));
          return;
        }

        if (msg.type === 'initial_state' && msg.patients) {
          const patientsMap = msg.patients.reduce(
            (acc, p) => {
              acc[p.id] = p;
              return acc;
            },
            {} as Record<string, PatientData>,
          );
          set({ patients: patientsMap });
          return;
        }

        if (msg.type === 'vitals_update' && msg.updates) {
          set((state) => {
            const newPatients = { ...state.patients };
            msg.updates!.forEach((update) => {
              if (newPatients[update.id]) {
                const p = newPatients[update.id];
                newPatients[update.id] = {
                  ...p,
                  vitals: update.vitals,
                  alarm: update.alarm,
                  alarmLimits: update.alarmLimits ?? p.alarmLimits,
                  scheduledCheck: update.scheduledCheck,
                  deviceBattery: update.deviceBattery ?? p.deviceBattery,
                  aiRisk: update.aiRisk,
                  history: update.history ?? p.history,
                  news2Score: update.news2Score ?? p.news2Score,
                  isPinned: update.isPinned ?? p.isPinned,
                  medications: update.medications ?? p.medications,
                  labs: update.labs ?? p.labs,
                  notes: update.notes ?? p.notes,
                };
              }
            });
            return { patients: newPatients };
          });
          return;
        }

        if (msg.type === 'patient_admitted' && msg.patient) {
          set((state) => ({
            patients: { ...state.patients, [msg.patient!.id]: msg.patient! },
          }));
          return;
        }

        if (msg.type === 'patient_discharged' && msg.patientId) {
          const patientId = msg.patientId;
          set((state) => {
            const newPatients = { ...state.patients };
            delete newPatients[patientId];
            return {
              patients: newPatients,
              selectedPatientId:
                state.selectedPatientId === patientId ? null : state.selectedPatientId,
            };
          });
        }

        // Handle error messages (e.g., bed occupied)
        if (msg.type === 'error') {
          const errorMsg = msg as any;
          set({ errorMessage: errorMsg.message || 'Noma\'lum xato' });
          // Auto-clear after 5 seconds
          setTimeout(() => {
            set({ errorMessage: null });
          }, 5000);
        }
      } catch (e) {
        console.error('WebSocket message parse error:', e);
      }
    };

    ws.onopen = () => {
      set({ socket: ws, wsConnected: true });
      reconnectAttempts = 0; // Reset on successful connection
      
      // Start heartbeat
      const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        } else {
          clearInterval(interval);
        }
      }, 30000);
    };

    ws.onerror = () => {
      console.error('WebSocket error');
    };

    ws.onclose = () => {
      set({ socket: null, wsConnected: false });
      if (!manualDisconnect) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        reconnectAttempts++;
        console.log(`📡 WebSocket closed. Reconnecting in ${delay}ms... (Attempt ${reconnectAttempts})`);
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          get().connect();
        }, delay);
      }
    };

    set({ socket: ws });
  },

  disconnect: () => {
    manualDisconnect = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    const ws = get().socket;
    if (ws) {
      ws.close();
    }
    set({ socket: null, wsConnected: false });
  },

  hasEmergency: () => {
    return Object.values(get().patients).some(p => p.alarm.level === 'red');
  },
}),
    {
      name: 'medicentral-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        patients: state.patients,
        privacyMode: state.privacyMode,
        searchQuery: state.searchQuery,
        selectedPatientId: state.selectedPatientId,
        isAudioMuted: state.isAudioMuted
      })
    }
  )
);
