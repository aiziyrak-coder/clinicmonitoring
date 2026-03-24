import { X, BookOpen } from 'lucide-react';
import { useModalDismiss } from '../hooks/useModalDismiss';

interface ColorGuideModalProps {
  onClose: () => void;
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-4 w-12 shrink-0 rounded-md border ${className}`} title={label} aria-hidden />
      <span className="text-zinc-800 font-medium">{label}</span>
    </span>
  );
}

export function ColorGuideModal({ onClose }: ColorGuideModalProps) {
  useModalDismiss(true, onClose);

  return (
    <div
      className="fixed inset-0 z-[115] flex items-center justify-center bg-zinc-900/35 backdrop-blur-md p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="color-guide-title"
        className="bg-white border border-zinc-200 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 p-5 border-b border-zinc-200 bg-zinc-50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 border border-emerald-200">
              <BookOpen className="h-5 w-5 text-emerald-700" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id="color-guide-title" className="text-lg font-bold text-zinc-900 truncate">
                Ranglar bo&apos;yicha yo&apos;riqnoma
              </h2>
              <p className="text-xs text-zinc-600 font-medium mt-0.5">
                Bemor kartochkalari va asosiy ekran elementlari
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-2 rounded-lg text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
            aria-label="Yopish"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-8 text-sm text-zinc-700">
          <section>
            <h3 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden />
              Bemor kartochkasi — signal darajasi (chegara buzilish)
            </h3>
            <p className="mb-4 text-zinc-600 leading-relaxed font-medium">
              Kartochka ramkasi va foni signal turi bo&apos;yicha o&apos;zgaradi. Katta kartochkalar kritik holatda, o&apos;rtacha — ogohlantirish, kichik — stabil bemorlar uchun ishlatiladi.
            </p>
            <ul className="space-y-3">
              <li className="flex flex-col sm:flex-row sm:items-start gap-2">
                <Swatch className="border-zinc-300 bg-zinc-100" label="Kulrang / zinc" />
                <span>
                  <strong className="text-zinc-900">Stabil.</strong> Ko&apos;rsatkichlar sozlangan chegaralar ichida, maxsus signal yo&apos;q.
                </span>
              </li>
              <li className="flex flex-col sm:flex-row sm:items-start gap-2">
                <Swatch className="border-sky-400 bg-sky-100" label="Ko&apos;k" />
                <span>
                  <strong className="text-sky-800">Ogohlantirish (pastki).</strong> Biror parametrsiz chegara buzilgan; monitoring va tekshiruvni davom ettiring.
                </span>
              </li>
              <li className="flex flex-col sm:flex-row sm:items-start gap-2">
                <Swatch className="border-amber-400 bg-amber-100" label="Sariq" />
                <span>
                  <strong className="text-amber-900">Ogohlantirish.</strong> O&apos;rtacha xavf; tez-tez tekshirish va klinik baholash tavsiya etiladi.
                </span>
              </li>
              <li className="flex flex-col sm:flex-row sm:items-start gap-2">
                <Swatch className="border-red-500 bg-red-100" label="Qizil" />
                <span>
                  <strong className="text-red-800">Kritik.</strong> Darhol aralashuv; tizim kritik signal uchun ovoz ham berishi mumkin (ovoz yoqilgan bo&apos;lsa).
                </span>
              </li>
              <li className="flex flex-col sm:flex-row sm:items-start gap-2">
                <Swatch className="border-purple-500 bg-purple-100" label="Binafsha" />
                <span>
                  <strong className="text-purple-900">Maxsus signal.</strong> Alohida holat (masalan, texnik yoki belgilangan signal); kartochkadagi badge yonida{' '}
                  <strong className="text-zinc-900">×</strong> tugmasi bilan tozalash mumkin.
                </span>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-red-600" aria-hidden />
              Asosiy ekran — bo&apos;lim sarlavhalari
            </h3>
            <ul className="space-y-2">
              <li>
                <span className="text-red-800 font-semibold">Kritik holat</span> — qizil alarm (yuqoridagi &quot;qizil&quot; kartochkalar) guruhi.
              </li>
              <li>
                <span className="text-amber-800 font-semibold">Ogohlantirish</span> — ko&apos;k, sariq yoki binafsha signaldagi bemorlar.
              </li>
              <li>
                <span className="text-emerald-800 font-semibold">Stabil holat</span> — signal yo&apos;q; kichik kartochka ko&apos;rinishida.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500" aria-hidden />
              NEWS2 bali (N: raqam)
            </h3>
            <p className="mb-3 text-zinc-600 font-medium">Kartochka ustidagi &quot;N:&quot; yorlig&apos;i umumiy holatni ifodalaydi:</p>
            <ul className="space-y-2">
              <li><span className="text-emerald-800 font-semibold">0</span> — yashil zona, normal.</li>
              <li><span className="text-amber-800 font-semibold">1–4</span> — sariq, past ogohlantirish.</li>
              <li><span className="text-orange-700 font-semibold">5–6</span> — apelsin, o&apos;rta xavf.</li>
              <li><span className="text-red-800 font-semibold">7 va yuqori</span> — qizil, yuqori xavf.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-600" aria-hidden />
              Katta kartochkadagi ko&apos;rsatkichlar (rang kodlari)
            </h3>
            <ul className="space-y-2">
              <li><span className="text-emerald-800 font-semibold">YUCh</span> — yurak urishi (emerald).</li>
              <li><span className="text-cyan-800 font-semibold">SpO₂</span> — qondagi kislorod (cyan).</li>
              <li><span className="text-zinc-900 font-semibold">AQB</span> — arterial qon bosimi (sistol/diastol).</li>
              <li><span className="text-amber-800 font-semibold">NCh</span> — nafas olish chastotasi.</li>
              <li><span className="text-orange-700 font-semibold">Harorat</span> — tana harorati.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-purple-600" aria-hidden />
              Boshqa belgilar
            </h3>
            <ul className="space-y-2">
              <li>
                <span className="text-red-800 font-semibold">Miya ikonkasi</span> — AI prognoz (yuqori xavf) belgisi.
              </li>
              <li>
                <span className="text-emerald-800 font-semibold">Qadalgan (pin)</span> — bemor ekranda ustunlik bilan ko&apos;rsatiladi.
              </li>
              <li>
                <span className="text-red-800 font-semibold">Batareya qizil</span> — qurilma zaryadi ~20% dan past.
              </li>
              <li>
                <span className="text-purple-900 font-semibold">Soat / vaqt</span> — rejali tekshiruv oralig&apos;i yoki qolgan vaqt.
              </li>
              <li>
                <span className="text-emerald-800 font-semibold">Online</span> / <span className="text-red-800 font-semibold">Offline</span> — server bilan ulanish holati.
              </li>
            </ul>
          </section>

          <p className="text-xs text-zinc-600 border-t border-zinc-200 pt-4 font-medium">
            Klinik qarorlar har doim shifokor bahosi va mahalliy protokollarga muvofiq qabul qilinishi kerak. Bu yo&apos;riqnoma faqat interfeysdagi rang kodlarini tushuntiradi.
          </p>
        </div>
      </div>
    </div>
  );
}
