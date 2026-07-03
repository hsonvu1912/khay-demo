// =============================================================================
// zip.ts — ZIP writer tối giản (STORE, không nén), tự chứa (zero deps).
// Tên file encode UTF-8 + bật flag bit 11 (Language encoding) để giữ tiếng Việt.
// =============================================================================

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c >>> 0;
}

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// MS-DOS time/date (độ phân giải 2 giây) cho header ZIP.
function dosTime(d: Date): number {
  return ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
}
function dosDate(d: Date): number {
  return (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);
}

/** Bit 11 = tên file/comment là UTF-8. */
const FLAG_UTF8 = 0x0800;

/** Tạo ZIP STORE (không nén) từ danh sách file → bytes ZIP hoàn chỉnh. */
export function createZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const now = new Date();
  const time = dosTime(now);
  const date = dosDate(now);

  interface Entry { name: Uint8Array; crc: number; size: number; offset: number }
  const entries: Entry[] = [];
  const parts: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const name = encoder.encode(f.name);
    const data = f.data;
    const crc = crc32(data);
    const size = data.length;

    // Local file header (30 byte + tên).
    const lfh = new Uint8Array(30 + name.length);
    const v = new DataView(lfh.buffer);
    v.setUint32(0, 0x04034b50, true);  // signature
    v.setUint16(4, 20, true);          // version needed
    v.setUint16(6, FLAG_UTF8, true);   // general purpose flags
    v.setUint16(8, 0, true);           // method 0 = STORE
    v.setUint16(10, time, true);
    v.setUint16(12, date, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, size, true);       // compressed = uncompressed (STORE)
    v.setUint32(22, size, true);
    v.setUint16(26, name.length, true);
    v.setUint16(28, 0, true);          // extra field length
    lfh.set(name, 30);

    parts.push(lfh, data);
    entries.push({ name, crc, size, offset });
    offset += lfh.length + size;
  }

  // Central directory.
  const cdStart = offset;
  for (const e of entries) {
    const cdh = new Uint8Array(46 + e.name.length);
    const v = new DataView(cdh.buffer);
    v.setUint32(0, 0x02014b50, true);  // signature
    v.setUint16(4, 20, true);          // version made by
    v.setUint16(6, 20, true);          // version needed
    v.setUint16(8, FLAG_UTF8, true);   // general purpose flags (khớp LFH)
    v.setUint16(10, 0, true);          // method STORE
    v.setUint16(12, time, true);
    v.setUint16(14, date, true);
    v.setUint32(16, e.crc, true);
    v.setUint32(20, e.size, true);
    v.setUint32(24, e.size, true);
    v.setUint16(28, e.name.length, true);
    v.setUint16(30, 0, true);          // extra length
    v.setUint16(32, 0, true);          // comment length
    v.setUint16(34, 0, true);          // disk number start
    v.setUint16(36, 0, true);          // internal attrs
    v.setUint32(38, 0, true);          // external attrs
    v.setUint32(42, e.offset, true);   // offset của LFH
    cdh.set(e.name, 46);
    parts.push(cdh);
    offset += cdh.length;
  }
  const cdSize = offset - cdStart;

  // End of central directory.
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);
  ev.setUint16(20, 0, true);
  parts.push(eocd);

  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  return out;
}
