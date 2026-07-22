// Perfilometría facial — catálogo de puntos blandos, líneas estéticas
// y medidas normales (perfil + frente).

export type Mode = 'perfil' | 'frente';

export type PointId =
  // Perfil (tejidos blandos)
  | 'Tr'  | 'G'   | 'N'   | 'Rh'  | 'Sp'  | 'Pn'  | 'Cm'  | 'Sn'  | 'AC'
  // Relación ala–columnela (Gunter): A = ala inferior, Ba/Bp = eje narina, Cb = columnela inferior
  | 'A'   | 'Ba'  | 'Bp'  | 'Cb'
  | 'Ls'  | 'Li'  | 'Sl'  | 'Pog' | 'Me'  | 'C'   | 'Nk'
  // Perfil — referencia (Frankfort)
  | 'Po'  | 'Or'
  // Frente — modelo antropométrico de Farkas (18 puntos + glabela auxiliar)
  | 'tr'    | 'g'     | 'n'     | 'prn'   | 'sn'    | 'sto'   | 'gn'
  | 'en_d'  | 'en_i'  | 'ex_d'  | 'ex_i'
  | 'pu_d'  | 'pu_i'
  | 'al_d'  | 'al_i'
  | 'ch_d'  | 'ch_i'
  | 't_d'   | 't_i'
  // Cabezas de ceja — límite tercio superior / tercio medio
  | 'cb_d'  | 'cb_i'
  // Contorno facial lateral a nivel ocular — límites externos de los quintos
  | 'lat_d' | 'lat_i';

export type PointGroup =
  | 'p-frente' | 'p-nariz' | 'p-boca' | 'p-menton' | 'p-referencia'
  | 'fr-midline' | 'fr-eyes' | 'fr-nose' | 'fr-mouth' | 'fr-ears';

export interface PointDef {
  id: PointId;
  name: string;
  desc: string;
  color: string;
  group: PointGroup;
  mode: Mode;
  /** Punto NO obligatorio: no cuenta para el progreso, no lo elige el avance
   *  guiado ni lo produce la detección automática. Se coloca a mano solo si se
   *  necesita la medida que lo usa (p. ej. Nk → ángulo cervicomental). */
  optional?: boolean;
}

export const CEPH_POINTS: PointDef[] = [
  // ============ PERFIL (puntos blandos) ============
  { id: 'Tr',  mode: 'perfil', name: 'Trichion',     desc: 'Línea anterior de implantación capilar',           color: '#60a5fa', group: 'p-frente' },
  { id: 'G',   mode: 'perfil', name: 'Glabela',      desc: 'Punto más prominente entre las cejas',             color: '#4ade80', group: 'p-frente' },
  { id: 'N',   mode: 'perfil', name: 'Nasion',       desc: 'Punto más posterior de la raíz nasal (blando)',    color: '#a78bfa', group: 'p-nariz' },
  { id: 'Rh',  mode: 'perfil', name: 'Rhinion',      desc: 'Transición hueso-cartílago en el dorso nasal',     color: '#e879f9', group: 'p-nariz' },
  { id: 'Sp',  mode: 'perfil', name: 'Suprapunta',   desc: 'Punto más alto del lóbulo de la punta nasal (entre Rh y Pn)', color: '#f472b6', group: 'p-nariz' },
  { id: 'Pn',  mode: 'perfil', name: 'Pronasale',    desc: 'Punta de la nariz (pronasale)',                    color: '#fb7185', group: 'p-nariz' },
  { id: 'Cm',  mode: 'perfil', name: 'Columnela',    desc: 'Punto más prominente de la columela',              color: '#facc15', group: 'p-nariz' },
  { id: 'Sn',  mode: 'perfil', name: 'Subnasal',     desc: 'Base de la columela / inicio del filtrum',         color: '#fda4af', group: 'p-nariz' },
  { id: 'AC',  mode: 'perfil', name: 'Pliegue alar', desc: 'Alar Crease — unión del ala nasal con la mejilla',            color: '#38bdf8', group: 'p-nariz' },
  // Relación ala–columnela (Gunter)
  { id: 'A',   mode: 'perfil', name: 'Ala inferior (A)', desc: 'Punto más inferior del borde alar — Gunter "A"',          color: '#FF66AA', group: 'p-nariz' },
  { id: 'Ba',  mode: 'perfil', name: 'Eje narina ant. (Ba)', desc: 'Punto anterior del eje longitudinal de la narina',    color: '#e2e8f0', group: 'p-nariz' },
  { id: 'Bp',  mode: 'perfil', name: 'Eje narina post. (Bp)', desc: 'Punto posterior del eje longitudinal de la narina',  color: '#e2e8f0', group: 'p-nariz' },
  { id: 'Cb',  mode: 'perfil', name: 'Columnela inf. (C)', desc: 'Punto más inferior de la columnela — Gunter "C"',       color: '#FFCC00', group: 'p-nariz' },
  { id: 'Ls',  mode: 'perfil', name: 'Labio sup.',   desc: 'Labrale superius — borde bermellón labio sup.',    color: '#f9a8d4', group: 'p-boca' },
  { id: 'Li',  mode: 'perfil', name: 'Labio inf.',   desc: 'Labrale inferius — borde bermellón labio inf.',    color: '#c4b5fd', group: 'p-boca' },
  { id: 'Sl',  mode: 'perfil', name: 'Surco mentolab.', desc: 'Sublabial — punto más posterior surco mentolabial', color: '#fb923c', group: 'p-boca' },
  { id: 'Pog', mode: 'perfil', name: 'Pogonion',     desc: 'Punto más anterior del mentón (blando)',           color: '#34d399', group: 'p-menton' },
  { id: 'Me',  mode: 'perfil', name: 'Mentón',       desc: 'Punto más inferior del mentón (blando)',           color: '#22d3ee', group: 'p-menton' },
  { id: 'C',   mode: 'perfil', name: 'Cervical',     desc: 'Intersección cuello–submentón (vértice del ángulo cervicomental)', color: '#fcd34d', group: 'p-menton' },
  { id: 'Nk',  mode: 'perfil', name: 'Cuello',       desc: 'Punto del plano cervical bajo C, tangente al cuello — define el 2º lado del ángulo cervicomental', color: '#f97316', group: 'p-menton', optional: true },
  // Plano de Frankfort (referencia horizontal)
  { id: 'Po',  mode: 'perfil', name: 'Porion',       desc: 'Punto más alto del conducto auditivo externo',     color: '#7dd3fc', group: 'p-referencia' },
  { id: 'Or',  mode: 'perfil', name: 'Orbitale',     desc: 'Punto más bajo del reborde infraorbitario',        color: '#7dd3fc', group: 'p-referencia' },

  // ============ FRENTE — modelo antropométrico de Farkas (18 puntos) ============
  // Convenciones:
  //  - Sufijo _d = lado derecho del PACIENTE (izquierdo del espectador).
  //  - Sufijo _i = lado izquierdo del PACIENTE (derecho del espectador).
  //  - Puntos de línea media (tr, n, prn, sn, sto, gn) sin sufijo.
  // — Línea media —
  { id: 'tr',   mode: 'frente', name: 'Trichion (tr)',   desc: 'Punto medio del nacimiento del cabello',           color: '#60a5fa', group: 'fr-midline' },
  { id: 'g',    mode: 'frente', name: 'Glabela (g)',     desc: 'Punto más prominente de la frente en la línea media, entre las cejas', color: '#4ade80', group: 'fr-midline' },
  { id: 'n',    mode: 'frente', name: 'Nasion (n)',      desc: 'Punto medio entre ojos al nivel del hueso nasal',  color: '#a78bfa', group: 'fr-midline' },
  { id: 'prn',  mode: 'frente', name: 'Pronasal (prn)',  desc: 'Punto más prominente de la punta nasal',           color: '#fb7185', group: 'fr-midline' },
  { id: 'sn',   mode: 'frente', name: 'Subnasal (sn)',   desc: 'Punto donde la columnela se une al labio',         color: '#fda4af', group: 'fr-midline' },
  { id: 'sto',  mode: 'frente', name: 'Stomion (sto)',   desc: 'Punto medio entre labios cerrados',                color: '#f9a8d4', group: 'fr-midline' },
  { id: 'gn',   mode: 'frente', name: 'Gnation (gn)',    desc: 'Punto más inferior del mentón',                    color: '#fcd34d', group: 'fr-midline' },
  // — Cejas (límite tercio superior / medio) —
  { id: 'cb_d', mode: 'frente', name: 'Cabeza ceja D. (cb_d)', desc: 'Punto más medial de la ceja derecha, en su borde inferior', color: '#fcd34d', group: 'fr-eyes' },
  { id: 'cb_i', mode: 'frente', name: 'Cabeza ceja I. (cb_i)', desc: 'Punto más medial de la ceja izquierda, en su borde inferior', color: '#fcd34d', group: 'fr-eyes' },
  // — Ojos —
  { id: 'en_d', mode: 'frente', name: 'Endocantión D. (en_d)', desc: 'Canto interno del ojo derecho del paciente',  color: '#f87171', group: 'fr-eyes' },
  { id: 'en_i', mode: 'frente', name: 'Endocantión I. (en_i)', desc: 'Canto interno del ojo izquierdo del paciente', color: '#f87171', group: 'fr-eyes' },
  { id: 'ex_d', mode: 'frente', name: 'Exocantión D. (ex_d)',  desc: 'Canto externo del ojo derecho del paciente',  color: '#fb923c', group: 'fr-eyes' },
  { id: 'ex_i', mode: 'frente', name: 'Exocantión I. (ex_i)',  desc: 'Canto externo del ojo izquierdo del paciente', color: '#fb923c', group: 'fr-eyes' },
  { id: 'pu_d', mode: 'frente', name: 'Pupila D. (pu_d)',      desc: 'Centro de la pupila derecha',                 color: '#22d3ee', group: 'fr-eyes' },
  { id: 'pu_i', mode: 'frente', name: 'Pupila I. (pu_i)',      desc: 'Centro de la pupila izquierda',               color: '#22d3ee', group: 'fr-eyes' },
  // — Nariz —
  { id: 'al_d', mode: 'frente', name: 'Alar D. (al_d)',  desc: 'Punto más lateral del ala nasal derecha',         color: '#fdba74', group: 'fr-nose' },
  { id: 'al_i', mode: 'frente', name: 'Alar I. (al_i)',  desc: 'Punto más lateral del ala nasal izquierda',       color: '#fdba74', group: 'fr-nose' },
  // — Boca —
  { id: 'ch_d', mode: 'frente', name: 'Chelion D. (ch_d)', desc: 'Comisura derecha de la boca',                   color: '#34d399', group: 'fr-mouth' },
  { id: 'ch_i', mode: 'frente', name: 'Chelion I. (ch_i)', desc: 'Comisura izquierda de la boca',                 color: '#34d399', group: 'fr-mouth' },
  // — Orejas —
  { id: 't_d',  mode: 'frente', name: 'Tragion D. (t_d)', desc: 'Punto más anterior del trago de la oreja derecha', color: '#a78bfa', group: 'fr-ears' },
  { id: 't_i',  mode: 'frente', name: 'Tragion I. (t_i)', desc: 'Punto más anterior del trago de la oreja izquierda', color: '#a78bfa', group: 'fr-ears' },
  // — Contorno facial lateral (límites externos de los quintos) —
  { id: 'lat_d', mode: 'frente', name: 'Lateral D. (lat_d)', desc: 'Punto más externo del contorno facial derecho a nivel ocular (hélix/contorno)', color: '#88FF88', group: 'fr-ears' },
  { id: 'lat_i', mode: 'frente', name: 'Lateral I. (lat_i)', desc: 'Punto más externo del contorno facial izquierdo a nivel ocular (hélix/contorno)', color: '#88FF88', group: 'fr-ears' },
];

export const POINT_BY_ID: Record<PointId, PointDef> = CEPH_POINTS.reduce(
  (acc, p) => ({ ...acc, [p.id]: p }),
  {} as Record<PointId, PointDef>,
);

export function pointsForMode(mode: Mode): PointDef[] {
  return CEPH_POINTS.filter((p) => p.mode === mode);
}

// ============ Plantilla guía — posiciones canónicas ============
// Coordenadas relativas [0..1] dentro del bbox de la cara.
// Valores aproximados según cánones clásicos de proporción facial.

export const CANONICAL_PROFILE: Partial<Record<PointId, [number, number]>> = {
  // x: 0 = frente más adelantada (lado nariz), 1 = nuca (cuello/cervical)
  // y: 0 = top de cabeza, 1 = mentón
  Tr:  [0.50, 0.00],
  G:   [0.42, 0.18],
  N:   [0.34, 0.27],
  Rh:  [0.22, 0.35],
  Sp:  [0.10, 0.42],
  Pn:  [0.06, 0.45],
  Cm:  [0.16, 0.52],
  Sn:  [0.24, 0.58],
  AC:  [0.30, 0.55],
  // Relación ala–columnela: Ba/Bp = eje de la narina (anterior–posterior),
  // A = ala más bajo, Cb = columnela más bajo.
  Ba:  [0.20, 0.56],
  Bp:  [0.32, 0.54],
  A:   [0.27, 0.61],
  Cb:  [0.18, 0.60],
  Ls:  [0.26, 0.66],
  Li:  [0.30, 0.76],
  Sl:  [0.36, 0.82],
  Pog: [0.30, 0.90],
  Me:  [0.36, 0.98],
  C:   [0.65, 0.97],
  Nk:  [0.55, 1.12],
  // Plano de Frankfort: Po (post-superior, oreja) y Or (medio-cara)
  Po:  [0.92, 0.40],
  Or:  [0.50, 0.40],
};

export const CANONICAL_FRONTAL: Partial<Record<PointId, [number, number]>> = {
  // Línea media
  tr:   [0.50, 0.00],
  g:    [0.50, 0.33],
  n:    [0.50, 0.40],
  prn:  [0.50, 0.56],
  sn:   [0.50, 0.64],
  sto:  [0.50, 0.78],
  gn:   [0.50, 1.00],
  // Cejas (cabezas — límite T. superior / T. medio)
  cb_d: [0.42, 0.34],
  cb_i: [0.58, 0.34],
  // Ojos (pares — _d = derecha del paciente = izquierda del observador)
  ex_d: [0.20, 0.40],
  en_d: [0.40, 0.40],
  en_i: [0.60, 0.40],
  ex_i: [0.80, 0.40],
  pu_d: [0.30, 0.41],
  pu_i: [0.70, 0.41],
  // Nariz
  al_d: [0.42, 0.60],
  al_i: [0.58, 0.60],
  // Boca
  ch_d: [0.40, 0.78],
  ch_i: [0.60, 0.78],
  // Orejas
  t_d:  [0.05, 0.43],
  t_i:  [0.95, 0.43],
  // Contorno facial lateral a nivel ocular (más externo que el trago)
  lat_d: [0.02, 0.40],
  lat_i: [0.98, 0.40],
};

// ============ Líneas estéticas (PERFIL — tejidos blandos) ============
export interface LineDef {
  id: string;
  label: string;
  from: PointId;
  to: PointId;
  color: string;
  dashed?: boolean;
  mode: Mode;
}

export const STANDARD_LINES: LineDef[] = [
  // Líneas estéticas clásicas del perfil blando
  { id: 'E',      mode: 'perfil', label: 'Línea E (Ricketts: Pn–Pog)',     from: 'Pn',  to: 'Pog', color: '#60a5fa' },
  { id: 'S',      mode: 'perfil', label: 'Línea S (Steiner: Cm–Pog)',      from: 'Cm',  to: 'Pog', color: '#a78bfa' },
  { id: 'Riedel', mode: 'perfil', label: 'Línea de Riedel (N–Pog)',        from: 'N',   to: 'Pog', color: '#fb7185' },
  { id: 'NSn',    mode: 'perfil', label: 'Eje nasal (N–Sn)',               from: 'N',   to: 'Sn',  color: '#4ade80', dashed: true },
  { id: 'NLs',    mode: 'perfil', label: 'Aux: N–Ls',                      from: 'N',   to: 'Ls',  color: '#fdba74', dashed: true },
  { id: 'MeC',    mode: 'perfil', label: 'Plano submentoniano (Me–C)',     from: 'Me',  to: 'C',   color: '#facc15' },
];

export function linesForMode(mode: Mode): LineDef[] {
  return STANDARD_LINES.filter((l) => l.mode === mode);
}

// ============ Guías de análisis (FRENTE) ============
export interface FrontalGuide {
  id: string;
  label: string;
  color: string;
  defaultVisible: boolean;
}

export const FRONTAL_GUIDES: FrontalGuide[] = [
  { id: 'thirds',               label: 'Tercios verticales (tr/cejas/sn/gn)', color: '#60a5fa', defaultVisible: true },
  { id: 'fifths',               label: 'Quintos faciales (6 verticales)', color: '#88FF88', defaultVisible: true },
  { id: 'pupil-line',           label: 'Línea bipupilar',                 color: '#22d3ee', defaultVisible: false },
  { id: 'midline-intercanthal', label: 'Línea media intercantal (vertical)', color: '#44CCFF', defaultVisible: true },
  { id: 'midline-labial',       label: 'Línea media labial (vertical)',      color: '#FFCC00', defaultVisible: true },
  { id: 'ref-horizontal',       label: 'Refs. horizontales (ex/al/ch)',   color: '#7dd3fc', defaultVisible: true },
  { id: 'symmetry-marks',       label: 'Marcas de simetría',              color: '#facc15', defaultVisible: false },
];

// Guías especiales del PERFIL (líneas verticales de referencia)
export const PROFILE_GUIDES: FrontalGuide[] = [
  { id: 'zero-meridian',  label: 'Vertical por N (cero meridiano)',  color: '#22d3ee', defaultVisible: true },
  { id: 'thirds-profile', label: 'Tercios verticales (Tr-G-Sn-Me)',   color: '#60a5fa', defaultVisible: true },
  { id: 'frankfort',      label: 'Línea de Frankfort (Po–Or)',        color: '#7dd3fc', defaultVisible: true },
  { id: 'goode',          label: 'Triángulo Goode (N–Pn–AC)',         color: '#fb923c', defaultVisible: true },
  { id: 'alar-columellar', label: 'Relación ala–columnela (eje Ba–Bp)', color: '#FF66AA', defaultVisible: true },
  { id: 'profile-contour', label: 'Contorno real del perfil (auto)',    color: '#2DE6C8', defaultVisible: true },
  { id: 'contour-anchors', label: 'Puntos de ajuste del contorno (◇)',  color: '#2DE6C8', defaultVisible: true },
];

// ============ Medidas angulares — PERFILOMETRÍA BLANDA ============
export interface AngleMeasure {
  id: string;
  label: string;
  desc: string;
  points: [PointId, PointId, PointId]; // a, vertex, b
  ideal: number;
  tolerance: number;
}

export const ANGLE_MEASURES: AngleMeasure[] = [
  { id: 'nasolabial',  label: 'Ángulo nasolabial',
    desc: 'Inclinación columela-labio superior (Cm–Sn–Ls)',
    points: ['Cm', 'Sn', 'Ls'], ideal: 100, tolerance: 10 },
  { id: 'nasofrontal', label: 'Ángulo nasofrontal',
    desc: 'Transición frente-dorso nasal (G–N–Pn)',
    points: ['G', 'N', 'Pn'],   ideal: 125, tolerance: 8 },
  { id: 'mentolabial', label: 'Ángulo mentolabial',
    desc: 'Profundidad del surco mentolabial (Li–Sl–Pog)',
    points: ['Li', 'Sl', 'Pog'],ideal: 120, tolerance: 10 },
  { id: 'nasomental', label: 'Ángulo nasomental',
    desc: 'Dorso nasal vs línea punta–mentón — ángulo más importante del triángulo de Powell (N–Pn–Pog)',
    points: ['N', 'Pn', 'Pog'], ideal: 126, tolerance: 6 },
  // El ángulo nasofacial NO está aquí: es un ángulo recta–recta (plano facial
  // G–Pog vs dorso N–Pn), no un ángulo de 3 puntos con vértice. Se calcula
  // aparte con nasofacialAngle() y se renderiza como caso especial (igual que
  // el ángulo facial vs Frankfort).
  { id: 'cervicoment', label: 'Ángulo cervicomental',
    desc: 'Ángulo en C entre el plano submentoniano (C–Me) y el plano cervical (C–Nk)',
    points: ['Me', 'C', 'Nk'], ideal: 105, tolerance: 15 },
];

// ============ Tercios faciales — genérico ============
export function computeThirds(
  pTop: Pt | undefined,
  pMid1: Pt | undefined,
  pMid2: Pt | undefined,
  pBottom: Pt | undefined,
): null | {
  upper: number; middle: number; lower: number; total: number;
  ratios: [number, number, number];
} {
  if (!pTop || !pMid1 || !pMid2 || !pBottom) return null;
  const upper  = Math.abs(pMid1.y - pTop.y);
  const middle = Math.abs(pMid2.y - pMid1.y);
  const lower  = Math.abs(pBottom.y - pMid2.y);
  const total  = upper + middle + lower;
  if (!total) return null;
  return { upper, middle, lower, total, ratios: [upper / total, middle / total, lower / total] };
}

// ============ Proyección nasal — Método Goode completo ============
/** Resultado del método de Goode clásico:
 *  - nasalLength: distancia Nasion → Pronasale (longitud de la nariz)
 *  - baseLine:    distancia Nasion → Pliegue alar (línea base nasal)
 *  - projection:  distancia perpendicular desde Pn hasta la recta N–AC
 *  - foot:        pie de la perpendicular sobre la recta N–AC
 *  - ratio:       projection / nasalLength (ideal 0.55–0.60)
 */
export interface GoodeProjection {
  nasalLength: number;
  baseLine: number;
  projection: number;
  foot: Pt;
  ratio: number;
}

export function goodeNasalProjection(points: PointsMap): GoodeProjection | null {
  const N = points.N, Pn = points.Pn, AC = points.AC;
  if (!N || !Pn || !AC) return null;
  const nasalLength = distance(N, Pn);
  const baseLine    = distance(N, AC);
  if (!nasalLength || !baseLine) return null;
  // Pie de la perpendicular desde Pn sobre la recta infinita N–AC
  const dx = AC.x - N.x, dy = AC.y - N.y;
  const len2 = dx * dx + dy * dy;
  const t = ((Pn.x - N.x) * dx + (Pn.y - N.y) * dy) / len2;
  const foot = { x: N.x + t * dx, y: N.y + t * dy };
  const projection = distance(Pn, foot);
  return { nasalLength, baseLine, projection, foot, ratio: projection / nasalLength };
}

/** Clasificación del resultado de Goode. */
export type GoodeVerdict = 'subproyectada' | 'adecuada' | 'sobreproyectada' | 'muted';
export function goodeVerdict(ratio: number | null | undefined): GoodeVerdict {
  if (ratio == null || !isFinite(ratio)) return 'muted';
  if (ratio < 0.55) return 'subproyectada';
  if (ratio > 0.60) return 'sobreproyectada';
  return 'adecuada';
}

// ============ Relación ala–columnela — Clasificación de Gunter ============
/** Mide las distancias perpendiculares desde A (ala inferior) y Cb (columnela
 *  inferior) al EJE LONGITUDINAL DE LA NARINA definido por la línea Ba–Bp.
 *
 *  Convención de signo: positivo = punto POR DEBAJO del eje (en sentido Y+
 *  del canvas, es decir, abajo en la foto); negativo = por encima del eje.
 *  El valor "show" se reporta como (cb − ab) signado:
 *    - positivo  →  columnela visible bajo el ala
 *    - negativo  →  columnela oculta tras el ala
 */
export interface AlarColumellarRelation {
  A: Pt;
  Ba: Pt;
  Bp: Pt;
  Cb: Pt;
  footA: Pt;          // pie de la perpendicular desde A sobre Ba–Bp
  footCb: Pt;         // pie de la perpendicular desde Cb sobre Ba–Bp
  abSignedPx: number; // dist. perp. signada A → Ba–Bp
  cbSignedPx: number; // dist. perp. signada Cb → Ba–Bp
  showSignedPx: number; // cbSignedPx - abSignedPx
}

export function alarColumellarRelation(points: PointsMap): AlarColumellarRelation | null {
  const A = points.A, Ba = points.Ba, Bp = points.Bp, Cb = points.Cb;
  if (!A || !Ba || !Bp || !Cb) return null;
  const dx = Bp.x - Ba.x, dy = Bp.y - Ba.y;
  const len2 = dx * dx + dy * dy;
  if (!len2) return null;
  // Normal del eje, orientada hacia "abajo" en la foto (Y+).
  // (rotación 90° y volteo si quedó apuntando hacia arriba)
  let nx = -dy, ny = dx;
  if (ny < 0) { nx = -nx; ny = -ny; }
  const nLen = Math.hypot(nx, ny);
  const signedPerp = (pt: Pt) =>
    ((pt.x - Ba.x) * nx + (pt.y - Ba.y) * ny) / nLen;
  const foot = (pt: Pt) => {
    const t = ((pt.x - Ba.x) * dx + (pt.y - Ba.y) * dy) / len2;
    return { x: Ba.x + t * dx, y: Ba.y + t * dy };
  };
  const abSignedPx = signedPerp(A);
  const cbSignedPx = signedPerp(Cb);
  return {
    A, Ba, Bp, Cb,
    footA: foot(A),
    footCb: foot(Cb),
    abSignedPx, cbSignedPx,
    showSignedPx: cbSignedPx - abSignedPx,
  };
}

/** Tipos de la clasificación de Gunter para la relación ala–columnela. */
export type GunterType = 'normal' | 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'muted';

/** Clasifica usando AB y BC en milímetros (distancias perpendiculares signadas
 *  al eje Ba–Bp, convención positivo = por debajo del eje).
 *
 *  Anatómicamente, en una relación normal el borde alar (A) queda POR ENCIMA del
 *  eje (AB negativo) y la columnela (Cb) POR DEBAJO (BC positivo). El "show
 *  columelar" es la separación vertical entre ambos: show = BC − AB, con valor
 *  normal de 1–4 mm.
 *
 *  La clasificación parte del show total: si es normal → 'normal'. Si es
 *  excesivo (>4) hay columnela colgante (I) y/o ala retraída (II); si es
 *  insuficiente (<1) hay ala colgante (IV) y/o columnela retraída (V). Las
 *  combinaciones dan III y VI. */
export function classifyGunter(
  abMm: number | null | undefined,
  cbMm: number | null | undefined,
): GunterType {
  if (abMm == null || cbMm == null || !isFinite(abMm) || !isFinite(cbMm)) return 'muted';
  const SHOW_MIN = 1, SHOW_MAX = 4;
  const A_FAR = 2;   // |AB| > 2 mm ⇒ ala alejada del eje (retraída/elevada)
  const C_FAR = 2;   // |BC| > 2 mm ⇒ columnela alejada del eje (colgante)
  // El show se redondea a 1 decimal (igual que se muestra en pantalla) para que
  // un valor mostrado como "+4.0 mm" nunca se clasifique como anormal por un
  // residuo de redondeo (p. ej. 4.03 mm interno).
  const show = Math.round((cbMm - abMm) * 10) / 10;
  const aMag = Math.abs(abMm);
  const cMag = Math.abs(cbMm);

  // 1) Show columelar dentro de lo normal → relación armónica.
  //    El show total manda: si está en rango, NO se reporta ninguna anomalía
  //    aunque AB o BC individuales se desvíen un poco.
  if (show >= SHOW_MIN && show <= SHOW_MAX) return 'normal';

  // 2) Show EXCESIVO (> 4 mm): columnela colgante y/o ala retraída
  if (show > SHOW_MAX) {
    const colHanging   = cMag > C_FAR;   // columnela demasiado por debajo del eje
    const alaRetracted = aMag > A_FAR;   // ala demasiado por encima del eje
    if (colHanging && alaRetracted) return 'III';
    if (colHanging) return 'I';
    if (alaRetracted) return 'II';
    // Show excesivo sin culpable claro → atribuir al componente más alejado
    return cMag >= aMag ? 'I' : 'II';
  }

  // 3) Show INSUFICIENTE (< 1 mm): ala colgante y/o columnela retraída
  const alaHanging   = abMm > -1;   // ala baja hacia/por debajo del eje (tapa)
  const colRetracted = cbMm <  1;   // columnela sube hacia/por encima del eje
  if (alaHanging && colRetracted) return 'VI';
  if (alaHanging) return 'IV';
  if (colRetracted) return 'V';
  return 'muted';
}

export interface GunterDescriptor { name: string; short: string; desc: string; }

const GUNTER_INFO: Record<GunterType, GunterDescriptor> = {
  normal: {
    name: 'Relación normal',
    short: 'Normal',
    desc: 'Relación ala-columnela normal. El borde alar y la columnela están en armonía, con 1-4 mm de columnela visible en vista de perfil.',
  },
  I: {
    name: 'Tipo I — Columnela colgante',
    short: 'Tipo I',
    desc: 'Columnela colgante. La columnela desciende por debajo del borde alar más de 2 mm. El ala está en posición normal.',
  },
  II: {
    name: 'Tipo II — Ala retraída',
    short: 'Tipo II',
    desc: 'Ala retraída. El borde alar asciende exponiendo exceso de columnela. La columnela está en posición normal.',
  },
  III: {
    name: 'Tipo III — Combinación I + II',
    short: 'Tipo III',
    desc: 'Combinación de columnela colgante y ala retraída. Ambos componentes contribuyen al exceso de show columelar.',
  },
  IV: {
    name: 'Tipo IV — Ala colgante',
    short: 'Tipo IV',
    desc: 'Ala colgante. El borde alar desciende cubriendo la columnela. La columnela queda oculta o poco visible.',
  },
  V: {
    name: 'Tipo V — Columnela retraída',
    short: 'Tipo V',
    desc: 'Columnela retraída. La columnela asciende quedando por encima del borde alar.',
  },
  VI: {
    name: 'Tipo VI — Combinación IV + V',
    short: 'Tipo VI',
    desc: 'Combinación de ala colgante y columnela retraída. Ambos componentes ocultan la columnela.',
  },
  muted: { name: '—', short: '—', desc: '' },
};

export function gunterInfo(t: GunterType): GunterDescriptor { return GUNTER_INFO[t]; }

// ============ Plano de Frankfort — ángulo del plano facial ============
/** Ángulo agudo entre la línea de Frankfort (Po–Or) y el plano facial
 *  blando (G–Pog). Valor de referencia: 90° (plano facial perpendicular al
 *  plano de Frankfort = cara recta). Desviaciones indican retrusión/protrusión
 *  general de la mandíbula respecto al cráneo. */
export function frankfortFacialAngle(points: PointsMap): number | null {
  const Po = points.Po, Or = points.Or, G = points.G, Pog = points.Pog;
  if (!Po || !Or || !G || !Pog) return null;
  return angleBetweenLines(Po, Or, G, Pog);
}

// ============ Ángulo nasofacial ============
// Ángulo agudo entre el PLANO FACIAL blando (Glabela → Pogonion) y el DORSO
// NASAL (Nasion → Pronasale). Es una de las medidas del triángulo estético de
// Powell-Humphreys. Normal ≈ 30–42° (ideal 36°). Requiere G, Pog, N, Pn.
// Es recta–recta (las dos líneas no comparten vértice), por eso usa
// angleBetweenLines y no la estructura de 3 puntos de ANGLE_MEASURES.
export const NASOFACIAL_IDEAL = 36;
export const NASOFACIAL_TOL = 6;
export function nasofacialAngle(points: PointsMap): number | null {
  const G = points.G, Pog = points.Pog, N = points.N, Pn = points.Pn;
  if (!G || !Pog || !N || !Pn) return null;
  return angleBetweenLines(G, Pog, N, Pn);
}

// ============ Rotación de punta por plano de Frankfort ============
// Inclinación de la columela (Sn→Cm) respecto al plano de Frankfort horizontal
// (Po–Or). Cm es el punto MÁS PROMINENTE (anterior) de la columela, así que la
// línea Sn→Cm es horizontal-ascendente: su ángulo agudo con Frankfort es la
// rotación de la punta. Columela paralela a Frankfort = 0°; una punta más
// respingada la inclina hacia arriba → más grados. Normal 0–30° (0–15° hombre ·
// 15–30° mujer; aquí rango único). Requiere Po, Or, Sn, Cm.
export const TIPROT_IDEAL = 15;
export const TIPROT_TOL = 15;   // ideal 15 ± 15 = rango 0–30°
export function frankfortTipRotation(points: PointsMap): number | null {
  const Po = points.Po, Or = points.Or, Sn = points.Sn, Cm = points.Cm;
  if (!Po || !Or || !Sn || !Cm) return null;
  return angleBetweenLines(Po, Or, Sn, Cm);
}

// ============ Proyección del mentón (cero meridiano González-Ulloa) ============
/** Distancia de Pog a la línea por N (nasión) PERPENDICULAR al plano de
 *  Frankfort. Signo positivo = mentón proyecta hacia adelante.
 *
 *  CORRECCIÓN 2026-07-20 (dos pasos, ambos reportados/pedidos por el usuario
 *  clínico): la versión original medía contra la vertical por Sn pese a
 *  etiquetarse cero meridiano — el cero meridiano de González-Ulloa se define
 *  desde NASIÓN (la vertical por Sn es otra referencia, la línea vertical
 *  verdadera de Arnett). Después, la referencia pasó de la vertical de PANTALLA
 *  a la perpendicular REAL a Frankfort, para que la medida no dependa de la
 *  inclinación de la foto.
 *
 *  Sistema de referencia: px de imagen. Con Po y Or, la dirección anterior de
 *  Frankfort es el unitario Po→Or (Or es siempre anterior a Po, así que no
 *  hace falta Pn para orientar) y la medida es la proyección escalar de N→Pog
 *  sobre él — invariante a la rotación de la imagen. Sin Po/Or se degrada al
 *  método anterior: vertical de pantalla por N con orientación por Pn (válido
 *  solo con la foto enderezada a Frankfort; el botón Auto lo hace). */
export function chinProjectionSigned(
  N: Pt | undefined, Pog: Pt | undefined, Pn: Pt | undefined,
  Po?: Pt, Or?: Pt,
): number | null {
  if (!N || !Pog) return null;
  if (Po && Or) {
    const dx = Or.x - Po.x, dy = Or.y - Po.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) return ((Pog.x - N.x) * dx + (Pog.y - N.y) * dy) / len;
  }
  if (!Pn) return null;
  // Fallback: orientación del perfil mirando si Pn está a la izda o dcha de N
  const faceDir = Math.sign(N.x - Pn.x) || 1;
  return (N.x - Pog.x) * faceDir;
}

// ============ Frente — proporciones ============
export interface RatioMeasure {
  id: string;
  label: string;
  desc: string;
  num: [PointId, PointId];
  den: [PointId, PointId];
  ideal: number;
  tolerance: number;
}

export const FRONTAL_RATIOS: RatioMeasure[] = [
  {
    id: 'nasal-intercanthal',
    label: 'Ancho nasal / Intercantal',
    desc: 'al_d–al_i ÷ en_d–en_i (ideal ≈ 1.0)',
    num: ['al_d', 'al_i'], den: ['en_d', 'en_i'],
    ideal: 1.0, tolerance: 0.10,
  },
  {
    id: 'mouth-interpupillary',
    label: 'Ancho bucal / Interpupilar',
    desc: 'ch_d–ch_i ÷ pu_d–pu_i (Powell, ideal ≈ 0.72)',
    num: ['ch_d', 'ch_i'], den: ['pu_d', 'pu_i'],
    ideal: 0.72, tolerance: 0.07,
  },
];

export interface SymmetryPair {
  id: string;
  label: string;
  right: PointId;
  left: PointId;
}

export const SYMMETRY_PAIRS: SymmetryPair[] = [
  { id: 'sym-Ex',  label: 'Cantos externos',  right: 'ex_d', left: 'ex_i' },
  { id: 'sym-En',  label: 'Cantos internos',  right: 'en_d', left: 'en_i' },
  { id: 'sym-Pup', label: 'Pupilas',          right: 'pu_d', left: 'pu_i' },
  { id: 'sym-Al',  label: 'Alas nasales',     right: 'al_d', left: 'al_i' },
  { id: 'sym-Ch',  label: 'Comisuras',        right: 'ch_d', left: 'ch_i' },
  { id: 'sym-Tr',  label: 'Tragiones',        right: 't_d',  left: 't_i'  },
];

// ============ Utilidades geométricas ============
export type Pt = { x: number; y: number };
export type PointsMap = Partial<Record<PointId, Pt>>;

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
export function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function angle3pt(a: Pt, vertex: Pt, b: Pt): number {
  const v1x = a.x - vertex.x, v1y = a.y - vertex.y;
  const v2x = b.x - vertex.x, v2y = b.y - vertex.y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (!m1 || !m2) return NaN;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (m1 * m2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function angleBetweenLines(a1: Pt, a2: Pt, b1: Pt, b2: Pt): number {
  const ang = (p: Pt, q: Pt) => Math.atan2(q.y - p.y, q.x - p.x);
  const diff = Math.abs(ang(a1, a2) - ang(b1, b2)) * 180 / Math.PI;
  const norm = diff % 180;
  return norm > 90 ? 180 - norm : norm;
}

export function pointLineSignedDistance(p: Pt, origin: Pt, dir: Pt): number {
  const dx = p.x - origin.x, dy = p.y - origin.y;
  const cross = dx * dir.y - dy * dir.x;
  const len = Math.hypot(dir.x, dir.y);
  return len ? cross / len : 0;
}

export type DeviationLevel = 'ok' | 'warn' | 'error' | 'muted';

export function evaluate(value: number | null, ideal: number, tolerance: number): DeviationLevel {
  if (value == null || isNaN(value)) return 'muted';
  const delta = Math.abs(value - ideal);
  if (delta <= tolerance) return 'ok';
  if (delta <= tolerance * 2) return 'warn';
  return 'error';
}

// ============ Frente — cálculos auxiliares ============

// ============ Quintos faciales — 6 verticales / 5 quintos ============
// Delimitados por: lat_d · ex_d · en_d · en_i · ex_i · lat_i
// Ideal: cada quinto ≈ 20 % del ancho facial total (lat_d → lat_i).
export interface FifthsResult {
  /** Anchuras de los 5 quintos, de derecha (paciente) a izquierda:
   *  [lat_d–ex_d, ex_d–en_d, en_d–en_i, en_i–ex_i, ex_i–lat_i] */
  widths: [number, number, number, number, number];
  /** Proporción de cada quinto sobre el total [0..1]. */
  ratios: [number, number, number, number, number];
  total: number;
  /** Las 6 coordenadas X de las verticales, en el mismo orden. */
  xs: [number, number, number, number, number, number];
}

export function computeFifths(points: PointsMap): FifthsResult | null {
  const seq = [
    points['lat_d'], points['ex_d'], points['en_d'],
    points['en_i'],  points['ex_i'], points['lat_i'],
  ];
  if (seq.some((p) => !p)) return null;
  const xs = seq.map((p) => p!.x) as FifthsResult['xs'];
  const widths = [0, 1, 2, 3, 4].map((i) => Math.abs(xs[i + 1] - xs[i])) as FifthsResult['widths'];
  const total = widths.reduce((s, w) => s + w, 0);
  if (!total) return null;
  const ratios = widths.map((w) => w / total) as FifthsResult['ratios'];
  return { widths, ratios, total, xs };
}

export const FIFTH_LABELS: [string, string, string, string, string] = [
  'Lateral D. (lat_d–ex_d)',
  'Ojo D. (ex_d–en_d)',
  'Central (en_d–en_i)',
  'Ojo I. (en_i–ex_i)',
  'Lateral I. (ex_i–lat_i)',
];

export function intercanthalMidline(points: PointsMap): null | { mid: Pt; foot: Pt; dir: Pt } {
  const enR = points['en_d'], enL = points['en_i'], me = points['gn'];
  if (!enR || !enL || !me) return null;
  const mid = midpoint(enR, enL);
  const dx = enL.x - enR.x, dy = enL.y - enR.y;
  let nx = -dy, ny = dx;
  if (ny < 0) { nx = -nx; ny = -ny; }
  if (Math.abs(ny) < 1e-6) return { mid, foot: { x: mid.x, y: me.y }, dir: { x: 0, y: 1 } };
  const t = (me.y - mid.y) / ny;
  return { mid, foot: { x: mid.x + t * nx, y: me.y }, dir: { x: nx, y: ny } };
}

export function labialMidline(points: PointsMap): null | { from: Pt; foot: Pt; dir: Pt } {
  const sto = points['sto'], gn = points['gn'];
  if (!sto || !gn) return null;
  const dx = gn.x - sto.x, dy = gn.y - sto.y;
  if (Math.abs(dy) < 1e-6) return { from: sto, foot: { x: sto.x, y: gn.y }, dir: { x: 0, y: 1 } };
  const t = (gn.y - sto.y) / dy;
  return { from: sto, foot: { x: sto.x + t * dx, y: gn.y }, dir: { x: dx, y: dy } };
}

export function midlineDeviation(points: PointsMap): null | {
  intercanthal: Pt; labial: Pt; deltaPx: number;
} {
  const im = intercanthalMidline(points);
  const lm = labialMidline(points);
  if (!im || !lm) return null;
  return { intercanthal: im.foot, labial: lm.foot, deltaPx: Math.abs(im.foot.x - lm.foot.x) };
}

// ============ Verticales puras: ojos vs labios ============

/** X del midpoint intercantal (eje vertical "centro de los ojos"). */
export function intercanthalMidpointX(points: PointsMap): number | null {
  const enR = points.en_d, enL = points.en_i;
  if (!enR || !enL) return null;
  return (enR.x + enL.x) / 2;
}

/** X del midpoint labial. Prioriza el stomion (centro de la línea dental
 *  Farkas); si no hay, cae a midpoint(ch_d, ch_i). */
export function lipMidpointX(points: PointsMap): number | null {
  if (points.sto) return points.sto.x;
  const chR = points.ch_d, chL = points.ch_i;
  if (chR && chL) return (chR.x + chL.x) / 2;
  return null;
}

/** Desviación signada de la vertical labial respecto a la vertical intercantal.
 *  Positivo = labios desviados a la izquierda del observador (lado anatómico
 *  izquierdo del paciente). */
export function lipVsEyeVerticalDeviation(points: PointsMap): number | null {
  const xEye = intercanthalMidpointX(points);
  const xLip = lipMidpointX(points);
  if (xEye == null || xLip == null) return null;
  return xLip - xEye;
}

// ============ Línea de cabezas de ceja (cb_d–cb_i) ============
/** Punto medio de la línea que une las cabezas de ceja. Define el límite
 *  entre el tercio superior y el tercio medio de la cara en el modo frente. */
export function browLineMid(points: PointsMap): Pt | null {
  const d = points.cb_d, i = points.cb_i;
  if (!d || !i) return null;
  return midpoint(d, i);
}

/** Tercios faciales frontales: tr → línea cb_d–cb_i → sn → gn. */
export function frontalThirds(points: PointsMap) {
  return computeThirds(points.tr, browLineMid(points) ?? undefined, points.sn, points.gn);
}

// ============================================================
//  FARKAS — Análisis antropométrico frontal de 18 puntos
//  Devuelve todas las medidas en píxeles. El consumidor multiplica
//  por mmPerPx para obtener mm.
// ============================================================

/** Una medida bilateral (derecha + izquierda) en mismas unidades. */
export interface BilateralMeasure { right: number | null; left: number | null; }

export interface FarkasMeasurements {
  // Globales
  faceHeight:     number | null;   // tr–gn
  noseHeightMid:  number | null;   // n–sn
  noseHeight:     number | null;   // n–prn
  mouthHeight:    number | null;   // sto–gn
  interEndoCanth: number | null;   // en_d–en_i
  interExoCanth:  number | null;   // ex_d–ex_i
  biauricular:    number | null;   // t_d–t_i
  noseWidth:      number | null;   // al_d–al_i
  mouthWidth:     number | null;   // ch_d–ch_i
  // Simétricas (bilateral)
  palpebralWidth:    BilateralMeasure; // en–ex de cada ojo
  eyeSlant:          BilateralMeasure; // ángulo hendidura palpebral vs horizontal (grados)
  pronasalAlar:      BilateralMeasure; // prn–al
  stomionChelion:    BilateralMeasure; // sto–ch
  oculoOtoNasal:     BilateralMeasure; // ángulo t–en–al (grados)
  nasoOcularExterno: BilateralMeasure; // ángulo al–n–ex (grados)
  eyeSeparationAng:  BilateralMeasure; // ángulo entre eje pupilar y línea media (grados)
  nasoBuccalAng:     BilateralMeasure; // ángulo al–sn–ch (grados)
  pupilToMidline:    BilateralMeasure; // distancia horizontal pupila ↔ línea media
  pupilSubnasal:     BilateralMeasure; // pu–sn (distancia)
}

/** Líneas medias verticales para referencia (en píxeles, eje X). */
export interface FarkasMidlines { xEye: number | null; xLip: number | null; }
export function farkasMidlines(points: PointsMap): FarkasMidlines {
  return { xEye: intercanthalMidpointX(points), xLip: lipMidpointX(points) };
}

function angleHorizontalDeg(a: Pt, b: Pt): number {
  // Ángulo agudo (0–90°) de la línea a→b respecto a la horizontal de la imagen.
  const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  let v = ((ang % 180) + 180) % 180;   // [0, 180)
  if (v > 90) v = 180 - v;             // pliega a [0, 90]
  return v;
}

function maybeDist(a?: Pt, b?: Pt): number | null {
  if (!a || !b) return null;
  return distance(a, b);
}

function maybeAngle3(a?: Pt, v?: Pt, b?: Pt): number | null {
  if (!a || !v || !b) return null;
  const r = angle3pt(a, v, b);
  return isNaN(r) ? null : r;
}

export function farkasMeasurements(points: PointsMap): FarkasMeasurements {
  const p = points;
  // ----- Globales -----
  const faceHeight     = maybeDist(p.tr, p.gn);
  const noseHeightMid  = maybeDist(p.n,  p.sn);
  const noseHeight     = maybeDist(p.n,  p.prn);
  const mouthHeight    = maybeDist(p.sto, p.gn);
  const interEndoCanth = maybeDist(p.en_d, p.en_i);
  const interExoCanth  = maybeDist(p.ex_d, p.ex_i);
  const biauricular    = maybeDist(p.t_d,  p.t_i);
  const noseWidth      = maybeDist(p.al_d, p.al_i);
  const mouthWidth     = maybeDist(p.ch_d, p.ch_i);

  // ----- Bilaterales -----
  const palpebralWidth: BilateralMeasure = {
    right: maybeDist(p.en_d, p.ex_d),
    left:  maybeDist(p.en_i, p.ex_i),
  };
  const eyeSlant: BilateralMeasure = {
    right: p.en_d && p.ex_d ? angleHorizontalDeg(p.en_d, p.ex_d) : null,
    left:  p.en_i && p.ex_i ? angleHorizontalDeg(p.en_i, p.ex_i) : null,
  };
  const pronasalAlar: BilateralMeasure = {
    right: maybeDist(p.prn, p.al_d),
    left:  maybeDist(p.prn, p.al_i),
  };
  const stomionChelion: BilateralMeasure = {
    right: maybeDist(p.sto, p.ch_d),
    left:  maybeDist(p.sto, p.ch_i),
  };
  // Ángulo óculo-oto-nasal: t–en–al (vértice en en)
  const oculoOtoNasal: BilateralMeasure = {
    right: maybeAngle3(p.t_d, p.en_d, p.al_d),
    left:  maybeAngle3(p.t_i, p.en_i, p.al_i),
  };
  // Ángulo naso-ocular externo: al–n–ex (vértice en n)
  const nasoOcularExterno: BilateralMeasure = {
    right: maybeAngle3(p.al_d, p.n, p.ex_d),
    left:  maybeAngle3(p.al_i, p.n, p.ex_i),
  };
  // Ángulo de separación: ángulo entre el eje pupilar (pu_d → pu_i)
  // y la línea media (n → gn / o vertical pura) — devuelto como agudo.
  let eyeSepR: number | null = null, eyeSepL: number | null = null;
  if (p.pu_d && p.pu_i && p.n && p.gn) {
    const midDeg = Math.atan2(p.gn.y - p.n.y, p.gn.x - p.n.x) * 180 / Math.PI;
    const pupR   = Math.atan2(p.pu_d.y - p.n.y, p.pu_d.x - p.n.x) * 180 / Math.PI;
    const pupL   = Math.atan2(p.pu_i.y - p.n.y, p.pu_i.x - p.n.x) * 180 / Math.PI;
    const fold = (v: number) => { let x = Math.abs(v) % 180; if (x > 90) x = 180 - x; return x; };
    eyeSepR = fold(pupR - midDeg);
    eyeSepL = fold(pupL - midDeg);
  }
  const eyeSeparationAng: BilateralMeasure = { right: eyeSepR, left: eyeSepL };
  // Ángulo naso-bucal: al–sn–ch (vértice en sn)
  const nasoBuccalAng: BilateralMeasure = {
    right: maybeAngle3(p.al_d, p.sn, p.ch_d),
    left:  maybeAngle3(p.al_i, p.sn, p.ch_i),
  };
  // Distancia pupila ↔ eje cara (vertical por midpoint intercantal)
  let pmR: number | null = null, pmL: number | null = null;
  const xMid = intercanthalMidpointX(p);
  if (xMid != null) {
    if (p.pu_d) pmR = Math.abs(p.pu_d.x - xMid);
    if (p.pu_i) pmL = Math.abs(p.pu_i.x - xMid);
  }
  const pupilToMidline: BilateralMeasure = { right: pmR, left: pmL };
  const pupilSubnasal: BilateralMeasure = {
    right: maybeDist(p.pu_d, p.sn),
    left:  maybeDist(p.pu_i, p.sn),
  };

  return {
    faceHeight, noseHeightMid, noseHeight, mouthHeight,
    interEndoCanth, interExoCanth, biauricular, noseWidth, mouthWidth,
    palpebralWidth, eyeSlant, pronasalAlar, stomionChelion,
    oculoOtoNasal, nasoOcularExterno, eyeSeparationAng, nasoBuccalAng,
    pupilToMidline, pupilSubnasal,
  };
}

// ============ Índice de simetría facial ============

/** Porcentaje de simetría de un par bilateral (valores en mismas unidades).
 *  100 % = idénticos; 0 % = uno cero. Devuelve null si falta dato. */
export function pairSymmetry(b: BilateralMeasure): number | null {
  if (b.right == null || b.left == null) return null;
  const r = Math.abs(b.right), l = Math.abs(b.left);
  const max = Math.max(r, l);
  if (max === 0) return 100;
  return 100 * (1 - Math.abs(r - l) / max);
}

export interface SymmetryZones {
  ocular:  number | null;
  nasal:   number | null;
  bucal:   number | null;
  global:  number | null;
}

/** Calcula el % de simetría por zona y global a partir de las medidas Farkas. */
export function farkasSymmetryIndex(f: FarkasMeasurements): SymmetryZones {
  // Zona ocular: anchura palpebral + inclinación + distancia pupila-eje + pupila-subnasal
  const ocularVals = [
    pairSymmetry(f.palpebralWidth),
    pairSymmetry(f.eyeSlant),
    pairSymmetry(f.pupilToMidline),
    pairSymmetry(f.pupilSubnasal),
    pairSymmetry(f.eyeSeparationAng),
    pairSymmetry(f.nasoOcularExterno),
    pairSymmetry(f.oculoOtoNasal),
  ].filter((v): v is number => v != null);
  // Zona nasal: distancia pronasal-alar + nasobucal
  const nasalVals = [
    pairSymmetry(f.pronasalAlar),
    pairSymmetry(f.nasoBuccalAng),
  ].filter((v): v is number => v != null);
  // Zona bucal: stomion-chelion
  const bucalVals = [
    pairSymmetry(f.stomionChelion),
  ].filter((v): v is number => v != null);
  const avg = (xs: number[]) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
  const ocular = avg(ocularVals);
  const nasal  = avg(nasalVals);
  const bucal  = avg(bucalVals);
  const all    = [...ocularVals, ...nasalVals, ...bucalVals];
  return { ocular, nasal, bucal, global: avg(all) };
}

/** Veredicto para un % de simetría: verde > 90, amarillo 80-90, rojo < 80. */
export type SymmetryLevel = 'ok' | 'warn' | 'error' | 'muted';
export function symmetryLevel(pct: number | null): SymmetryLevel {
  if (pct == null) return 'muted';
  if (pct >= 90) return 'ok';
  if (pct >= 80) return 'warn';
  return 'error';
}

// ============ Tercios faciales — evaluación de proporcionalidad ============
export type ThirdsVerdict = 'equilibrado' | 'sup' | 'medio' | 'inf' | 'muted';

export interface ThirdsEvaluation {
  verdict: ThirdsVerdict;
  text: string;       // "Equilibrado" | "Predominio del tercio superior" | ...
  maxDevPct: number;  // mayor desviación de cualquier tercio respecto al 33.3% (en pts. %)
}

/** Evalúa la proporcionalidad de tres tercios en proporción [0..1].
 *  - Si la mayor desviación es ≤ 4 pts %, → "equilibrado".
 *  - Si no, identifica cuál de los tres tiene la mayor ratio y reporta predominio.
 */
export function evaluateThirds(
  upper: number | null, middle: number | null, lower: number | null,
): ThirdsEvaluation {
  if (upper == null || middle == null || lower == null) {
    return { verdict: 'muted', text: '—', maxDevPct: 0 };
  }
  const up = upper * 100, mid = middle * 100, low = lower * 100;
  const maxDevPct = Math.max(
    Math.abs(up  - 33.33),
    Math.abs(mid - 33.33),
    Math.abs(low - 33.33),
  );
  if (maxDevPct <= 4) {
    return { verdict: 'equilibrado', text: 'Equilibrado', maxDevPct };
  }
  // Predominio = tercio con la mayor proporción
  if (up >= mid && up >= low) {
    return { verdict: 'sup',   text: 'Predominio del tercio superior', maxDevPct };
  }
  if (mid >= up && mid >= low) {
    return { verdict: 'medio', text: 'Predominio del tercio medio',    maxDevPct };
  }
  return   { verdict: 'inf',   text: 'Predominio del tercio inferior', maxDevPct };
}
