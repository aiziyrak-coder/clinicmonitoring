import React, { useState, useEffect, useMemo } from 'react';
import { authedFetch } from '../authStore';
import { useStore } from '../store';
import { X, UserPlus } from 'lucide-react';
import { useModalDismiss } from '../hooks/useModalDismiss';

interface InfraDepartment {
  id: string;
  name: string;
}
interface InfraRoom {
  id: string;
  name: string;
  departmentId: string;
}
interface InfraBed {
  id: string;
  name: string;
  roomId: string;
}

export function AdmitPatientModal({ onClose }: { onClose: () => void }) {
  const admitPatient = useStore((state) => state.admitPatient);
  useModalDismiss(true, onClose);

  const [departments, setDepartments] = useState<InfraDepartment[]>([]);
  const [rooms, setRooms] = useState<InfraRoom[]>([]);
  const [beds, setBeds] = useState<InfraBed[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [departmentId, setDepartmentId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [bedId, setBedId] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    diagnosis: '',
    doctor: '',
    assignedNurse: '',
  });

  useEffect(() => {
    const controller = new AbortController();
    authedFetch('/api/infrastructure/', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Infratuzilma ma'lumotlarini yuklashda xatolik");
        return res.json();
      })
      .then((data) => {
        setDepartments(data.departments || []);
        setRooms(data.rooms || []);
        setBeds(data.beds || []);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error(err);
        setError(err.message);
        setIsLoading(false);
      });
    return () => controller.abort();
  }, []);

  const roomsInDept = useMemo(
    () => rooms.filter((r) => r.departmentId === departmentId),
    [rooms, departmentId],
  );
  const bedsInRoom = useMemo(
    () => beds.filter((b) => b.roomId === roomId),
    [beds, roomId],
  );

  const hasBedOptions = beds.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bedId.trim()) return;
    const bed = beds.find((b) => b.id === bedId);
    const room = rooms.find((r) => r.id === bed?.roomId);
    const dept = departments.find((d) => d.id === room?.departmentId);
    const roomDisplay =
      bed && room
        ? dept
          ? `${dept.name} — ${room.name}, ${bed.name}`
          : `${room.name}, ${bed.name}`
        : '';

    admitPatient({
      name: formData.name,
      room: roomDisplay,
      diagnosis: formData.diagnosis,
      doctor: formData.doctor,
      assignedNurse: formData.assignedNurse,
      bedId,
    });
    onClose();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
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
        aria-labelledby="admit-patient-title"
        className="bg-white border border-zinc-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 bg-zinc-50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
              <UserPlus className="w-5 h-5" aria-hidden />
            </div>
            <h2 id="admit-patient-title" className="text-xl font-bold text-zinc-900">
              Bemor qabul qilish
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors"
            aria-label="Yopish"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-lg text-sm font-medium">
              {error}
            </div>
          )}
          {!error && !isLoading && !hasBedOptions && (
            <div
              className="bg-amber-50 border border-amber-200 text-amber-950 p-3 rounded-lg text-sm font-medium"
              role="status"
            >
              Tizimda bo&apos;sh joy (palata/karavat) topilmadi. Avval sozlamalar orqali infratuzilma
              qo&apos;shing.
            </div>
          )}

          <div>
            <label htmlFor="adm-dept" className="block text-sm font-semibold text-zinc-700 mb-1">
              Bo&apos;lim
            </label>
            <select
              id="adm-dept"
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                setRoomId('');
                setBedId('');
              }}
              disabled={isLoading || !!error || !hasBedOptions}
              className="w-full bg-white border border-zinc-300 rounded-lg px-4 py-2.5 text-zinc-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all disabled:opacity-50"
              required
            >
              <option value="">{isLoading ? 'Yuklanmoqda...' : 'Bo‘limni tanlang'}</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="adm-room" className="block text-sm font-semibold text-zinc-700 mb-1">
              Palata / xona
            </label>
            <select
              id="adm-room"
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value);
                setBedId('');
              }}
              disabled={isLoading || !!error || !departmentId}
              className="w-full bg-white border border-zinc-300 rounded-lg px-4 py-2.5 text-zinc-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all disabled:opacity-50"
              required
            >
              <option value="">Tanlang</option>
              {roomsInDept.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="adm-bed" className="block text-sm font-semibold text-zinc-700 mb-1">
              Karavat / joy
            </label>
            <select
              id="adm-bed"
              value={bedId}
              onChange={(e) => setBedId(e.target.value)}
              disabled={isLoading || !!error || !roomId}
              className="w-full bg-white border border-zinc-300 rounded-lg px-4 py-2.5 text-zinc-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all disabled:opacity-50"
              required
            >
              <option value="">Tanlang</option>
              {bedsInRoom.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.id})
                </option>
              ))}
            </select>
            {bedId && (
              <p className="mt-1 text-xs text-zinc-500">
                Shu karavatga biriktirilgan monitor vitallari bemor bilan avtomatik bog‘lanadi.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-semibold text-zinc-700 mb-1">
              F.I.Sh.
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
              className="w-full bg-white border border-zinc-300 rounded-lg px-4 py-2.5 text-zinc-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
              placeholder="Masalan: Karimov A.B."
            />
          </div>

          <div>
            <label htmlFor="diagnosis" className="block text-sm font-semibold text-zinc-700 mb-1">
              Tashxis
            </label>
            <input
              type="text"
              id="diagnosis"
              name="diagnosis"
              required
              value={formData.diagnosis}
              onChange={handleChange}
              className="w-full bg-white border border-zinc-300 rounded-lg px-4 py-2.5 text-zinc-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
              placeholder="Asosiy tashxis"
            />
          </div>

          <div>
            <label htmlFor="doctor" className="block text-sm font-semibold text-zinc-700 mb-1">
              Mas&apos;ul shifokor
            </label>
            <input
              type="text"
              id="doctor"
              name="doctor"
              required
              value={formData.doctor}
              onChange={handleChange}
              className="w-full bg-white border border-zinc-300 rounded-lg px-4 py-2.5 text-zinc-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
              placeholder="Shifokor F.I.Sh."
            />
          </div>

          <div>
            <label htmlFor="assignedNurse" className="block text-sm font-semibold text-zinc-700 mb-1">
              Mas&apos;ul hamshira
            </label>
            <input
              type="text"
              id="assignedNurse"
              name="assignedNurse"
              required
              value={formData.assignedNurse}
              onChange={handleChange}
              className="w-full bg-white border border-zinc-300 rounded-lg px-4 py-2.5 text-zinc-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
              placeholder="Hamshira F.I.Sh."
            />
          </div>

          <div className="pt-4 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 transition-colors"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={!hasBedOptions || isLoading || !!error || !bedId}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
            >
              Qabul qilish
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
