import {
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { X, Monitor } from 'lucide-react';
import { authedFetch } from '../authStore';

export interface InfrastructureShape {
  departments: { id: string; name: string }[];
  rooms: { id: string; name: string; departmentId: string }[];
  beds: { id: string; name: string; roomId: string }[];
}

interface AddDeviceFromScreenModalProps {
  infrastructure: InfrastructureShape;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddDeviceFromScreenModal({
  infrastructure,
  onClose,
  onSuccess,
}: AddDeviceFromScreenModalProps) {
  const [departmentId, setDepartmentId] = useState('');
  const [roomId, setRoomId]             = useState('');
  const [bedId, setBedId]               = useState('');
  const [ipAddress, setIpAddress]       = useState('');
  const [model, setModel]               = useState('');
  const [hl7Port, setHl7Port]           = useState('6006');
  const [busy, setBusy]                 = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const roomsInDept = useMemo(
    () => infrastructure.rooms.filter((r) => r.departmentId === departmentId),
    [infrastructure.rooms, departmentId],
  );
  const bedsInRoom = useMemo(
    () => infrastructure.beds.filter((b) => b.roomId === roomId),
    [infrastructure.beds, roomId],
  );

  const canSubmit = Boolean(departmentId && roomId && bedId && ipAddress.trim() && !busy);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    // IP format tekshiruv
    const ipRx = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRx.test(ipAddress.trim())) {
      setError("IP manzil noto'g'ri (masalan: 192.168.1.100)");
      return;
    }

    const port = parseInt(hl7Port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      setError("Port 1–65535 oralig'ida bo'lishi kerak");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const body = {
        ipAddress: ipAddress.trim(),
        model:     model.trim() || 'Monitor',
        hl7Enabled: true,
        hl7Port:   port,
        bedId,
      };
      const res = await authedFetch('/api/devices/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof data === 'object' && data !== null
            ? (data as Record<string, unknown>).detail ??
              Object.values(data as Record<string, unknown>).flat().join(' ')
            : res.statusText;
        setError(String(msg) || `Xatolik (${res.status})`);
        return;
      }
      onSuccess();
      onClose();
    } catch {
      setError('Tarmoq xatosi — server bilan aloqa yo'q.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-900/35 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-device-title"
        className="bg-white border border-zinc-200 rounded-xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 bg-zinc-50">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-emerald-600" />
            <h2 id="add-device-title" className="text-base font-bold text-zinc-900">
              Qurilma qo'shish
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg"
            aria-label="Yopish"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-sm font-medium p-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Bo'lim */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Bo'lim</label>
            <select
              value={departmentId}
              onChange={(e) => { setDepartmentId(e.target.value); setRoomId(''); setBedId(''); }}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            >
              <option value="">Tanlang…</option>
              {infrastructure.departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Palata */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Palata</label>
            <select
              value={roomId}
              onChange={(e) => { setRoomId(e.target.value); setBedId(''); }}
              disabled={!departmentId}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-40"
              required
            >
              <option value="">Tanlang…</option>
              {roomsInDept.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          {/* Karavat */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Karavat / joy</label>
            <select
              value={bedId}
              onChange={(e) => setBedId(e.target.value)}
              disabled={!roomId}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-40"
              required
            >
              <option value="">Tanlang…</option>
              {bedsInRoom.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <hr className="border-zinc-200" />

          {/* IP manzil */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Monitor IP manzili <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              placeholder="192.168.1.100"
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          {/* Model nomi */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Model nomi <span className="text-zinc-400 font-normal">(ixtiyoriy)</span>
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Creative Medical K12"
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* HL7 Port */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">HL7 port</label>
            <input
              type="number"
              value={hl7Port}
              onChange={(e) => setHl7Port(e.target.value)}
              min={1}
              max={65535}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Tugmalar */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-zinc-600 hover:text-zinc-900 font-semibold text-sm"
            >
              Bekor
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-40 font-semibold text-sm"
            >
              {busy ? 'Saqlanmoqda…' : 'Qo'shish'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
