import React from 'react';
import { X, Brain, AlertTriangle, Activity, ShieldAlert, HeartPulse, Clock } from 'lucide-react';
import { useStore } from '../store';
import { useModalDismiss } from '../hooks/useModalDismiss';

interface Props {
  onClose: () => void;
}

export function AiPredictionModal({ onClose }: Props) {
  const patients = useStore(state => state.patients);
  const privacyMode = useStore(state => state.privacyMode);

  const atRiskPatients = Object.values(patients).filter(p => p.aiRisk);

  useModalDismiss(true, onClose);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-prediction-title"
        className="bg-zinc-950 border border-red-500/30 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-[0_0_40px_rgba(220,38,38,0.2)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-red-500/20 bg-red-950/20">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-red-500/20 rounded-lg border border-red-500/30 animate-pulse">
              <Brain className="w-6 h-6 text-red-500" aria-hidden />
            </div>
            <div>
              <h2 id="ai-prediction-title" className="text-xl font-bold text-red-500">AI Prognoz: Kritik Holatlar</h2>
              <p className="text-sm text-red-400/70">Sun'iy intellekt tomonidan aniqlangan o'lim xavfi yuqori bo'lgan bemorlar</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors" aria-label="Yopish">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {atRiskPatients.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <Activity className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>Ayni vaqtda kritik xavf ostidagi bemorlar aniqlanmadi.</p>
            </div>
          ) : (
            atRiskPatients.map(patient => {
              const maskedName = privacyMode
                ? (patient.name || '').replace(/([A-ZА-ЯЁ]\.\s[A-ZА-ЯЁ]).*/u, '$1***')
                : patient.name;
              const risk = patient.aiRisk!;

              return (
                <div key={patient.id} className="bg-zinc-900 border border-red-500/20 rounded-xl p-5 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                  
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-zinc-100">{maskedName}</h3>
                      <p className="text-sm text-zinc-400 font-mono">{patient.room} | ID: {patient.id}</p>
                    </div>
                    <div className="text-right">
                      <div className="inline-flex items-center px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 font-bold text-sm">
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        Xavf: {risk.probability}%
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Time */}
                    <div className="bg-black/40 rounded-lg p-4 border border-zinc-800">
                      <div className="flex items-center text-zinc-400 mb-2">
                        <Clock className="w-4 h-4 mr-2 text-orange-400" />
                        <span className="text-xs font-semibold uppercase tracking-wider">Kritik holatgacha vaqt</span>
                      </div>
                      <p className="text-xl font-bold text-orange-400">{risk.estimatedTime}</p>
                      <p className="text-[10px] text-zinc-500 mt-1">Taxminiy umr qoldig'i (aralashuvsiz)</p>
                    </div>

                    {/* Reasons */}
                    <div className="bg-black/40 rounded-lg p-4 border border-zinc-800">
                      <div className="flex items-center text-zinc-400 mb-2">
                        <HeartPulse className="w-4 h-4 mr-2 text-red-400" />
                        <span className="text-xs font-semibold uppercase tracking-wider">Prognoz Sabablari</span>
                      </div>
                      <ul className="space-y-1.5">
                        {risk.reasons.map((reason, idx) => (
                          <li key={idx} className="text-sm text-zinc-300 flex items-start">
                            <span className="text-red-500 mr-2 mt-0.5">•</span>
                            <span className="flex-1">{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Recommendations */}
                    <div className="bg-black/40 rounded-lg p-4 border border-zinc-800">
                      <div className="flex items-center text-zinc-400 mb-2">
                        <ShieldAlert className="w-4 h-4 mr-2 text-emerald-400" />
                        <span className="text-xs font-semibold uppercase tracking-wider">Oldini olish choralari</span>
                      </div>
                      <ul className="space-y-1.5">
                        {risk.recommendations.map((rec, idx) => (
                          <li key={idx} className="text-sm text-emerald-400/90 flex items-start">
                            <span className="text-emerald-500 mr-2 mt-0.5">→</span>
                            <span className="flex-1">{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
