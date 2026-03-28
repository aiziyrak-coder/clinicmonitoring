import React, { useState } from 'react';
import { X, FlaskConical, Play, AlertCircle } from 'lucide-react';
import { PatientData, useStore } from '../store';
import { useAuthStore } from '../authStore';

interface SimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: PatientData[];
}

export const SimulationModal: React.FC<SimulationModalProps> = ({ isOpen, onClose, patients }) => {
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [hr, setHr] = useState(75);
  const [spo2, setSpo2] = useState(98);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const token = useAuthStore(state => state.token);

  if (!isOpen) return null;

  const handleSimulate = async () => {
    if (!selectedPatientId) {
      setError('Iltimos, bemorni tanlang');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/simulate-vitals/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`
        },
        body: JSON.stringify({
          patient_id: selectedPatientId,
          vitals: { hr, spo2 }
        })
      });
      if (!resp.ok) throw new Error('Simulyatsiyani yuborib bo‘lmadi');
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-800 bg-purple-50 dark:bg-purple-900/20">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Vitals Simulyatsiyasi</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors">
            <X className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Bemorni tanlang</label>
            <select 
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-zinc-100"
            >
              <option value="">Tanlash...</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.room})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Yurak urishi (HR)</label>
              <input 
                type="number"
                value={hr}
                onChange={(e) => setHr(Number(e.target.value))}
                className="w-full h-11 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-zinc-100"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">SpO2 %</label>
              <input 
                type="number"
                value={spo2}
                onChange={(e) => setSpo2(Number(e.target.value))}
                className="w-full h-11 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-zinc-100"
              />
            </div>
          </div>

          <button
            onClick={handleSimulate}
            disabled={loading}
            className="w-full h-12 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
            Simulyatsiyani boshlash
          </button>
        </div>
      </div>
    </div>
  );
};
