# khay-demo — Configurator khay chia ngăn kéo in 3D (V2 "khay module rời")

LIVE nghiệm thu: **https://hsonvu1912.github.io/khay-demo/** (repo này, nhánh
gh-pages; deploy lại: `GHPAGES_BASE=/khay-demo/ pnpm build` → push dist).

Khách đo lòng ngăn kéo → nhập mm → MỘT lưới Excel-trên-3D trải toàn lòng ngăn;
**mỗi ô (sau gộp) = MỘT KHAY RỜI** màu riêng (Bambu PLA Matte), khe 0.5mm.
Khay vượt bàn in 180 → tự **cắt thành mảnh ghép mộng puzzle ở đáy** (khe
0.15mm, ấn thẳng, lòng liền mạch). Tải ZIP **STL binary/mảnh** + manifest.
Giá theo **gram nhựa** (đ/g + phí/mảnh, chỉnh trong ⚙). Tạo hình V2 theo ảnh
tham khảo Apple: vách 4mm chunky, bo ngoài R11, **miệng bo tròn 1.4**, đáy
lòng vát mềm, chân đế thụt 2mm; stack ngăn sâu bằng chân cắm + vát 45°
(tự sinh khi khay tầng trên trùng đáy khay dưới).

⚠️ V2 chuyển lõi dựng khối sang **CSG manifold-3d (WASM, npm)** — engine
không còn "zero-dep" như v1; mirror giai đoạn B cần thêm dep này vào cả 2 repo.
Mọi object manifold trung gian PHẢI .delete() (đã làm trong finally — leak
WASM làm CSG chết im lặng sau ~600 build).

Chạy: `pnpm install && pnpm dev` → http://localhost:5190 · Test: `pnpm test`
(test-geometry + test-model) · Typecheck: `pnpm typecheck`

## Kiến trúc

```
src/engine/            ← THUẦN TS, không React/three — copy nguyên sang
│                        furniture-brand/products/khay ở giai đoạn B
├── geometry/          2.5D polygon-with-holes extrusion, watertight by construction
│   ├── types.ts       HỢP ĐỒNG: Vec2/3, TriMesh, TraySpec, quy ước winding/z-up
│   ├── rounded-rect.ts roundedRectPath CCW 4·(segs+1) điểm, insetRoundedRect (zip vát 45°)
│   ├── earcut.ts      vendored mapbox/earcut (không npm — mirror byte-identical được)
│   ├── tray-solid.ts  buildTraySolid: band plug→vát→đáy→vách→hạ-vách; VERTEX POOL
│   ├── volume.ts      meshVolumeMm3 (tetra có dấu) + analyticTrayVolumeMm3 (closed-form)
│   ├── validate.ts    validateManifold: cạnh đôi ngược hướng, Euler χ=2, 1 khối, V>0
│   ├── stl.ts         STL binary (header không bắt đầu "solid") + parse round-trip
│   └── zip.ts         ZIP store-only CRC-32
├── catalog.ts         KhayCatalog (setting admin) + DEFAULT + stackingDims SUY RA
├── palette.ts         25 màu PLA Matte theo BẢNG HEX CHÍNH THỨC Bambu Lab
├── tiling.ts          chia lòng ngăn kéo thành lưới khay ≤176mm (tiling là MASTER)
├── layout.ts          KhayLayout state + pure ops (merge chữ nhật, tầng, normalize)
├── pricing.ts         gram = mm³/1000 × 1.24 × calibration; giá = gram×đ/g + phí/khay
└── export.ts          buildOrderZip: validate → STL/khay + manifest.txt (gom lô màu)

src/sheet/             UI React (port pattern từ ngan-excel-demo/src/sheet)
├── useKhaySheet.ts    hook state trung tâm (hợp đồng KhaySheet), undo 50 snapshot
├── Scene3D/TrayMeshes 3D = ĐÚNG TriMesh của STL (WYSIWYG), matte roughness 0.65
├── CellHitLayer       click/kéo marquee chọn ô trên 3D, long-press mobile
├── ContextMenu        gộp ô / tách ô / màu nhanh
├── BottomDock+DockPanel  4 tab: Ngăn kéo · Tầng · Lưới · Màu
├── LevelTabs          chuyển tầng active (tầng khác mờ 0.25)
├── MeasureGuide       hướng dẫn đo (đo 3 điểm lấy min, cao tới vật cản thấp nhất)
├── SettingsPanel      GIẢ LẬP ADMIN: bảng màu/giá/giới hạn → localStorage 'khay:catalog'
└── debugApi.ts        window.__khay cho test tự động
```

## Quyết định hình học then chốt

- **Không CSG**: khay là 2.5D — chồng band (z0→z1) tiết diện rounded-rect + lỗ;
  earcut nắp; dải quad thành. Kín nước nhờ **vertex pool** (mỗi (path,z) sinh
  đỉnh 1 lần, mọi mặt tham chiếu chung index).
- **Stack**: hằng số SUY RA từ limits (catalog.ts:stackingDims): plugInset =
  wallT+lipClear = 1.9; vát 45° cao 1.9 (in không support); seatDepth = 2.8;
  dividerDrop = 3.1. Mọi tầng CHUNG tiling; khay tầng ≥2 cao thêm seatDepth.
- **ε-inset 0.05mm** cho pocket chạm biên lòng khi hạ vách → nắp đỉnh vách là
  polygon-with-holes hợp lệ (lỗ không chạm viền).
- **Guard admin-error**: outerR ≤ pocketR + (2+√2)·wallT (điều kiện vật liệu
  trên chéo góc); plug.height > 0; ringR = min(bo các ô) — throw lỗi tiếng Việt
  rõ ràng thay vì mesh hỏng.
- **2 đường tính thể tích độc lập** (mesh tetra vs closed-form) phải khớp <0.1%
  — chạy trong test + lúc xuất đơn.

## Nghiệm thu

- `pnpm test` xanh (6 case cố định + 20 spec random + tiling/layout/pricing).
- `samples/` chứa 6 STL mẫu — mở bằng Bambu Studio phải slice sạch không cảnh
  báo manifold.
- Workflow build có 3 vòng reviewer đối kháng (topology / volume / STL format)
  + 2 critic UI (design / UX) — xem transcript session 03/07/2026.

## Giai đoạn B (merge production — sau khi duyệt demo)

- Copy `src/engine/**` → `furniture-brand/products/khay/**`; UI → `src/khay/`.
- Sửa 4 file chung: registry.ts (+khay), share-config.ts:35 (whitelist p),
  design/page.tsx + DesignClient.tsx (nhánh khay).
- KhayCatalog → KV key mới `catalog:khay`; SettingsPanel → /admin/khay 4 tab;
  đơn hàng qua POST /api/order sẵn có; admin tải STL rebuild deterministic từ
  valuesJson (`values.__engine = 'khay-1'`).
