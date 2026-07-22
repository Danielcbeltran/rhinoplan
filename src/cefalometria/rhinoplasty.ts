// Simulación de proyección prequirúrgica de rinoplastia.
// A partir de los puntos blandos (N, Pn, Cm, Sn) y sliders del usuario,
// calcula la posición de los nuevos puntos en el sistema local de la cara
// (eje "down" = N→Sn, eje "forward" = perpendicular hacia la nariz).

import type { PointsMap, Pt } from './cephalometry';
import { angle3pt, distance } from './cephalometry';

export interface RhinoplastySim {
  dorsumFlatten: number; // % 0..100 — aplana la giba: mezcla el dorso hacia la recta N–Pn
  dorsum: number;        // mm — + eleva (aumenta) · − baja (reduce) el dorso
  radix: number;         // mm — + sube (proyecta) · − baja (profundiza) el radix (zona NASION)
  rhinion: number;       // mm — + eleva · − baja la zona del RHINION (independiente)
  supratip: number;      // mm — + eleva · − baja la zona de la SUPRAPUNTA (independiente)
  noseProjection: number;// mm — proyección de la NARIZ completa (dorso+punta+columela)
  tipProjection: number; // mm — positivo = punta más prominente
  tipRotation: number;   // grados — positivo = rotar punta hacia arriba (abre nasolabial)
  tipRefinement: number; // % — + define la punta · − la ensancha
  columellaLift: number; // mm — + eleva · − baja la columela (eje vertical facial)
  columellaProj: number; // mm — positivo = columela hacia adelante
  subnasale: number;     // mm — + adelanta · − retrae la zona del SUBNASAL (Sn)
  alaLift: number;       // mm — + eleva · − baja el ala nasal (solo warp de foto:
                         //      el ala no forma parte de la silueta del perfil)
  baseWidth: number;     // mm — solo frontal (no afecta perfil pero queda registrado)
}

export const DEFAULT_RHINO_SIM: RhinoplastySim = {
  dorsumFlatten: 0, dorsum: 0, radix: 0, rhinion: 0, supratip: 0, noseProjection: 0,
  tipProjection: 0, tipRotation: 0, tipRefinement: 0,
  columellaLift: 0, columellaProj: 0, subnasale: 0, alaLift: 0, baseWidth: 0,
};

export interface RhinoSlider {
  id: keyof RhinoplastySim;
  label: string;
  desc: string;
  min: number; max: number; step: number;
  unit: string;
  frontalOnly?: boolean;
}

export const RHINO_SLIDERS: RhinoSlider[] = [
  { id: 'dorsumFlatten', label: 'Aplanar dorso',        desc: 'endereza la giba hacia la recta N–Pn',       min: 0,   max: 100, step: 1,   unit: '%' },
  { id: 'dorsum',        label: 'Dorso nasal',          desc: '+ eleva (aumenta) · − baja (reduce)',        min: -10, max: 10,  step: 0.1, unit: 'mm' },
  { id: 'radix',         label: 'Radix (zona nasion)',  desc: '+ sube (proyecta) · − baja (profundiza)',    min: -6,  max: 6,   step: 0.1, unit: 'mm' },
  { id: 'rhinion',       label: 'Zona rhinion',         desc: '+ eleva · − baja · req. punto Rh',           min: -6,  max: 6,   step: 0.1, unit: 'mm' },
  { id: 'supratip',      label: 'Zona suprapunta',      desc: '+ eleva · − baja · req. punto Sp',           min: -6,  max: 6,   step: 0.1, unit: 'mm' },
  { id: 'noseProjection',label: 'Proyección de nariz',  desc: '+ aumenta · − disminuye (nariz completa)',   min: -8,  max: 8,   step: 0.1, unit: 'mm' },
  { id: 'tipProjection', label: 'Proyección de punta (pronasale)', desc: '+ punta más prominente',           min: -10, max: 10,  step: 0.1, unit: 'mm' },
  { id: 'tipRotation',   label: 'Rotación de punta',    desc: '+ punta arriba · el valor = Δ del ángulo nasolabial', min: -20, max: 20, step: 0.5, unit: '°' },
  { id: 'tipRefinement', label: 'Definición de punta',  desc: '+ define la punta · − la ensancha',          min: -10, max: 10,  step: 0.5, unit: '%' },
  { id: 'columellaLift', label: 'Columela (elevar/bajar)', desc: '+ eleva · − baja',                        min: -5,  max: 5,   step: 0.1, unit: 'mm' },
  { id: 'columellaProj', label: 'Proyección columela',  desc: '+ adelante',                                 min: -5,  max: 5,   step: 0.1, unit: 'mm' },
  { id: 'subnasale',     label: 'Zona subnasal',        desc: '+ adelanta · − retrae (base de la nariz)',   min: -5,  max: 5,   step: 0.1, unit: 'mm' },
  { id: 'alaLift',       label: 'Ala nasal (elevar/bajar)', desc: '+ eleva · − baja (requiere AC o A)',     min: -5,  max: 5,   step: 0.1, unit: 'mm' },
  // baseWidth existe en el tipo (para el prompt del backend IA futuro) pero no
  // tiene slider: la simulación solo funciona en modo perfil y ahí no es visible.
];

export interface NasalSilhouette {
  N: Pt;
  /** Contorno del dorso entre N y Pn, ordenado de N hacia Pn. Usa los puntos
   *  anatómicos reales (Rh rhinion, Sp suprapunta) si están colocados; si no,
   *  cae al punto medio de la recta N–Pn (aproximación de dorso recto). */
  dorsal: Pt[];
  Pn: Pt;
  Cm: Pt;
  Sn: Pt;
}

/** Silueta original (sin modificar): N → [Rh → Sp] → Pn → Cm → Sn.
 *  Con Rh/Sp colocados, la curva sigue el dorso REAL del paciente (giba
 *  incluida); sin ellos, se aproxima con el punto medio de N–Pn. */
export function originalNasalSilhouette(points: PointsMap): NasalSilhouette | null {
  const N = points.N, Pn = points.Pn, Cm = points.Cm, Sn = points.Sn;
  if (!N || !Pn || !Cm || !Sn) return null;
  const dorsal: Pt[] = [];
  for (const p of [points.Rh, points.Sp]) if (p) dorsal.push(p);
  // Ordenar de N hacia Pn por proyección sobre el eje N→Pn (robusto a inclinación)
  const ax = Pn.x - N.x, ay = Pn.y - N.y;
  const len2 = ax * ax + ay * ay || 1;
  dorsal.sort((a, b) =>
    ((a.x - N.x) * ax + (a.y - N.y) * ay) / len2 -
    ((b.x - N.x) * ax + (b.y - N.y) * ay) / len2);
  if (dorsal.length === 0) {
    dorsal.push({ x: (N.x + Pn.x) / 2, y: (N.y + Pn.y) / 2 });
  }
  return { N, dorsal, Pn, Cm, Sn };
}

/** Calcula la nueva silueta tras aplicar los cambios del simulador. */
export function computeSimulatedNose(
  points: PointsMap,
  sim: RhinoplastySim,
  mmPerPx: number | null,
): NasalSilhouette | null {
  const orig = originalNasalSilhouette(points);
  if (!orig) return null;
  const { N, Pn, Cm, Sn } = orig;

  // Orientación de la cara: signo positivo = nariz apunta hacia la izquierda del espectador
  const faceDir = Math.sign(Sn.x - Pn.x) || 1;

  // Sistema local de coordenadas:
  //   "down" = vector unitario de N a Sn (eje vertical facial)
  //   "fwd"  = perpendicular a down, apuntando hacia Pn (forward / hacia la nariz)
  const dx = Sn.x - N.x, dy = Sn.y - N.y;
  const dLen = Math.hypot(dx, dy);
  if (dLen < 1e-3) return null;

  // px por mm: calibración si existe; si no, prior antropométrico — la altura
  // nasal N→Sn de un adulto ronda los 55 mm. Así los sliders producen
  // magnitudes realistas a CUALQUIER resolución de foto (un valor fijo en px
  // volvía los cambios invisibles en fotos de cámara de 4000+ px).
  const pxPerMm = mmPerPx ? 1 / mmPerPx : dLen / 55;
  const downX = dx / dLen, downY = dy / dLen;
  let fwdX = -downY, fwdY = downX;
  if (fwdX * (Pn.x - N.x) + fwdY * (Pn.y - N.y) < 0) {
    fwdX = -fwdX; fwdY = -fwdY;
  }

  // Helpers de desplazamiento en el sistema local (mm → px de imagen).
  // "fwd" = anteroposterior (proyección) · "down" = eje facial (+ = caudal).
  const mv = (p: Pt, fwdMm: number, downMm: number): Pt => ({
    x: p.x + fwdX * fwdMm * pxPerMm + downX * downMm * pxPerMm,
    y: p.y + fwdY * fwdMm * pxPerMm + downY * downMm * pxPerMm,
  });
  const gProj = sim.noseProjection;          // proyección de la NARIZ completa

  // RADIX: sube (+, proyecta) / baja (−, profundiza) el nasion blando.
  const newN = mv(N, sim.radix + gProj * 0.5, 0);   // el radix recibe media proyección global (transición)

  // PRONASALE: proyección global + de punta (fwd).
  let newPn = mv(Pn, gProj + sim.tipProjection, 0);
  // COLUMELA: proyección global+propia (fwd) · elevar/bajar (−down = elevar).
  let newCm = mv(Cm, gProj + sim.columellaProj, -sim.columellaLift);
  // SUBNASAL: adelantar/retraer la base de la nariz (zona Sn).
  const newSn = mv(Sn, sim.subnasale, 0);
  if (sim.tipRotation !== 0) {
    // En imagen el eje Y crece hacia abajo; faceDir compensa la orientación.
    // Signo verificado midiendo el nasolabial: +rotación = punta ARRIBA
    // (cefálica) = nasolabial se ABRE (aumenta), como en la clínica.
    // PIVOTE en AC (pliegue alar): así la distancia pliegue alar–pronasale se
    // CONSERVA exacta durante la rotación (requisito clínico). Sin AC colocado,
    // se cae a Sn. La columela (Cm) gira con Pn como unidad rígida — girar solo
    // la punta estiraba el tramo Pn–Cm de forma antinatural.
    const pivot = points.AC ?? Sn;
    const rotBy = (p: Pt, rad: number): Pt => {
      const c = Math.cos(rad), s = Math.sin(rad);
      const cdx = p.x - pivot.x, cdy = p.y - pivot.y;
      return { x: pivot.x + cdx * c - cdy * s, y: pivot.y + cdx * s + cdy * c };
    };
    // REESCALADO: el valor del slider = CAMBIO DESEADO del ángulo nasolabial
    // (en grados). Con pivote en AC, el brazo de palanca amplifica ~2× (varía
    // con la anatomía), así que el giro real se CALIBRA numéricamente contra
    // el nasolabial medido (2 iteraciones — la relación es casi lineal).
    // Sin Ls (nasolabial no medible), el giro se aplica tal cual.
    let deg = sim.tipRotation;
    const Ls = points.Ls;
    if (Ls) {
      const nlAt = (d: number) =>
        angle3pt(rotBy(newCm, (d * Math.PI / 180) * faceDir), newSn, Ls);
      const base = nlAt(0);
      const k = nlAt(1) - base;               // Δnasolabial por 1° de giro
      if (Math.abs(k) > 1e-3) {
        deg = sim.tipRotation / k;
        const err = nlAt(deg) - base;          // 2ª iteración (no-linealidad)
        if (Math.abs(err) > 1e-6) deg *= sim.tipRotation / err;
      }
    }
    const rad = (deg * Math.PI / 180) * faceDir;
    newPn = rotBy(newPn, rad);
    newCm = rotBy(newCm, rad);
  }

  // DORSO: 1) aplanar la giba — mezcla cada punto dorsal hacia su proyección
  // sobre la recta N'–Pn' (el "dorso ideal" tras mover radix/punta);
  // 2) elevar/bajar — desplazamiento anteroposterior en bloque;
  // 3) proyección global de la nariz;
  // 4) ajuste POR ZONA independiente: rhinion (Rh) y suprapunta (Sp). Se
  //    identifican por REFERENCIA — originalNasalSilhouette reutiliza los
  //    mismos objetos Pt de `points`. El warp interpola entre controles, así
  //    que mover Rh dobla solo su tramo (N'↔Sp) sin arrastrar el resto.
  const f = Math.max(0, Math.min(1, sim.dorsumFlatten / 100));
  const lx = newPn.x - newN.x, ly = newPn.y - newN.y;
  const lLen2 = lx * lx + ly * ly || 1;
  const dorsal = orig.dorsal.map((p) => {
    let px = p.x, py = p.y;
    if (f > 0) {
      const t = ((px - newN.x) * lx + (py - newN.y) * ly) / lLen2;
      const qx = newN.x + t * lx, qy = newN.y + t * ly;   // pie sobre la recta N'–Pn'
      px += (qx - px) * f;
      py += (qy - py) * f;
    }
    const zone = p === points.Rh ? sim.rhinion
      : p === points.Sp ? sim.supratip
      : 0;
    return mv({ x: px, y: py }, sim.dorsum + gProj + zone, 0);
  });

  return { N: newN, dorsal, Pn: newPn, Cm: newCm, Sn: newSn };
}

/** Controles EXTRA de warp fotográfico para el ala nasal (elevar/bajar). El
 *  ala no forma parte de la silueta del perfil (queda dentro de la cara), así
 *  que se deforma con controles puntuales sobre AC (pliegue alar) y A (ala
 *  inferior). Solo afecta a la foto, no a la línea objetivo. */
export function alarWarpControls(
  points: PointsMap,
  sim: RhinoplastySim,
  mmPerPx: number | null,
): WarpControl[] {
  if (Math.abs(sim.alaLift) < 0.05) return [];
  const N = points.N, Sn = points.Sn;
  if (!N || !Sn) return [];
  const dx = Sn.x - N.x, dy = Sn.y - N.y;
  const dLen = Math.hypot(dx, dy);
  if (dLen < 1e-3) return [];
  const pxPerMm = mmPerPx ? 1 / mmPerPx : dLen / 55;
  // elevar (+) = hacia ARRIBA en el eje facial = −down
  const ux = -(dx / dLen) * sim.alaLift * pxPerMm;
  const uy = -(dy / dLen) * sim.alaLift * pxPerMm;
  const out: WarpControl[] = [];
  for (const p of [points.AC, points.A]) {
    if (p) out.push({ x: p.x, y: p.y, dx: ux, dy: uy });
  }
  return out;
}

/** Aplica refinement de punta bidireccional.
 *  refinement > 0  → acerca dorsum y Cm hacia Pn (afila/define la punta)
 *  refinement < 0  → aleja dorsum y Cm de Pn (ensancha la punta)
 *  Rango esperado: -10% a +10% (en %), mapeado internamente a ±25% de movimiento. */
export function refineNoseTip(silhouette: NasalSilhouette, refinement: number): NasalSilhouette {
  if (Math.abs(refinement) < 0.05) return silhouette;
  // refinement en porcentaje (-10..+10) → t factor (-0.25..+0.25)
  const t = Math.max(-0.25, Math.min(0.25, refinement * 0.025));
  const n = silhouette.dorsal.length;
  return {
    ...silhouette,
    // El refinamiento afecta la zona de la punta: los puntos dorsales cercanos
    // a Pn (suprapunta) se mueven más que los altos (rhinion casi no cambia).
    dorsal: silhouette.dorsal.map((p, i) => {
      const w = 0.4 * ((i + 1) / n);
      return {
        x: p.x + (silhouette.Pn.x - p.x) * t * w,
        y: p.y + (silhouette.Pn.y - p.y) * t * w,
      };
    }),
    Cm: {
      x: silhouette.Cm.x + (silhouette.Pn.x - silhouette.Cm.x) * t * 0.6,
      y: silhouette.Cm.y + (silhouette.Pn.y - silhouette.Cm.y) * t * 0.6,
    },
  };
}

/** Deforma un segmento DENSO del contorno real (tramo nasal N→Sn) aplicando
 *  los desplazamientos de la simulación. Cada punto de control de la silueta
 *  (N, dorsales, Pn, Cm, Sn) define un delta (sim − orig); los deltas se
 *  interpolan linealmente a lo largo del segmento. Así la simulación conserva
 *  la FORMA REAL del perfil (giba, irregularidades) y solo aplica los cambios
 *  quirúrgicos encima. */
export function warpSegmentBySilhouettes(
  seg: Pt[],
  orig: NasalSilhouette,
  sim: NasalSilhouette,
): Pt[] {
  if (seg.length < 2) return seg;
  // Pares de control orig → sim, en orden anatómico N → Sn
  const controls: Array<{ p: Pt; dx: number; dy: number }> = [];
  const push = (p: Pt, s: Pt) => controls.push({ p, dx: s.x - p.x, dy: s.y - p.y });
  push(orig.N, sim.N);
  for (let i = 0; i < orig.dorsal.length; i++) push(orig.dorsal[i], sim.dorsal[i] ?? orig.dorsal[i]);
  push(orig.Pn, sim.Pn);
  push(orig.Cm, sim.Cm);
  push(orig.Sn, sim.Sn);

  // Índice del segmento para cada control: búsqueda MONÓTONA hacia adelante.
  // Los controles van en orden anatómico (N → dorsales → Pn → Cm → Sn), igual
  // que el tramo. Cerca de la punta el contorno se PLIEGA (dorso y columela
  // quedan espacialmente pegados) y el mapeo euclídeo libre podía asignar un
  // control al brazo equivocado del pliegue — los índices se intercalaban y el
  // delta de la punta se desparramaba por el dorso (rhinion/nasion se movían
  // al proyectar la punta). Forzar monotonía elimina el intercalado.
  let prevIdx = -1;
  const marks = controls.map((c) => {
    let best = Math.min(prevIdx + 1, seg.length - 1), bd = Infinity;
    for (let i = prevIdx + 1; i < seg.length; i++) {
      const d = (seg[i].x - c.p.x) ** 2 + (seg[i].y - c.p.y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    prevIdx = best;
    return { i: best, dx: c.dx, dy: c.dy };
  });

  // Extremos del TRAMO clavados a cero: si el tramo se extiende más allá de la
  // silueta (margen sobre N para difuminar el radix, bajo Sn), el warp se
  // desvanece a 0 en los bordes — sin saltos con el resto del contorno. Antes
  // el radix (delta ≠ 0 en N) se propagaba constante hasta el corte y saltaba.
  if (marks[0].i > 3) marks.unshift({ i: 0, dx: 0, dy: 0 });
  if (marks[marks.length - 1].i < seg.length - 4) {
    marks.push({ i: seg.length - 1, dx: 0, dy: 0 });
  }

  // Campo de deltas por índice: smoothstep entre controles (sin codos en los
  // puntos de control); fuera de los extremos se mantiene el delta del extremo
  // (N y Sn no cambian → suele ser 0).
  const n = seg.length;
  const DX = new Float32Array(n), DY = new Float32Array(n);
  const ease = (t: number) => t * t * (3 - 2 * t);
  for (let i = 0; i <= marks[0].i; i++) { DX[i] = marks[0].dx; DY[i] = marks[0].dy; }
  for (let k = 0; k < marks.length - 1; k++) {
    const a = marks[k], b = marks[k + 1];
    for (let i = a.i; i <= b.i; i++) {
      const t = b.i === a.i ? 0 : ease((i - a.i) / (b.i - a.i));
      DX[i] = a.dx + (b.dx - a.dx) * t;
      DY[i] = a.dy + (b.dy - a.dy) * t;
    }
  }
  const last = marks[marks.length - 1];
  for (let i = last.i; i < n; i++) { DX[i] = last.dx; DY[i] = last.dy; }

  return seg.map((p, i) => ({ x: p.x + DX[i], y: p.y + DY[i] }));
}

/** Ángulo nasolabial aproximado (Cm-Sn-Ls). Requiere Ls. */
export function nasolabialFromSilhouette(s: NasalSilhouette, Ls: Pt | undefined): number | null {
  if (!Ls) return null;
  return angle3pt(s.Cm, s.Sn, Ls);
}

/** Ángulo nasofrontal (G-N-Pn) tras aplicar la silueta. Requiere G. */
export function nasofrontalFromSilhouette(s: NasalSilhouette, G: Pt | undefined): number | null {
  if (!G) return null;
  return angle3pt(G, s.N, s.Pn);
}

/** Proyección nasal tras simulación.
 *  Con AC colocado: método de GOODE real (perpendicular de Pn a la recta N–AC
 *  / longitud N–Pn), el mismo de la tabla principal — ideal 0.55–0.60.
 *  Sin AC: adaptación con el eje facial N–Sn (componente perpendicular de
 *  Sn→Pn / longitud N–Sn). Ambas fórmulas son invariantes a la inclinación de
 *  la foto (la versión anterior usaba Δx/Δy de pantalla y se rompía al rotar). */
export function nasalProjectionFromSilhouette(s: NasalSilhouette, AC?: Pt): number {
  if (AC) {
    const dx = AC.x - s.N.x, dy = AC.y - s.N.y;
    const len2 = dx * dx + dy * dy;
    const nasalLen = Math.hypot(s.Pn.x - s.N.x, s.Pn.y - s.N.y);
    if (len2 > 0 && nasalLen > 0) {
      const t = ((s.Pn.x - s.N.x) * dx + (s.Pn.y - s.N.y) * dy) / len2;
      const foot = { x: s.N.x + t * dx, y: s.N.y + t * dy };
      return Math.hypot(s.Pn.x - foot.x, s.Pn.y - foot.y) / nasalLen;
    }
  }
  const ax = s.Sn.x - s.N.x, ay = s.Sn.y - s.N.y;
  const len = Math.hypot(ax, ay);
  if (!len) return 0;
  const perp = Math.abs((s.Pn.x - s.Sn.x) * (-ay / len) + (s.Pn.y - s.Sn.y) * (ax / len));
  return perp / len;
}

/** Ángulo de punta (N–Pn–Sn) tras simulación: la cuña que forma la punta
 *  nasal (vértice en Pn). Se muestra como comparativa original↔simulada, sin
 *  valor "normal" (el nasofacial es la medida con rango de referencia). */
export function tipAngleFromSilhouette(s: NasalSilhouette): number {
  return angle3pt(s.N, s.Pn, s.Sn);
}

/** Cambios significativos aplicados (filtra los 0). */
export function getActiveChanges(sim: RhinoplastySim): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  const fmt = (v: number, unit: string, decimals = 1) =>
    `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}${unit ? ' ' + unit : ''}`;
  if (sim.dorsumFlatten > 0.5)              out.push({ label: 'Aplanar dorso',         value: `${sim.dorsumFlatten.toFixed(0)} %` });
  if (Math.abs(sim.dorsum) > 0.05)          out.push({ label: 'Dorso nasal',           value: fmt(sim.dorsum, 'mm') });
  if (Math.abs(sim.radix) > 0.05)           out.push({ label: 'Radix (zona nasion)',   value: fmt(sim.radix, 'mm') });
  if (Math.abs(sim.rhinion) > 0.05)         out.push({ label: 'Zona rhinion',          value: fmt(sim.rhinion, 'mm') });
  if (Math.abs(sim.supratip) > 0.05)        out.push({ label: 'Zona suprapunta',       value: fmt(sim.supratip, 'mm') });
  if (Math.abs(sim.noseProjection) > 0.05)  out.push({ label: 'Proyección de nariz',   value: fmt(sim.noseProjection, 'mm') });
  if (Math.abs(sim.tipProjection) > 0.05)   out.push({ label: 'Proyección de punta',   value: fmt(sim.tipProjection, 'mm') });
  if (Math.abs(sim.tipRotation) > 0.4)      out.push({ label: 'Rotación de punta',     value: fmt(sim.tipRotation, '°', 1) });
  if (Math.abs(sim.tipRefinement) > 0.4)    out.push({ label: 'Definición de punta',   value: fmt(sim.tipRefinement, '%', 1) });
  if (Math.abs(sim.columellaLift) > 0.05)   out.push({ label: 'Columela (elevar/bajar)', value: fmt(sim.columellaLift, 'mm') });
  if (Math.abs(sim.columellaProj) > 0.05)   out.push({ label: 'Proyección columela',   value: fmt(sim.columellaProj, 'mm') });
  if (Math.abs(sim.subnasale) > 0.05)       out.push({ label: 'Zona subnasal',         value: fmt(sim.subnasale, 'mm') });
  if (Math.abs(sim.alaLift) > 0.05)         out.push({ label: 'Ala nasal (elevar/bajar)', value: fmt(sim.alaLift, 'mm') });
  if (Math.abs(sim.baseWidth) > 0.4)        out.push({ label: 'Ancho base (frontal)',  value: fmt(sim.baseWidth, '%', 1) });
  return out;
}

// ============ Warp fotográfico de la región nasal ============
//
// Deforma los PÍXELES de la foto (no solo la línea) para que el lado
// "SIMULACIÓN" del divisor muestre la cara modificada de verdad. Todo local.
//
// Diseño (v2): campo por DISTANCIA A LA CURVA. Cada punto consulta los
// controles (muestras densas del borde nasal con su delta orig→sim) con pesos
// IDW singulares — sobre el borde el desplazamiento es EXACTO, así la foto
// deformada COINCIDE con la silueta objetivo (v1 gaussiana la diluía y la
// imagen se quedaba corta respecto a la línea verde). El conjunto se atenúa
// con smoothstep de la distancia mínima a los controles, llegando a CERO en
// el radio R — labios, mejilla, ojo y frente quedan matemáticamente inmóviles
// (v1 alcanzaba media cara).

/** `r` (opcional): radio de influencia PROPIO del control; sin él, el control
 *  usa el radio global R del campo. Solo los deformadores libres lo fijan. */
export interface WarpControl { x: number; y: number; dx: number; dy: number; r?: number }

// ============ Deformadores libres ============
// Empujes locales creados por el usuario ARRASTRANDO sobre la foto en modo
// simulación: origen (from) → destino (to). Independientes de los puntos
// anatómicos y de los sliders. Los cercanos al borde se funden en el tramo
// de la silueta (línea y foto coinciden); los interiores van como controles
// extra del campo fotográfico.

/** `radius` es un MULTIPLICADOR del radio base (handleRadius): 1 = por defecto,
 *  0.5 = mitad de área de influencia (retoque fino), 2 = doble. Ausente = 1. */
export interface RhinoHandle { from: Pt; to: Pt; radius?: number }

/** Radio de influencia de los deformadores y del campo, derivado del tamaño
 *  del tramo nasal (misma fórmula que buildNoseWarpField). */
export function handleRadius(seg: Pt[]): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of seg) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return Math.max(30, Math.max(maxX - minX, maxY - minY) * 0.18);
}

/** Convierte deformadores a controles de campo (para los alejados del borde).
 *  Con `baseR`, cada control lleva su radio propio (baseR × multiplicador del
 *  deformador); sin él, el campo usa su radio global como hasta ahora. */
export function handleWarpControls(handles: RhinoHandle[], baseR?: number): WarpControl[] {
  return handles
    .filter((h) => Math.hypot(h.to.x - h.from.x, h.to.y - h.from.y) > 0.5)
    .map((h) => ({
      x: h.from.x, y: h.from.y, dx: h.to.x - h.from.x, dy: h.to.y - h.from.y,
      ...(baseR != null ? { r: baseR * (h.radius ?? 1) } : {}),
    }));
}

/** Aplica los deformadores al tramo DENSO de la silueta: cada punto dentro
 *  del radio del deformador (R × su multiplicador) recibe el empuje con caída
 *  smoothstep. Aditivo entre deformadores solapados. */
export function applyHandlesToSegment(seg: Pt[], handles: RhinoHandle[], R: number): Pt[] {
  const act = handles
    .filter((h) => Math.hypot(h.to.x - h.from.x, h.to.y - h.from.y) > 0.5)
    .map((h) => ({
      x: h.from.x, y: h.from.y, dx: h.to.x - h.from.x, dy: h.to.y - h.from.y,
      r: R * (h.radius ?? 1),
    }));
  if (act.length === 0) return seg;
  return seg.map((p) => {
    let ox = 0, oy = 0;
    for (const c of act) {
      const d2 = (p.x - c.x) * (p.x - c.x) + (p.y - c.y) * (p.y - c.y);
      if (d2 >= c.r * c.r) continue;
      const t = 1 - Math.sqrt(d2) / c.r;
      const w = t * t * (3 - 2 * t);
      ox += c.dx * w; oy += c.dy * w;
    }
    return ox !== 0 || oy !== 0 ? { x: p.x + ox, y: p.y + oy } : p;
  });
}

/** Aplica los deformadores libres a los puntos de control de una SILUETA
 *  (mismo empuje smoothstep que applyHandlesToSegment). Lo usa el panel para
 *  que las medidas "Original vs proyectado" (∠ nasolabial, largo N–Pn,
 *  proyección AC–Pn, etc.) reflejen también los deformadores, no solo los
 *  sliders. `R` es el radio base (handleRadius del tramo nasal). */
export function applyHandlesToSilhouette(
  s: NasalSilhouette, handles: RhinoHandle[], R: number,
): NasalSilhouette {
  if (handles.length === 0) return s;
  const seg = [s.N, ...s.dorsal, s.Pn, s.Cm, s.Sn];
  const out = applyHandlesToSegment(seg, handles, R);
  const n = s.dorsal.length;
  return { N: out[0], dorsal: out.slice(1, 1 + n), Pn: out[1 + n], Cm: out[2 + n], Sn: out[3 + n] };
}

/** Separa deformadores en cercanos al tramo (se funden en la silueta) y
 *  lejanos (controles extra del campo fotográfico). El umbral usa el radio
 *  efectivo de CADA deformador (R × multiplicador). */
export function splitHandlesBySegment(
  seg: Pt[], handles: RhinoHandle[], R: number,
): { near: RhinoHandle[]; far: RhinoHandle[] } {
  const near: RhinoHandle[] = [], far: RhinoHandle[] = [];
  for (const h of handles) {
    const lim = R * (h.radius ?? 1) * 0.8;
    let d2min = Infinity;
    for (const p of seg) {
      const d2 = (p.x - h.from.x) * (p.x - h.from.x) + (p.y - h.from.y) * (p.y - h.from.y);
      if (d2 < d2min) d2min = d2;
    }
    (d2min <= lim * lim ? near : far).push(h);
  }
  return { near, far };
}

export interface NoseWarpField {
  controls: WarpControl[];
  R: number;                                       // radio de influencia (px)
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** Construye el campo de warp a partir del tramo nasal denso (orig → sim).
 *  `extra` añade controles puntuales fuera de la silueta (p. ej. ala nasal). */
export function buildNoseWarpField(
  denseOrig: Pt[], denseSim: Pt[], extra: WarpControl[] = [],
): NoseWarpField | null {
  const n = Math.min(denseOrig.length, denseSim.length);
  if (n < 3) return null;

  // Submuestrear a ~72 controles móviles (denso → fidelidad al borde incluso
  // donde el delta cambia rápido: punta rotada, radix)
  const step = Math.max(1, Math.floor(n / 72));
  const controls: WarpControl[] = [];
  for (let i = 0; i < n; i += step) {
    controls.push({
      x: denseOrig[i].x, y: denseOrig[i].y,
      dx: denseSim[i].x - denseOrig[i].x, dy: denseSim[i].y - denseOrig[i].y,
    });
  }
  const lastI = n - 1;
  if ((lastI % step) !== 0) {
    controls.push({
      x: denseOrig[lastI].x, y: denseOrig[lastI].y,
      dx: denseSim[lastI].x - denseOrig[lastI].x, dy: denseSim[lastI].y - denseOrig[lastI].y,
    });
  }
  controls.push(...extra);

  // Tamaño de la nariz → radio de influencia (más allá, NADA se mueve)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of controls) {
    if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y; if (c.y > maxY) maxY = c.y;
  }
  const size = Math.max(maxX - minX, maxY - minY);
  if (size < 4) return null;
  // Radio CEÑIDO: la nariz completa (N→Sn) abarca `size`; 0.12×size deja
  // labios, glabela, ojo y mejilla fuera del alcance (verificado: 0 px de
  // cambio fuera de la nariz). El interior nasal queda cubierto porque el
  // borde (dorso+punta+columela) envuelve la nariz.
  const R = Math.max(30, size * 0.12);

  // El padding del bbox debe cubrir también el radio propio más grande de los
  // controles `extra` (deformadores con radio ampliado) — fuera del bbox el
  // mesh no se evalúa y su influencia quedaría cortada en seco.
  let pad = R;
  for (const c of controls) if (c.r != null && c.r > pad) pad = c.r;

  return {
    controls, R,
    bbox: { x0: minX - pad, y0: minY - pad, x1: maxX + pad, y1: maxY + pad },
  };
}

/** Desplazamiento interpolado en (x, y).
 *  IDW singular (w = 1/(d²+ε)) → exacto sobre los controles (el borde de la
 *  foto aterriza EXACTAMENTE en la silueta objetivo) · atenuación smoothstep
 *  con la distancia NORMALIZADA mínima a los controles → cero garantizado a
 *  partir del radio. Cada control puede llevar radio propio (c.r); sin él usa
 *  el R global del campo — con todos los radios por defecto el resultado es
 *  idéntico a la fórmula original (u = d/R). */
export function evalWarpAt(field: NoseWarpField, x: number, y: number): Pt {
  let uMin2 = Infinity, wSum = 0, dxSum = 0, dySum = 0;
  for (const c of field.controls) {
    const cr = c.r ?? field.R;
    const d2 = (x - c.x) * (x - c.x) + (y - c.y) * (y - c.y);
    const u2 = d2 / (cr * cr);             // distancia² normalizada al radio del control
    if (u2 < uMin2) uMin2 = u2;
    if (u2 < 4) {                          // solo controles cercanos pesan
      const w = 1 / (d2 + 4);
      wSum += w; dxSum += w * c.dx; dySum += w * c.dy;
    }
  }
  if (uMin2 >= 1 || wSum < 1e-9) return { x: 0, y: 0 };
  const t = 1 - Math.sqrt(uMin2);
  const fall = t * t * (3 - 2 * t);        // smoothstep → 0 en el radio
  return { x: (dxSum / wSum) * fall, y: (dySum / wSum) * fall };
}

// Re-export helper para conveniencia
export { distance };
