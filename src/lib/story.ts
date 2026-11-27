import type { LngLat, Route } from './types';
import { SHAPES, SPORTS } from './sports';
import { SCENES, scenePortraitUrl } from './scenes';
import { duration, kmValue } from './format';

/*
 * Image à partager en story (1080 × 1920) : la photo de paysage de l'app, le tracé en grand qui brille, puis un
 * bloc de verre avec le nom du parcours et ses trois chiffres (distance, dénivelé, durée). Dessinée sur l'appareil,
 * sans carte ni service extérieur : rien ne part ailleurs qu'à qui on la partage. Le départ réel n'apparaît pas :
 * seule la forme du tracé est dessinée, sans fond de carte ni nom de rue.
 */

const W = 1080;
const H = 1920;
const TINT = '#ff375f';
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
/** Le logo de l'app (une boucle), dans un carré de 24 unités. */
const LOGO = 'M6 17c-2.2 0-3.5-1.6-3.5-3.6S4 9.6 6.4 9.6c3.6 0 4.6 6.8 9.2 6.8 2.4 0 3.9-1.7 3.9-3.8S18 8.8 15.6 8.8c-1.9 0-3 1-4 2.3';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => ok(img);
    img.onerror = () => ko(new Error('photo'));
    img.src = src;
  });
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * k;
  const ih = img.naturalHeight * k;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Le tracé ramené dans une boîte, proportions gardées (longitudes resserrées selon la latitude). */
function project(coords: LngLat[], box: { x: number; y: number; w: number; h: number }): [number, number][] {
  const lat0 = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const pts = coords.map(([lng, lat]) => [lng * kx, -lat] as [number, number]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min(box.w / Math.max(x1 - x0, 1e-9), box.h / Math.max(y1 - y0, 1e-9));
  const ox = box.x + (box.w - (x1 - x0) * k) / 2;
  const oy = box.y + (box.h - (y1 - y0) * k) / 2;
  return pts.map(([x, y]) => [ox + (x - x0) * k, oy + (y - y0) * k]);
}

/** Un nom trop long pour une ligne : deux lignes au plus, la seconde coupée par « … ». */
function lines(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= max || !cur) cur = next;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  if (out.length <= 2) return out;
  let second = out.slice(1).join(' ');
  while (second.length > 1 && ctx.measureText(`${second}…`).width > max) second = second.slice(0, -1);
  return [out[0], `${second.trimEnd()}…`];
}

/** L'image story d'un parcours, en JPEG. `scene` : la photo de fond (celle du moment dans l'app). */
export async function storyImage(r: Route, scene: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = SCENES[scene]?.tone ?? '#28312c';
  ctx.fillRect(0, 0, W, H);
  let photo: HTMLImageElement | null = null;
  try {
    photo = await loadImage(scenePortraitUrl(scene));
    cover(ctx, photo, 0, 0, W, H);
  } catch {
    /* sans photo : la teinte de la scène */
  }
  // Voile : plus sombre en haut (logo) et en bas (chiffres), la photo respire au milieu.
  const veil = ctx.createLinearGradient(0, 0, 0, H);
  veil.addColorStop(0, 'rgba(0,0,0,0.5)');
  veil.addColorStop(0.22, 'rgba(0,0,0,0.18)');
  veil.addColorStop(0.55, 'rgba(0,0,0,0.22)');
  veil.addColorStop(1, 'rgba(0,0,0,0.62)');
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, W, H);

  // Logo et nom de l'app.
  ctx.save();
  ctx.translate(72, 108);
  roundRect(ctx, 0, 0, 84, 84, 26);
  ctx.fillStyle = TINT;
  ctx.fill();
  ctx.translate(12, 12);
  ctx.scale(2.5, 2.5);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.stroke(new Path2D(LOGO));
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.font = `800 58px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('Boucle', 178, 152);

  // Le tracé, en grand : un halo rose, puis le trait blanc ; le départ en rond blanc cerclé de rose.
  const pts = project(r.coords, { x: 110, y: 300, w: W - 220, h: 860 });
  const path = new Path2D();
  pts.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.save();
  ctx.shadowColor = 'rgba(255,55,95,0.95)';
  ctx.shadowBlur = 48;
  ctx.strokeStyle = TINT;
  ctx.lineWidth = 22;
  ctx.stroke(path);
  ctx.restore();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 8;
  ctx.stroke(path);
  const [sx, sy] = pts[0];
  ctx.beginPath();
  ctx.arc(sx, sy, 20, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = 9;
  ctx.strokeStyle = TINT;
  ctx.stroke();

  // Bloc de verre : la photo floutée dessous, un voile, un liseré clair.
  const card = { x: 56, y: 1268, w: W - 112, h: 520, r: 60 };
  ctx.save();
  roundRect(ctx, card.x, card.y, card.w, card.h, card.r);
  ctx.clip();
  if (photo && 'filter' in ctx) {
    ctx.filter = 'blur(36px) saturate(1.5)';
    cover(ctx, photo, -60, -60, W + 120, H + 120);
    ctx.filter = 'none';
  }
  ctx.fillStyle = 'rgba(12,14,16,0.46)';
  ctx.fillRect(card.x, card.y, card.w, card.h);
  const sheen = ctx.createRadialGradient(card.x + card.w * 0.28, card.y - 60, 10, card.x + card.w * 0.28, card.y - 60, card.w * 0.8);
  sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(card.x, card.y, card.w, card.h);
  ctx.restore();
  roundRect(ctx, card.x + 1, card.y + 1, card.w - 2, card.h - 2, card.r);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const px = card.x + 56;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.74)';
  ctx.font = `600 38px ${FONT}`;
  const kind = r.art ? `${SPORTS[r.sport].label} · Dessin · ${Math.round(r.art.fit * 100)} % de ressemblance` : `${SPORTS[r.sport].label} · ${SHAPES[r.shape].label}`;
  ctx.fillText(kind, px, card.y + 92);
  ctx.fillStyle = '#fff';
  ctx.font = `750 64px ${FONT}`;
  const name = lines(ctx, r.name, card.w - 112);
  name.forEach((l, i) => ctx.fillText(l, px, card.y + 170 + i * 74));

  // Les trois chiffres, en colonnes égales, alignés en bas du bloc.
  const stats: [string, string, string][] = [
    ['Distance', kmValue(r.lengthM), 'km'],
    ['Dénivelé +', String(Math.round(r.ascent)), 'm'],
    ['Durée', duration(r.durationS), ''],
  ];
  const colW = (card.w - 112) / 3;
  const base = card.y + card.h - 64;
  stats.forEach(([label, value, unit], i) => {
    const x = px + i * colW;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `600 34px ${FONT}`;
    ctx.fillText(label, x, base - 104);
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${value.length > 6 ? 66 : 84}px ${FONT}`;
    ctx.fillText(value, x, base);
    if (unit) {
      const vw = ctx.measureText(value).width;
      ctx.font = `600 40px ${FONT}`;
      ctx.fillText(unit, x + vw + 10, base);
    }
  });

  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  ctx.font = `600 36px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('Fais ta boucle sur rom442005.github.io/boucle', W / 2, H - 58);

  return await new Promise<Blob>((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error('image'))), 'image/jpeg', 0.9));
}
