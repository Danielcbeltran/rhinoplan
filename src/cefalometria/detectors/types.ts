// Interfaz común para todos los modelos de detección facial.
// Cada detector implementa esto y la app los intercambia transparentemente.

import type { Mode, PointId, Pt } from '../cephalometry';

export type ModelKey = 'mediapipe' | 'faceapi' | 'custom';

export interface ModelInfo {
  key: ModelKey;
  label: string;        // mostrado en el selector
  shortLabel: string;   // mostrado de forma compacta
  description: string;
  points: number;       // nº de puntos que el modelo provee
}

export const MODELS: Record<ModelKey, ModelInfo> = {
  mediapipe: {
    key: 'mediapipe',
    label: 'MediaPipe FaceLandmarker',
    shortLabel: 'MediaPipe',
    description: '478 puntos. Excelente en frontal, limitado en perfil puro. Ligero (~3.7 MB).',
    points: 478,
  },
  faceapi: {
    key: 'faceapi',
    label: 'face-api.js (SSD + 68 pts)',
    shortLabel: 'face-api',
    description: '68 puntos (iBUG 300-W). Detector SSD MobileNet robusto a poses, incluye algo de perfil. ~5.5 MB.',
    points: 68,
  },
  custom: {
    key: 'custom',
    label: 'Modelo propio (perfil)',
    shortLabel: 'Propio',
    description: '21 puntos perfilométricos entrenados con tu dataset (YOLOv8-pose). Solo perfil, 100% local. ~13 MB.',
    points: 21,
  },
};

export interface DetectedPoint {
  pt: Pt;
  confidence: number;
}

export interface DetectionResult {
  success: boolean;
  error?: string;
  warning?: string;
  points: Partial<Record<PointId, DetectedPoint>>;
  unmapped: PointId[];
  usedMirror?: boolean;
  modelUsed: ModelKey;
}

export interface DetectorAdapter {
  key: ModelKey;
  preload(): Promise<void>;
  detect(image: HTMLImageElement | HTMLCanvasElement, mode: Mode): Promise<DetectionResult>;
}

/** Helper: crea un canvas espejado horizontalmente. */
export function mirrorImage(
  image: HTMLImageElement | HTMLCanvasElement,
): HTMLCanvasElement {
  const w = image instanceof HTMLImageElement ? image.naturalWidth  : image.width;
  const h = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(image, 0, 0);
  return c;
}

export function imageSize(image: HTMLImageElement | HTMLCanvasElement) {
  return image instanceof HTMLImageElement
    ? { w: image.naturalWidth, h: image.naturalHeight }
    : { w: image.width, h: image.height };
}
