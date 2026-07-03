// =============================================================================
// KhayApp — lắp ráp đầy đủ configurator khay:
//   Scene3D > TrayMeshes + CellHitLayer + SelectionOverlay3D (trong Canvas)
//   TopBar · LevelTabs · BottomDock + DockPanel · ContextMenu
//   MeasureGuide · SettingsPanel · PriceDetails · toast · phím tắt · debug API
// =============================================================================
import { useCallback, useState } from 'react';
import { useKhaySheet } from './useKhaySheet';
import { Scene3D } from './Scene3D';
import { TrayMeshes } from './TrayMeshes';
import { CellHitLayer } from './CellHitLayer';
import { SelectionOverlay3D } from './SelectionOverlay3D';
import { TopBar } from './TopBar';
import { LevelTabs } from './LevelTabs';
import { BottomDock } from './BottomDock';
import { DockPanel, type DockTab } from './DockPanel';
import { ContextMenu } from './ContextMenu';
import { MeasureGuide } from './MeasureGuide';
import { SettingsPanel } from './SettingsPanel';
import { PriceDetails } from './PriceDetails';
import { exportZip } from './download';
import { useToast } from './bits';
import { useDebugApi } from './debugApi';
import { useKhayKeyboard } from './keyboard';

export function KhayApp() {
  const sheet = useKhaySheet();
  const [exporting, setExporting] = useState(false);
  const [toast, flash] = useToast();

  // Overlay states — mỗi panel 1 cờ, ContextMenu giữ toạ độ mở.
  const [dockTab, setDockTab] = useState<DockTab>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);

  useDebugApi(sheet);
  // Escape: overlay nào đang mở tự đóng (listener riêng của nó); chỉ khi KHÔNG
  // còn overlay mới bỏ chọn ô — tránh 1 phím Escape làm 2 việc cùng lúc.
  const overlayOpen =
    menu !== null || dockTab !== null || guideOpen || settingsOpen || priceOpen;
  useKhayKeyboard(sheet, () => !overlayOpen);

  const handleExport = useCallback(() => {
    if (exporting) return;
    setExporting(true);
    // Nhường 1 frame cho spinner vẽ rồi mới build STL (sync, có thể nặng).
    window.setTimeout(() => {
      try {
        const r = exportZip(sheet);
        flash(`Đã tải ${r.files.length} file STL · ~${Math.round(r.totalGrams)}g nhựa`);
      } catch (e) {
        flash(e instanceof Error ? e.message : 'Xuất file thất bại', { error: true });
      } finally {
        setExporting(false);
      }
    }, 50);
  }, [exporting, sheet, flash]);

  const openGuide = useCallback(() => setGuideOpen(true), []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--color-paper)]">
      <div className="absolute inset-0">
        <Scene3D sheet={sheet} onPointerMissed={() => sheet.select(null)}>
          <TrayMeshes sheet={sheet} />
          <CellHitLayer sheet={sheet} onContextMenu={(x, y) => setMenu({ x, y })} />
          <SelectionOverlay3D sheet={sheet} />
        </Scene3D>
      </div>

      <TopBar
        sheet={sheet}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenGuide={openGuide}
        onOpenPrice={() => setPriceOpen(true)}
        onExport={handleExport}
        exporting={exporting}
      />
      <LevelTabs sheet={sheet} />
      <BottomDock sheet={sheet} tab={dockTab} setTab={setDockTab} />
      <DockPanel
        sheet={sheet}
        tab={dockTab}
        onClose={() => setDockTab(null)}
        onOpenGuide={openGuide}
      />

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          sheet={sheet}
          onClose={() => setMenu(null)}
          onOpenColors={() => setDockTab('color')}
        />
      )}

      <MeasureGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
      <SettingsPanel sheet={sheet} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <PriceDetails sheet={sheet} open={priceOpen} onClose={() => setPriceOpen(false)} />

      {toast}
    </div>
  );
}
