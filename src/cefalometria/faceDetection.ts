// Coordinador de modelos de detección facial.
// Re-exporta los tipos compartidos y enruta al detector elegido por el usuario.

import { mediapipeAdapter } from './detectors/mediapipe';
import { faceapiAdapter }   from './detectors/faceapi';
import { customAdapter }    from './detectors/custom';
import {
  type DetectorAdapter, type DetectionResult, type ModelKey, MODELS,
} from './detectors/types';
import type { Mode } from './cephalometry';

export type { DetectionResult, ModelKey } from './detectors/types';
export { MODELS } from './detectors/types';

const DETECTORS: Record<ModelKey, DetectorAdapter> = {
  mediapipe: mediapipeAdapter,
  faceapi: faceapiAdapter,
  custom: customAdapter,
};

/** Precarga el modelo elegido (descarga WASM + pesos si aún no están). */
export async function preloadModel(model: ModelKey): Promise<void> {
  return DETECTORS[model].preload();
}

/** Detección facial con el modelo seleccionado. */
export async function detectFaceLandmarks(
  image: HTMLImageElement | HTMLCanvasElement,
  mode: Mode,
  model: ModelKey = 'mediapipe',
): Promise<DetectionResult> {
  return DETECTORS[model].detect(image, mode);
}

/** Lista de modelos disponibles para el selector de UI. */
export function listModels() {
  return Object.values(MODELS);
}
