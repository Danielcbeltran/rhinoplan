// ============================================================================
// bridge.ts — Contrato entre RhinoPlan (App.jsx) y el módulo de cefalometría.
// ----------------------------------------------------------------------------
// Diseño "opción B": varias mediciones por paciente, cada una atada a la foto
// concreta sobre la que se midió, para poder comparar pre y post.
//
// REGLAS DE DISEÑO
//
// 1. La imagen NO se guarda dentro de la medición. Se referencia por `fotoId`
//    contra las fotos del paciente. Guardar el base64 otra vez duplicaría
//    varios MB por medición.
//
// 2. Se guardan SIEMPRE los landmarks, no solo los valores calculados. Ocupan
//    unos cientos de bytes y permiten recalcular si se corrige un punto o se
//    mejora una fórmula. Los valores se guardan además como instantánea para
//    poder listar y comparar sin recalcular.
//
// 3. La calibración viaja DENTRO de la medición. Sin ella, cualquier medida en
//    milímetros pierde su significado al reabrir el caso.
//
// 4. El estado de interfaz (capas visibles, viewport, punto activo) NO se
//    persiste aquí: son preferencias, no datos clínicos.
// ============================================================================

/** Versión del formato. Subir sólo si se rompe compatibilidad. */
export const CEPH_FORMAT_VERSION = 1;

export type CephMode = 'perfil' | 'frente';
export type Momento = 'pre' | 'post';

/** Parte clínica del estado de un modo: lo que sí se persiste. */
export interface MedicionEstado {
  originalSize: { w: number; h: number } | null;
  rotationAngle: number;
  flipH: boolean;
  points: Record<string, unknown>;
  pointMeta: Record<string, unknown>;
  confirmedPoints: Record<string, unknown>;
  customLines: unknown[];
  customAngles: unknown[];
  rulers: unknown[];
  contourAnchors: unknown[];
  calibration: unknown | null;
  refCalibMm: number | null;
  confirmed: boolean;
}

export interface Medicion {
  id: string;
  /** Id de la foto del paciente sobre la que se midió. */
  fotoId: string;
  /** De qué grupo de fotos del paciente proviene. */
  momento: Momento;
  modo: CephMode;
  /** ISO 8601. */
  fecha: string;
  /** Texto libre opcional: "control 3 meses", "revisión", etc. */
  etiqueta?: string;
  estado: MedicionEstado;
  /** Instantánea de las medidas calculadas, para listar y comparar. */
  valores: Record<string, number | string | null>;
}

export interface CefalometriaData {
  v: number;
  mediciones: Medicion[];
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export function nuevaMedicionId(): string {
  return 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function cefalometriaVacia(): CefalometriaData {
  return { v: CEPH_FORMAT_VERSION, mediciones: [] };
}

/**
 * Lee el JSON guardado en la columna `cefalometria` de `pacientes`.
 * Tolerante: ante cualquier dato corrupto devuelve una estructura vacía en vez
 * de lanzar, para no dejar al cirujano sin poder abrir el paciente.
 */
export function parseCefalometria(raw: unknown): CefalometriaData {
  if (!raw) return cefalometriaVacia();
  let obj: any = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return cefalometriaVacia(); }
  }
  if (!obj || typeof obj !== 'object') return cefalometriaVacia();
  const arr = Array.isArray(obj.mediciones) ? obj.mediciones : [];
  const mediciones = arr.filter(
    (m: any) => m && typeof m.id === 'string' && typeof m.fotoId === 'string' && m.estado,
  );
  return { v: typeof obj.v === 'number' ? obj.v : CEPH_FORMAT_VERSION, mediciones };
}

/** Extrae de un ModeState completo sólo la parte clínica persistible. */
export function extraerEstado(ms: any): MedicionEstado {
  return {
    originalSize: ms?.originalSize ?? null,
    rotationAngle: ms?.rotationAngle ?? 0,
    flipH: !!ms?.flipH,
    points: ms?.points ?? {},
    pointMeta: ms?.pointMeta ?? {},
    confirmedPoints: ms?.confirmedPoints ?? {},
    customLines: ms?.customLines ?? [],
    customAngles: ms?.customAngles ?? [],
    rulers: ms?.rulers ?? [],
    contourAnchors: ms?.contourAnchors ?? [],
    calibration: ms?.calibration ?? null,
    refCalibMm: ms?.refCalibMm ?? null,
    confirmed: !!ms?.confirmed,
  };
}

/**
 * Convierte una medición guardada en un parche para `patchCurrent`.
 * `imageSrc` se pasa aparte: lo resuelve quien conoce las fotos del paciente.
 */
export function estadoAParche(m: Medicion, imageSrc: string | null): Record<string, unknown> {
  const e = m.estado;
  return {
    imageSrc,
    originalSize: e.originalSize,
    rotationAngle: e.rotationAngle,
    flipH: e.flipH,
    points: e.points,
    pointMeta: e.pointMeta,
    confirmedPoints: e.confirmedPoints,
    customLines: e.customLines,
    customAngles: e.customAngles,
    rulers: e.rulers,
    contourAnchors: e.contourAnchors,
    calibration: e.calibration,
    refCalibMm: e.refCalibMm,
    confirmed: e.confirmed,
    // Estado transitorio: se reinicia al cargar
    activePointId: null,
    detectionStatus: 'idle',
    detectionError: null,
    detectionWarning: null,
  };
}

/** Inserta o reemplaza una medición conservando el resto. */
export function guardarMedicion(data: CefalometriaData, m: Medicion): CefalometriaData {
  const i = data.mediciones.findIndex((x) => x.id === m.id);
  const mediciones = [...data.mediciones];
  if (i >= 0) mediciones[i] = m; else mediciones.push(m);
  return { ...data, mediciones };
}

export function borrarMedicion(data: CefalometriaData, id: string): CefalometriaData {
  return { ...data, mediciones: data.mediciones.filter((m) => m.id !== id) };
}

/** Mediciones de una foto concreta, de la más reciente a la más antigua. */
export function medicionesDeFoto(data: CefalometriaData, fotoId: string): Medicion[] {
  return data.mediciones
    .filter((m) => m.fotoId === fotoId)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Props que la app principal pasa al módulo
// ---------------------------------------------------------------------------

export interface FotoPaciente {
  id: string;
  src: string;
  momento: Momento;
}

export interface CephProps {
  /** Nombre del paciente activo, sólo para mostrar. */
  pacienteNombre?: string;
  /** Fotos del paciente activo, ya aplanadas y con id estable. */
  fotos?: FotoPaciente[];
  /** Mediciones ya guardadas de este paciente. */
  cefalometria?: CefalometriaData;
  /** Persiste el conjunto completo de mediciones. */
  onSave?: (data: CefalometriaData) => void | Promise<void>;
  /** Idioma de la app principal (por ahora informativo). */
  lang?: string;
}
