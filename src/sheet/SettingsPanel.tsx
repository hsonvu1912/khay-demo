// =============================================================================
// SettingsPanel — "Cài đặt (demo admin)": panel trượt từ phải (desktop 420px,
// mobile full) sửa KhayCatalog qua sheet.setCatalog (áp NGAY). 3 nhóm gấp/mở:
// (a) Bảng màu PLA Matte — toggle tồn kho từng màu;
// (b) Giá — đ/g, phí/khay, hệ số bù, giá sàn + preview giá hiện tại;
// (c) Giới hạn in — wallT/floorT/outerR/pocketR… + luật engine outerR≤pocketR+
//     (2+√2)·wallT−0.01 (vượt → lỗi đỏ, KHÔNG áp).
// Nút: Về mặc định (confirm) · Xuất JSON · Nhập JSON (parse fail → lỗi inline).
// =============================================================================
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useIsMobile } from './hooks';
import { IconBtn, Btn } from './bits';
import type { KhaySheet } from './useKhaySheet';
import {
  DEFAULT_KHAY_CATALOG,
  colorEnabled,
  type KhayCatalog,
  type KhayLimits,
  type KhayPricing,
} from '@/engine/catalog';
import { PLA_MATTE_PALETTE } from '@/engine/palette';

const CloseIcon = (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
    <path d="M3 3l9 9M12 3l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const RED = '#b3261e';

function formatPrice(v: number): string {
  return `${Math.round(v).toLocaleString('vi-VN')} ₫`;
}

/** Luật hình học engine: bo ngoài không được vượt bo lòng ô + (2+√2)·vách. */
function limitsRuleError(l: KhayLimits): string | null {
  const maxOuter = l.pocketR + (2 + Math.SQRT2) * l.wallT - 0.01;
  if (l.outerR > maxOuter + 1e-9) {
    return `Bo ngoài tối đa ${maxOuter.toFixed(2)} mm (= bo lòng ô + (2+√2)·vách − 0.01). Giảm bo ngoài hoặc tăng bo lòng ô / vách.`;
  }
  return null;
}

/** Merge JSON nhập (partial) lên DEFAULT — field thiếu lấy mặc định (như store). */
function mergeImported(p: Partial<KhayCatalog>): KhayCatalog {
  const d = DEFAULT_KHAY_CATALOG;
  const pl = (p.limits ?? {}) as Partial<KhayLimits>;
  return {
    version: 1,
    pricing: { ...d.pricing, ...(p.pricing ?? {}) },
    limits: {
      ...d.limits,
      ...pl,
      fitClearanceMm: { ...d.limits.fitClearanceMm, ...(pl.fitClearanceMm ?? {}) },
      maxDrawer: { ...d.limits.maxDrawer, ...(pl.maxDrawer ?? {}) },
      minDrawer: { ...d.limits.minDrawer, ...(pl.minDrawer ?? {}) },
      heightSteps:
        Array.isArray(pl.heightSteps) && pl.heightSteps.length > 0
          ? pl.heightSteps
          : d.limits.heightSteps,
    },
    colors: Array.isArray(p.colors) ? p.colors : d.colors,
  };
}

/** Input số: hiện text đang gõ, chỉ commit khi hợp lệ + trong min/max;
 *  blur → về giá trị thật trong catalog (giá trị chưa áp bị bỏ). */
function NumField({
  label,
  unit,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  // Catalog đổi từ ngoài (reset/nhập JSON) → sync text khi không gõ dở
  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);
  const parsed = Number(text);
  const bad = text.trim() === '' || !Number.isFinite(parsed) || parsed < min || parsed > max;
  return (
    <label className="flex items-center justify-between gap-2 py-[5px]">
      <span className="min-w-0 flex-1 text-[12px] text-[var(--color-ink-2)]">{label}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={text}
          title={`${min}–${max} ${unit}`}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
            setText(String(value)); // về giá trị đã áp thật
          }}
          onChange={(e) => {
            setText(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value.trim() !== '' && Number.isFinite(v) && v >= min && v <= max) {
              onCommit(v);
            }
          }}
          className={`num h-8 w-[92px] rounded-[9px] border bg-white px-2 text-right text-[12.5px] outline-none transition-colors ${
            bad ? 'border-[#b3261e] text-[#b3261e]' : 'border-[var(--color-line)] focus:border-[var(--color-ink)]/50'
          }`}
        />
        <span className="w-9 text-[10.5px] text-[var(--color-ink-3)]">{unit}</span>
      </span>
    </label>
  );
}

/** Nhóm gấp/mở kiểu accordion hairline. */
function Group({
  title,
  meta,
  open,
  onToggle,
  children,
}: {
  title: string;
  meta?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-[var(--color-line)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 py-3.5 text-left"
      >
        <span className="muuto-label text-[var(--color-ink)]">{title}</span>
        <span className="flex items-center gap-2">
          {meta && <span className="num text-[11px] text-[var(--color-ink-3)]">{meta}</span>}
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
            className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          >
            <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open && <div className="anim-fade pb-4">{children}</div>}
    </section>
  );
}

/** Công tắc pill nhỏ. */
function Toggle({ on, title, onChange }: { on: boolean; title: string; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title={title}
      onClick={onChange}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ${
        on ? 'bg-[var(--color-ink)]' : 'bg-[var(--color-line)]'
      }`}
    >
      <span
        className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-150 ${
          on ? 'translate-x-[18px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  );
}

export function SettingsPanel({
  sheet,
  open,
  onClose,
}: {
  sheet: KhaySheet;
  open: boolean;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const [opened, setOpened] = useState<Record<'colors' | 'pricing' | 'limits', boolean>>({
    colors: true,
    pricing: false,
    limits: false,
  });
  const [limitsError, setLimitsError] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Esc đóng panel
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const cat = sheet.catalog;
  const toggleGroup = (k: 'colors' | 'pricing' | 'limits') =>
    setOpened((o) => ({ ...o, [k]: !o[k] }));

  // ── commit từng nhánh catalog (áp NGAY) ────────────────────────────────────
  const toggleColor = (id: string) => {
    const nowOn = colorEnabled(cat, id);
    const rest = cat.colors.filter((c) => c.id !== id);
    // Bật = mặc định → chỉ giữ row khi TẮT (catalog gọn)
    const colors = nowOn ? [...rest, { id, enabled: false }] : rest;
    sheet.setCatalog({ ...cat, colors });
  };
  const commitPricing = (patch: Partial<KhayPricing>) =>
    sheet.setCatalog({ ...cat, pricing: { ...cat.pricing, ...patch } });
  const commitLimits = (patch: Partial<KhayLimits>) => {
    const limits = { ...cat.limits, ...patch };
    const err = limitsRuleError(limits);
    setLimitsError(err);
    if (err) return; // vi phạm luật engine → KHÔNG áp
    sheet.setCatalog({ ...cat, limits });
  };

  // ── reset / xuất / nhập JSON ───────────────────────────────────────────────
  const resetDefaults = () => {
    if (!window.confirm('Đưa toàn bộ cài đặt về mặc định?')) return;
    sheet.setCatalog(DEFAULT_KHAY_CATALOG);
    setLimitsError(null);
    setJsonError(null);
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(cat, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'khay-catalog.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  const importJson = (f: File) => {
    f.text()
      .then((raw) => {
        try {
          const p = JSON.parse(raw) as Partial<KhayCatalog> | null;
          if (!p || typeof p !== 'object' || (!p.pricing && !p.limits && !p.colors)) {
            throw new Error('shape');
          }
          sheet.setCatalog(mergeImported(p));
          setJsonError(null);
          setLimitsError(null);
        } catch {
          setJsonError('File JSON không hợp lệ — cần đúng cấu trúc catalog đã xuất.');
        }
      })
      .catch(() => setJsonError('Không đọc được file.'));
  };

  const enabledCount = PLA_MATTE_PALETTE.filter((c) => colorEnabled(cat, c.id)).length;
  const l = cat.limits;
  const p = cat.pricing;

  return (
    <>
      <div className="anim-fade fixed inset-0 z-40 bg-black/25" onClick={onClose} />
      <aside
        role="dialog"
        aria-label="Cài đặt sản phẩm (demo admin)"
        className={`fixed z-50 flex flex-col bg-white ${
          isMobile
            ? 'anim-sheet inset-0'
            : 'anim-slide-right bottom-0 right-0 top-0 w-[420px] border-l border-[var(--color-line)] shadow-2xl'
        }`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-line)] px-5 py-3.5">
          <div>
            <h2 className="text-[14px] font-semibold leading-tight">Cài đặt (demo admin)</h2>
            <p className="mt-0.5 text-[10.5px] text-[var(--color-ink-3)]">
              Áp dụng ngay vào giá & hình · demo lưu trên máy này
            </p>
          </div>
          <IconBtn label={CloseIcon} title="Đóng cài đặt" onClick={onClose} size={32} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          {/* (a) Bảng màu */}
          <Group
            title="Bảng màu"
            meta={`${enabledCount}/${PLA_MATTE_PALETTE.length} màu`}
            open={opened.colors}
            onToggle={() => toggleGroup('colors')}
          >
            <p className="mb-2 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
              PLA Matte (Bambu Lab). Màu tắt = hết hàng, khách không thấy.
            </p>
            <ul className="space-y-0.5">
              {PLA_MATTE_PALETTE.map((c) => {
                const on = colorEnabled(cat, c.id);
                return (
                  <li key={c.id} className="flex items-center gap-2.5 py-[3px]">
                    <span
                      className="h-6 w-6 shrink-0 rounded-full border border-black/10"
                      style={{ background: c.hex, opacity: on ? 1 : 0.35 }}
                    />
                    <span className={`min-w-0 flex-1 leading-tight ${on ? '' : 'opacity-45'}`}>
                      <span className="block truncate text-[12.5px] font-medium">{c.nameVi}</span>
                      <span className="block truncate text-[10.5px] text-[var(--color-ink-3)]">{c.name}</span>
                    </span>
                    <Toggle
                      on={on}
                      title={on ? `Tắt màu ${c.nameVi} (hết hàng)` : `Bật màu ${c.nameVi}`}
                      onChange={() => toggleColor(c.id)}
                    />
                  </li>
                );
              })}
            </ul>
          </Group>

          {/* (b) Giá */}
          <Group title="Giá" open={opened.pricing} onToggle={() => toggleGroup('pricing')}>
            <NumField
              label="Giá nhựa"
              unit="đ/g"
              value={p.pricePerGram}
              min={0}
              max={100_000}
              step={50}
              onCommit={(v) => commitPricing({ pricePerGram: v })}
            />
            <NumField
              label="Phí cố định mỗi khay"
              unit="đ"
              value={p.baseFeePerTray}
              min={0}
              max={1_000_000}
              step={1000}
              onCommit={(v) => commitPricing({ baseFeePerTray: v })}
            />
            <NumField
              label="Hệ số bù slicer"
              unit="×"
              value={p.calibrationFactor}
              min={0.5}
              max={2}
              step={0.01}
              onCommit={(v) => commitPricing({ calibrationFactor: v })}
            />
            <NumField
              label="Giá sàn mỗi đơn"
              unit="đ"
              value={p.minOrder}
              min={0}
              max={10_000_000}
              step={1000}
              onCommit={(v) => commitPricing({ minOrder: v })}
            />
            <div className="mt-2 rounded-[9px] bg-[var(--color-surface-2)] px-3 py-2">
              <span className="text-[11px] text-[var(--color-ink-3)]">Cấu hình hiện tại: </span>
              <span className="num text-[12.5px] font-bold">{formatPrice(sheet.price.total)}</span>
              <span className="num text-[11px] text-[var(--color-ink-3)]">
                {' '}· {sheet.price.trayCount} khay · ~{Math.round(sheet.price.totalGrams)}g
              </span>
            </div>
          </Group>

          {/* (c) Giới hạn in */}
          <Group title="Giới hạn in" open={opened.limits} onToggle={() => toggleGroup('limits')}>
            <NumField
              label="Dày vách (wallT)"
              unit="mm"
              value={l.wallT}
              min={0.8}
              max={3.2}
              step={0.1}
              onCommit={(v) => commitLimits({ wallT: v })}
            />
            <NumField
              label="Dày đáy (floorT)"
              unit="mm"
              value={l.floorT}
              min={0.8}
              max={4}
              step={0.1}
              onCommit={(v) => commitLimits({ floorT: v })}
            />
            <NumField
              label="Bo ngoài (outerR)"
              unit="mm"
              value={l.outerR}
              min={0}
              max={20}
              step={0.5}
              onCommit={(v) => commitLimits({ outerR: v })}
            />
            <NumField
              label="Bo lòng ô (pocketR)"
              unit="mm"
              value={l.pocketR}
              min={0}
              max={20}
              step={0.5}
              onCommit={(v) => commitLimits({ pocketR: v })}
            />
            <NumField
              label="Lòng ô nhỏ nhất"
              unit="mm"
              value={l.minPocketMm}
              min={10}
              max={100}
              step={1}
              onCommit={(v) => commitLimits({ minPocketMm: v })}
            />
            <NumField
              label="Cạnh khay tối đa"
              unit="mm"
              value={l.maxTrayMm}
              min={60}
              max={176}
              step={1}
              onCommit={(v) => commitLimits({ maxTrayMm: v })}
            />
            <NumField
              label="Chân cắm xếp chồng (lipH)"
              unit="mm"
              value={l.lipH}
              min={1}
              max={6}
              step={0.1}
              onCommit={(v) => commitLimits({ lipH: v })}
            />
            <NumField
              label="Khe hở chân cắm (lipClear)"
              unit="mm"
              value={l.lipClearMm}
              min={0.1}
              max={1}
              step={0.05}
              onCommit={(v) => commitLimits({ lipClearMm: v })}
            />
            {limitsError && (
              <p className="mt-2 rounded-[9px] px-3 py-2 text-[11.5px] leading-relaxed" style={{ background: '#fbeae9', color: RED }}>
                {limitsError}
              </p>
            )}
          </Group>

          {/* Footer: reset + JSON */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Btn onClick={resetDefaults} title="Đưa mọi cài đặt về mặc định (có xác nhận)">
              Về mặc định
            </Btn>
            <Btn onClick={exportJson} title="Tải catalog hiện tại xuống dạng JSON">
              Xuất JSON
            </Btn>
            <Btn onClick={() => fileRef.current?.click()} title="Nạp catalog từ file JSON đã xuất">
              Nhập JSON
            </Btn>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importJson(f);
                e.target.value = ''; // cho phép chọn lại cùng file
              }}
            />
          </div>
          {jsonError && (
            <p className="mt-2 text-[11.5px]" style={{ color: RED }}>
              {jsonError}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
