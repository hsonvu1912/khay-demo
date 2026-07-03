// =============================================================================
// Bảng màu Bambu Lab PLA Matte — 25 màu theo BẢNG HEX CHÍNH THỨC của Bambu Lab
// (Filament Hex Code Table, store.bblcdn.eu — đối chiếu 03/07/2026). Admin chỉ
// bật/tắt qua catalog.colors (tồn kho). Mỗi khay in đúng 1 màu.
// previewHex: CHỈ dùng cho render 3D khi hex gốc quá cực đoan (đen tuyền
// #000000 không có diffuse shading → khối bẹt); swatch UI luôn dùng hex gốc.
// =============================================================================

export interface FilamentColor {
  id: string;
  /** Tên chính thức (EN) trên spool Bambu. */
  name: string;
  /** Tên hiển thị tiếng Việt cho khách. */
  nameVi: string;
  hex: string;
  previewHex?: string;
}

export const PLA_MATTE_PALETTE: FilamentColor[] = [
  { id: 'matte-ivory-white', name: 'Ivory White', nameVi: 'Trắng ngà', hex: '#FFFFFF', previewHex: '#F4F1EA' },
  { id: 'matte-bone-white', name: 'Bone White', nameVi: 'Trắng xương', hex: '#CBC6B8' },
  { id: 'matte-desert-tan', name: 'Desert Tan', nameVi: 'Be sa mạc', hex: '#E8DBB7' },
  { id: 'matte-latte-brown', name: 'Latte Brown', nameVi: 'Nâu latte', hex: '#D3B7A7' },
  { id: 'matte-caramel', name: 'Caramel', nameVi: 'Caramel', hex: '#AE835B' },
  { id: 'matte-terracotta', name: 'Terracotta', nameVi: 'Đất nung', hex: '#B15533' },
  { id: 'matte-dark-brown', name: 'Dark Brown', nameVi: 'Nâu đậm', hex: '#7D6556' },
  { id: 'matte-dark-chocolate', name: 'Dark Chocolate', nameVi: 'Socola đen', hex: '#4D3324' },
  { id: 'matte-lilac-purple', name: 'Lilac Purple', nameVi: 'Tím lilac', hex: '#AE96D4' },
  { id: 'matte-sakura-pink', name: 'Sakura Pink', nameVi: 'Hồng sakura', hex: '#E8AFCF' },
  { id: 'matte-mandarin-orange', name: 'Mandarin Orange', nameVi: 'Cam quýt', hex: '#F99963' },
  { id: 'matte-lemon-yellow', name: 'Lemon Yellow', nameVi: 'Vàng chanh', hex: '#F7D959' },
  { id: 'matte-plum', name: 'Plum', nameVi: 'Mận chín', hex: '#950051' },
  { id: 'matte-scarlet-red', name: 'Scarlet Red', nameVi: 'Đỏ tươi', hex: '#DE4343' },
  { id: 'matte-dark-red', name: 'Dark Red', nameVi: 'Đỏ trầm', hex: '#BB3D43' },
  { id: 'matte-dark-green', name: 'Dark Green', nameVi: 'Xanh rêu', hex: '#68724D' },
  { id: 'matte-grass-green', name: 'Grass Green', nameVi: 'Xanh cỏ', hex: '#61C680' },
  { id: 'matte-apple-green', name: 'Apple Green', nameVi: 'Xanh táo', hex: '#C2E189' },
  { id: 'matte-ice-blue', name: 'Ice Blue', nameVi: 'Xanh băng', hex: '#A3D8E1' },
  { id: 'matte-sky-blue', name: 'Sky Blue', nameVi: 'Xanh da trời', hex: '#56B7E6' },
  { id: 'matte-marine-blue', name: 'Marine Blue', nameVi: 'Xanh biển', hex: '#0078BF' },
  { id: 'matte-dark-blue', name: 'Dark Blue', nameVi: 'Xanh đêm', hex: '#042F56' },
  { id: 'matte-ash-gray', name: 'Ash Gray', nameVi: 'Xám tro', hex: '#9B9EA0' },
  { id: 'matte-nardo-gray', name: 'Nardo Gray', nameVi: 'Xám nardo', hex: '#757575' },
  { id: 'matte-charcoal', name: 'Charcoal', nameVi: 'Than chì', hex: '#000000', previewHex: '#3B3A37' },
];

/** Màu mặc định khi tạo khay mới. */
export const DEFAULT_COLOR_ID = 'matte-ivory-white';

export function findColor(id: string): FilamentColor {
  return PLA_MATTE_PALETTE.find((c) => c.id === id) ?? PLA_MATTE_PALETTE[0];
}

/** Màu cho vật liệu 3D preview (clamp các hex cực đoan). Swatch dùng hex gốc. */
export function previewHexOf(c: FilamentColor): string {
  return c.previewHex ?? c.hex;
}
