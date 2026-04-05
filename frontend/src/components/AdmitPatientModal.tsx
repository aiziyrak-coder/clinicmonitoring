import React, { useState, useEffect, useMemo } from 'react';
import { authedFetch } from '../authStore';
import { useStore } from '../store';
import { X, UserPlus } from 'lucide-react';
import { useModalDismiss } from '../hooks/useModalDismiss';

interface InfraDepartment { id: string; name: string; }
interface InfraRoom       { id: string; name: string; departmentId: string; }
interface InfraBed        { id: string; name: string; roomId: string; }

export function AdmitPatientModal({ onClose }: { onClose: () => void }) {
  const admitPatient   = useStore((s) => s.admitPatient);
  const errorMessage   = useStore((s) => s.errorMessage);
  const setErrorMessage = useStore((s) => s.setErrorMessage);
  useModalDismiss(true, onClose);

  const [departments, setDepartments] = useState<InfraDepartment[]>([]);
  const [rooms, setRooms]             = useState<InfraRoom[]>([]);
  const [beds, setBeds]               = useState<InfraBed[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [error, setError]             = useState<string | null>(null);

  const [departmentId, setDepartmentId] = useState('');
  const [roomId, setRoomId]             = useState('');
  const [bedId, setBedId]               = useState('');
  const [name, setName]                 = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    authedFetch('/api/infrastructure/', { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error('Infratuzilma yuklanmadi'); return r.json(); })
      .then((d) => {
        setDepartments(d.departments || []);
        setRooms(d.rooms || []);
        setBeds(d.beds || []);
        setIsLoading(false);
      })
      .catch((e) => { if (e.name === 'AbortError') return; setError(e.message); setIsLoading(false); });
    return () => ctrl.abort();
  }, []);

  const roomsInDept = useMemo(() => rooms.filter((r) => r.departmentId === departmentId), [rooms, departmentId]);
  const bedsInRoom  = useMemo(() => beds.filter((b) => b.roomId === roomId), [beds, roomId]);
  const hasBeds     = beds.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bedId || !name.trim()) return;
    const bed  = beds.find((b) => b.id === bedId);
    const room = rooms.find((r) => r.id === bed?.roomId);
    const dept = departments.find((d) => d.id === room?.departmentId);
    const roomDisplay = bed && room
      ? dept ? `${dept.name} — ${room.name}, ${bed.name}` : `${room.name}, ${bed.name}`
      : '';
    admitPatient({ name: name.trim(), room: roomDisplay, bedId, diagnosis: '', doctor: '', assignedNurse: '' });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900/35 backdrop-blur-sm p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admit-title"
        className="bg-white border border-zinc-200 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 bg-zinc-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
              <UserPlus className="w-5 h-5" />
            </div>
            <h2 id="admit-title" className="text-lg font-bold text-zinc-900">Bemor qabul qilish</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg" aria-label="Yopish">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Xato xabarlari */}
          {(errorMessage || error) && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-lg text-sm font-medium flex justify-between">
              <span>{errorMessage || error}</span>
              <button type="button" onClick={() => { setErrorMessage(null); setError(null); }}><X className="w-4 h-4" /></button>
            </div>
          )}

          {!error && !isLoading && !hasBeds && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-lg text-sm font-medium">
              Tizimda karavat topilmadi. Avval Sozlamalar → Tuzilma orqali qo'shing.
            </div>
          )}

          {/* Bo'lim */}
          <div>
            <label className="block text-sm font-semibold text-zinc-700 mb-1">Bo'lim</label>
            <select
              value={departmentId}
              onChange={(e) => { setDepartmentId(e.target.value); setRoomId(''); setBedId(''); }}
              disabled={isLoading || !!error || !hasBeds}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-zinc-900 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
              required
            >
              <option value="">{isLoading ? 'Yuklanmoqda…' : 'Tanlang'}</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          {/* Palata */}
          <div>
            <label className="block text-sm font-semibold text-zinc-700 mb-1">Palata</label>
            <select
              value={roomId}
              onChange={(e) => { setRoomId(e.target.value); setBedId(''); }}
              disabled={!departmentId}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-zinc-900 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
              required
            >
              <option value="">Tanlang</option>
              {roomsInDept.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          {/* Karavat */}
          <div>
            <label className="block text-sm font-semibold text-zinc-700 mb-1">Karavat</label>
            <select
              value={bedId}
              onChange={(e) => setBedId(e.target.value)}
              disabled={!roomId}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-zinc-900 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
              required
            >
              <option value="">Tanlang</option>
              {bedsInRoom.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          {/* Bemor ismi */}
          <div>
            <label className="block text-sm font-semibold text-zinc-700 mb-1">Bemor ismi</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Ism"
              className="w-full border border-zinc-300 rounded-lg px-3 py-2.5 text-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Tugmalar */}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-zinc-600 hover:text-zinc-900">
              Bekor
            </button>
            <button
              type="submit"
              disabled={!hasBeds || isLoading || !!error || !bedId || !name.trim()}
              className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-40 shadow"
            >
              Qabul qilish
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
