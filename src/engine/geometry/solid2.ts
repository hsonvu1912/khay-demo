// =============================================================================
// V2 — dựng "khay module rời" bằng CSG manifold-3d (implement solid2-types.ts).
// Tạo hình theo ảnh tham khảo Apple: chân đế thụt (hoặc chân cắm stack) nối
// thân bằng vát 45°, bo ngoài lớn, MIỆNG BO TRÒN xấp xỉ band 0.2mm (≈ layer
// in), đáy lòng vát mềm. Khay vượt bàn in → cắt mảnh, mộng puzzle ở ĐÁY
// (z ≤ floorTopZ); phía trên đường cắt là mặt phẳng trơn hở 0.05 mỗi bên.
// Đực = mảnh phía toạ độ NHỎ theo trục cắt; cái = phần bù của (đực + clear).
// =============================================================================

import { getManifold, type ManifoldTop } from './csg';
import { roundedRectPath } from './rounded-rect';
import type { TriMesh } from './types';
import type { CutLine, JigsawStyle, BuildTrayPieces } from './solid2-types';

type CS = InstanceType<ManifoldTop['CrossSection']>;
type Solid = InstanceType<ManifoldTop['Manifold']>;
type MeshOut = ReturnType<Solid['getMesh']>;

/** Extrude mỏng làm "lát" cho hull vát 45°. */
const EPS = 0.01;
/** Bước band xấp xỉ bo miệng ≈ 1 layer in. */
const RIM_STEP = 0.2;
/**
 * Chồng lấn z giữa các khối XẾP CHỒNG (band bo miệng, thân lòng). Đặt đúng mí
 * (a+(b−a) ≠ b trong float) từng để hở khe ~4e-15 → khối đứt làm 2 shell
 * (genus −1). Phần lấn luôn chui vào khối KẾ BÊN RỘNG HƠN nên bị che kín.
 */
const Z_LAP = 0.05;
/**
 * Epsilon simplify mesh XUẤT — chỉ để sập cạnh ~0-dài + đỉnh thẳng hàng do seam
 * CSG, phải NHỎ hơn khe mộng 0.15 nhiều bậc (kể cả collapse cascade ~10×) để
 * không bao giờ biến dạng vách ổ mộng.
 */
const SIM_EPS = 1e-4;

/** Mặc định mộng puzzle (đã chốt): bầu hình thang khoá đuôi én, bo mềm outline. */
export function jigsawDefaults(): JigsawStyle {
  return { neckMm: 10, headMm: 14, depthMm: 7, roundMm: 1.5, clearMm: 0.15 };
}

/** Mảnh trung gian + territory (vùng chủ quyền trong lưới — KHÔNG gồm tab mộng). */
interface Work {
  m: Solid;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Mesh manifold → TriMesh. getMesh() trả tam giác CCW nhìn từ NGOÀI vật liệu
 * (đã kiểm bằng probe: tetra volume DƯƠNG, khớp manifold.volume()) → GIỮ
 * NGUYÊN indices. positions lấy 3 thành phần đầu mỗi vertex (numProp có thể > 3).
 */
function toTriMesh(mesh: MeshOut): TriMesh {
  const np = mesh.numProp;
  const nV = mesh.vertProperties.length / np;
  const positions = new Array<number>(nV * 3);
  for (let i = 0; i < nV; i++) {
    positions[i * 3] = mesh.vertProperties[i * np];
    positions[i * 3 + 1] = mesh.vertProperties[i * np + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * np + 2];
  }
  return { positions, indices: Array.from(mesh.triVerts) };
}

export const buildTrayPieces: BuildTrayPieces = async (spec, cuts) => {
  const { name, w, d, h, style, plug } = spec;
  const { wallT, floorT, outerR, rimRound, floorFillet, baseInset, baseH, arcSegs } = style;

  // ---- Z-stations ----
  // plug: chân cắm cao plug.height + vát 45° cao chamferH; không plug: đế thụt.
  const zBody0 = plug ? plug.height + plug.chamferH : baseH + baseInset;
  const floorTopZ = zBody0 + floorT;
  const rimZ0 = h - rimRound;

  // ---- GUARDS ----
  if (plug && !(plug.height > 0)) {
    throw new Error(`Khay "${name}": plug.height phải > 0 (đang ${plug.height}).`);
  }
  if (wallT < 2 * rimRound + 0.4) {
    throw new Error(
      `Khay "${name}": wallT ${wallT} quá mỏng — cần ≥ 2·rimRound + 0.4 = ${(2 * rimRound + 0.4).toFixed(2)} để miệng bo 2 mép vẫn còn mặt phẳng ≥ 0.4mm.`,
    );
  }
  const pw = w - 2 * wallT;
  const pd = d - 2 * wallT;
  if (floorFillet > Math.min(pw, pd) / 2) {
    throw new Error(
      `Khay "${name}": floorFillet ${floorFillet} vượt nửa cạnh lòng (${(Math.min(pw, pd) / 2).toFixed(2)}) — lòng ${pw.toFixed(1)}×${pd.toFixed(1)}mm.`,
    );
  }
  const pocketR = outerR - wallT;
  if (pocketR < 1) {
    throw new Error(
      `Khay "${name}": pocketR = outerR − wallT = ${pocketR.toFixed(2)} < 1mm — tăng outerR hoặc giảm wallT.`,
    );
  }
  const hMin = zBody0 + floorT + floorFillet + rimRound + 3;
  if (h < hMin) {
    throw new Error(
      `Khay "${name}": h ${h} quá thấp — cần ≥ ${hMin.toFixed(1)}mm (chân ${zBody0} + đáy ${floorT} + vát lòng ${floorFillet} + bo miệng ${rimRound} + lòng tối thiểu 3).`,
    );
  }

  const wasm = await getManifold();
  const { CrossSection, Manifold } = wasm;

  // ---- SỔ THU DỌN WASM ----
  // manifold-3d là Emscripten: MỌI CrossSection/Manifold nằm trên heap C++ và
  // KHÔNG được GC JS dọn — thiếu .delete() thì mỗi build rò hàng chục object,
  // kéo slider liên tục là cạn heap/table WASM → mọi build SAU throw
  // "table index is out of bounds" vĩnh viễn (chỉ reload cứu được). track()
  // ghi sổ từng object trung gian, finally delete() TOÀN BỘ — an toàn vì kết
  // quả trả về (TrayPiece) chỉ chứa TriMesh/số JS thuần, không giữ handle WASM.
  // (wasm.Mesh là class JS thuần chứa typed array — không cần delete.)
  const tracked: { delete(): void }[] = [];
  const track = <O extends { delete(): void }>(o: O): O => {
    tracked.push(o);
    return o;
  };
  try {
  // ---- helpers 2D ----
  const rr = (cx: number, cy: number, ww: number, dd: number, r: number): CS =>
    track(
      new CrossSection([
        roundedRectPath({ cx, cy, w: ww, d: dd, r, segs: arcSegs }).map(
          (pt) => [pt[0], pt[1]] as [number, number],
        ),
      ]),
    );
  const off = (cs: CS, delta: number): CS => track(cs.offset(delta, 'Round', 2, arcSegs));
  const rect = (rx0: number, ry0: number, rx1: number, ry1: number): CS =>
    track(
      new CrossSection([
        [
          [rx0, ry0],
          [rx1, ry0],
          [rx1, ry1],
          [rx0, ry1],
        ] as [number, number][],
      ]),
    );

  const outerCS = rr(w / 2, d / 2, w, d, outerR);
  // Lòng đồng tâm tuyệt đối với viền ngoài (offset đều −wallT).
  const pocketCS = off(outerCS, -wallT);

  // Cung phần tư lồi bo miệng: t đo TỪ rimZ0 lên; t=0 → 0 (nối trơn thân),
  // t=rimRound → rimRound (đỉnh). inset(t) = R − √(R² − t²).
  const rimInset = (t: number): number =>
    rimRound - Math.sqrt(Math.max(rimRound * rimRound - t * t, 0));
  const nBands = Math.ceil(rimRound / RIM_STEP);

  // ---- BODY ----
  const footInset = plug ? plug.inset : baseInset;
  const footH = plug ? plug.height : baseH;
  const footCS = off(outerCS, -footInset);
  const bodyParts: Solid[] = [];
  // a. chân (plug hoặc đế thụt)
  bodyParts.push(track(footCS.extrude(footH)));
  // b. vát 45° chân → thân (hull 2 lát mỏng — hợp lệ vì rounded-rect LỒI)
  bodyParts.push(
    track(
      Manifold.hull([
        track(track(footCS.extrude(EPS)).translate([0, 0, footH - EPS])),
        track(track(outerCS.extrude(EPS)).translate([0, 0, zBody0])),
      ]),
    ),
  );
  // c. thân chính tới chân bo miệng
  bodyParts.push(track(track(outerCS.extrude(rimZ0 - zBody0)).translate([0, 0, zBody0])));
  // d. bo miệng NGOÀI — band bước 0.2, tiết diện thu theo inset(t đỉnh band);
  //    band lấn XUỐNG Z_LAP vào band dưới (rộng hơn → phần lấn bị che).
  for (let j = 0; j < nBands; j++) {
    const t0 = j * RIM_STEP;
    const t1 = Math.min((j + 1) * RIM_STEP, rimRound);
    bodyParts.push(
      track(
        track(off(outerCS, -rimInset(t1)).extrude(t1 - t0 + Z_LAP)).translate([
          0,
          0,
          rimZ0 + t0 - Z_LAP,
        ]),
      ),
    );
  }
  const body = bodyParts.reduce((acc, m) => track(acc.add(m)));

  // ---- CAVITY ----
  const cavParts: Solid[] = [];
  // e. vát mềm đáy lòng → vách (hull 2 lát mỏng)
  cavParts.push(
    track(
      Manifold.hull([
        track(track(off(pocketCS, -floorFillet).extrude(EPS)).translate([0, 0, floorTopZ])),
        track(track(pocketCS.extrude(EPS)).translate([0, 0, floorTopZ + floorFillet])),
      ]),
    ),
  );
  // f. thân lòng — lấn LÊN Z_LAP vào band bo trong đầu tiên (rộng hơn → che kín)
  cavParts.push(
    track(
      track(pocketCS.extrude(rimZ0 - (floorTopZ + floorFillet) + Z_LAP)).translate([
        0,
        0,
        floorTopZ + floorFillet,
      ]),
    ),
  );
  // g. bo miệng TRONG — band nở dần ra, lấn LÊN Z_LAP vào band trên (rộng hơn);
  //    band cuối vượt đỉnh 0.5 để cắt sạch
  for (let j = 0; j < nBands; j++) {
    const t0 = j * RIM_STEP;
    const t1 = Math.min((j + 1) * RIM_STEP, rimRound);
    const zTop = j === nBands - 1 ? h + 0.5 : rimZ0 + t1 + Z_LAP;
    cavParts.push(
      track(
        track(off(pocketCS, rimInset(t1)).extrude(zTop - (rimZ0 + t0))).translate([
          0,
          0,
          rimZ0 + t0,
        ]),
      ),
    );
  }
  const cavity = cavParts.reduce((acc, m) => track(acc.add(m)));

  const tray = track(body.subtract(cavity));

  // ---- CUTS: cắt mảnh + mộng puzzle ở đáy ----
  const jig = jigsawDefaults();

  /** Cắt 1 mảnh thành 2 (đực = phía toạ độ nhỏ, cái = phía lớn). */
  const splitPiece = (p: Work, cut: CutLine): Work[] => {
    const axis = cut.axis;
    const at = cut.at;
    // Hệ (u, v): u = trục cắt, v = trục vuông góc (dọc đường cắt).
    const u0 = axis === 'x' ? p.x0 : p.y0;
    const v0 = axis === 'x' ? p.y0 : p.x0;
    const v1 = axis === 'x' ? p.y1 : p.x1;
    const len = v1 - v0;
    const n = Math.max(1, Math.round(len / 60));

    // Polyline mộng J: nửa mặt phẳng u ≤ at + n bầu hình thang (neck ở đường
    // cắt, head rộng hơn → khoá đuôi én) nhô depth về phía u LỚN — tab thuộc
    // mảnh đực (from-side). Khung bao mở rộng 20mm quanh territory.
    const uMin = u0 - 20;
    const v0e = v0 - 20;
    const v1e = v1 + 20;
    const ptsUV: [number, number][] = [
      [uMin, v0e],
      [at, v0e],
    ];
    for (let k = 0; k < n; k++) {
      const vc = v0 + (k + 0.5) * (len / n);
      ptsUV.push(
        [at, vc - jig.neckMm / 2],
        [at + jig.depthMm, vc - jig.headMm / 2],
        [at + jig.depthMm, vc + jig.headMm / 2],
        [at, vc + jig.neckMm / 2],
      );
    }
    ptsUV.push([at, v1e], [uMin, v1e]);

    // (u,v) → (x,y). Trục y: hoán vị toạ độ là phép đối xứng → đảo mảng giữ CCW.
    const ptsXY =
      axis === 'x' ? ptsUV : ptsUV.map(([u, v]) => [v, u] as [number, number]).reverse();

    // Làm tròn outline (opening −r/+r bo các góc lồi của tab).
    const maleLow = off(off(track(new CrossSection([ptsXY])), -jig.roundMm), jig.roundMm);
    // Trên floorTopZ: cắt phẳng, hở 0.05 mỗi bên quanh đường cắt.
    const maleHigh =
      axis === 'x' ? rect(uMin, v0e, at - 0.05, v1e) : rect(v0e, uMin, v1e, at - 0.05);

    const maleSolid = track(
      track(maleLow.extrude(floorTopZ)).add(
        track(track(maleHigh.extrude(h + 1 - floorTopZ)).translate([0, 0, floorTopZ])),
      ),
    );
    // Mảnh CÁI = SUBTRACT "phần thuộc đực + khe" — KHÔNG intersect khối cái:
    // intersect từng giữ lại màng 0-dày bịt miệng hốc mộng (femaleHigh extrude
    // từ đúng floorTopZ chạm-khít mặt sàn ngay trên hốc → mảng tam giác thể
    // tích 0 trong STL). Subtract với mặt trùng phẳng cho kết quả sạch.
    // Dưới sàn: đực nở +clear (z 0..floorTopZ); trên sàn: nửa mặt phẳng tới
    // at+0.05 (giữ hở 0.05 mỗi bên như cũ), phủ trọn 0..h+1.
    const maleClaimHigh =
      axis === 'x' ? rect(uMin, v0e, at + 0.05, v1e) : rect(v0e, uMin, v1e, at + 0.05);
    const femaleClaim = track(
      track(off(maleLow, jig.clearMm).extrude(floorTopZ)).add(track(maleClaimHigh.extrude(h + 1))),
    );

    const mA = track(p.m.intersect(maleSolid));
    const mB = track(p.m.subtract(femaleClaim));
    if (axis === 'x') {
      return [
        { m: mA, x0: p.x0, x1: at, y0: p.y0, y1: p.y1 },
        { m: mB, x0: at, x1: p.x1, y0: p.y0, y1: p.y1 },
      ];
    }
    return [
      { m: mA, x0: p.x0, x1: p.x1, y0: p.y0, y1: at },
      { m: mB, x0: p.x0, x1: p.x1, y0: at, y1: p.y1 },
    ];
  };

  // Áp TUẦN TỰ: mọi cắt trục x trước, rồi trục y trên từng mảnh.
  const ordered = [...cuts].sort((a, b) =>
    a.axis === b.axis ? a.at - b.at : a.axis === 'x' ? -1 : 1,
  );
  let pieces: Work[] = [{ m: tray, x0: 0, x1: w, y0: 0, y1: d }];
  for (const cut of ordered) {
    const next: Work[] = [];
    for (const p of pieces) {
      const lo = cut.axis === 'x' ? p.x0 : p.y0;
      const hi = cut.axis === 'x' ? p.x1 : p.y1;
      if (cut.at <= lo + 0.01 || cut.at >= hi - 0.01) {
        next.push(p); // đường cắt không đi qua territory mảnh này
      } else {
        next.push(...splitPiece(p, cut));
      }
    }
    pieces = next;
  }

  // ---- Kiểm + xuất TrayPiece (tên theo thứ tự territory tăng dần) ----
  pieces.sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0);
  const multi = pieces.length > 1;
  return pieces.map((p, i) => {
    const label = multi ? `${name}-M${i + 1}` : name;
    // LÀM SẠCH mesh xuất — 2 bước, KHÔNG tolerance lớn:
    // 1. Quantize float32 trước: round-trip qua Mesh numProp=3 KHÔNG đặt
    //    tolerance (getMesh trả float32; 2 đỉnh double khác nhau có thể tròn về
    //    CÙNG toạ độ float32 → phải weld trong đúng không gian sẽ xuất ra).
    // 2. simplify(SIM_EPS = 0.1µm) sập cạnh ~0-dài + đỉnh thẳng hàng ở seam CSG
    //    (mảnh cái subtract hay sinh tam giác suy biến / đỉnh trùng toạ độ).
    // ⚠️ TUYỆT ĐỐI không quay lại pipeline cũ (simplify 0.01 + Mesh
    // tolerance 0.005 + simplify 0.005): nó kéo vách ổ mộng CÁI lệch tới ~7mm
    // (collapse cascade trên tam giác dẹt dọc ổ) → 2 mảnh chồng lấn hoặc khe
    // 0.15 bị gặm còn 0.05 — không lắp được. MỌI số liệu (status/genus/volume/
    // bbox) đo trên m2 = ĐÚNG khối sẽ xuất (WYSIWYG — volumeMm3 khớp tetra
    // trên TriMesh xuất ra).
    const raw = p.m.getMesh();
    const nvRaw = raw.vertProperties.length / raw.numProp;
    const pos = new Float32Array(nvRaw * 3);
    for (let v = 0; v < nvRaw; v++) {
      pos[v * 3] = raw.vertProperties[v * raw.numProp];
      pos[v * 3 + 1] = raw.vertProperties[v * raw.numProp + 1];
      pos[v * 3 + 2] = raw.vertProperties[v * raw.numProp + 2];
    }
    const mesh32 = new wasm.Mesh({ numProp: 3, vertProperties: pos, triVerts: raw.triVerts });
    mesh32.merge(); // weld đỉnh trùng sau quantize (no-op nếu đã kín)
    const m2 = track(track(new Manifold(mesh32)).simplify(SIM_EPS));
    const st = m2.status();
    if (st !== 'NoError') {
      throw new Error(`Khay "${label}": manifold lỗi (${st}).`);
    }
    const g = m2.genus();
    if (g !== 0) {
      throw new Error(`Khay "${label}": genus ${g} ≠ 0 — khối có lỗ xuyên/quai bất thường.`);
    }
    const vol = m2.volume();
    if (!(vol > 0)) {
      throw new Error(`Khay "${label}": thể tích ${vol} ≤ 0 — đường cắt làm mảnh rỗng?`);
    }
    const bb = m2.boundingBox();
    return {
      name: label,
      mesh: toTriMesh(m2.getMesh()),
      volumeMm3: vol,
      bbox: [
        bb.max[0] - bb.min[0],
        bb.max[1] - bb.min[1],
        bb.max[2] - bb.min[2],
      ] as [number, number, number],
    };
  });
  } finally {
    // Free TẤT CẢ object WASM trung gian — kể cả khi throw giữa chừng.
    for (const o of tracked) {
      try {
        o.delete();
      } catch {
        /* object đã bị delete (không xảy ra với track 1-lần) — bỏ qua */
      }
    }
  }
};
