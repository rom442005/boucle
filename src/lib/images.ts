import type { LngLat } from './types';

/*
 * Photos prises sur l'appareil, prêtes à partager : redimensionnées, réencodées en JPEG (ce qui efface toutes
 * les métadonnées, position comprise), avec leur position GPS lue avant, pour les placer sur le parcours.
 */

export interface Prepared {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  /** position de prise de vue (si la photo la porte) */
  at: LngLat | null;
}

/** Position GPS d'une photo JPEG (métadonnées EXIF), ou null. */
export async function exifPosition(file: Blob): Promise<LngLat | null> {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    return parseGps(new DataView(buf));
  } catch {
    return null;
  }
}

function parseGps(v: DataView): LngLat | null {
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let off = 2;
  while (off + 4 < v.byteLength) {
    const marker = v.getUint16(off);
    const size = v.getUint16(off + 2);
    if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return readTiff(v, off + 10);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
    off += 2 + size;
  }
  return null;
}

function readTiff(v: DataView, t: number): LngLat | null {
  if (t + 8 > v.byteLength) return null;
  const le = v.getUint16(t) === 0x4949;
  const u16 = (o: number) => v.getUint16(t + o, le);
  const u32 = (o: number) => v.getUint32(t + o, le);
  const ifd0 = u32(4);
  let gpsAt = 0;
  for (let i = 0, n = u16(ifd0); i < n; i++) {
    const e = ifd0 + 2 + i * 12;
    if (u16(e) === 0x8825) gpsAt = u32(e + 8);
  }
  if (!gpsAt || t + gpsAt + 2 > v.byteLength) return null;
  const tags: Record<number, number> = {};
  for (let i = 0, n = u16(gpsAt); i < n; i++) {
    const e = gpsAt + 2 + i * 12;
    tags[u16(e)] = e;
  }
  const ref = (tag: number) => (tags[tag] != null ? String.fromCharCode(v.getUint8(t + tags[tag] + 8)) : '');
  const dms = (tag: number) => {
    if (tags[tag] == null) return NaN;
    const at = u32(tags[tag] + 8);
    const r = (k: number) => u32(at + k * 8) / (u32(at + k * 8 + 4) || 1);
    return r(0) + r(1) / 60 + r(2) / 3600;
  };
  let lat = dms(2);
  let lng = dms(4);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  if (ref(1) === 'S') lat = -lat;
  if (ref(3) === 'W') lng = -lng;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lng, lat] : null;
}

type Drawable = ImageBitmap | HTMLImageElement;

async function decode(file: Blob): Promise<Drawable> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Certains formats (HEIC sur Safari) passent par une image classique.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

const dims = (d: Drawable) => (d instanceof HTMLImageElement ? [d.naturalWidth, d.naturalHeight] : [d.width, d.height]);

function encode(d: Drawable, max: number, quality: number, square: boolean): Promise<{ blob: Blob; width: number; height: number }> {
  const [w0, h0] = dims(d);
  let sx = 0;
  let sy = 0;
  let sw = w0;
  let sh = h0;
  if (square) {
    const s = Math.min(w0, h0);
    sx = (w0 - s) / 2;
    sy = (h0 - s) / 2;
    sw = sh = s;
  }
  const k = Math.min(1, max / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * k));
  const height = Math.max(1, Math.round(sh * k));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(d, sx, sy, sw, sh, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve({ blob: b, width, height }) : reject(new Error('encodage impossible'))), 'image/jpeg', quality),
  );
}

/** Photo de sortie : grande (1600 px) et vignette carrée (360 px). */
export async function preparePhoto(file: Blob, big = 1600): Promise<Prepared> {
  const [at, img] = await Promise.all([exifPosition(file), decode(file)]);
  const full = await encode(img, big, 0.82, false);
  const thumb = await encode(img, 360, 0.75, true);
  if ('close' in img) img.close();
  return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height, at };
}

/** Photo de profil : carrée, 512 px. */
export async function prepareAvatar(file: Blob, size = 512): Promise<Blob> {
  const img = await decode(file);
  const out = await encode(img, size, 0.85, true);
  if ('close' in img) img.close();
  return out.blob;
}

export async function blobToDataUrl(b: Blob): Promise<string> {
  if (typeof FileReader === 'undefined') {
    const bytes = new Uint8Array(await b.arrayBuffer());
    let bin = '';
    for (const x of bytes) bin += String.fromCharCode(x);
    return `data:${b.type || 'application/octet-stream'};base64,${btoa(bin)}`;
  }
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}
