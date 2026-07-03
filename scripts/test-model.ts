// =============================================================================
// Test tầng model: tiling / layout / merge / pricing — chạy: pnpm test-model
// =============================================================================
import { DEFAULT_KHAY_CATALOG, stackingDims } from '../src/engine/catalog';
import { computeTiling } from '../src/engine/tiling';
import {
  addLevel,
  buildAllTrays,
  cellSize,
  decodeBlocks,
  defaultLayout,
  encodeBlocks,
  mergeRect,
  parseLayout,
  serializeLayout,
  setDrawer,
  setLevelHeight,
  setTrayGrid,
  unmergeAt,
} from '../src/engine/layout';
import { computeKhayPrice, PLA_DENSITY, trayGrams } from '../src/engine/pricing';
import { analyticTrayVolumeMm3 } from '../src/engine/geometry/volume';

const catalog = DEFAULT_KHAY_CATALOG;
let failed = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failed++;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

console.log('— Tiling —');
{
  // 150×100 → 1×1; 400×300 → 3×2 (cột×hàng); 900×600 → 6×4; mọi tile ≤176, đều ±1mm
  const cases: [number, number, number, number][] = [
    [150, 100, 1, 1],
    [400, 300, 3, 2],
    [900, 600, 6, 4],
    [176 + 2, 100, 1, 1], // 178 lòng − 2×1 khe = 176 = đúng max → vẫn 1 khay
    [179, 100, 2, 1], // 177 usable > 176 → phải chia 2
  ];
  for (const [w, d, ec, er] of cases) {
    const t = computeTiling(w, d, 'chuan', catalog.limits);
    check(`${w}×${d} → ${ec}×${er}`, t.cols === ec && t.rows === er, `được ${t.cols}×${t.rows}`);
    const maxSide = Math.max(...t.tiles.flatMap((x) => [x.w, x.d]));
    check(`${w}×${d} mọi cạnh tile ≤176`, maxSide <= catalog.limits.maxTrayMm + 1e-9, `max ${maxSide.toFixed(2)}`);
    const ws = new Set(t.tiles.map((x) => x.w.toFixed(3)));
    const ds = new Set(t.tiles.map((x) => x.d.toFixed(3)));
    check(`${w}×${d} tile đều nhau`, ws.size === 1 && ds.size === 1);
    // Phủ kín: tile cuối + khe fit = mép lòng
    const last = t.tiles[t.tiles.length - 1];
    check(
      `${w}×${d} phủ kín lòng`,
      Math.abs(last.x + last.w + t.originX - w) < 1e-9 && Math.abs(last.y + last.d + t.originY - d) < 1e-9,
    );
  }
  // Độ vừa đổi khe
  const tl = computeTiling(300, 200, 'long', catalog.limits);
  const tc = computeTiling(300, 200, 'chat', catalog.limits);
  check('fit lỏng usable < chặt', tl.usableW < tc.usableW);
  let threw = false;
  try {
    computeTiling(2000, 100, 'chuan', catalog.limits);
  } catch {
    threw = true;
  }
  check('quá maxDrawer → throw', threw);
}

console.log('— Blocks codec —');
{
  const s = '0,0,1,2,p|0,2,1,1,p|1,0,1,3,p';
  const bs = decodeBlocks(s, 2, 3);
  check('decode đủ phủ 2×3', bs.reduce((a, b) => a + b.rs * b.cs, 0) === 6);
  check('round-trip', encodeBlocks(decodeBlocks(encodeBlocks(bs), 2, 3)) === encodeBlocks(bs));
  const bad = decodeBlocks('0,0,5,5,p|junk', 2, 2); // block tràn lưới + rác → phủ 1×1
  check('decode chống rác', bad.length === 4 && bad.every((b) => b.rs === 1 && b.cs === 1));
}

console.log('— Layout —');
{
  const layout = defaultLayout({ w: 400, d: 300, h: 120 }, 'chuan', catalog);
  check('1 tầng mặc định', layout.levels.length === 1);
  check('6 khay (3×2)', layout.levels[0].trays.length === 6);
  check('nấc cao mặc định = 65 (max ≤120)', layout.levels[0].h === 65);

  // merge chữ nhật + nở ôm block giao nhau
  let l2 = setTrayGrid(layout, 0, 0, 2, 2, catalog);
  l2 = mergeRect(l2, 0, 0, 0, 0, 0, 1); // merge hàng đầu
  let bs = decodeBlocks(l2.levels[0].trays[0].blocks, 2, 2);
  check('merge 1×2', bs.some((b) => b.rs === 1 && b.cs === 2));
  l2 = mergeRect(l2, 0, 0, 0, 1, 1, 1); // chạm block đã merge → nở ôm trọn
  bs = decodeBlocks(l2.levels[0].trays[0].blocks, 2, 2);
  check('merge nở thành 2×2', bs.length === 1 && bs[0].rs === 2 && bs[0].cs === 2);
  l2 = unmergeAt(l2, 0, 0, 0, 0);
  bs = decodeBlocks(l2.levels[0].trays[0].blocks, 2, 2);
  check('unmerge nổ về 1×1', bs.length === 4);

  // tầng: thêm/clamp
  let l3 = addLevel(layout, catalog); // 65 + 50 = 115 ≤ 120
  check('thêm tầng 2 (50)', l3.levels.length === 2 && l3.levels[1].h === 50);
  l3 = addLevel(l3, catalog); // còn 5mm — không nấc nào vừa → giữ nguyên
  check('hết chỗ không thêm tầng', l3.levels.length === 2);
  const l4 = setLevelHeight(l3, 0, 25, catalog);
  check('đổi nấc tầng 1 → 25', l4.levels[0].h === 25);

  // đổi drawer giữ grid khi tiling không đổi số khay
  const l5 = setDrawer(l3, { w: 401, d: 300, h: 120 }, catalog);
  check('drawer 400→401 giữ 6 khay + 2 tầng', l5.levels[0].trays.length === 6 && l5.levels.length === 2);

  // serialize round-trip
  const rt = parseLayout(serializeLayout(l3), catalog);
  check('serialize round-trip', rt !== null && serializeLayout(rt) === serializeLayout(l3));
  check('parse rác → null', parseLayout('{"x":1}', catalog) === null);
}

console.log('— buildAllTrays / stacking —');
{
  const stack = stackingDims(catalog.limits);
  check('plugInset 1.9', Math.abs(stack.plugInset - 1.9) < 1e-12);
  check('seatDepth 2.8', Math.abs(stack.seatDepth - 2.8) < 1e-12);
  check('dividerDrop 3.1', Math.abs(stack.dividerDrop - 3.1) < 1e-12);

  let layout = defaultLayout({ w: 300, d: 250, h: 110 }, 'chuan', catalog);
  layout = setLevelHeight(layout, 0, 35, catalog);
  layout = addLevel(layout, catalog); // 35 + 65 = 100 ≤ 110
  const { trays, tiling, warnings } = buildAllTrays(layout, catalog);
  check('không warning', warnings.length === 0, warnings.join('; '));
  check('số khay = số tile × 2 tầng', trays.length === tiling.tiles.length * 2, `${trays.length} vs ${tiling.tiles.length}×2`);
  const l1 = trays.filter((t) => t.levelIdx === 0);
  const l2t = trays.filter((t) => t.levelIdx === 1);
  check('tầng 1 không plug, có drop', l1.every((t) => !t.spec.plug && t.spec.dividerDrop === stack.dividerDrop));
  check('tầng 2 có plug, không drop', l2t.every((t) => !!t.spec.plug && t.spec.dividerDrop === 0));
  check('tầng 2 cao = 65 + seatDepth', l2t.every((t) => Math.abs(t.spec.h - (65 + stack.seatDepth)) < 1e-9));
  check('tầng 2 zBase = 35 − seatDepth', l2t.every((t) => Math.abs(t.zBase - (35 - stack.seatDepth)) < 1e-9));
  check('miệng tầng 2 = 100', l2t.every((t) => Math.abs(t.zBase + t.spec.h - 100) < 1e-9));
  check('2 tầng chung tiling', l1.every((t, i) => t.tile.w === l2t[i].tile.w && t.tile.d === l2t[i].tile.d));

  // min pocket: grid quá dày phải bị chặn từ setTrayGrid (normalize hạ về max)
  const dense = setTrayGrid(layout, 0, 0, 40, 40, catalog);
  const g = dense.levels[0].trays[0];
  const cw = cellSize(trays[0].tile.w, g.cols, catalog.limits.wallT);
  const cd = cellSize(trays[0].tile.d, g.rows, catalog.limits.wallT);
  check('normalize chặn grid dày (ô ≥35)', cw >= catalog.limits.minPocketMm - 1e-9 && cd >= catalog.limits.minPocketMm - 1e-9, `ô ${cw.toFixed(1)}×${cd.toFixed(1)}`);
}

console.log('— Pricing —');
{
  const layout = defaultLayout({ w: 150, d: 100, h: 40 }, 'chuan', catalog);
  const { trays } = buildAllTrays(layout, catalog);
  const price = computeKhayPrice(trays, catalog);
  // đối chiếu tính tay: grams = mm³/1000 × 1.24 × 1.05
  const vol = analyticTrayVolumeMm3(trays[0].spec);
  const grams = (vol / 1000) * PLA_DENSITY * catalog.pricing.calibrationFactor;
  check('grams khớp tính tay', Math.abs(price.lines[0].grams - grams) < 1e-9);
  check('trayGrams() nhất quán', Math.abs(trayGrams(vol, catalog) - grams) < 1e-9);
  const raw = grams * catalog.pricing.pricePerGram + catalog.pricing.baseFeePerTray;
  const expect = Math.max(catalog.pricing.minOrder, Math.round(raw / 1000) * 1000);
  check('tổng khớp công thức + sàn minOrder', price.total === expect, `${price.total} vs ${expect}`);
  check('gram dương hợp lý (10–200g)', grams > 10 && grams < 200, `${grams.toFixed(1)}g`);
}

console.log(failed === 0 ? '\nTẤT CẢ PASS' : `\n${failed} FAIL`);
if (failed > 0) process.exit(1);
