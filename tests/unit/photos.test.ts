import { describe, expect, it } from 'vitest';
import { exifPosition } from '../../src/lib/images';
import { createLocalBackend, DEMO_CODE } from '../../src/lib/community/local';

/** Un JPEG minimal dont l'EXIF porte une position GPS (TIFF petit-boutiste). */
function jpegWithGps(lat: number, lng: number): Blob {
  const rat = (v: number) => {
    const d = Math.floor(v);
    const m = Math.floor((v - d) * 60);
    const s = Math.round(((v - d) * 60 - m) * 60 * 1000);
    return [d, 1, m, 1, s, 1000];
  };
  const tiff = new DataView(new ArrayBuffer(200));
  let o = 0;
  const u16 = (v: number) => (tiff.setUint16(o, v, true), (o += 2));
  const u32 = (v: number) => (tiff.setUint32(o, v, true), (o += 4));
  u16(0x4949); u16(42); u32(8);
  // IFD0 : une entrée, le pointeur vers l'IFD GPS (à 26).
  u16(1); u16(0x8825); u16(4); u32(1); u32(26); u32(0);
  // IFD GPS (26) : 4 entrées, valeurs à partir de 80.
  const entries: [number, number, number, number][] = [
    [1, 2, 2, lat >= 0 ? 0x4e : 0x53],
    [2, 5, 3, 80],
    [3, 2, 2, lng >= 0 ? 0x45 : 0x57],
    [4, 5, 3, 104],
  ];
  u16(entries.length);
  for (const [tag, type, count, val] of entries) {
    u16(tag); u16(type); u32(count);
    if (type === 2) { tiff.setUint8(o, val); o += 4; } else u32(val);
  }
  u32(0);
  o = 80;
  for (const v of [...rat(Math.abs(lat)), ...rat(Math.abs(lng))]) u32(v);
  const exif = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0, ...new Uint8Array(tiff.buffer)]);
  const app1 = new Uint8Array([0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 0xff, ...exif]);
  return new Blob([new Uint8Array([0xff, 0xd8]), app1, new Uint8Array([0xff, 0xd9])], { type: 'image/jpeg' });
}

describe('position des photos', () => {
  it('lit la position GPS de l’EXIF', async () => {
    const at = await exifPosition(jpegWithGps(47.2184, -1.5536));
    expect(at).not.toBeNull();
    expect(at![0]).toBeCloseTo(-1.5536, 3);
    expect(at![1]).toBeCloseTo(47.2184, 3);
  });
  it('sans EXIF, pas de position', async () => {
    expect(await exifPosition(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])]))).toBeNull();
    expect(await exifPosition(new Blob(['pas une image']))).toBeNull();
  });
});

describe('photos dans la démonstration', () => {
  it('photo de profil, photos de sortie, couverture et retrait', async () => {
    const b = await createLocalBackend();
    await b.sendCode('moi@exemple.fr');
    await b.verifyCode('moi@exemple.fr', DEMO_CODE);
    const avatar = await b.uploadAvatar(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
    expect(avatar.startsWith('data:image/jpeg;base64,')).toBe(true);
    const me = await b.saveProfile({ firstName: 'Romain', city: null, sports: ['run'], level: 'regular', practiceYears: null, bio: 'Coureur du dimanche', avatar }, { birthYear: 2004 });
    expect(me.avatar).toBe(avatar);

    const img = new Blob([new Uint8Array([9, 9])], { type: 'image/jpeg' });
    const ph = await b.addPhoto('demo-route-0', { full: img, thumb: img, width: 2, height: 1, at: [-1.55, 47.2], caption: null });
    expect(ph.authorName).toBe('Romain');
    expect(ph.authorAvatar).toBe(avatar);
    const r = await b.route('demo-route-0');
    expect(r!.photos).toBe(1);
    expect(r!.cover).toBe(ph.thumb);
    expect((await b.photos('demo-route-0')).map((p) => p.id)).toEqual([ph.id]);
    expect((await b.photosBy(me.id)).length).toBe(1);

    await b.deletePhoto(ph.id);
    expect((await b.route('demo-route-0'))!.photos).toBe(0);
    expect((await b.route('demo-route-0'))!.cover).toBeNull();
  });
});
