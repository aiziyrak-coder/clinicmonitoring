import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { X, Upload, Building2, ChevronRight } from 'lucide-react';
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

/**
 * Bo'lim → palata → karavat, keyin monitor tarmoq ekrani rasmi.
 * Backend Gemini Vision bilan maydonlarni o'qiydi va qurilma yaratadi.
 */
export function AddDeviceFromScreenModal({
  infrastructure,
  onClose,
  onSuccess,
}: AddDeviceFromScreenModalProps) {
  const [departmentId, setDepartmentId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [bedId, setBedId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roomsInDept = useMemo(
    () => infrastructure.rooms.filter((r) => r.departmentId === departmentId),
    [infrastructure.rooms, departmentId],
  );
  const bedsInRoom = useMemo(
    () => infrastructure.beds.filter((b) => b.roomId === roomId),
    [infrastructure.beds, roomId],
  );

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onPickFile = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFile(f ?? null);
    setError(null);
  }, []);

  const canSubmit =
    Boolean(departmentId && roomId && bedId && file && !busy);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('bedId', bedId);
      fd.append('image', file);
      const res = await authedFetch('/api/devices/from-screen/', {
        method: 'POST',
        body: fd,
      });
      const raw = await res.text();
      let detail: unknown = raw;
      try {
        detail = raw ? JSON.parse(raw) : {};
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        const msg =
          typeof detail === 'object' && detail !== null && 'detail' in detail
            ? String((detail as { detail: unknown }).detail)
            : res.statusText;
        setError(msg || `Xatolik (${res.status})`);
        return;
      }
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      setError("Tarmoq xatosi — backend va GEMINI_API_KEY ni tekshiring.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-device-screen-title"
        className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 text-emerald-400">
            <Building2 className="w-5 h-5" />
            <h2 id="add-device-screen-title" className="text-lg font-bold text-white">
              Qurilma (ekran rasmi)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg"
            aria-label="Yopish"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <p className="text-sm text-zinc-400">
            Avval joyni tanlang, keyin monitorning <strong className="text-zinc-300">Интернет / HL7</strong>{' '}
            oynasining skrinshotini yuklang — tizim IP, MAC va portlarni o‘qiydi.
          </p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Bo‘lim</label>
            <select
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                setRoomId('');
                setBedId('');
              }}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-white"
              required
            >
              <option value="">Tanlang…</option>
              {infrastructure.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Palata / xona</label>
            <select
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value);
                setBedId('');
              }}
              disabled={!departmentId}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-white disabled:opacity-50"
              required
            >
              <option value="">Tanlang…</option>
              {roomsInDept.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Karavat / joy</label>
            <select
              value={bedId}
              onChange={(e) => setBedId(e.target.value)}
              disabled={!roomId}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-white disabled:opacity-50"
              required
            >
              <option value="">Tanlang…</option>
              {bedsInRoom.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.id})
                </option>
              ))}
            </select>
          </div>

          <div className="border border-dashed border-zinc-600 rounded-lg p-4 text-center">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onPickFile}
              className="hidden"
              id="monitor-screen-file"
            />
            <label
              htmlFor="monitor-screen-file"
              className="cursor-pointer flex flex-col items-center gap-2 text-zinc-400 hover:text-emerald-400"
            >
              <Upload className="w-8 h-8" />
              <span>Rasm tanlash (JPEG / PNG)</span>
              {file && <span className="text-xs font-mono text-zinc-500">{file.name}</span>}
            </label>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Yuklangan ekran"
                className="mt-3 max-h-48 mx-auto rounded border border-zinc-700"
              />
            )}
          </div>

          <p className="text-xs text-zinc-500 flex items-start gap-1">
            <ChevronRight className="w-4 h-4 shrink-0 mt-0.5" />
            Backend-da <code className="text-zinc-400">GEMINI_API_KEY</code> bo‘lishi kerak (Google AI
            Studio).
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-zinc-400 hover:text-white"
            >
              Bekor
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-40"
            >
              {busy ? 'Tahlil…' : 'Qurilma qo‘shish'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
