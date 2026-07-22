// Adapter para face-api.js (fork @vladmandic/face-api).
// Usa SSD MobileNet v1 como detector facial + 68 landmarks (iBUG 300-W).
// SSD MobileNet maneja poses más variadas que MediaPipe, incluyendo perfiles.

import * as faceapi from '@vladmandic/face-api';
import type { Mode, PointId, Pt } from '../cephalometry';
import {
  type DetectorAdapter, type DetectionResult, type DetectedPoint,
  mirrorImage,
} from './types';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

let loaded = false;
let loadingPromise: Promise<void> | null = null;

async function ensureModelsLoaded(): Promise<void> {
  if (loaded) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    loaded = true;
  })();
  try { await loadingPromise; }
  catch (e) { loadingPromise = null; throw e; }
}

// ============ Mapeo iBUG 68-puntos → nuestros PointIds ============
// Convención iBUG (subject's anatomical right/left):
//  0-16 jawline, 17-21 right brow, 22-26 left brow, 27-30 nose bridge,
//  31-35 nostrils, 36-41 right eye, 42-47 left eye, 48-67 mouth.

/** Resultado: una posición Pt o null si requiere combinar varios landmarks. */
type Resolver = (lm: faceapi.Point[]) => Pt | null;

const mid = (a: faceapi.Point, b: faceapi.Point): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const between = (a: faceapi.Point, b: faceapi.Point, t = 0.5): Pt =>
  ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const pt = (p: faceapi.Point): Pt => ({ x: p.x, y: p.y });

// Modelo Farkas (18 puntos). iBUG-68 no incluye trichion ni trago, así que esos
// quedan sin mapeo y el usuario debe colocarlos manualmente.
const FRENTE_RESOLVERS: Partial<Record<PointId, Resolver>> = {
  // tr (trichion): iBUG-68 no llega a la línea del cabello — estimado por el
  // canon de tercios (tr = g + (g − sn)); el usuario lo ajusta a su hairline.
  tr:   (l) => {
    const g = mid(l[21], l[22]);
    const s = pt(l[33]);
    const K = 0.80;   // tercio superior algo más corto que el medio en la práctica
    return { x: g.x + K * (g.x - s.x), y: Math.max(2, g.y + K * (g.y - s.y)) };
  },
  g:    (l) => mid(l[21], l[22]),       // glabela ≈ midpoint cejas internas
  n:    (l) => pt(l[27]),
  prn:  (l) => pt(l[30]),
  sn:   (l) => pt(l[33]),
  sto:  (l) => between(l[62], l[66], 0.5),   // entre borde interno labio sup/inf
  gn:   (l) => pt(l[8]),
  // Cejas (cabeza = extremo medial; iBUG traza el borde superior — aproximación)
  cb_d: (l) => pt(l[21]),
  cb_i: (l) => pt(l[22]),
  // Ojos
  en_d: (l) => pt(l[39]),
  en_i: (l) => pt(l[42]),
  ex_d: (l) => pt(l[36]),
  ex_i: (l) => pt(l[45]),
  pu_d: (l) => {
    const xs = l.slice(36, 42); let sx = 0, sy = 0;
    for (const p of xs) { sx += p.x; sy += p.y; }
    return { x: sx / xs.length, y: sy / xs.length };
  },
  pu_i: (l) => {
    const xs = l.slice(42, 48); let sx = 0, sy = 0;
    for (const p of xs) { sx += p.x; sy += p.y; }
    return { x: sx / xs.length, y: sy / xs.length };
  },
  // Nariz
  al_d: (l) => pt(l[31]),
  al_i: (l) => pt(l[35]),
  // Boca
  ch_d: (l) => pt(l[48]),
  ch_i: (l) => pt(l[54]),
  // Contorno facial lateral a nivel ocular (extremos del jawline iBUG)
  lat_d: (l) => pt(l[0]),
  lat_i: (l) => pt(l[16]),
  // t_d / t_i (trago): no disponible en iBUG-68
};

const PERFIL_RESOLVERS: Partial<Record<PointId, Resolver>> = {
  // Tr: iBUG-68 no llega a la línea del cabello — estimado por tercios (G + (G − Sn))
  Tr:  (l) => {
    const g = mid(l[21], l[22]);
    const s = pt(l[33]);
    const K = 0.80;   // tercio superior algo más corto que el medio en la práctica
    return { x: g.x + K * (g.x - s.x), y: Math.max(2, g.y + K * (g.y - s.y)) };
  },
  G:   (l) => mid(l[21], l[22]),
  N:   (l) => pt(l[27]),
  Pn:  (l) => pt(l[30]),
  Cm:  (l) => between(l[30], l[33], 0.5),    // entre punta nasal y subnasal
  Sn:  (l) => pt(l[33]),
  Ls:  (l) => pt(l[51]),
  Li:  (l) => pt(l[57]),
  Sl:  (l) => between(l[57], l[8], 0.4),     // sublabial entre labio inf y mentón
  Pog: (l) => pt(l[8]),
  Me:  (l) => pt(l[8]),
  // C: no disponible (sin punto cervical en iBUG)
};

export const faceapiAdapter: DetectorAdapter = {
  key: 'faceapi',
  async preload() {
    try { await ensureModelsLoaded(); } catch {}
  },
  async detect(image, mode: Mode): Promise<DetectionResult> {
    try {
      await ensureModelsLoaded();

      // Detección + landmarks. Umbral mínimo bajo para perfil.
      const opts = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1, maxResults: 1 });
      let det = await faceapi.detectSingleFace(image as HTMLImageElement, opts).withFaceLandmarks();

      let usedMirror = false;
      if (!det) {
        const m = mirrorImage(image);
        const det2 = await faceapi.detectSingleFace(m, opts).withFaceLandmarks();
        if (det2) {
          // Flip x de los 68 landmarks
          const w = m.width;
          const flipped = det2.landmarks.positions.map((p) => ({ x: w - p.x, y: p.y })) as faceapi.Point[];
          // Construir un objeto landmarks compatible
          det = { ...det2, landmarks: { positions: flipped } as any };
          usedMirror = true;
        }
      }

      if (!det) {
        return {
          success: false,
          modelUsed: 'faceapi',
          error: mode === 'perfil'
            ? 'face-api.js tampoco detectó rostro. En perfil puro ningún modelo browser-only es totalmente fiable — coloca los puntos manualmente con la herramienta ◉ Punto y el flujo seguirá funcionando.'
            : 'face-api.js no detectó rostro. Prueba con mejor iluminación o con el modelo MediaPipe.',
          points: {}, unmapped: [],
        };
      }

      const landmarks = (det.landmarks?.positions ?? det.landmarks) as faceapi.Point[];
      const map = mode === 'frente' ? FRENTE_RESOLVERS : PERFIL_RESOLVERS;
      const points: Partial<Record<PointId, DetectedPoint>> = {};
      const unmapped: PointId[] = [];
      // Confianza global desde la detection score
      const detScore = (det.detection?.score ?? 0.6);
      const baseConf = Math.max(0.5, Math.min(0.95, detScore));

      for (const [id, resolver] of Object.entries(map) as [PointId, Resolver][]) {
        const p = resolver(landmarks);
        if (!p) { unmapped.push(id); continue; }
        points[id] = { pt: p, confidence: baseConf };
      }

      const warning = mode === 'perfil' && baseConf < 0.7
        ? `Confianza de detección baja (${(baseConf * 100).toFixed(0)} %). Revisa y arrastra los puntos para ajustar.`
        : undefined;

      return { success: true, modelUsed: 'faceapi', points, unmapped, usedMirror, warning };
    } catch (e: any) {
      return {
        success: false,
        modelUsed: 'faceapi',
        error: e?.message ?? 'Error inesperado en face-api.js.',
        points: {}, unmapped: [],
      };
    }
  },
};
