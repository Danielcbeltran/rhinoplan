// Adapter para MediaPipe FaceLandmarker (478 puntos).

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { Mode, PointId } from '../cephalometry';
import {
  type DetectorAdapter, type DetectionResult, type DetectedPoint,
  mirrorImage, imageSize,
} from './types';

let landmarker: FaceLandmarker | null = null;
let loadingPromise: Promise<FaceLandmarker> | null = null;

const WASM_URL  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';

async function getLandmarker(): Promise<FaceLandmarker> {
  if (landmarker) return landmarker;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const resolver = await FilesetResolver.forVisionTasks(WASM_URL);
    const lm = await FaceLandmarker.createFromOptions(resolver, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      runningMode: 'IMAGE',
      numFaces: 1,
      minFaceDetectionConfidence: 0.1,
      minFacePresenceConfidence: 0.1,
      minTrackingConfidence: 0.1,
    });
    landmarker = lm;
    return lm;
  })();
  try { return await loadingPromise; }
  catch (e) { loadingPromise = null; throw e; }
}

// Modelo Farkas (18 puntos). Mapeo aproximado a landmarks MediaPipe.
// Convención _d = anatómicamente derecha del paciente (= izquierda del observador).
const FRENTE_MAP: Partial<Record<PointId, number>> = {
  tr: 10,                          // tope de malla (frente media) — se re-estima post-detección al canon de tercios
  g:  9,                           // glabela (entre cejas, línea media)
  n:  168,                         // nasion
  prn: 1,                          // pronasal
  sn:  2,                          // subnasal
  sto: 13,                         // stomion (centro labio sup. — punto medio entre labios)
  gn:  152,                        // gnation
  // Cejas (cabeza = extremo medial, borde inferior)
  cb_d: 55,  cb_i: 285,
  // Ojos
  en_d: 133, en_i: 362,            // endocantión
  ex_d: 33,  ex_i: 263,            // exocantión
  pu_d: 468, pu_i: 473,            // pupilas
  // Nariz
  al_d: 102, al_i: 331,            // alas
  // Boca
  ch_d: 61,  ch_i: 291,            // comisuras
  // Orejas (trago) — MediaPipe no expone trago directo; usamos puntos cercanos al pinna anterior.
  t_d:  234, t_i: 454,
  // Contorno facial lateral a nivel ocular (óvalo facial, sin orejas)
  lat_d: 127, lat_i: 356,
};

const PERFIL_MAP: Partial<Record<PointId, number>> = {
  Tr: 10, G: 9, N: 168, Pn: 1, Cm: 4, Sn: 2,
  Ls: 13, Li: 14, Sl: 17,
  Pog: 199, Me: 152,
};

function confFromZ(lp: { z?: number }): number {
  if (lp.z == null) return 0.9;
  const c = 0.96 - Math.min(0.4, Math.abs(lp.z) * 2.2);
  return Math.max(0.45, Math.min(0.98, c));
}

function detectOnce(lm: FaceLandmarker, img: HTMLImageElement | HTMLCanvasElement) {
  const result = lm.detect(img);
  return result.faceLandmarks?.[0] ?? null;
}

export const mediapipeAdapter: DetectorAdapter = {
  key: 'mediapipe',
  async preload() {
    try { await getLandmarker(); } catch {}
  },
  async detect(image, mode: Mode): Promise<DetectionResult> {
    try {
      const lm = await getLandmarker();
      const { w: W, h: H } = imageSize(image);

      let landmarks = detectOnce(lm, image);
      let usedMirror = false;
      if (!landmarks) {
        const m = mirrorImage(image);
        const flipped = detectOnce(lm, m);
        if (flipped) {
          landmarks = flipped.map((lp) => ({ ...lp, x: 1 - lp.x }));
          usedMirror = true;
        }
      }
      if (!landmarks) {
        return {
          success: false,
          modelUsed: 'mediapipe',
          error: mode === 'perfil'
            ? 'MediaPipe no detectó rostro. En perfil puro su precisión es limitada — prueba con el modelo face-api.js (selector junto al botón) o coloca los puntos manualmente.'
            : 'MediaPipe no detectó rostro. Asegúrate de buena iluminación, cara de frente y sin oclusiones. También puedes probar el modelo face-api.js.',
          points: {}, unmapped: [],
        };
      }

      const map = mode === 'frente' ? FRENTE_MAP : PERFIL_MAP;
      const points: Partial<Record<PointId, DetectedPoint>> = {};
      const unmapped: PointId[] = [];
      let sumConf = 0, count = 0;
      for (const [id, idx] of Object.entries(map) as [PointId, number][]) {
        const lp = landmarks[idx];
        if (!lp) { unmapped.push(id); continue; }
        const conf = confFromZ(lp);
        points[id] = { pt: { x: lp.x * W, y: lp.y * H }, confidence: conf };
        sumConf += conf; count++;
      }

      // Corrección del trichion: el landmark 10 es el TOPE DE LA MALLA de
      // MediaPipe (frente media) — la malla no incluye la línea del cabello,
      // así que el trichion queda sistemáticamente bajo. Lo re-estimamos con
      // el canon de tercios (tr–g ≈ g–sn): tr = g + (g − sn), respetando la
      // inclinación de la cabeza. Confianza reducida: es un estimado
      // antropométrico que el usuario debe ajustar a la línea real del cabello.
      {
        const trId: PointId = mode === 'frente' ? 'tr' : 'Tr';
        const gId: PointId  = mode === 'frente' ? 'g'  : 'G';
        const snId: PointId = mode === 'frente' ? 'sn' : 'Sn';
        const gPt = points[gId], snPt = points[snId];
        if (points[trId] && gPt && snPt) {
          // Factor 0.80: el canon teórico (tercios iguales) queda alto en la
          // práctica — el tercio superior suele ser algo más corto que el medio.
          const K = 0.80;
          const tx = gPt.pt.x + K * (gPt.pt.x - snPt.pt.x);
          const ty = gPt.pt.y + K * (gPt.pt.y - snPt.pt.y);
          points[trId] = {
            pt: { x: Math.max(0, Math.min(W, tx)), y: Math.max(2, Math.min(H, ty)) },
            confidence: 0.5,
          };
        }
      }
      const avg = count ? sumConf / count : 0;
      const warning = mode === 'perfil' && avg < 0.7
        ? `Confianza media baja (${(avg * 100).toFixed(0)} %) en perfil. Revisa y arrastra los puntos para ajustar.`
        : undefined;
      return { success: true, modelUsed: 'mediapipe', points, unmapped, usedMirror, warning };
    } catch (e: any) {
      return {
        success: false,
        modelUsed: 'mediapipe',
        error: e?.message ?? 'Error inesperado en MediaPipe.',
        points: {}, unmapped: [],
      };
    }
  },
};
