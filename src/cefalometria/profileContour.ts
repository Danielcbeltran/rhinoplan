// Detección del contorno REAL del perfil por visión clásica (sin ML).
//
// Idea: en foto clínica el fondo toca los bordes de la imagen. Se SEGMENTA el
// fondo por CONECTIVIDAD (flood-fill desde los bordes): todo lo que queda unido
// —pelo, piel, cuello, ropa— es UN solo primer plano. Así la silueta es siempre
// el borde EXTERNO real cara/pelo↔fondo, y los bordes internos (línea de
// implantación del pelo, gafas, arrugas) quedan DENTRO del blob y no pueden
// confundirse con el contorno. Se conserva solo el componente conexo mayor
// (la cabeza), se extrae la silueta de cada lado y se suaviza.
//
// Funciona mejor con fondo neutro (foto clínica estándar). Con fondos muy
// cargados puede fallar — por eso es una capa activable/desactivable.

import type { Pt } from './cephalometry';

const MAX_H = 900;   // se trabaja a resolución reducida (velocidad)
const MED_WIN = 9;   // ventana de mediana (quita pelos/picos)
const AVG_WIN = 5;   // ventana de promedio (alisa)

export interface TraceResult {
  pts: Pt[];
  /** Fracción de filas con borde detectado dentro del tramo útil (0..1). */
  coverage: number;
  /** Mediana del salto |Δx| entre filas consecutivas, en px de trabajo.
   *  Cara sobre fondo limpio ≈ 0–3; pelo rizado/ropa ≈ mucho mayor. */
  roughness: number;
}

/**
 * Traza el contorno del perfil.
 * @param faceDir 1 = la nariz mira a la IZQUIERDA del espectador (se escanea
 *                desde el borde izquierdo); -1 = mira a la derecha.
 * @returns polilínea + métricas de calidad, o null si no se pudo trazar.
 */
interface Foreground {
  W: number; H: number; scale: number;
  fg: Uint8Array;     // 1 = primer plano (cabeza/cuerpo), 0 = fondo
  lum: Float32Array;  // luminancia por píxel (para refinar el borde a subpíxel)
}

const median = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
const chromaOf = (r: number, g: number, b: number) =>
  Math.max(r, g, b) - Math.min(r, g, b);

/** Segmenta el FONDO por conectividad (flood-fill desde los bordes de la imagen)
 *  y devuelve la máscara del primer plano (cabeza/cuerpo).
 *
 *  El fondo se rellena creciendo por regiones desde los cuatro bordes: un píxel
 *  se une al fondo si (a) es globalmente parecido al color de fondo, (b) no es
 *  más cromático que el fondo (la PIEL tiene calidez R>G>B; un fondo neutro no,
 *  así la piel pálida sobre fondo claro no se "traga"), y (c) es localmente
 *  similar a su vecino ya-fondo (sigue degradados suaves de iluminación). Todo
 *  lo demás —pelo, piel, cuello, ropa— queda como primer plano conexo, y los
 *  bordes internos (línea del pelo, gafas) quedan DENTRO, nunca en la silueta. */
function buildForeground(image: HTMLImageElement | HTMLCanvasElement): Foreground | null {
  const W0 = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const H0 = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  if (!W0 || !H0) return null;
  const scale = Math.min(1, MAX_H / H0);
  const W = Math.max(2, Math.round(W0 * scale));
  const H = Math.max(2, Math.round(H0 * scale));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  // --- Color de fondo por PARCHES de borde consistentes ---
  // La mediana de TODO el borde se contamina cuando el sujeto lo toca (pelo
  // arriba, torso abajo, cara pegada al borde — encuadre clínico habitual):
  // salía "fondo" color piel y los umbrales, inflados por la desviación, se
  // comían la cabeza entera (contorno en la línea del pelo, o nada).
  // En su lugar: 8 parches (4 esquinas + 4 centros de borde); el FONDO real es
  // el grupo de parches que COINCIDEN en color y son LISOS. Los parches sobre
  // pelo/ropa/piel no casan entre sí o son rugosos y quedan fuera.
  const t = Math.max(3, Math.round(Math.min(W, H) * 0.05));  // lado del parche
  const patchAt = (x0: number, y0: number) => {
    const rs: number[] = [], gs: number[] = [], bs: number[] = [];
    for (let y = y0; y < y0 + t; y++) for (let x = x0; x < x0 + t; x++) {
      const i = (y * W + x) * 4; rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
    }
    const r = median(rs), g = median(gs), b = median(bs);
    let d = 0;
    for (let k = 0; k < rs.length; k++) d += Math.abs(rs[k] - r) + Math.abs(gs[k] - g) + Math.abs(bs[k] - b);
    return { r, g, b, dev: d / rs.length };
  };
  const mx = W - t, my = H - t, cx = (W - t) >> 1, cy = (H - t) >> 1;
  const patches = [
    patchAt(0, 0), patchAt(mx, 0), patchAt(0, my), patchAt(mx, my),
    patchAt(cx, 0), patchAt(cx, my), patchAt(0, cy), patchAt(mx, cy),
  ];
  // Agrupar parches similares (greedy). El fondo clínico es CLARO, NEUTRO y
  // LISO — ese prior manda sobre el tamaño del grupo: si el sujeto toca más
  // borde que la pared (pelo arriba + ropa abajo), su clúster oscuro/cromático
  // es el mayor, y elegirlo como "fondo" invierte la segmentación entera.
  const SAME = 60;
  let bgRefs: typeof patches = [];
  let bestScore = -Infinity;
  for (let i = 0; i < patches.length; i++) {
    const p = patches[i];
    const grp = patches.filter((q) =>
      Math.abs(q.r - p.r) + Math.abs(q.g - p.g) + Math.abs(q.b - p.b) < SAME);
    const lum = grp.reduce((s, q) => s + 0.299 * q.r + 0.587 * q.g + 0.114 * q.b, 0) / grp.length;
    const chroma = grp.reduce((s, q) => s + chromaOf(q.r, q.g, q.b), 0) / grp.length;
    const smooth = grp.reduce((s, q) => s + q.dev, 0) / grp.length;
    const score = lum - 2 * chroma - 2 * smooth + 15 * grp.length;
    if (score > bestScore) { bestScore = score; bgRefs = grp; }
  }
  // dev = rugosidad interna + dispersión entre parches del grupo (acotado: los
  // umbrales nunca deben "abrirse" hasta tragarse al sujeto)
  const bR = median(bgRefs.map((p) => p.r));
  const bG = median(bgRefs.map((p) => p.g));
  const bB = median(bgRefs.map((p) => p.b));
  let dev = bgRefs.reduce((s, p) => s + p.dev, 0) / bgRefs.length;
  for (const p of bgRefs) dev += (Math.abs(p.r - bR) + Math.abs(p.g - bG) + Math.abs(p.b - bB)) / bgRefs.length / 2;
  dev = Math.min(45, dev);
  const bChroma = Math.max(...bgRefs.map((p) => chromaOf(p.r, p.g, p.b)));
  const bWarm = Math.max(...bgRefs.map((p) => p.r - p.b));  // calidez propia del fondo (R−B)
  const GLOBAL = Math.max(80, Math.min(150, dev * 3 + 55)); // distancia máx. al fondo para ser "fondo"
  const LOCAL = Math.max(18, Math.min(45, dev * 2 + 12));   // similitud entre vecinos (sigue degradados)
  const CHROMA = 20;                           // exceso de croma tolerado sobre el fondo
  const SKIN_WARM = 10;                        // calidez extra (R−B) que delata piel

  // Distancia al fondo = mínimo contra CADA parche del grupo (tolera fondos
  // con degradado suave: cada zona del fondo casa con su parche más parecido).
  const bgDist = (r: number, g: number, b: number) => {
    let best = Infinity;
    for (const p of bgRefs) {
      const d = Math.abs(r - p.r) + Math.abs(g - p.g) + Math.abs(b - p.b);
      if (d < best) best = d;
    }
    return best;
  };
  // SOMBRA sobre el fondo: misma cromaticidad (r−g, g−b) que un parche de
  // fondo pero más oscura. Sin esta vía, la sombra que el sujeto proyecta en
  // la pared queda como "primer plano" y la silueta se despega del borde real.
  // La piel no pasa (cromaticidad cálida), el pelo negro tampoco (demasiado
  // oscuro), la ropa de color tampoco (cromaticidad distinta).
  const shadowEligible = (r: number, g: number, b: number) => {
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    for (const p of bgRefs) {
      const dCr = Math.abs((r - g) - (p.r - p.g)) + Math.abs((g - b) - (p.g - p.b));
      if (dCr >= 26) continue;
      const pl = 0.299 * p.r + 0.587 * p.g + 0.114 * p.b;
      if (lum >= pl * 0.35 && lum <= pl * 1.25) return true;
    }
    return false;
  };
  const bgEligible = (i: number) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (bgDist(r, g, b) >= GLOBAL && !shadowEligible(r, g, b)) return false;
    // La PIEL es cálida (R>G>B) aunque sea clara; un fondo neutro no. Un píxel
    // bastante más cálido que el fondo es piel aunque su luminancia se parezca →
    // impide que el relleno cruce la frente/pómulo claros y PARTA la cabeza en
    // dos (lo que dejaba el contorno pegado a la línea de implantación del pelo).
    if (r >= g && (r - b) - bWarm > SKIN_WARM) return false;
    if (chromaOf(r, g, b) - bChroma > CHROMA) return false; // más cromático que el fondo → objeto (piel)
    return true;
  };

  // --- Flood-fill del fondo por región (desde todos los bordes) ---
  const bg = new Uint8Array(W * H);
  const stack: number[] = [];
  const seed = (x: number, y: number) => {
    const p = y * W + x;
    if (!bg[p] && bgEligible(p * 4)) { bg[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
  for (let y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }
  while (stack.length) {
    const p = stack.pop()!;
    const px = p % W, py = (p / W) | 0, pi = p * 4;
    const tryN = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const q = y * W + x;
      if (bg[q]) return;
      const qi = q * 4;
      if (!bgEligible(qi)) return;
      const d = Math.abs(data[qi] - data[pi]) + Math.abs(data[qi + 1] - data[pi + 1]) + Math.abs(data[qi + 2] - data[pi + 2]);
      if (d > LOCAL) return;   // borde real con el fondo → se detiene aquí
      bg[q] = 1; stack.push(q);
    };
    tryN(px - 1, py); tryN(px + 1, py); tryN(px, py - 1); tryN(px, py + 1);
  }

  // --- Primer plano = no-fondo; conservar solo el componente conexo MAYOR ---
  // (descarta pelillos sueltos, motas de polvo, reflejos aislados)
  const label = new Int32Array(W * H);
  let bestLabel = 0, bestSize = 0, cur = 0;
  for (let p0 = 0; p0 < W * H; p0++) {
    if (bg[p0] || label[p0]) continue;
    cur++;
    let size = 0;
    const st = [p0]; label[p0] = cur;
    while (st.length) {
      const p = st.pop()!;
      size++;
      const px = p % W, py = (p / W) | 0;
      const tryN = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const q = y * W + x;
        if (!bg[q] && !label[q]) { label[q] = cur; st.push(q); }
      };
      tryN(px - 1, py); tryN(px + 1, py); tryN(px, py - 1); tryN(px, py + 1);
    }
    if (size > bestSize) { bestSize = size; bestLabel = cur; }
  }
  if (!bestLabel || bestSize < W * H * 0.03) return null;  // no hay un primer plano plausible
  const fg = new Uint8Array(W * H);
  let minY = H, maxY = -1;
  for (let p = 0; p < W * H; p++) {
    if (label[p] !== bestLabel) continue;
    fg[p] = 1;
    const y = (p / W) | 0;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  // La cabeza abarca casi toda la altura. Si el componente mayor NO lo hace, la
  // segmentación se partió (fuga por la piel) → no dibujar un contorno basura.
  if (maxY - minY < H * 0.55) return null;
  const lum = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    lum[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return { W, H, scale, fg, lum };
}

/** Extrae la silueta de un lado del primer plano: para cada fila, el píxel de
 *  primer plano más EXTERNO (izq = menor x, der = mayor x). Suaviza (mediana +
 *  promedio) y calcula métricas de calidad para la selección de lado. */
function extractSide(fgr: Foreground, side: 'left' | 'right'): TraceResult | null {
  const { W, H, scale, fg, lum } = fgr;

  // Refina el borde a SUBPÍXEL: entre el último px de fondo y el primero de
  // primer plano, la luminancia cruza el nivel medio fondo↔objeto en algún
  // punto fraccionario. Sin esto, la cuantización a píxel entero (a resolución
  // de trabajo) se multiplica por 1/scale al reescalar y el contorno "escalona".
  const subpixel = (row: number, xFg: number, dir: 1 | -1): number => {
    const xBg = xFg - dir;                        // último píxel de fondo
    if (xBg < 0 || xBg >= W) return xFg;
    const bg2 = xBg - dir * 2;                    // niveles estables a 2-3 px del borde
    const fg2 = xFg + dir * 2;
    const bgL = bg2 >= 0 && bg2 < W ? (lum[row + bg2] + lum[row + bg2 + dir]) / 2 : lum[row + xBg];
    const fgL = fg2 >= 0 && fg2 < W ? (lum[row + fg2] + lum[row + fg2 - dir]) / 2 : lum[row + xFg];
    const mid = (bgL + fgL) / 2;
    const lo = lum[row + xBg], hi = lum[row + xFg];
    if (Math.abs(hi - lo) < 1e-3) return xFg;
    const t = Math.min(1, Math.max(0, (mid - lo) / (hi - lo)));
    return xBg + dir * t;                         // posición fraccionaria del cruce
  };

  const raw: number[] = new Array(H).fill(-1);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    if (side === 'right') {
      for (let x = W - 1; x >= 0; x--) { if (fg[row + x]) { raw[y] = subpixel(row, x, -1); break; } }
    } else {
      for (let x = 0; x < W; x++) { if (fg[row + x]) { raw[y] = subpixel(row, x, 1); break; } }
    }
  }

  // Suavizado: mediana deslizante (quita picos de pelo) + promedio (alisa)
  const mHalf = MED_WIN >> 1;
  const medArr: number[] = new Array(H).fill(-1);
  for (let y = 0; y < H; y++) {
    const win: number[] = [];
    for (let k = -mHalf; k <= mHalf; k++) { const v = raw[y + k]; if (v !== undefined && v >= 0) win.push(v); }
    if (win.length >= 3) { win.sort((a, b) => a - b); medArr[y] = win[win.length >> 1]; }
  }
  const aHalf = AVG_WIN >> 1;
  const pts: Pt[] = [];
  for (let y = 0; y < H; y++) {
    if (medArr[y] < 0) continue;
    let s = 0, n = 0;
    for (let k = -aHalf; k <= aHalf; k++) { const v = medArr[y + k]; if (v !== undefined && v >= 0) { s += v; n++; } }
    pts.push({ x: (s / n) / scale, y: y / scale });
  }
  if (pts.length <= 20) return null;

  // RECUPERAR tramos casi horizontales (submentón→cervical, base nasal…):
  // el escaneo por filas toma el píxel más externo de CADA fila, así que a la
  // altura del cuello "ve" el pecho/hombro y salta recto del mentón al pecho —
  // el hueco cervicomental queda invisible y mover el punto C no curvaba nada.
  // En cada salto grande se sigue la FRONTERA real de la máscara entre los dos
  // extremos (BFS por píxeles frontera, acotado a una ventana): eso devuelve
  // el borde mentón→cuello→cervical→hombro de verdad. Si el BFS falla, se
  // interpola recto (deformable al menos).
  const isBg = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || !fg[y * W + x];
  const isBorder = (x: number, y: number) =>
    !isBg(x, y) && (isBg(x - 1, y) || isBg(x + 1, y) || isBg(x, y - 1) || isBg(x, y + 1));
  const borderPathBetween = (ax: number, ay: number, bx: number, by: number): Pt[] | null => {
    const gap = Math.abs(bx - ax);
    const m = 6;
    const wx0 = Math.max(0, Math.min(ax, bx) - m);
    const wx1 = Math.min(W - 1, Math.max(ax, bx) + m);
    const wy0 = Math.max(0, Math.min(ay, by) - m);
    const wy1 = Math.min(H - 1, Math.max(ay, by) + Math.round(gap * 1.2) + m);
    const ww = wx1 - wx0 + 1, wh = wy1 - wy0 + 1;
    if (ww * wh > 300000) return null;
    if (!isBorder(ax, ay) || !isBorder(bx, by)) return null;
    const prev = new Int32Array(ww * wh).fill(-2);      // -2 = sin visitar
    const qi = (x: number, y: number) => (y - wy0) * ww + (x - wx0);
    const queue: number[] = [qi(ax, ay)];
    prev[qi(ax, ay)] = -1;
    const target = qi(bx, by);
    let head = 0, found = target === qi(ax, ay);
    while (head < queue.length && !found) {
      const p = queue[head++];
      const px = (p % ww) + wx0, py = ((p / ww) | 0) + wy0;
      for (let dy2 = -1; dy2 <= 1 && !found; dy2++) {
        for (let dx2 = -1; dx2 <= 1; dx2++) {
          if (!dx2 && !dy2) continue;
          const nx2 = px + dx2, ny2 = py + dy2;
          if (nx2 < wx0 || nx2 > wx1 || ny2 < wy0 || ny2 > wy1) continue;
          const q = qi(nx2, ny2);
          if (prev[q] !== -2 || !isBorder(nx2, ny2)) continue;
          prev[q] = p;
          if (q === target) { found = true; break; }
          queue.push(q);
        }
      }
    }
    if (!found) return null;
    const path: Pt[] = [];
    for (let p = target; p !== -1; p = prev[p]) {
      path.push({ x: ((p % ww) + wx0) / scale, y: (((p / ww) | 0) + wy0) / scale });
    }
    path.reverse();
    const out: Pt[] = [];
    for (let i = 0; i < path.length; i += 2) out.push(path[i]);  // ~cada 2 px de trabajo
    return out.length >= 2 ? out : null;
  };

  const MAX_DX = 3 / scale;                 // px de imagen por vértice como máximo
  let bfsBudget = 12;                       // saltos con trazado real por lado
  const dense: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const gap = Math.abs(b.x - a.x);
    if (gap > MAX_DX) {
      let replaced = false;
      if (gap * scale > 6 && bfsBudget > 0) {
        bfsBudget--;
        // filas de trabajo exactas + borde crudo (sin suavizar) como extremos
        const ay = Math.round(a.y * scale), by = Math.round(b.y * scale);
        if (raw[ay] >= 0 && raw[by] >= 0) {
          const path = borderPathBetween(Math.round(raw[ay]), ay, Math.round(raw[by]), by);
          if (path && path.length > 2) {
            for (let j = 1; j < path.length - 1; j++) dense.push(path[j]);
            replaced = true;
          }
        }
      }
      if (!replaced) {
        const k = Math.min(60, Math.ceil(gap / MAX_DX));
        for (let j = 1; j < k; j++) {
          const t = j / k;
          dense.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
      }
    }
    dense.push(b);
  }

  // Métricas de calidad (para elegir el lado correcto y descartar basura)
  let firstV = -1, lastV = -1, valid = 0;
  const jumps: number[] = [];
  let prev = -1;
  for (let y = 0; y < H; y++) {
    if (medArr[y] < 0) continue;
    valid++;
    if (firstV < 0) firstV = y;
    lastV = y;
    if (prev >= 0) jumps.push(Math.abs(medArr[y] - prev));
    prev = medArr[y];
  }
  const span = Math.max(1, lastV - firstV + 1);
  const coverage = valid / span;
  jumps.sort((a, b) => a - b);
  const roughness = jumps.length ? jumps[jumps.length >> 1] : 999;

  // Limpiar el trazado: quitar bucles (BFS serpenteando entre pelos sueltos) y
  // suavizar a fondo el zigzag (media móvil). El base no tiene anclas (sin
  // protect); el anclaje re-fija después los puntos anatómicos exactos.
  return { pts: smoothContour(removeSelfIntersections(dense), 3, 3), coverage, roughness };
}

/**
 * Traza el contorno del perfil de UN lado (compatibilidad).
 * @param faceDir 1 = la nariz mira a la IZQUIERDA (silueta = borde izquierdo);
 *                -1 = mira a la derecha (borde derecho).
 */
export function traceProfileContour(
  image: HTMLImageElement | HTMLCanvasElement,
  faceDir: 1 | -1,
): TraceResult | null {
  const fg = buildForeground(image);
  if (!fg) return null;
  return extractSide(fg, faceDir === 1 ? 'left' : 'right');
}

// ============ Anclaje del contorno a los puntos anatómicos ============
//
// El contorno detectado sigue el borde VISIBLE (incluye pelo, barba, bigote).
// Los puntos de línea media que coloca el usuario (Tr, G, …, Pog, Me, C) marcan
// el borde ANATÓMICO real. Esta función deforma el contorno para que pase
// exactamente por cada ancla, interpolando la corrección linealmente entre
// anclas consecutivas y desvaneciéndola más allá de la primera/última.
// Es O(n) sobre la polilínea → se puede recalcular en vivo mientras se arrastra.

/** Índice del punto del contorno más cercano en Y. Barrido lineal: desde que
 *  los saltos horizontales se sustituyen por la frontera real de la máscara,
 *  la Y del contorno ya no es estrictamente creciente (el hueco cervicomental
 *  baja y vuelve a subir) y la búsqueda binaria dejaría de ser válida. */
function nearestIndexByY(contour: Pt[], y: number): number {
  let best = 0, bd = Infinity;
  for (let i = 0; i < contour.length; i++) {
    const d = Math.abs(contour[i].y - y);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export interface ContourCandidates {
  left: TraceResult | null;    // trazado asumiendo nariz a la izquierda
  right: TraceResult | null;   // trazado asumiendo nariz a la derecha
}

/** Traza el contorno de ambos lados segmentando el fondo UNA sola vez. */
export function traceBothSides(
  image: HTMLImageElement | HTMLCanvasElement,
): ContourCandidates {
  let fg: Foreground | null = null;
  try { fg = buildForeground(image); } catch { /* fondo imposible */ }
  if (!fg) return { left: null, right: null };
  return { left: extractSide(fg, 'left'), right: extractSide(fg, 'right') };
}

/** Puntúa cuánto se parece un trazo a un PERFIL FACIAL (nariz + labios + mentón
 *  con sus concavidades) frente a la NUCA / PELO SUELTO. Es el discriminador de
 *  orientación: sirve para saber hacia dónde mira el rostro sin ningún punto.
 *  Devuelve un score adimensional (0 = nada facial).
 *
 *  Idea: en la banda nariz→mentón, se resta el "plano facial" (recta de mínimos
 *  cuadrados). Los residuos = protrusión perpendicular. Un perfil real tiene una
 *  ondulación GRANDE y SUAVE (nariz↑, subnasal↓, labio↑, surco↓, mentón↑); el
 *  pelo suelto de la nuca es un zigzag de ALTA FRECUENCIA. Por eso:
 *    - se mide la amplitud/alternancias sobre la señal FUERTEMENTE suavizada
 *      (conserva nariz/labio/mentón, borra el zigzag del pelo);
 *    - se PENALIZA el contenido de alta frecuencia (|residuo − suavizado|), que
 *      es bajo en una cara lisa y alto en mechones sueltos.
 *  Score = amplitud · (1 + alternancias) · suavidad. */
function faceProfileScore(c: TraceResult | null, imageW: number): number {
  if (!c) return 0;
  const p = c.pts;
  if (p.length < 12) return 0;
  const y0 = p[0].y, y1 = p[p.length - 1].y;
  const range = y1 - y0;
  if (range <= 0) return 0;
  // Banda nariz→mentón (evita pelo/frente arriba y cuello/ropa abajo)
  const top = y0 + range * 0.25, bot = y0 + range * 0.85;
  const band = p.filter((q) => q.y >= top && q.y <= bot);
  if (band.length < 8) return 0;
  // Recta de mínimos cuadrados x = a·y + b (el "plano facial" general)
  let sy = 0, sx = 0, syy = 0, sxy = 0; const n = band.length;
  for (const q of band) { sy += q.y; sx += q.x; syy += q.y * q.y; sxy += q.x * q.y; }
  const den = n * syy - sy * sy;
  const a = den !== 0 ? (n * sxy - sx * sy) / den : 0;
  const b = (sx - a * sy) / n;
  const res = band.map((q) => q.x - (a * q.y + b));
  // Low-pass FUERTE (~8% de la banda): conserva la escala nariz/labio/mentón,
  // borra el zigzag de alta frecuencia del pelo suelto.
  const win = Math.max(3, Math.round(n * 0.08));
  const sm = res.map((_, i) => {
    let s = 0, k = 0;
    for (let d = -win; d <= win; d++) { const j = i + d; if (j >= 0 && j < res.length) { s += res[j]; k++; } }
    return s / k;
  });
  let mn = Infinity, mx = -Infinity;
  for (const v of sm) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const amp = (mx - mn) / Math.max(1, imageW);       // nariz↔surco, normalizado
  // Contenido de alta frecuencia: bajo en cara lisa, alto en pelo dentado
  let hf = 0;
  for (let i = 0; i < res.length; i++) hf += Math.abs(res[i] - sm[i]);
  hf = (hf / res.length) / Math.max(1, imageW);
  // Alternancias de relieve sobre 16 muestras de la señal suavizada
  const K = 16;
  const samp: number[] = [];
  for (let i = 0; i < K; i++) samp.push(sm[Math.round(i * (sm.length - 1) / (K - 1))]);
  const thr = Math.max(1.5, imageW * 0.006);
  let alt = 0, prev = 0;
  for (let i = 1; i < K; i++) {
    const d = samp[i] - samp[i - 1];
    const s = d > thr ? 1 : d < -thr ? -1 : 0;
    if (s !== 0) { if (prev !== 0 && s !== prev) alt++; prev = s; }
  }
  const smoothness = 1 / (1 + hf * 120);             // pelo dentado → suavidad baja
  return amp * (1 + alt) * smoothness;
}

/** Orientación del rostro deducida de la estructura del perfil (sin puntos).
 *  1 = la nariz mira a la IZQUIERDA del espectador · -1 = a la derecha ·
 *  null = ningún lado parece un rostro con claridad. */
export function detectFaceDirection(
  cand: ContourCandidates | null,
  imageW: number,
): 1 | -1 | null {
  if (!cand) return null;
  const fL = faceProfileScore(cand.left, imageW);
  const fR = faceProfileScore(cand.right, imageW);
  if (Math.max(fL, fR) < 0.02) return null;
  return fL >= fR ? 1 : -1;
}

/** Elige el trazo correcto (cara, no nuca) entre los dos candidatos.
 *  - Con ≥3 anclas: gana el que mejor concuerda con ellas (con umbral de
 *    descarte si ninguno pasa cerca).
 *  - Sin anclas: solo trazos de calidad; si ambos parecen buenos, decide la
 *    estructura facial (curvatura) solo si la diferencia es clara.
 *  Devuelve la polilínea elegida o null si nada es fiable. */
export function selectContourSide(
  cand: ContourCandidates | null,
  anchors: Pt[],
  imageW: number,
): Pt[] | null {
  if (!cand) return null;
  if (anchors.length >= 3) {
    const eL = contourFitError(cand.left?.pts ?? null, anchors);
    const eR = contourFitError(cand.right?.pts ?? null, anchors);
    const best = eL <= eR ? cand.left : cand.right;
    const bestErr = Math.min(eL, eR);
    return best && bestErr <= Math.max(30, imageW * 0.06) ? best.pts : null;
  }
  const okQ = (c: TraceResult | null): c is TraceResult =>
    !!c && c.coverage >= 0.55 && c.roughness <= 5;
  const curv = (c: TraceResult) => {
    const p = c.pts;
    let s = 0;
    for (let i = 1; i < p.length - 1; i++) s += Math.abs(p[i + 1].x - 2 * p[i].x + p[i - 1].x);
    return s / Math.max(1, p.length - 2);
  };
  // Primero, identificar el lado del ROSTRO por su estructura (nariz+labios+
  // mentón). Es el criterio dominante: gana el que más parece un perfil, aunque
  // tenga algo más de ruido (pelo) que la nuca lisa del otro lado.
  const fL = faceProfileScore(cand.left, imageW);
  const fR = faceProfileScore(cand.right, imageW);
  if (Math.max(fL, fR) >= 0.02) {
    const pick = fL >= fR ? cand.left : cand.right;
    return pick ? pick.pts : null;
  }
  // Ningún lado parece claramente un rostro → recurrir a calidad + curvatura.
  const okL = okQ(cand.left), okR = okQ(cand.right);
  if (okL && !okR) return cand.left!.pts;
  if (okR && !okL) return cand.right!.pts;
  if (okL && okR) {
    const cL = curv(cand.left!), cR = curv(cand.right!);
    if (cL > cR * 2) return cand.left!.pts;
    if (cR > cL * 2) return cand.right!.pts;
  }
  return null;
}

/** Afila el contorno en un vértice anatómico (p. ej. Sn, el ápice del ángulo
 *  nasolabial): el suavizado del trazado redondea las esquinas, así que se
 *  sustituye el contorno por las dos rectas que forman el ángulo
 *  (upper→vértice→lower).
 *
 *  Los extremos `upper` y `lower` son los puntos anatómicos VECINOS (p. ej. la
 *  columela inmediatamente arriba y el labio inmediatamente abajo). Al usarlos
 *  como extremos, esos puntos quedan EXACTAMENTE sobre el contorno y el afilado
 *  no invade más allá de ellos — la columela por encima conserva su forma real.
 *  Si no se pasan, se usa una ventana en px (fallback). */
export function sharpenCornerAt(
  contour: Pt[], vertex: Pt,
  upper?: Pt | null, lower?: Pt | null,
  fallbackWindowPx = 30,
): Pt[] {
  const n = contour.length;
  if (n < 5) return contour;
  const i0 = nearestIndexByY(contour, vertex.y);
  const spacing = Math.max(0.5, (contour[n - 1].y - contour[0].y) / (n - 1));
  const K = Math.max(2, Math.round(fallbackWindowPx / spacing));
  const aPt = upper ?? contour[Math.max(0, i0 - K)];
  const bPt = lower ?? contour[Math.min(n - 1, i0 + K)];
  const ia = nearestIndexByY(contour, aPt.y);
  const ib = nearestIndexByY(contour, bPt.y);
  if (i0 - ia < 1 || ib - i0 < 1) return contour;
  const out = contour.slice();
  for (let i = ia; i <= i0; i++) {
    const t = i0 === ia ? 1 : (i - ia) / (i0 - ia);
    out[i] = { x: aPt.x + (vertex.x - aPt.x) * t, y: aPt.y + (vertex.y - aPt.y) * t };
  }
  for (let i = i0; i <= ib; i++) {
    const t = ib === i0 ? 0 : (i - i0) / (ib - i0);
    out[i] = { x: vertex.x + (bPt.x - vertex.x) * t, y: vertex.y + (bPt.y - vertex.y) * t };
  }
  return out;
}

/** Punto del contorno más cercano a `p` (por vértices — el contorno es denso,
 *  un punto por fila, así que no hace falta proyectar sobre segmentos). */
export function nearestOnContour(contour: Pt[], p: Pt): { pt: Pt; dist: number } {
  let best = contour[0], bd = Infinity;
  for (const c of contour) {
    const d = (c.x - p.x) * (c.x - p.x) + (c.y - p.y) * (c.y - p.y);
    if (d < bd) { bd = d; best = c; }
  }
  return { pt: { x: best.x, y: best.y }, dist: Math.sqrt(bd) };
}

/** Error de concordancia entre un contorno y un conjunto de puntos que
 *  DEBERÍAN estar sobre él: mediana de |Δx| en la fila de cada punto.
 *  Sirve para elegir el lado de escaneo correcto y descartar trazos malos. */
export function contourFitError(contour: Pt[] | null, anchors: Pt[]): number {
  if (!contour || contour.length < 2 || anchors.length === 0) return Infinity;
  const dxs = anchors.map((a) => {
    const i = nearestIndexByY(contour, a.y);
    return Math.abs(a.x - contour[i].x);
  }).sort((p, q) => p - q);
  return dxs[dxs.length >> 1];
}

/** Índice del punto del contorno geométricamente más cercano (distancia 2D). */
function nearestIndexEuclid(contour: Pt[], p: Pt): number {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < contour.length; i++) {
    const d = (contour[i].x - p.x) ** 2 + (contour[i].y - p.y) ** 2;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

export function anchorContourToPoints(
  contour: Pt[], anchors: Pt[], priorityAnchors: Pt[] = [],
): Pt[] {
  if (contour.length < 2 || anchors.length + priorityAnchors.length === 0) return contour;

  // 1) Ancla → (índice del contorno más cercano por DISTANCIA 2D, corrección
  //    dx/dy). El mapeo euclídeo + corrección 2D es clave en zonas donde el
  //    borde NO es función de la altura (submentón/cuello): ahí el mapeo por
  //    fila cruzaba las líneas. Si dos anclas caen en el mismo índice, gana la
  //    más cercana (menor corrección) — salvo las PRIORITARIAS (las del
  //    usuario), que mandan siempre sobre las normales (pines detectados).
  const marks = new Map<number, { dx: number; dy: number; d2: number; pri: boolean }>();
  const mark = (a: Pt, pri: boolean) => {
    const i = nearestIndexEuclid(contour, a);
    const dx = a.x - contour[i].x, dy = a.y - contour[i].y;
    const d2 = dx * dx + dy * dy;
    const prev = marks.get(i);
    if (!prev || (pri && !prev.pri) || (pri === prev.pri && d2 < prev.d2)) {
      marks.set(i, { dx, dy, d2, pri });
    }
  };
  for (const a of anchors) mark(a, false);
  for (const a of priorityAnchors) mark(a, true);
  const idxs = [...marks.keys()].sort((p, q) => p - q);

  // 2) Campo de correcciones 2D por índice: smoothstep entre anclas (derivada
  //    nula en cada ancla → sin codos visibles) y desvanecido suave a 0 en
  //    FALLOFF índices más allá de la primera y la última.
  const n = contour.length;
  const FALLOFF = Math.max(20, Math.round(n * 0.10));
  const DX = new Float32Array(n), DY = new Float32Array(n);
  const ease = (t: number) => t * t * (3 - 2 * t);   // smoothstep

  const first = idxs[0], last = idxs[idxs.length - 1];
  for (let k = 0; k < idxs.length - 1; k++) {
    const i0 = idxs[k], i1 = idxs[k + 1];
    const m0 = marks.get(i0)!, m1 = marks.get(i1)!;
    for (let i = i0; i <= i1; i++) {
      const t = i1 === i0 ? 0 : ease((i - i0) / (i1 - i0));
      DX[i] = m0.dx + (m1.dx - m0.dx) * t;
      DY[i] = m0.dy + (m1.dy - m0.dy) * t;
    }
  }
  const mFirst = marks.get(first)!, mLast = marks.get(last)!;
  for (let i = Math.max(0, first - FALLOFF); i < first; i++) {
    const t = ease((i - (first - FALLOFF)) / FALLOFF);
    DX[i] = mFirst.dx * t; DY[i] = mFirst.dy * t;
  }
  for (let i = last + 1; i <= Math.min(n - 1, last + FALLOFF); i++) {
    const t = ease(1 - (i - last) / FALLOFF);
    DX[i] = mLast.dx * t; DY[i] = mLast.dy * t;
  }
  // Garantía de exactitud: cada índice-ancla lleva SU corrección completa.
  // Cubre el caso de ancla ÚNICA (first === last), donde los bucles de tramo
  // no se ejecutan y el índice del ancla quedaba sin corregir — el contorno
  // se deformaba alrededor del ancla pero no pasaba por ella.
  for (const [i, mk] of marks) { DX[i] = mk.dx; DY[i] = mk.dy; }

  // 3) Aplicar corrección 2D
  return contour.map((p, i) => (DX[i] !== 0 || DY[i] !== 0 ? { x: p.x + DX[i], y: p.y + DY[i] } : p));
}

/** Punto de intersección de los segmentos ab y cd (interior estricto), o null. */
function segIntersect(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
  if (t > 0 && t < 1 && u > 0 && u < 1) {
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  }
  return null;
}

/** Media móvil sobre la polilínea (pasa-bajos): elimina el zigzag de alta
 *  frecuencia del trazado (pasos de píxel, serpenteo del BFS entre pelos). Se
 *  puede aplicar a fondo sobre el contorno BASE porque el anclaje re-fija
 *  después los puntos anatómicos exactos — la forma entre ellos solo debe ser
 *  suave. `protect` deja intactos los vértices cercanos a esos puntos. */
export function smoothContour(
  poly: Pt[], win = 3, passes = 3, protect: Pt[] = [], protectR = 0,
): Pt[] {
  if (poly.length < 2 * win + 1) return poly;
  const pr2 = protectR * protectR;
  const isProtected = (p: Pt): boolean => {
    for (const q of protect) {
      const dx = p.x - q.x, dy = p.y - q.y;
      if (dx * dx + dy * dy < pr2) return true;
    }
    return false;
  };
  const nn = 2 * win + 1;
  let cur = poly;
  for (let pass = 0; pass < passes; pass++) {
    const next = cur.slice();
    for (let i = win; i < cur.length - win; i++) {
      if (protectR > 0 && isProtected(cur[i])) continue;
      let sx = 0, sy = 0;
      for (let k = -win; k <= win; k++) { sx += cur[i + k].x; sy += cur[i + k].y; }
      next[i] = { x: sx / nn, y: sy / nn };
    }
    cur = next;
  }
  return cur;
}

/** Aplana MUESCAS/PICOS AGUDOS: vértices donde el contorno gira bruscamente
 *  (giro > ~107°, cos < cosThresh) son artefactos (pelo suelto, zigzag del BFS)
 *  — anatómicamente el perfil no tiene picos agudos. Cada pico se lleva al punto
 *  medio de sus vecinos; varias pasadas suavizan picos de 2–4 vértices.
 *
 *  Curvas suaves (dorso, mentón) y esquinas anatómicas legítimas (nariz, ángulo
 *  nasolabial ~80° de giro) tienen cos por encima del umbral → NO se tocan. Los
 *  vértices dentro de `protectR` de un punto `protect` (anclas + vértice Sn) se
 *  dejan intactos, para no despegar el contorno de los puntos ni redondear la
 *  esquina de Sn. */
export function smoothSpikes(
  poly: Pt[], passes = 3, cosThresh = -0.3, protect: Pt[] = [], protectR = 0,
): Pt[] {
  if (poly.length < 5) return poly;
  const pr2 = protectR * protectR;
  const isProtected = (p: Pt): boolean => {
    for (const q of protect) {
      const dx = p.x - q.x, dy = p.y - q.y;
      if (dx * dx + dy * dy < pr2) return true;
    }
    return false;
  };
  let cur = poly;
  for (let pass = 0; pass < passes; pass++) {
    const next = cur.slice();
    let changed = false;
    for (let i = 1; i < cur.length - 1; i++) {
      const a = cur[i - 1], b = cur[i], c = cur[i + 1];
      if (protectR > 0 && isProtected(b)) continue;
      const v1x = b.x - a.x, v1y = b.y - a.y;
      const v2x = c.x - b.x, v2y = c.y - b.y;
      const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
      if (m1 < 1e-6 || m2 < 1e-6) continue;
      const cosang = (v1x * v2x + v1y * v2y) / (m1 * m2);
      if (cosang < cosThresh) {
        next[i] = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
        changed = true;
      }
    }
    cur = next;
    if (!changed) break;
  }
  return cur;
}

/** Elimina auto-intersecciones (bucles) de la polilínea: cuando el segmento i
 *  cruza un segmento j cercano (dentro de `window` índices), se corta el lazo
 *  i+1..j y se sustituye por el punto de cruce. Cubre los bucles del trazado
 *  BFS que serpentea entre pelos sueltos y los que puede introducir el anclaje.
 *  Los lazos son LOCALES (pocos índices), por eso basta una ventana acotada:
 *  O(n·window). */
export function removeSelfIntersections(poly: Pt[], window = 90): Pt[] {
  if (poly.length < 4) return poly;
  const out = poly.slice();
  let i = 0, guard = 0;
  const maxGuard = out.length * 3;
  while (i < out.length - 1 && guard++ < maxGuard) {
    const a = out[i], b = out[i + 1];
    const jmax = Math.min(out.length - 1, i + window);
    let cut = -1, X: Pt | null = null;
    for (let j = i + 2; j < jmax; j++) {
      const p = segIntersect(a, b, out[j], out[j + 1]);
      if (p) { cut = j; X = p; break; }
    }
    if (cut >= 0 && X) {
      out.splice(i + 1, cut - i, X);   // quita i+1..cut, inserta el cruce → re-chequea i
    } else {
      i++;
    }
  }
  return out;
}
