// Adapter para el modelo propio entrenado (YOLOv8-pose, 21 keypoints de perfil).
// Corre 100% en el navegador con onnxruntime-web — la foto nunca sale del equipo.
//
// El .onnx se entrena con training/rhinoplan_train.ipynb.
//
// CARGA DEL MODELO (cambiado para la fusión con la app principal):
// El archivo ya NO viaja en el repositorio. Se descarga desde una URL remota
// (Supabase Storage) y se guarda en Cache Storage del navegador, de modo que
// la descarga ocurre una sola vez por dispositivo y luego funciona offline.
// Motivos: el .onnx supera el límite de subida por la web de GitHub y hacía
// pesado cada despliegue; además así se puede actualizar el modelo sin
// redesplegar la aplicación.

import * as ort from 'onnxruntime-web';
import type { Mode, PointId } from '../cephalometry';
import {
  type DetectorAdapter, type DetectionResult, type DetectedPoint,
  imageSize,
} from './types';

// ---------------------------------------------------------------------------
// Origen del modelo
// ---------------------------------------------------------------------------
// Pegar aquí la URL pública del bucket de Supabase Storage, por ejemplo:
//   https://tzmbybwytfpaqaajwumz.supabase.co/storage/v1/object/public/models/rhinoplan_perfil_fp16.onnx
// Se puede sobreescribir con la variable de entorno VITE_MODEL_URL.
const REMOTE_MODEL_URL = 'https://tzmbybwytfpaqaajwumz.supabase.co/storage/v1/object/public/models/rhinoplan_perfil.onnx';

// Fallback local: útil mientras se desarrolla sin conexión, si se deja una
// copia en public/models/. En producción se usa siempre la URL remota.
const LOCAL_MODEL_URL = '/models/rhinoplan_perfil.onnx';

const ENV_URL = (import.meta as any)?.env?.VITE_MODEL_URL as string | undefined;
const MODEL_URL =
  ENV_URL ||
  (REMOTE_MODEL_URL.startsWith('http') ? REMOTE_MODEL_URL : LOCAL_MODEL_URL);

// Nombre del caché. Cambiar el sufijo al publicar un modelo nuevo fuerza
// la redescarga en todos los dispositivos.
const MODEL_CACHE = 'rhinoplan-models-v1';

// Diagnóstico por consola. DEBE quedar en false en producción: los mensajes
// imprimen coordenadas de landmarks faciales de pacientes reales.
// Poner en true sólo en local al reentrenar el modelo o cambiar INPUT_SIZE:
// verifica la forma de la salida y el revertido del letterbox, que es lo que
// falla en silencio (los puntos aparecen desplazados sin dar ningún error).
const DEBUG_DETECTION = false;

const INPUT_SIZE = 960;        // imgsz con el que se exportó (yolov8s-pose 960)
const CONF_THRESHOLD = 0.10;   // confianza mínima de la detección

// Orden FIJO de los 21 keypoints — debe coincidir con keypoint_order.json y con
// el KPT_ORDER del notebook de entrenamiento.
const KPT_ORDER: PointId[] = [
  'Tr', 'G', 'N', 'Rh', 'Sp', 'Pn', 'Cm', 'Sn', 'AC', 'A', 'Ba',
  'Bp', 'Cb', 'Ls', 'Li', 'Sl', 'Pog', 'Me', 'C', 'Po', 'Or',
];
const NK = KPT_ORDER.length;

// WASM desde CDN (evita problemas de bundling con Vite).
ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`;

// ---------------------------------------------------------------------------
// Progreso de descarga (para mostrar una barra en la interfaz)
// ---------------------------------------------------------------------------
export interface ModelProgress {
  /** Bytes recibidos. */
  loaded: number;
  /** Bytes totales; 0 si el servidor no envía Content-Length. */
  total: number;
  /** 0–1, o null si se desconoce el total. */
  ratio: number | null;
  /** true cuando el modelo ya estaba en caché (no hubo descarga). */
  fromCache: boolean;
  done: boolean;
}

type ProgressHandler = (p: ModelProgress) => void;
let progressHandler: ProgressHandler | null = null;

/** Registra un callback para seguir la descarga del modelo. */
export function setModelProgressHandler(fn: ProgressHandler | null): void {
  progressHandler = fn;
}

function emit(p: ModelProgress): void {
  try { progressHandler?.(p); } catch { /* la UI no debe romper la carga */ }
}

// ---------------------------------------------------------------------------
// Descarga + caché del .onnx
// ---------------------------------------------------------------------------

/**
 * Devuelve los bytes del modelo, usando Cache Storage si ya se descargó antes.
 * Cache Storage persiste entre sesiones y funciona dentro de la PWA.
 */
async function loadModelBytes(): Promise<Uint8Array> {
  // 1. ¿Ya está en caché?
  let cache: Cache | null = null;
  try {
    if ('caches' in window) {
      cache = await caches.open(MODEL_CACHE);
      const hit = await cache.match(MODEL_URL);
      if (hit) {
        const buf = await hit.arrayBuffer();
        emit({ loaded: buf.byteLength, total: buf.byteLength, ratio: 1, fromCache: true, done: true });
        return new Uint8Array(buf);
      }
    }
  } catch {
    cache = null; // Safari en modo privado puede bloquear Cache Storage
  }

  // 2. Descargar con progreso
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`No se pudo descargar el modelo (HTTP ${res.status}).`);

  const total = Number(res.headers.get('Content-Length') || 0);

  let bytes: Uint8Array;
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.length;
        emit({ loaded, total, ratio: total ? loaded / total : null, fromCache: false, done: false });
      }
    }
    bytes = new Uint8Array(loaded);
    let off = 0;
    for (const c of chunks) { bytes.set(c, off); off += c.length; }
  } else {
    // Navegador sin streams: descarga simple, sin progreso intermedio
    const buf = await res.arrayBuffer();
    bytes = new Uint8Array(buf);
  }

  emit({ loaded: bytes.length, total: total || bytes.length, ratio: 1, fromCache: false, done: true });

  // 3. Guardar en caché para la próxima vez
  try {
    if (cache) {
      await cache.put(
        MODEL_URL,
        new Response(bytes.buffer as ArrayBuffer, {
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
      );
    }
  } catch { /* sin caché disponible: se redescargará la próxima vez */ }

  return bytes;
}

/** Borra el modelo cacheado (útil tras publicar una versión nueva). */
export async function clearModelCache(): Promise<void> {
  try { if ('caches' in window) await caches.delete(MODEL_CACHE); } catch { /* noop */ }
}

// ---------------------------------------------------------------------------
// Sesión de inferencia
// ---------------------------------------------------------------------------

let session: ort.InferenceSession | null = null;
let loadingPromise: Promise<ort.InferenceSession> | null = null;

async function getSession(): Promise<ort.InferenceSession> {
  if (session) return session;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const bytes = await loadModelBytes();
    const s = await ort.InferenceSession.create(bytes, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    session = s;
    return s;
  })();
  try { return await loadingPromise; }
  catch (e) { loadingPromise = null; throw e; }
}

interface Letterbox { tensor: ort.Tensor; scale: number; padX: number; padY: number; W: number; H: number; }

/** Redimensiona con letterbox a INPUT_SIZE y produce el tensor NCHW float32 [0,1]. */
function preprocess(image: HTMLImageElement | HTMLCanvasElement): Letterbox {
  const { w: W, h: H } = imageSize(image);
  const scale = Math.min(INPUT_SIZE / W, INPUT_SIZE / H);
  const nw = Math.round(W * scale), nh = Math.round(H * scale);
  const padX = (INPUT_SIZE - nw) / 2, padY = (INPUT_SIZE - nh) / 2;

  const c = document.createElement('canvas');
  c.width = INPUT_SIZE; c.height = INPUT_SIZE;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgb(114,114,114)';       // padding gris estándar de YOLO
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  ctx.drawImage(image, padX, padY, nw, nh);

  const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const area = INPUT_SIZE * INPUT_SIZE;
  const f = new Float32Array(3 * area);
  for (let i = 0; i < area; i++) {
    f[i]            = data[i * 4]     / 255;  // R
    f[area + i]     = data[i * 4 + 1] / 255;  // G
    f[2 * area + i] = data[i * 4 + 2] / 255;  // B
  }
  return {
    tensor: new ort.Tensor('float32', f, [1, 3, INPUT_SIZE, INPUT_SIZE]),
    scale, padX, padY, W, H,
  };
}

export const customAdapter: DetectorAdapter = {
  key: 'custom',
  async preload() {
    try { await getSession(); } catch {}
  },
  async detect(image, mode: Mode): Promise<DetectionResult> {
    if (mode !== 'perfil') {
      return {
        success: false,
        modelUsed: 'custom',
        error: 'El modelo propio solo detecta PERFIL. Para frontal usa MediaPipe o face-api.',
        points: {}, unmapped: [],
      };
    }
    try {
      const s = await getSession();
      const { tensor, scale, padX, padY, W, H } = preprocess(image);
      const out = await s.run({ [s.inputNames[0]]: tensor });
      const o = out[s.outputNames[0]];
      const dims = o.dims;                 // [1, 5+3*NK, A]
      const ch = dims[1], A = dims[2];
      const d = o.data as Float32Array;
      if (DEBUG_DETECTION) {
        console.log('[custom] outDims=', dims, 'imgW=', W, 'imgH=', H,
          'scale=', scale.toFixed(4), 'padX=', padX.toFixed(1), 'padY=', padY.toFixed(1));
      }

      // Mejor detección por confianza (esperamos una sola cara)
      let bestA = -1, bestConf = 0;
      for (let a = 0; a < A; a++) {
        const conf = d[4 * A + a];
        if (conf > bestConf) { bestConf = conf; bestA = a; }
      }
      if (bestA < 0 || bestConf < CONF_THRESHOLD) {
        return {
          success: false,
          modelUsed: 'custom',
          error: `El modelo no encontró un perfil con suficiente confianza (${(bestConf * 100).toFixed(0)}%). Prueba con otra foto o coloca los puntos a mano.`,
          points: {}, unmapped: [],
        };
      }

      // Decodificar los NK keypoints (canal 5 en adelante: x,y,conf por punto)
      const points: Partial<Record<PointId, DetectedPoint>> = {};
      const unmapped: PointId[] = [];
      const nKptCh = (ch - 5) / 3;         // debería ser NK
      for (let j = 0; j < NK; j++) {
        if (j >= nKptCh) { unmapped.push(KPT_ORDER[j]); continue; }
        const kx = d[(5 + j * 3) * A + bestA];
        const ky = d[(5 + j * 3 + 1) * A + bestA];
        const kc = d[(5 + j * 3 + 2) * A + bestA];
        // Revertir letterbox → coords de la imagen original
        const x = (kx - padX) / scale;
        const y = (ky - padY) / scale;
        // Punta nasal (Pn = índice 5): crudo vs revertido. Es el punto de
        // control del letterbox — si está bien, el resto también.
        if (DEBUG_DETECTION && j === 5) {
          console.log('[custom] Pn raw=(', kx.toFixed(1), ',', ky.toFixed(1),
            ') -> img=(', x.toFixed(1), ',', y.toFixed(1), ') conf=', kc.toFixed(2),
            'boxConf=', bestConf.toFixed(2));
        }
        points[KPT_ORDER[j]] = { pt: { x, y }, confidence: Math.max(0, Math.min(1, kc)) };
      }

      const warning = bestConf < 0.4
        ? `Confianza de detección baja (${(bestConf * 100).toFixed(0)}%). Revisa y ajusta los puntos.`
        : undefined;
      return { success: true, modelUsed: 'custom', points, unmapped, warning };
    } catch (e: any) {
      return {
        success: false,
        modelUsed: 'custom',
        error: e?.message ?? 'Error ejecutando el modelo propio (ONNX).',
        points: {}, unmapped: [],
      };
    }
  },
};
