import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './components/Icon';
import jsPDF from 'jspdf';
import Toolbar from './components/Toolbar';
import CanvasArea, {
  type Tool, type CustomLine, type CustomAngle, type Calibration, type Ruler,
} from './components/CanvasArea';
import ResultsTable from './components/ResultsTable';
import CameraCapture from './components/CameraCapture';
import {
  pointsForMode, linesForMode, FRONTAL_GUIDES, PROFILE_GUIDES,
  ANGLE_MEASURES,
  farkasMeasurements, farkasSymmetryIndex, pairSymmetry, evaluateThirds, frontalThirds, FIFTH_LABELS,
  computeThirds, computeFifths,
  goodeNasalProjection, goodeVerdict, chinProjectionSigned, frankfortFacialAngle,
  nasofacialAngle, NASOFACIAL_IDEAL, NASOFACIAL_TOL,
  frankfortTipRotation, TIPROT_IDEAL, TIPROT_TOL,
  alarColumellarRelation, classifyGunter, gunterInfo,
  angle3pt, distance, evaluate,
  type PointId, type Pt, type Mode,
} from './cephalometry';
import { detectFaceLandmarks, preloadModel, MODELS, type ModelKey } from './faceDetection';
import RhinoplastyPanel from './components/RhinoplastyPanel';
import AnnotationPanel from './components/AnnotationPanel';
import LayersPanel from './components/LayersPanel';
import {
  traceBothSides, selectContourSide, nearestOnContour,
  type ContourCandidates,
} from './profileContour';
import { loadDataset } from './dataset';
import {
  DEFAULT_RHINO_SIM, getActiveChanges,
  originalNasalSilhouette, computeSimulatedNose, refineNoseTip,
  nasolabialFromSilhouette, nasofrontalFromSilhouette, nasalProjectionFromSilhouette,
  type RhinoplastySim, type RhinoHandle,
} from './rhinoplasty';

export type PointSource = 'detected' | 'user';
export interface PointMeta { source: PointSource; confidence: number; }

export interface Viewport { zoom: number; panX: number; panY: number; }

interface ModeState {
  imageSrc: string | null;
  originalSize: { w: number; h: number } | null;
  rotationAngle: number;  // grados, positivo = horario
  flipH: boolean;         // espejo horizontal (canonizar orientación de perfil)
  points: Partial<Record<PointId, Pt>>;
  pointMeta: Partial<Record<PointId, PointMeta>>;
  confirmedPoints: Partial<Record<PointId, boolean>>; // modo anotación
  customLines: CustomLine[];
  customAngles: CustomAngle[];
  rulers: Ruler[];
  contourAnchors: Pt[];        // anclas libres para ajustar el contorno (pelo/barba)
  calibration: Calibration | null;
  refCalibMm: number | null;   // calibración por distancia anatómica (intercantal / N–Pn)
  activePointId: PointId | null;   // null = ningún punto seleccionado
  visibleLines: Record<string, boolean>;
  // Capas de análisis — visibilidad granular gestionada por LayersPanel
  pointsHidden: PointId[];          // puntos explícitamente ocultos (default: ninguno)
  anglesShown:  string[];           // ángulos dibujados sobre el canvas (default: ninguno)
  measuresHidden: string[];         // categorías de medida ocultas (default: ninguna)
  layersPanelOpen: boolean;
  layersSectionsOpen: { points: boolean; lines: boolean; angles: boolean; measures: boolean };
  confirmed: boolean;
  detectionStatus: 'idle' | 'detecting' | 'done' | 'failed';
  detectionError: string | null;
  detectionWarning: string | null;
  detectionUsedMirror: boolean;
  viewport: Viewport;
}

// ============ Persistencia de capas en localStorage ============
const LAYERS_KEY = (mode: Mode) => `rhinoplan_layers_${mode}`;
interface PersistedLayers {
  visibleLines?: Record<string, boolean>;
  pointsHidden?: PointId[];
  anglesShown?:  string[];
  measuresHidden?: string[];
  layersPanelOpen?: boolean;
  layersSectionsOpen?: { points: boolean; lines: boolean; angles: boolean; measures: boolean };
}
function loadLayers(mode: Mode): PersistedLayers {
  try {
    const raw = localStorage.getItem(LAYERS_KEY(mode));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveLayers(mode: Mode, s: ModeState) {
  try {
    const payload: PersistedLayers = {
      visibleLines: s.visibleLines,
      pointsHidden: s.pointsHidden,
      anglesShown:  s.anglesShown,
      measuresHidden: s.measuresHidden,
      layersPanelOpen: s.layersPanelOpen,
      layersSectionsOpen: s.layersSectionsOpen,
    };
    localStorage.setItem(LAYERS_KEY(mode), JSON.stringify(payload));
  } catch {}
}

function initialState(mode: Mode): ModeState {
  const firstPoint = pointsForMode(mode)[0]?.id ?? 'G';
  const visibleLines: Record<string, boolean> = {};
  if (mode === 'perfil') {
    for (const ln of linesForMode('perfil')) {
      visibleLines[ln.id] = ['E', 'NSn', 'MeC'].includes(ln.id);
    }
    for (const g of PROFILE_GUIDES) visibleLines[g.id] = g.defaultVisible;
  } else {
    for (const g of FRONTAL_GUIDES) visibleLines[g.id] = g.defaultVisible;
  }
  // Merge con persistencia
  const stored = loadLayers(mode);
  return {
    imageSrc: null,
    originalSize: null,
    rotationAngle: 0,
    flipH: false,
    points: {},
    pointMeta: {},
    confirmedPoints: {},
    customLines: [],
    customAngles: [],
    rulers: [],
    contourAnchors: [],
    calibration: null,
    refCalibMm: null,
    activePointId: firstPoint,
    visibleLines: { ...visibleLines, ...(stored.visibleLines ?? {}) },
    pointsHidden:   stored.pointsHidden ?? [],
    anglesShown:    stored.anglesShown  ?? [],
    measuresHidden: stored.measuresHidden ?? [],
    layersPanelOpen: stored.layersPanelOpen ?? false,
    layersSectionsOpen: stored.layersSectionsOpen ?? {
      points: false, lines: true, angles: false, measures: false,
    },
    confirmed: false,
    detectionStatus: 'idle',
    detectionError: null,
    detectionWarning: null,
    detectionUsedMirror: false,
    viewport: { zoom: 1, panX: 0, panY: 0 },
  };
}

// Lado mayor máximo de la imagen de trabajo. Cap de MEMORIA: un canvas RGBA de
// 24 MP ≈ 96 MB, y Safari/iPad mata la pestaña con eso. A 2400 px son ~4 MP
// (~15 MB), suficiente para landmarks (la cara ocupa >1000 px de alto) y para
// la detección (el modelo hace letterbox a 640). No afecta a la precisión: las
// medidas son ángulos/proporciones o se calibran en el mismo espacio de imagen.
const MAX_IMAGE_SIDE = 2400;

/** Reescala un data URL si su lado mayor supera `maxSide`. Preserva la
 *  orientación EXIF (dibuja el <img>, que el navegador ya auto-orienta) y el
 *  aspect ratio. No-op si la imagen ya es pequeña o si falla la carga. */
function downscaleDataUrl(dataUrl: string, maxSide = MAX_IMAGE_SIDE): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight, long = Math.max(w, h);
      if (!long || long <= maxSide) { resolve(dataUrl); return; }
      const s = maxSide / long;
      const c = document.createElement('canvas');
      c.width = Math.round(w * s); c.height = Math.round(h * s);
      const ctx = c.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export default function App() {
  const [mode, setMode] = useState<Mode>('perfil');
  const [modeStates, setModeStates] = useState<Record<Mode, ModeState>>({
    perfil: initialState('perfil'),
    frente: initialState('frente'),
  });
  const [imageEls, setImageEls] = useState<Record<Mode, HTMLImageElement | HTMLCanvasElement | null>>({
    perfil: null, frente: null,
  });
  // Cache de las imágenes originales (sin rotación) para no re-decodificar
  const originalImagesRef = useRef<Record<Mode, HTMLImageElement | null>>({
    perfil: null, frente: null,
  });
  const [tool, setTool] = useState<Tool>('point');
  const [showCamera, setShowCamera] = useState(false);

  // Refs espejo para closures estables (atajos de teclado, historial)
  const modeRef = useRef(mode);
  modeRef.current = mode;

  /** Cambia de herramienta. Al elegir la HERRAMIENTA "Punto" (botón/atajo) se
   *  LIMPIA la selección: sin esto, quedaba preseleccionado el último punto
   *  usado y el siguiente click lo movía sin querer. */
  function selectTool(t: Tool) {
    if (t === 'point') {
      const m = modeRef.current;
      setModeStates((prev) => ({ ...prev, [m]: { ...prev[m], activePointId: null } }));
    }
    setTool(t);
  }

  /** Elegir un punto CONCRETO de la lista: lo selecciona y activa la
   *  herramienta Punto SIN limpiar (a diferencia de selectTool). */
  function pickPoint(id: PointId) {
    patchCurrent({ activePointId: id });
    setTool('point');
  }
  // Modelo de detección fijo por modo: MediaPipe para frente (478 pts,
  // excelente frontal) y el modelo propio para perfil (entrenado con el
  // dataset perfilométrico). Sin selector — cada vista usa su especialista.
  const detectionModel: ModelKey = mode === 'frente' ? 'mediapipe' : 'custom';
  // Tema de la interfaz (oscuro/claro), persistido. Los colores clínicos del
  // canvas no cambian; solo la paleta de la UI.
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('rhinoplan_theme') === 'light' ? 'light' : 'dark'),
  );
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('rhinoplan_theme', theme); } catch { /* ignore */ }
  }, [theme]);
  const [magnifierEnabled, setMagnifierEnabled] = useState(true);
  // Paneles laterales retraíbles INDIVIDUALMENTE (botones en los bordes del visor)
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [resultsHidden, setResultsHidden] = useState(false);
  // Barra superior retraíble (pestaña en el borde superior del visor)
  const [topbarHidden, setTopbarHidden] = useState(false);
  // Toast de confirmación (export, confirmar puntos) — autodescartable
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number>(0);
  function showToast(msg: string) {
    setToast(msg);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  }
  const [edgeSnapEnabled, setEdgeSnapEnabled] = useState(true);
  const [templateVisible, setTemplateVisible] = useState(false);
  // Escala del texto de las etiquetas sobre la foto (slider del usuario)
  const [labelScale, setLabelScale] = useState<number>(() => {
    const s = parseFloat(localStorage.getItem('rhinoplan_label_scale') ?? '');
    return isFinite(s) && s > 0 ? s : 1.2;
  });
  useEffect(() => {
    try { localStorage.setItem('rhinoplan_label_scale', String(labelScale)); } catch {}
  }, [labelScale]);
  // Rinoplastia
  const [rhinoSimActive, setRhinoSimActive] = useState(false);
  const [rhinoSim, setRhinoSim] = useState<RhinoplastySim>(DEFAULT_RHINO_SIM);
  const [rhinoShowOriginal, setRhinoShowOriginal] = useState(true);
  const [rhinoWarpPhoto, setRhinoWarpPhoto] = useState(true);
  // Deformadores libres del modo simulación (arrastres sobre la foto)
  const [rhinoHandles, setRhinoHandles] = useState<RhinoHandle[]>([]);
  // Modo edición de deformadores: apagado (defecto), arrastrar sobre la foto
  // DESPLAZA la imagen ampliada como siempre; encendido, crea/edita deformadores.
  const [rhinoEditHandles, setRhinoEditHandles] = useState(false);
  // Visibilidad de las flechas ámbar (el warp se sigue aplicando ocultas)
  const [rhinoShowHandles, setRhinoShowHandles] = useState(true);
  // Radio (multiplicador) con el que se CREAN los nuevos deformadores
  const [rhinoNewHandleRadius, setRhinoNewHandleRadius] = useState(1);
  // Vista dividida antes/después con divisor arrastrable. Por defecto APAGADA:
  // se ve la foto completa proyectada (+ línea original tenue si se activa),
  // que compara mejor sin el corte vertical.
  const [rhinoSplitView, setRhinoSplitView] = useState(false);
  // Mostrar la línea verde de la silueta simulada sobre la foto
  const [rhinoShowSimLine, setRhinoShowSimLine] = useState(true);
  const [rhinoDividerRatio, setRhinoDividerRatio] = useState(0.5);

  // ============ Deshacer de la simulación de rinoplastia ============
  // Historial propio de {sliders, deformadores} — independiente del Deshacer
  // general (puntos/anclas), que no toca el estado de la simulación. Las
  // ráfagas (arrastre de un slider o de una empuñadura) se agrupan: solo se
  // apila un snapshot si pasaron >800 ms desde el anterior.
  const rhinoSimRef = useRef(rhinoSim);
  const rhinoHandlesRef = useRef(rhinoHandles);
  useEffect(() => { rhinoSimRef.current = rhinoSim; }, [rhinoSim]);
  useEffect(() => { rhinoHandlesRef.current = rhinoHandles; }, [rhinoHandles]);
  const rhinoHistRef = useRef<{ sim: RhinoplastySim; handles: RhinoHandle[] }[]>([]);
  const rhinoRedoRef = useRef<{ sim: RhinoplastySim; handles: RhinoHandle[] }[]>([]);
  const rhinoLastPushRef = useRef(0);
  const [rhinoCanUndo, setRhinoCanUndo] = useState(false);
  const [rhinoCanRedo, setRhinoCanRedo] = useState(false);
  const pushRhinoHistory = useCallback((force = false) => {
    // Cualquier cambio NUEVO invalida la rama de rehacer (semántica estándar)
    rhinoRedoRef.current = [];
    setRhinoCanRedo(false);
    const now = Date.now();
    if (!force && now - rhinoLastPushRef.current < 800) return;
    const snap = { sim: rhinoSimRef.current, handles: rhinoHandlesRef.current };
    const hist = rhinoHistRef.current;
    const last = hist[hist.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(snap)) return;
    rhinoLastPushRef.current = now;
    hist.push(snap);
    if (hist.length > 40) hist.shift();
    setRhinoCanUndo(true);
  }, []);
  // Setters con historial: cualquier cambio de sliders o deformadores apila
  // primero el estado previo. Estables (useCallback) — CanvasArea registra
  // listeners de drag con setRhinoHandles en las dependencias.
  const setRhinoSimTracked = useCallback((s: RhinoplastySim) => {
    pushRhinoHistory();
    setRhinoSim(s);
  }, [pushRhinoHistory]);
  const setRhinoHandlesTracked = useCallback((v: React.SetStateAction<RhinoHandle[]>) => {
    pushRhinoHistory();
    setRhinoHandles(v);
  }, [pushRhinoHistory]);
  function undoRhino() {
    const snap = rhinoHistRef.current.pop();
    if (!snap) return;
    // El estado actual pasa a la pila de rehacer
    rhinoRedoRef.current.push({ sim: rhinoSimRef.current, handles: rhinoHandlesRef.current });
    setRhinoCanRedo(true);
    setRhinoSim(snap.sim);
    setRhinoHandles(snap.handles);
    setRhinoCanUndo(rhinoHistRef.current.length > 0);
    rhinoLastPushRef.current = 0;   // el siguiente cambio apila de inmediato
  }
  function redoRhino() {
    const snap = rhinoRedoRef.current.pop();
    if (!snap) return;
    // El estado actual vuelve a la pila de deshacer (sin pasar por
    // pushRhinoHistory, que vaciaría la rama de rehacer)
    rhinoHistRef.current.push({ sim: rhinoSimRef.current, handles: rhinoHandlesRef.current });
    if (rhinoHistRef.current.length > 40) rhinoHistRef.current.shift();
    setRhinoCanUndo(true);
    setRhinoSim(snap.sim);
    setRhinoHandles(snap.handles);
    setRhinoCanRedo(rhinoRedoRef.current.length > 0);
    rhinoLastPushRef.current = 0;
  }
  // Modo anotación
  const [annotationModeActive, setAnnotationModeActive] = useState(false);
  const [datasetCount, setDatasetCount] = useState(() => loadDataset().cases.length);
  // Refrescar contador cada vez que se abre/cierra el panel o se monta el componente
  useEffect(() => { setDatasetCount(loadDataset().cases.length); }, [annotationModeActive]);

  // Persistir capas de análisis en localStorage cuando cambian
  useEffect(() => { saveLayers('perfil', modeStates.perfil); }, [
    modeStates.perfil.visibleLines,
    modeStates.perfil.pointsHidden,
    modeStates.perfil.anglesShown,
    modeStates.perfil.measuresHidden,
    modeStates.perfil.layersPanelOpen,
    modeStates.perfil.layersSectionsOpen,
  ]);
  useEffect(() => { saveLayers('frente', modeStates.frente); }, [
    modeStates.frente.visibleLines,
    modeStates.frente.pointsHidden,
    modeStates.frente.anglesShown,
    modeStates.frente.measuresHidden,
    modeStates.frente.layersPanelOpen,
    modeStates.frente.layersSectionsOpen,
  ]);

  const current = modeStates[mode];
  const imageEl = imageEls[mode];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Lo rellena CanvasArea: compone foto + anotaciones para la exportación
  const exportComposerRef = useRef<(() => HTMLCanvasElement | null) | null>(null);

  // Precarga del modelo seleccionado en background
  useEffect(() => { preloadModel(detectionModel); }, [detectionModel]);

  // Contorno del perfil: se traza UNA vez por imagen desde ambos lados.
  // Lo usan (1) CanvasArea para dibujar la silueta y (2) onDetect para anclar
  // los puntos automáticos al borde real.
  const contourCandidates = useMemo<ContourCandidates | null>(() => {
    if (mode !== 'perfil' || !imageEl) return null;
    try { return traceBothSides(imageEl); } catch { return null; }
  }, [mode, imageEl]);

  const mmPerPx = useMemo(() => {
    // 1) Calibración manual (herramienta Calibrar) tiene prioridad.
    const cal = current.calibration;
    if (cal) {
      const pxDist = distance(cal.p1, cal.p2);
      if (pxDist) return cal.mm / pxDist;
    }
    // 2) Calibración anatómica predeterminada: intercantal (frente) o N–Pn (perfil).
    const refMm = current.refCalibMm;
    if (refMm && refMm > 0) {
      const a = mode === 'frente' ? current.points['en_d'] : current.points['N'];
      const b = mode === 'frente' ? current.points['en_i'] : current.points['Pn'];
      if (a && b) {
        const pxDist = distance(a, b);
        if (pxDist) return refMm / pxDist;
      }
    }
    return null;
  }, [current.calibration, current.refCalibMm, current.points, mode]);

  useEffect(
    () => loadAndRotate('perfil', modeStates.perfil.imageSrc, modeStates.perfil.rotationAngle, modeStates.perfil.flipH),
    [modeStates.perfil.imageSrc, modeStates.perfil.rotationAngle, modeStates.perfil.flipH],
  );
  useEffect(
    () => loadAndRotate('frente', modeStates.frente.imageSrc, modeStates.frente.rotationAngle, modeStates.frente.flipH),
    [modeStates.frente.imageSrc, modeStates.frente.rotationAngle, modeStates.frente.flipH],
  );

  function loadAndRotate(m: Mode, src: string | null, angle: number, flipH: boolean) {
    if (!src) {
      originalImagesRef.current[m] = null;
      setImageEls((prev) => ({ ...prev, [m]: null }));
      return;
    }
    const cached = originalImagesRef.current[m];
    if (cached && cached.src === src && cached.complete) {
      renderImage(m, cached, angle, flipH);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      originalImagesRef.current[m] = img;
      // Guarda dimensiones originales si aún no estaban
      setModeStates((prev) => {
        const cur = prev[m];
        if (cur.originalSize) return prev;
        return {
          ...prev,
          [m]: { ...cur, originalSize: { w: img.naturalWidth, h: img.naturalHeight } },
        };
      });
      renderImage(m, img, angle, flipH);
    };
    img.src = src;
  }

  /** Crea un canvas con la imagen espejada horizontalmente (fuente para flip). */
  function mirrorSource(img: HTMLImageElement): HTMLCanvasElement {
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.translate(w, 0); ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0);
    return c;
  }

  /** Prepara la fuente (espejada si flipH) y aplica rotación + recorte. */
  function renderImage(m: Mode, img: HTMLImageElement, angle: number, flipH: boolean) {
    const source: CanvasImageSource = flipH ? mirrorSource(img) : img;
    applyRotationToCanvas(m, source, img.naturalWidth, img.naturalHeight, angle);
  }

  function applyRotationToCanvas(m: Mode, source: CanvasImageSource, W: number, H: number, angle: number) {
    if (!angle) {
      setImageEls((prev) => ({ ...prev, [m]: source as HTMLImageElement | HTMLCanvasElement }));
      return;
    }
    const rad = (angle * Math.PI) / 180;
    const cosA = Math.abs(Math.cos(rad));
    const sinA = Math.abs(Math.sin(rad));
    // Bounding box completo (intermedio)
    const bigW = W * cosA + H * sinA;
    const bigH = W * sinA + H * cosA;
    // Mayor rectángulo recto centrado con mismo aspect ratio que cabe dentro
    const sideX = Math.min(
      (W * W) / (W * cosA + H * sinA),
      (W * H) / (W * sinA + H * cosA),
    );
    const sideY = sideX * (H / W);
    // 1) Render rotado completo en un canvas temporal
    const big = document.createElement('canvas');
    big.width = Math.round(bigW);
    big.height = Math.round(bigH);
    const bctx = big.getContext('2d');
    if (!bctx) return;
    bctx.translate(big.width / 2, big.height / 2);
    bctx.rotate(rad);
    bctx.drawImage(source, -W / 2, -H / 2);
    // 2) Recortar la región central al rectángulo inscrito
    const c = document.createElement('canvas');
    c.width = Math.round(sideX);
    c.height = Math.round(sideY);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const offX = (big.width - c.width) / 2;
    const offY = (big.height - c.height) / 2;
    ctx.drawImage(big, offX, offY, c.width, c.height, 0, 0, c.width, c.height);
    setImageEls((prev) => ({ ...prev, [m]: c }));
  }

  /** Cambia la rotación y transforma puntos + calibración por el delta. */
  function setRotation(newAngleOrFn: number | ((prev: number) => number)) {
    setModeStates((prev) => {
      const cur = prev[mode];
      const requested = typeof newAngleOrFn === 'function'
        ? newAngleOrFn(cur.rotationAngle)
        : newAngleOrFn;
      const newAngle = Math.max(-180, Math.min(180, requested));
      const oldAngle = cur.rotationAngle;
      const delta = newAngle - oldAngle;
      if (Math.abs(delta) < 1e-4) return prev;
      if (!cur.originalSize) return { ...prev, [mode]: { ...cur, rotationAngle: newAngle } };

      const oW = cur.originalSize.w, oH = cur.originalSize.h;
      // Dimensiones del CANVAS RECORTADO (rect inscrito con aspect ratio original)
      const cropDims = (angDeg: number) => {
        if (angDeg === 0) return { w: oW, h: oH };
        const r = (angDeg * Math.PI) / 180;
        const cosA = Math.abs(Math.cos(r));
        const sinA = Math.abs(Math.sin(r));
        const sX = Math.min(
          (oW * oW) / (oW * cosA + oH * sinA),
          (oW * oH) / (oW * sinA + oH * cosA),
        );
        return { w: sX, h: sX * (oH / oW) };
      };
      const oldDim = cropDims(oldAngle);
      const newDim = cropDims(newAngle);
      const oldCenter = { x: oldDim.w / 2, y: oldDim.h / 2 };
      const newCenter = { x: newDim.w / 2, y: newDim.h / 2 };

      const dRad = (delta * Math.PI) / 180;
      const dcos = Math.cos(dRad), dsin = Math.sin(dRad);
      const tf = (p: Pt): Pt => {
        const dx = p.x - oldCenter.x, dy = p.y - oldCenter.y;
        return {
          x: newCenter.x + dx * dcos - dy * dsin,
          y: newCenter.y + dx * dsin + dy * dcos,
        };
      };

      const newPoints: typeof cur.points = {};
      for (const [id, p] of Object.entries(cur.points) as [PointId, Pt][]) {
        newPoints[id] = tf(p);
      }
      const newCal = cur.calibration
        ? { ...cur.calibration, p1: tf(cur.calibration.p1), p2: tf(cur.calibration.p2) }
        : null;
      const newRulers = cur.rulers.map((r) => ({ p1: tf(r.p1), p2: tf(r.p2) }));
      const newContourAnchors = cur.contourAnchors.map(tf);

      return {
        ...prev,
        [mode]: {
          ...cur,
          rotationAngle: newAngle,
          points: newPoints,
          calibration: newCal,
          rulers: newRulers,
          contourAnchors: newContourAnchors,
          viewport: { zoom: 1, panX: 0, panY: 0 }, // recentrar
        },
      };
    });
  }

  /** Voltea la imagen en horizontal (espejo) y refleja puntos/reglas/calibración
   *  en X respecto al ancho del canvas mostrado. Útil para canonizar la
   *  orientación de los perfiles antes de anotar. */
  function toggleFlipH() {
    const el = imageEls[mode];
    setModeStates((prev) => {
      const cur = prev[mode];
      if (!el) return { ...prev, [mode]: { ...cur, flipH: !cur.flipH } };
      const W = el instanceof HTMLImageElement ? el.naturalWidth : el.width;
      const fx = (p: Pt): Pt => ({ x: W - p.x, y: p.y });
      const newPoints: typeof cur.points = {};
      for (const [id, p] of Object.entries(cur.points) as [PointId, Pt][]) newPoints[id] = fx(p);
      const newCal = cur.calibration
        ? { ...cur.calibration, p1: fx(cur.calibration.p1), p2: fx(cur.calibration.p2) }
        : null;
      const newRulers = cur.rulers.map((r) => ({ p1: fx(r.p1), p2: fx(r.p2) }));
      const newContourAnchors = cur.contourAnchors.map(fx);
      return {
        ...prev,
        [mode]: {
          ...cur,
          flipH: !cur.flipH,
          points: newPoints,
          calibration: newCal,
          rulers: newRulers,
          contourAnchors: newContourAnchors,
          viewport: { zoom: 1, panX: 0, panY: 0 },
        },
      };
    });
  }

  /** Auto-enderezar usando puntos colocados:
   *  - Frente: nivela pupilas (o cantos internos como fallback).
   *  - Perfil: PRIORIDAD al plano de Frankfort (Po–Or horizontal). Si no están,
   *    fallback a verticalizar G–Me (o equivalentes Tr/Pog). */
  function autoStraighten() {
    const pts = current.points;
    let tiltDeg: number | null = null;
    if (mode === 'frente') {
      if (pts.pu_d && pts.pu_i) {
        tiltDeg = (Math.atan2(pts.pu_i.y - pts.pu_d.y, pts.pu_i.x - pts.pu_d.x) * 180) / Math.PI;
      } else if (pts.en_d && pts.en_i) {
        tiltDeg = (Math.atan2(pts.en_i.y - pts.en_d.y, pts.en_i.x - pts.en_d.x) * 180) / Math.PI;
      }
    } else {
      // 1ª prioridad: plano de Frankfort (Po–Or) → horizontal (anatómicamente correcto)
      if (pts.Po && pts.Or) {
        const ang = (Math.atan2(pts.Or.y - pts.Po.y, pts.Or.x - pts.Po.x) * 180) / Math.PI;
        // Normalizar a (-90, 90] — el ángulo respecto a la horizontal,
        // independientemente de si la cara mira a izquierda o derecha
        let tilt = ang;
        while (tilt > 90) tilt -= 180;
        while (tilt <= -90) tilt += 180;
        tiltDeg = tilt;
      } else {
        // Fallback: verticalizar G–Me (tejidos blandos)
        const a = pts.G ?? pts.Tr;
        const b = pts.Me ?? pts.Pog;
        if (a && b) {
          const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
          tiltDeg = ang - 90; // queremos vertical (90° desde +X)
        }
      }
    }
    if (tiltDeg == null) return;
    setRotation(current.rotationAngle - tiltDeg);
  }

  const canAutoStraighten = useMemo(() => {
    const p = current.points;
    if (mode === 'frente') return !!((p.pu_d && p.pu_i) || (p.en_d && p.en_i));
    return !!((p.Po && p.Or) || (p.G && p.Me) || (p.Tr && p.Me) || (p.Tr && p.Pog));
  }, [current.points, mode]);

  /** Etiqueta del método actual de auto-enderezar (para el tooltip). */
  const autoStraightenMethod = useMemo<string>(() => {
    const p = current.points;
    if (mode === 'frente') {
      if (p.pu_d && p.pu_i) return 'nivelando pupilas';
      if (p.en_d && p.en_i) return 'nivelando cantos internos';
      return '';
    }
    if (p.Po && p.Or) return 'horizontalizando Frankfort (Po–Or)';
    if (p.G && p.Me) return 'verticalizando G–Me';
    if (p.Tr && p.Me) return 'verticalizando Tr–Me';
    if (p.Tr && p.Pog) return 'verticalizando Tr–Pog';
    return '';
  }, [current.points, mode]);

  function patchCurrent(patch: Partial<ModeState>) {
    setModeStates((prev) => ({ ...prev, [mode]: { ...prev[mode], ...patch } }));
  }

  // ---------- Setters de estado (afectan al modo actual) ----------
  function setPoints(value: React.SetStateAction<Partial<Record<PointId, Pt>>>) {
    setModeStates((prev) => {
      const cur = prev[mode];
      const next = typeof value === 'function' ? value(cur.points) : value;
      return { ...prev, [mode]: { ...cur, points: next } };
    });
  }
  function setCustomLines(value: React.SetStateAction<CustomLine[]>) {
    setModeStates((prev) => {
      const cur = prev[mode];
      const next = typeof value === 'function' ? value(cur.customLines) : value;
      return { ...prev, [mode]: { ...cur, customLines: next } };
    });
  }
  function setCustomAngles(value: React.SetStateAction<CustomAngle[]>) {
    setModeStates((prev) => {
      const cur = prev[mode];
      const next = typeof value === 'function' ? value(cur.customAngles) : value;
      return { ...prev, [mode]: { ...cur, customAngles: next } };
    });
  }
  function setRulers(value: React.SetStateAction<Ruler[]>) {
    setModeStates((prev) => {
      const cur = prev[mode];
      const next = typeof value === 'function' ? value(cur.rulers) : value;
      return { ...prev, [mode]: { ...cur, rulers: next } };
    });
  }
  function setContourAnchors(value: React.SetStateAction<Pt[]>) {
    setModeStates((prev) => {
      const cur = prev[mode];
      const next = typeof value === 'function' ? value(cur.contourAnchors) : value;
      return { ...prev, [mode]: { ...cur, contourAnchors: next } };
    });
  }
  function setVisibleLines(value: React.SetStateAction<Record<string, boolean>>) {
    setModeStates((prev) => {
      const cur = prev[mode];
      const next = typeof value === 'function' ? value(cur.visibleLines) : value;
      return { ...prev, [mode]: { ...cur, visibleLines: next } };
    });
  }
  function setCalibration(c: Calibration | null) { patchCurrent({ calibration: c }); }
  function setRefCalibMm(v: number | null) { patchCurrent({ refCalibMm: v }); }
  function setActivePointId(id: PointId | null) { patchCurrent({ activePointId: id }); }
  function setViewport(value: React.SetStateAction<Viewport>) {
    setModeStates((prev) => {
      const cur = prev[mode];
      const next = typeof value === 'function' ? value(cur.viewport) : value;
      return { ...prev, [mode]: { ...cur, viewport: next } };
    });
  }

  // ---------- Deshacer ----------
  // Historial de snapshots del estado de ANOTACIÓN del modo actual (puntos,
  // anclas, líneas, ángulos, mediciones, calibración). Se apila un snapshot al
  // INICIO de cada gesto que muta (colocar/arrastrar/borrar/detectar) y
  // Ctrl+Z o el botón ↶ lo restaura. Los snapshots idénticos consecutivos se
  // descartan (agarres sin arrastre). Fuera del alcance: sliders de simulación
  // y deformadores libres.
  type UndoData = Pick<ModeState,
    'points' | 'pointMeta' | 'confirmedPoints' | 'confirmed' | 'contourAnchors'
    | 'customLines' | 'customAngles' | 'rulers' | 'calibration'>;
  const modeStatesRef = useRef(modeStates);
  modeStatesRef.current = modeStates;
  const historyRef = useRef<Array<{ m: Mode; data: UndoData }>>([]);
  const redoRef = useRef<Array<{ m: Mode; data: UndoData }>>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  /** Snapshot del estado de anotación ACTUAL del modo activo. */
  function currentSnapshot(): { m: Mode; data: UndoData } {
    const m = modeRef.current;
    const cur = modeStatesRef.current[m];
    return {
      m,
      data: {
        points: { ...cur.points },
        pointMeta: { ...cur.pointMeta },
        confirmedPoints: { ...cur.confirmedPoints },
        confirmed: cur.confirmed,
        contourAnchors: [...cur.contourAnchors],
        customLines: [...cur.customLines],
        customAngles: [...cur.customAngles],
        rulers: [...cur.rulers],
        calibration: cur.calibration,
      },
    };
  }

  function pushHistory() {
    const snap = currentSnapshot();
    const last = historyRef.current[historyRef.current.length - 1];
    if (last && last.m === snap.m && JSON.stringify(last.data) === JSON.stringify(snap.data)) return;
    historyRef.current.push(snap);
    if (historyRef.current.length > 40) historyRef.current.shift();
    setCanUndo(true);
    // Una acción NUEVA invalida la rama de rehacer (semántica estándar)
    redoRef.current = [];
    setCanRedo(false);
  }

  function undo() {
    const snap = historyRef.current.pop();
    setCanUndo(historyRef.current.length > 0);
    if (!snap) return;
    // El estado actual pasa a la pila de rehacer
    redoRef.current.push(currentSnapshot());
    setCanRedo(true);
    setModeStates((prev) => ({ ...prev, [snap.m]: { ...prev[snap.m], ...snap.data } }));
  }

  function redo() {
    const snap = redoRef.current.pop();
    setCanRedo(redoRef.current.length > 0);
    if (!snap) return;
    // El estado actual vuelve al historial (sin pasar por pushHistory, que
    // vaciaría la rama de rehacer)
    historyRef.current.push(currentSnapshot());
    if (historyRef.current.length > 40) historyRef.current.shift();
    setCanUndo(true);
    setModeStates((prev) => ({ ...prev, [snap.m]: { ...prev[snap.m], ...snap.data } }));
  }

  // Ctrl+Z / Cmd+Z global (fuera de inputs)
  useEffect(() => {
    function onUndoKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      // Rehacer: Ctrl/Cmd+Shift+Z (estándar) o Ctrl+Y (Windows)
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
    }
    window.addEventListener('keydown', onUndoKey);
    return () => window.removeEventListener('keydown', onUndoKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Origen y metadatos de cada punto ----------
  /** Llamado por CanvasArea cuando el usuario coloca o arrastra un punto.
   *  En modo anotación, mover un punto invalida su "confirmación" — el usuario
   *  debe re-confirmar. */
  function markPointAsUser(id: PointId) {
    setModeStates((prev) => {
      const cur = prev[mode];
      const newConfirmed = { ...cur.confirmedPoints };
      delete newConfirmed[id];
      return {
        ...prev,
        [mode]: {
          ...cur,
          pointMeta: { ...cur.pointMeta, [id]: { source: 'user', confidence: 1 } },
          confirmedPoints: newConfirmed,
          confirmed: cur.confirmed,
        },
      };
    });
  }

  function setPointConfirmed(id: PointId, value: boolean) {
    setModeStates((prev) => {
      const cur = prev[mode];
      const next = { ...cur.confirmedPoints };
      if (value) next[id] = true; else delete next[id];
      return { ...prev, [mode]: { ...cur, confirmedPoints: next } };
    });
  }

  function setAllConfirmed(map: Partial<Record<PointId, boolean>>) {
    setModeStates((prev) => ({
      ...prev,
      [mode]: { ...prev[mode], confirmedPoints: map },
    }));
  }

  // ---------- Detección automática ----------
  async function onDetect() {
    if (!imageEl) return;
    patchCurrent({
      detectionStatus: 'detecting', detectionError: null,
      detectionWarning: null, detectionUsedMirror: false,
    });
    const result = await detectFaceLandmarks(imageEl, mode, detectionModel);

    // ---- Refinado por contorno (solo perfil) ----
    // Los puntos de línea media viven SOBRE la silueta. El contorno trazado
    // tiene precisión de píxel, así que PROYECTAMOS cada punto detectado al
    // punto más cercano del contorno — así los puntos SIGUEN el contorno en vez
    // de quedar flotando aparte. El radio es amplio (Tr en la implantación
    // capilar y C tras el pelo del cuello quedan legítimamente lejos de la
    // silueta exterior y deben pegarse a ella igual); solo se descartan
    // predicciones DISPARATADAS (detección en otra estructura). Los puntos del
    // usuario no se tocan (se preservan más abajo, como siempre).
    if (result.success && mode === 'perfil' && contourCandidates && imageEl) {
      const MIDLINE: PointId[] = ['Tr', 'G', 'N', 'Rh', 'Sp', 'Pn', 'Cm', 'Sn', 'Ls', 'Li', 'Sl', 'Pog', 'Me', 'C'];
      const detected: Pt[] = [];
      for (const id of MIDLINE) {
        const d = result.points[id];
        if (d) detected.push(d.pt);
      }
      const W = imageEl instanceof HTMLImageElement ? imageEl.naturalWidth : imageEl.width;
      const contour = selectContourSide(contourCandidates, detected, W);
      if (contour) {
        const SNAP_MAX = Math.max(20, W * 0.25);   // ~⅛ del ancho: cubre pelo abundante
        for (const id of MIDLINE) {
          const d = result.points[id];
          if (!d) continue;
          const near = nearestOnContour(contour, d.pt);
          if (near.dist <= SNAP_MAX) d.pt = near.pt;
        }
      }
    }

    // La detección sobrescribe puntos → apilar snapshot para poder deshacerla
    if (result.success) pushHistory();
    setModeStates((prev) => {
      const cur = prev[mode];
      if (!result.success) {
        return { ...prev, [mode]: {
          ...cur, detectionStatus: 'failed',
          detectionError: result.error ?? null,
          detectionWarning: null, detectionUsedMirror: false,
        } };
      }
      const newPoints = { ...cur.points };
      const newMeta: Partial<Record<PointId, PointMeta>> = { ...cur.pointMeta };
      for (const [id, det] of Object.entries(result.points) as [PointId, { pt: Pt; confidence: number }][]) {
        const existing = newMeta[id];
        if (existing?.source === 'user') continue;
        newPoints[id] = det.pt;
        newMeta[id] = { source: 'detected', confidence: det.confidence };
      }
      // Siguiente punto OBLIGATORIO sin colocar tras la detección. Los opcionales
      // (Nk/Cuello) NO se eligen por defecto — si no queda ninguno obligatorio,
      // se deselecciona (antes elegía Nk, que quedaba activo para colocar ya).
      const next = pointsForMode(mode).find((p) => !p.optional && !newPoints[p.id]);
      return {
        ...prev,
        [mode]: {
          ...cur,
          points: newPoints,
          pointMeta: newMeta,
          activePointId: next ? next.id : null,
          detectionStatus: 'done',
          detectionError: null,
          detectionWarning: result.warning ?? null,
          detectionUsedMirror: !!result.usedMirror,
          confirmed: false,
        },
      };
    });
  }

  function onConfirmPoints() {
    patchCurrent({ confirmed: true });
    showToast('✓ Puntos confirmados');
  }
  function onUnconfirm()     { patchCurrent({ confirmed: false }); }

  /** Carga una imagen nueva (archivo o cámara): la REESCALA si es enorme (cap de
   *  memoria, ver downscaleDataUrl) y reinicia el estado de anotación del modo.
   *  `originalSize: null` es CLAVE — sin resetearlo, loadAndRotate conservaba las
   *  dimensiones de la foto anterior (su guarda no lo sobrescribe) y la rotación
   *  se calculaba con la referencia equivocada. */
  async function loadNewImageSrc(dataUrl: string) {
    const src = await downscaleDataUrl(dataUrl);
    setRhinoHandles([]);   // los deformadores libres pertenecen a la foto anterior
    rhinoHistRef.current = [];   // …y su historial de deshacer/rehacer también
    rhinoRedoRef.current = [];
    setRhinoCanUndo(false);
    setRhinoCanRedo(false);
    patchCurrent({
      imageSrc: src, originalSize: null,
      points: {}, pointMeta: {}, confirmedPoints: {},
      customLines: [], customAngles: [], rulers: [], contourAnchors: [], calibration: null,
      confirmed: false, detectionStatus: 'idle', detectionError: null,
    });
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { void loadNewImageSrc(reader.result as string); };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function resetMarks() {
    pushHistory();   // "Borrar todas las marcas" es reversible con Deshacer
    patchCurrent({
      points: {}, pointMeta: {}, confirmedPoints: {},
      customLines: [], customAngles: [], calibration: null,
      confirmed: false, detectionStatus: 'idle', detectionError: null,
    });
  }

  /** Canvas COMPLETO para exportar: el principal ya solo lleva foto+simulación
   *  (las anotaciones viven en el overlay de pantalla), así que se compone con
   *  las anotaciones en espacio de imagen — idéntico al canvas único de antes. */
  function exportCanvas(): HTMLCanvasElement | null {
    return exportComposerRef.current?.() ?? canvasRef.current;
  }

  function exportPNG() {
    const canvas = exportCanvas();
    if (!canvas) return;
    // Blob + object URL, NO data URL: Safari de iOS ignora (o falla en
    // silencio) el atributo download con data: de varios MB — por eso el PDF
    // sí bajaba (jsPDF usa Blob) y el PNG no llegaba a aparecer.
    canvas.toBlob((blob) => {
      if (!blob) { showToast('No se pudo generar el PNG'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rhinoplan-${mode}-${Date.now()}.png`;
      document.body.appendChild(a);   // iOS: el ancla debe estar en el DOM
      a.click();
      a.remove();
      // Revocar tras un margen: hacerlo en el acto corta la descarga en Safari
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast('✓ PNG descargado');
    }, 'image/png');
  }

  function exportPDF() {
    const canvas = exportCanvas();
    if (!canvas) return;
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
      unit: 'mm', format: 'a4',
    });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;

    pdf.setFontSize(16); pdf.setTextColor(20, 30, 60);
    pdf.text(`RhinoPlan Perfilometría — Informe ${mode === 'perfil' ? 'de perfil' : 'frontal'}`, margin, margin + 4);
    pdf.setFontSize(9); pdf.setTextColor(90);
    pdf.text(new Date().toLocaleString(), margin, margin + 10);
    if (mmPerPx) pdf.text(`Escala: ${(1 / mmPerPx).toFixed(2)} px/mm`, pageW - margin - 50, margin + 10);

    const maxImgW = pageW - margin * 2;
    const maxImgH = pageH * 0.5 - margin;
    const ratio = canvas.width / canvas.height;
    let imgW = maxImgW, imgH = imgW / ratio;
    if (imgH > maxImgH) { imgH = maxImgH; imgW = imgH * ratio; }
    pdf.addImage(imgData, 'PNG', (pageW - imgW) / 2, margin + 14, imgW, imgH);

    let y = margin + 14 + imgH + 8;
    pdf.setFontSize(11); pdf.setTextColor(20, 30, 60);
    pdf.text('Medidas', margin, y); y += 5;
    pdf.setFontSize(8); pdf.setTextColor(60);

    const writeRow = (cols: string[]) => {
      if (y > pageH - margin) { pdf.addPage(); y = margin; }
      const xs = [margin, margin + 65, margin + 105, margin + 140, margin + 168];
      cols.forEach((c, i) => pdf.text(c, xs[i] ?? margin + 180, y));
      y += 4.2;
    };

    pdf.setFont('helvetica', 'bold');
    writeRow(['Medida', 'Paciente', 'Normal', 'Δ', 'Eval.']);
    pdf.setFont('helvetica', 'normal');
    pdf.setDrawColor(200); pdf.line(margin, y - 2, pageW - margin, y - 2);

    // Nota: la IMAGEN del informe respeta las capas activas (sale del canvas en
    // vivo); las TABLAS siempre incluyen todas las medidas calculadas.

    // Sección rinoplastia: cambios aplicados + tabla original vs proyectado
    if (rhinoSimActive && mode === 'perfil') {
      const changes = getActiveChanges(rhinoSim);
      const orig = originalNasalSilhouette(current.points);
      const simRaw = computeSimulatedNose(current.points, rhinoSim, mmPerPx);
      const sim = simRaw ? refineNoseTip(simRaw, rhinoSim.tipRefinement) : null;
      if (changes.length > 0 || (orig && sim)) {
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(20, 30, 60);
        writeRow(['SIMULACIÓN RINOPLASTIA', '', '', '', '']);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(60);
        for (const c of changes) {
          writeRow([`  ${c.label}`, c.value, '', '', '']);
        }
        if (orig && sim) {
          // Cabecera tabla original vs proyectado
          pdf.setFont('helvetica', 'bold');
          writeRow(['  Medida', 'Original', 'Proyectado', 'Δ', '']);
          pdf.setFont('helvetica', 'normal');
          const nlOrig = nasolabialFromSilhouette(orig, current.points.Ls);
          const nlSim  = nasolabialFromSilhouette(sim,  current.points.Ls);
          const nfOrig = nasofrontalFromSilhouette(orig, current.points.G);
          const nfSim  = nasofrontalFromSilhouette(sim,  current.points.G);
          const npOrig = nasalProjectionFromSilhouette(orig);
          const npSim  = nasalProjectionFromSilhouette(sim);
          if (nlOrig != null && nlSim != null) {
            writeRow(['  ∠ nasolabial', `${nlOrig.toFixed(1)}°`, `${nlSim.toFixed(1)}°`,
              `${nlSim - nlOrig >= 0 ? '+' : ''}${(nlSim - nlOrig).toFixed(1)}°`, '']);
          }
          if (nfOrig != null && nfSim != null) {
            writeRow(['  ∠ nasofrontal', `${nfOrig.toFixed(1)}°`, `${nfSim.toFixed(1)}°`,
              `${nfSim - nfOrig >= 0 ? '+' : ''}${(nfSim - nfOrig).toFixed(1)}°`, '']);
          }
          writeRow(['  Proyección nasal', npOrig.toFixed(2), npSim.toFixed(2),
            `${npSim - npOrig >= 0 ? '+' : ''}${(npSim - npOrig).toFixed(2)}`, '']);
        }
        writeRow(['', '', '', '', '']); // espacio
      }
    }

    if (mode === 'perfil') {
      // Ángulos faciales — siempre todos en la tabla
      for (const m of ANGLE_MEASURES) {
        const [a, v, b] = m.points;
        const pa = current.points[a], pv = current.points[v], pb = current.points[b];
        const val = (pa && pv && pb) ? angle3pt(pa, pv, pb) : null;
        const lev = evaluate(val, m.ideal, m.tolerance);
        writeRow([m.label,
          val != null ? `${val.toFixed(1)}°` : '—',
          `${m.ideal}° ±${m.tolerance}`,
          val != null ? `${val - m.ideal >= 0 ? '+' : ''}${(val - m.ideal).toFixed(1)}°` : '—',
          evalLabel(lev)]);
      }
      // Ángulo nasofacial (recta–recta: plano facial G–Pog vs dorso N–Pn)
      {
        const nfac = nasofacialAngle(current.points);
        writeRow(['Ángulo nasofacial',
          nfac != null ? `${nfac.toFixed(1)}°` : '—',
          `${NASOFACIAL_IDEAL}° ±${NASOFACIAL_TOL}`,
          nfac != null ? `${nfac - NASOFACIAL_IDEAL >= 0 ? '+' : ''}${(nfac - NASOFACIAL_IDEAL).toFixed(1)}°` : '—',
          nfac != null ? evalLabel(evaluate(nfac, NASOFACIAL_IDEAL, NASOFACIAL_TOL)) : '—']);
      }
      // Rotación de punta vs plano de Frankfort (columela Sn–Cm vs vertical Po–Or)
      {
        const tr = frankfortTipRotation(current.points);
        writeRow(['Rotación punta (Frankfort)',
          tr != null ? `${tr.toFixed(1)}°` : '—',
          '0–30°',
          tr != null ? `${tr - TIPROT_IDEAL >= 0 ? '+' : ''}${(tr - TIPROT_IDEAL).toFixed(1)}°` : '—',
          tr != null ? evalLabel(evaluate(tr, TIPROT_IDEAL, TIPROT_TOL)) : '—']);
      }
      // Ángulo facial vs Frankfort
      {
        const fhAng = frankfortFacialAngle(current.points);
        writeRow(['Ángulo facial vs Frankfort',
          fhAng != null ? `${fhAng.toFixed(1)}°` : '—',
          '90° ±5',
          fhAng != null ? `${fhAng - 90 >= 0 ? '+' : ''}${(fhAng - 90).toFixed(1)}°` : '—',
          fhAng != null ? evalLabel(evaluate(fhAng, 90, 5)) : '—']);
      }
      const goode = goodeNasalProjection(current.points);
      if (goode) {
        const lenTxt = mmPerPx ? `${(goode.nasalLength * mmPerPx).toFixed(1)} mm` : `${goode.nasalLength.toFixed(0)} px`;
        const projTxt = mmPerPx ? `${(goode.projection * mmPerPx).toFixed(1)} mm` : `${goode.projection.toFixed(0)} px`;
        const v = goodeVerdict(goode.ratio);
        const verdictTxt = v === 'adecuada' ? 'Adecuada'
          : v === 'subproyectada' ? 'Subproyectada'
          : v === 'sobreproyectada' ? 'Sobreproyectada' : '—';
        writeRow(['Proyección nasal (Goode)', '', '', '', '']);
        writeRow(['  Longitud nasal (N–Pn)', lenTxt, '', '', '']);
        writeRow(['  Proyección (⊥ N–AC)',   projTxt, '', '', '']);
        writeRow(['  Ratio Goode', goode.ratio.toFixed(2), '0.55 – 0.60',
          `${goode.ratio - 0.575 >= 0 ? '+' : ''}${(goode.ratio - 0.575).toFixed(2)}`,
          verdictTxt]);
      } else {
        writeRow(['Proyección nasal (Goode)', '—', '0.55 – 0.60', '—',
          'Faltan N, Pn o AC']);
      }
      const rel = alarColumellarRelation(current.points);
      if (rel) {
        const abMmP   = mmPerPx ? rel.abSignedPx   * mmPerPx : null;
        const cbMmP   = mmPerPx ? rel.cbSignedPx   * mmPerPx : null;
        const showMmP = mmPerPx ? rel.showSignedPx * mmPerPx : null;
        const gT = classifyGunter(abMmP, cbMmP);
        const gI = gunterInfo(gT);
        const fmt = (signedPx: number, signedMm: number | null) =>
          signedMm != null ? `${signedMm >= 0 ? '+' : ''}${signedMm.toFixed(1)} mm`
            : `${signedPx >= 0 ? '+' : ''}${signedPx.toFixed(0)} px (sin calib.)`;
        writeRow(['Relación ala–columnela (Gunter)', '', '', '', '']);
        writeRow(['  AB · A → eje Ba–Bp', fmt(rel.abSignedPx, abMmP), '1 – 2 mm', '', '']);
        writeRow(['  BC · C → eje Ba–Bp', fmt(rel.cbSignedPx, cbMmP), '1 – 2 mm', '', '']);
        writeRow(['  Show columelar',     fmt(rel.showSignedPx, showMmP), '1 – 4 mm', '', gI.short]);
      } else {
        writeRow(['Relación ala–columnela (Gunter)', '—', '—', '—', 'Faltan A, Ba, Bp o Cb']);
      }
      const cp = chinProjectionSigned(current.points['N'], current.points['Pog'], current.points['Pn'],
        current.points['Po'], current.points['Or']);
      const cpMm = (cp != null && mmPerPx) ? cp * mmPerPx : null;
      writeRow(['Proyección mentón (cero merid.)',
        cpMm != null ? `${cpMm >= 0 ? '+' : ''}${cpMm.toFixed(1)} mm`
        : cp != null ? `${cp >= 0 ? '+' : ''}${cp.toFixed(0)} px (sin calib.)` : '—',
        '0 ±2 mm',
        cpMm != null ? `${cpMm >= 0 ? '+' : ''}${cpMm.toFixed(1)} mm` : '—',
        cpMm != null ? evalLabel(evaluate(cpMm, 0, 2)) : '—']);
      const t = computeThirds(current.points['Tr'], current.points['G'], current.points['Sn'], current.points['Me']);
      if (t) {
        const writeT = (lab: string, r: number) => writeRow([lab,
          `${(r * 100).toFixed(1)} %`, '33.3 %',
          `${(r * 100 - 33.33) >= 0 ? '+' : ''}${((r * 100) - 33.33).toFixed(1)} %`,
          evalLabel(evaluate(r * 100, 33.33, 4))]);
        writeT('Tercio superior (Tr–G)', t.ratios[0]);
        writeT('Tercio medio (G–Sn)',    t.ratios[1]);
        writeT('Tercio inferior (Sn–Me)',t.ratios[2]);
      }
    } else {
      const thirds = frontalThirds(current.points);
      if (thirds) {
        const heightsPx = [thirds.upper, thirds.middle, thirds.lower];
        const labels: [string, string, string] = [
          'Tercio superior (tr–cejas)', 'Tercio medio (cejas–sn)', 'Tercio inferior (sn–gn)',
        ];
        labels.forEach((lab, i) => {
          const h = heightsPx[i];
          const mm = mmPerPx ? `${(h * mmPerPx).toFixed(1)} mm` : `${h.toFixed(0)} px`;
          writeRow([lab,
            mm,
            '33.3 %',
            `${(thirds.ratios[i] * 100).toFixed(1)} %`,
            evalLabel(evaluate(thirds.ratios[i] * 100, 33.33, 4))]);
        });
        const tEval = evaluateThirds(thirds.ratios[0], thirds.ratios[1], thirds.ratios[2]);
        writeRow(['  Total tr–gn',
          mmPerPx ? `${(thirds.total * mmPerPx).toFixed(1)} mm` : `${thirds.total.toFixed(0)} px`,
          '100 %', '—', tEval.text]);
      }
      const fifths = computeFifths(current.points);
      if (fifths) {
        FIFTH_LABELS.forEach((lab, i) => {
          const w = fifths.widths[i];
          const pct = fifths.ratios[i] * 100;
          const wTxt = mmPerPx ? `${(w * mmPerPx).toFixed(1)} mm` : `${w.toFixed(0)} px`;
          writeRow([`Quinto ${lab}`, wTxt, '20 %',
            `${pct.toFixed(1)} %`,
            evalLabel(evaluate(pct, 20, 2.5))]);
        });
        writeRow(['  Total (lat_d–lat_i)',
          mmPerPx ? `${(fifths.total * mmPerPx).toFixed(1)} mm` : `${fifths.total.toFixed(0)} px`,
          '100 %', '—', '—']);
      }
      // --- Farkas: medidas globales en mm ---
      const fk = farkasMeasurements(current.points);
      const fmtPx = (px: number | null) => px == null ? '—'
        : mmPerPx ? `${(px * mmPerPx).toFixed(1)} mm` : `${px.toFixed(0)} px`;
      writeRow(['Farkas — Medidas globales', '', '', '', '']);
      writeRow(['  Altura fisiognómica (tr–gn)', fmtPx(fk.faceHeight), '', '', '']);
      writeRow(['  Altura nasal media (n–sn)',    fmtPx(fk.noseHeightMid), '', '', '']);
      writeRow(['  Altura nasal (n–prn)',         fmtPx(fk.noseHeight), '', '', '']);
      writeRow(['  Altura mucosa bucal (sto–gn)', fmtPx(fk.mouthHeight), '', '', '']);
      writeRow(['  Anchura nasal (al_d–al_i)',    fmtPx(fk.noseWidth), '', '', '']);
      writeRow(['  Anchura bucal (ch_d–ch_i)',    fmtPx(fk.mouthWidth), '', '', '']);
      writeRow(['  Anchura intercantal (en_d–en_i)',  fmtPx(fk.interEndoCanth), '', '', '']);
      writeRow(['  Anchura interocular ext. (ex_d–ex_i)', fmtPx(fk.interExoCanth), '', '', '']);
      writeRow(['  Anchura bi-auricular (t_d–t_i)',   fmtPx(fk.biauricular), '', '', '']);
      const symEval = (pct: number | null) => pct == null ? '—'
        : pct >= 90 ? 'OK' : pct >= 80 ? 'Leve' : 'Asim. marcada';
      // --- Farkas: medidas bilaterales (derecha vs izquierda + % simetría) ---
      const fmtDeg = (deg: number | null) => deg == null ? '—' : `${deg.toFixed(1)}°`;
      const writeBilateral = (label: string, b: { right: number | null; left: number | null }, fmt: (v: number | null) => string) => {
        const pct = pairSymmetry(b);
        writeRow([`  ${label}`,
          fmt(b.right),
          fmt(b.left),
          pct != null ? `${pct.toFixed(0)} %` : '—',
          symEval(pct)]);
      };
      pdf.setFont('helvetica', 'bold');
      writeRow(['Farkas — Medidas bilaterales', 'Derecha', 'Izquierda', 'Sim.', 'Eval.']);
      pdf.setFont('helvetica', 'normal');
      writeBilateral('Anchura palpebral (en–ex)',      fk.palpebralWidth,    fmtPx);
      writeBilateral('Inclinación ojo (vs horiz.)',    fk.eyeSlant,          fmtDeg);
      writeBilateral('Dist. pronasal–alar (prn–al)',   fk.pronasalAlar,      fmtPx);
      writeBilateral('Dist. stomion–chelion (sto–ch)', fk.stomionChelion,    fmtPx);
      writeBilateral('Áng. óculo-oto-nasal (t–en–al)', fk.oculoOtoNasal,     fmtDeg);
      writeBilateral('Áng. naso-ocular ext. (al–n–ex)',fk.nasoOcularExterno, fmtDeg);
      writeBilateral('Áng. separación ojo–eje cara',   fk.eyeSeparationAng,  fmtDeg);
      writeBilateral('Áng. naso-bucal (al–sn–ch)',     fk.nasoBuccalAng,     fmtDeg);
      writeBilateral('Dist. pupila–eje cara',          fk.pupilToMidline,    fmtPx);
      writeBilateral('Altura pupila–subnasal (pu–sn)', fk.pupilSubnasal,     fmtPx);
      // --- Farkas: índice de simetría ---
      const sym = farkasSymmetryIndex(fk);
      writeRow(['Farkas — Simetría facial', '', '', '', '']);
      writeRow(['  Zona ocular', sym.ocular != null ? `${sym.ocular.toFixed(1)} %` : '—', '> 90 %', '', symEval(sym.ocular)]);
      writeRow(['  Zona nasal',  sym.nasal  != null ? `${sym.nasal.toFixed(1)} %`  : '—', '> 90 %', '', symEval(sym.nasal)]);
      writeRow(['  Zona bucal',  sym.bucal  != null ? `${sym.bucal.toFixed(1)} %`  : '—', '> 90 %', '', symEval(sym.bucal)]);
      writeRow(['  GLOBAL',      sym.global != null ? `${sym.global.toFixed(1)} %` : '—', '> 90 %', '', symEval(sym.global)]);
    }

    // --- Nota al pie: la imagen refleja las capas activas; la tabla es completa ---
    const hiddenPts = current.pointsHidden.length;
    const noteParts: string[] = [
      'La imagen muestra únicamente los elementos activos en el panel "Capas de análisis" al momento de exportar.',
      'Las tablas incluyen todas las medidas calculadas, independientemente de las capas visibles.',
    ];
    if (hiddenPts > 0) {
      noteParts.push(`Puntos ocultos en la imagen: ${current.pointsHidden.join(', ')}.`);
    }
    const note = noteParts.join(' ');
    pdf.setFontSize(7);
    pdf.setTextColor(130);
    const noteLines: string[] = pdf.splitTextToSize(note, pageW - margin * 2);
    const noteH = noteLines.length * 3 + 2;
    if (y + noteH > pageH - margin) { pdf.addPage(); y = margin; }
    pdf.text(noteLines, margin, y + 4);

    pdf.save(`rhinoplan-${mode}-${Date.now()}.pdf`);
    showToast('✓ Informe PDF descargado');
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      const map: Record<string, Tool> = {
        '1': 'point', '2': 'line', '3': 'angle', '4': 'measure', '5': 'calibrate', '6': 'erase', '7': 'contour',
      };
      if (map[e.key]) selectTool(map[e.key]);
      if (e.key === 'p' || e.key === 'P') setMode('perfil');
      if (e.key === 'f' || e.key === 'F') setMode('frente');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // El progreso cuenta solo los puntos OBLIGATORIOS (los opcionales como Nk/Cuello
  // no cuentan: son extra para medidas concretas como el cervicomental).
  const mandatoryPoints = pointsForMode(mode).filter((p) => !p.optional);
  const totalPoints = mandatoryPoints.length;
  const placedCount = mandatoryPoints.filter((p) => current.points[p.id]).length;
  const detectedCount = Object.values(current.pointMeta).filter((m) => m?.source === 'detected').length;
  const userCount     = Object.values(current.pointMeta).filter((m) => m?.source === 'user').length;
  const hasImage = !!imageEl;
  const isDetecting = current.detectionStatus === 'detecting';
  // Paso SIGUIENTE del flujo (cargar → detectar → confirmar → informe): decide
  // cuál es el ÚNICO botón "primary" de la topbar — una sola llamada a la
  // acción por estado, en vez de tres botones azules compitiendo.
  const flowStep: 'load' | 'detect' | 'confirm' | 'export' =
    !hasImage ? 'load'
    : current.detectionStatus !== 'done' ? 'detect'
    : !current.confirmed ? 'confirm'
    : 'export';

  return (
    <div className={`app ${topbarHidden ? 'topbar-hidden' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <div className="logo">R</div>
          <div>
            RhinoPlan Perfilometría
            <span className="sub">perfilometría facial — proyección prequirúrgica</span>
          </div>
        </div>

        <div className="mode-switch" role="tablist" aria-label="Modo de análisis">
          <button
            role="tab" aria-selected={mode === 'perfil'}
            className={mode === 'perfil' ? 'active' : ''}
            onClick={() => setMode('perfil')}
            title="Perfilometría lateral (P)"
          >◐ Perfil</button>
          <button
            role="tab" aria-selected={mode === 'frente'}
            className={mode === 'frente' ? 'active' : ''}
            onClick={() => setMode('frente')}
            title="Análisis frontal (F)"
          >◉ Frente</button>
        </div>

        <button
          className="theme-toggle"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          title={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>

        <div className="spacer" />
        <div className="actions">
          {/* Chip de progreso: la métrica central del flujo, visible de un vistazo */}
          {hasImage ? (
            <span
              className={`progress-chip ${placedCount >= totalPoints ? 'complete' : ''}`}
              title="Puntos anatómicos colocados"
            >
              <span className="pc-bar">
                <span
                  className="pc-fill"
                  style={{ width: `${Math.min(100, Math.round((placedCount / Math.max(1, totalPoints)) * 100))}%` }}
                />
              </span>
              {placedCount}/{totalPoints}
            </span>
          ) : (
            <span className="progress-chip">Sin imagen</span>
          )}

          {/* Grupo CAPTURA. Un solo botón "primary" en toda la barra: el paso
              SIGUIENTE del flujo (cargar → detectar → confirmar → informe). */}
          <button className={flowStep === 'load' ? 'primary' : ''} onClick={() => fileInputRef.current?.click()}>
            <Icon name="folder" /> Cargar foto
          </button>
          {/* Oculto con visually-hidden y NO con display:none — en iOS Safari el
              click programático sobre un input file con display:none es errático
              (a veces exige dos toques para abrir el selector). */}
          <input
            ref={fileInputRef} type="file" accept="image/*" onChange={onPickFile}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            tabIndex={-1} aria-hidden="true"
          />
          <button onClick={() => setShowCamera(true)}><Icon name="camera" /> Cámara</button>

          {hasImage && <span className="tb-sep" />}

          {/* Grupo ANÁLISIS */}
          {hasImage && (
            <div className="detect-group">
              <button
                className={flowStep === 'detect' ? 'primary' : ''}
                onClick={onDetect}
                disabled={isDetecting}
                title="Detectar puntos automáticamente con IA en el navegador"
              >
                {isDetecting ? <><span className="spinner" /> Detectando…</>
                  : <><Icon name="sparkles" /> {current.detectionStatus === 'done' ? 'Re-detectar' : 'Detectar auto'}</>}
              </button>
              <span
                className="model-select"
                style={{ display: 'inline-flex', alignItems: 'center' }}
                title={MODELS[detectionModel].description}
              >
                {MODELS[detectionModel].shortLabel} ({MODELS[detectionModel].points})
              </span>
            </div>
          )}
          {hasImage && current.detectionStatus === 'done' && !current.confirmed && (
            <button className={flowStep === 'confirm' ? 'primary' : ''} onClick={onConfirmPoints}>
              <Icon name="check" /> Confirmar puntos
            </button>
          )}
          {current.confirmed && (
            <button onClick={onUnconfirm} title="Volver a editar los puntos">
              <Icon name="pencil" /> Editar puntos
            </button>
          )}
          {mode === 'perfil' && hasImage && !annotationModeActive && (
            <button
              className={rhinoSimActive ? 'primary confirm' : ''}
              onClick={() => setRhinoSimActive(!rhinoSimActive)}
              title="Simular proyección prequirúrgica de rinoplastia"
            >
              <Icon name="flask" /> {rhinoSimActive ? 'Cerrar simulación' : 'Rinoplastia'}
            </button>
          )}
          {!rhinoSimActive && (
            <button
              className={annotationModeActive ? 'primary confirm' : ''}
              onClick={() => setAnnotationModeActive(!annotationModeActive)}
              title="Crear dataset de entrenamiento anotando puntos manualmente"
            >
              <Icon name="dataset" /> {annotationModeActive ? 'Cerrar anotación' : `Anotación${datasetCount > 0 ? ` (${datasetCount})` : ''}`}
            </button>
          )}

          <span className="tb-sep" />

          {/* Grupo EXPORTACIÓN */}
          <button onClick={exportPNG} disabled={!hasImage}><Icon name="download" /> PNG</button>
          <button className={flowStep === 'export' ? 'primary' : ''} onClick={exportPDF} disabled={!hasImage}>
            <Icon name="fileText" /> Informe PDF
          </button>
        </div>
      </header>

      {/* Toast de confirmación (autodescartable) */}
      {toast && <div className="toast" role="status">{toast}</div>}

      {/* Stepper del flujo: materializa el camino Cargar → Detectar →
          Corregir/Confirmar → Exportar. Indicador, no navegación. */}
      <div className="flow-stepper" aria-label="Progreso del análisis">
        {([
          { id: 'load',    n: 1, label: 'Cargar foto',          done: hasImage },
          { id: 'detect',  n: 2, label: 'Detectar puntos',      done: current.detectionStatus === 'done' },
          { id: 'confirm', n: 3, label: 'Corregir y confirmar', done: !!current.confirmed },
          { id: 'export',  n: 4, label: 'Analizar y exportar',  done: false },
        ] as const).map((s, i, arr) => (
          <Fragment key={s.id}>
            <div className={`fs-step ${s.done ? 'done' : ''} ${flowStep === s.id ? 'current' : ''}`}>
              <span className="fs-dot">{s.done ? '✓' : s.n}</span>
              <span className="fs-label">{s.label}</span>
            </div>
            {i < arr.length - 1 && <span className="fs-line" />}
          </Fragment>
        ))}
      </div>

      {/* Banner de estado/error de detección */}
      {hasImage && current.detectionStatus !== 'idle' && (
        <div className={`detection-banner ${current.detectionStatus}`}>
          {current.detectionStatus === 'detecting' && (
            <>
              <span className="spinner" /> Analizando rostro con IA en el navegador… (la imagen no se envía a ningún servidor)
            </>
          )}
          {current.detectionStatus === 'done' && (
            <>
              <span style={{ display: 'inline-flex', verticalAlign: '-2px', marginRight: 2 }}><Icon name="sparkles" size={14} /></span>
              Detección completa: <b>{detectedCount}</b> punto{detectedCount !== 1 ? 's' : ''} automático{detectedCount !== 1 ? 's' : ''}
              {userCount > 0 && <> · <b>{userCount}</b> ajustado{userCount !== 1 ? 's' : ''} manualmente</>}
              {current.detectionUsedMirror && <> · <span className="ok-tag">detectado con imagen espejada</span></>}
              · Arrastra los puntos para corregir su posición.
              {!current.confirmed && <> Cuando estén bien, pulsa <b>Confirmar puntos</b>.</>}
              {current.confirmed && <> <span className="ok-tag">✓ Confirmados</span></>}
              {current.detectionWarning && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#fdba74' }}>⚠ {current.detectionWarning}</div>
              )}
            </>
          )}
          {current.detectionStatus === 'failed' && (
            <>⚠ {current.detectionError ?? 'La detección falló.'}</>
          )}
        </div>
      )}

      <div className={`main ${sidebarHidden ? 'sidebar-hidden' : ''} ${resultsHidden ? 'results-hidden' : ''}`}>
        <Toolbar
          mode={mode} tool={tool}
          activePointId={current.activePointId} setActivePointId={setActivePointId}
          onPickPoint={pickPoint}
          points={current.points}
          visibleLines={current.visibleLines} setVisibleLines={setVisibleLines}
          onResetMarks={resetMarks} hasImage={hasImage}
          magnifierEnabled={magnifierEnabled} setMagnifierEnabled={setMagnifierEnabled}
          edgeSnapEnabled={edgeSnapEnabled} setEdgeSnapEnabled={setEdgeSnapEnabled}
          templateVisible={templateVisible} setTemplateVisible={setTemplateVisible}
          labelScale={labelScale} setLabelScale={setLabelScale}
        >
          <LayersPanel
            mode={mode}
            visibleLines={current.visibleLines}
            setVisibleLines={(next) => patchCurrent({ visibleLines: next })}
            pointsHidden={current.pointsHidden}
            setPointsHidden={(next) => patchCurrent({ pointsHidden: next })}
            anglesShown={current.anglesShown}
            setAnglesShown={(next) => patchCurrent({ anglesShown: next })}
            measuresHidden={current.measuresHidden}
            setMeasuresHidden={(next) => patchCurrent({ measuresHidden: next })}
            panelOpen={current.layersPanelOpen}
            setPanelOpen={(v) => patchCurrent({ layersPanelOpen: v })}
            sectionsOpen={current.layersSectionsOpen}
            setSectionsOpen={(s) => patchCurrent({ layersSectionsOpen: s })}
          />
        </Toolbar>
        <CanvasArea
          mode={mode} imageEl={imageEl}
          points={current.points} setPoints={setPoints}
          pointMeta={current.pointMeta} onMarkPointAsUser={markPointAsUser}
          onBeforeChange={pushHistory}
          tool={tool} setTool={selectTool} onUndo={undo} canUndo={canUndo} onRedo={redo} canRedo={canRedo}
          activePointId={current.activePointId} setActivePointId={setActivePointId}
          customLines={current.customLines} setCustomLines={setCustomLines}
          customAngles={current.customAngles} setCustomAngles={setCustomAngles}
          rulers={current.rulers} setRulers={setRulers}
          contourAnchors={current.contourAnchors} setContourAnchors={setContourAnchors}
          contourCandidates={contourCandidates}
          visibleLines={current.visibleLines}
          pointsHidden={current.pointsHidden}
          anglesShown={current.anglesShown}
          measuresHidden={current.measuresHidden}
          calibration={current.calibration} setCalibration={setCalibration}
          mmPerPx={mmPerPx} canvasRef={canvasRef} exportComposerRef={exportComposerRef}
          viewport={current.viewport} setViewport={setViewport}
          magnifierEnabled={magnifierEnabled}
          edgeSnapEnabled={edgeSnapEnabled}
          templateVisible={templateVisible}
          labelScale={labelScale}
          rotationAngle={current.rotationAngle}
          setRotation={setRotation}
          flipH={current.flipH}
          onFlipH={toggleFlipH}
          autoStraighten={autoStraighten}
          canAutoStraighten={canAutoStraighten}
          autoStraightenMethod={autoStraightenMethod}
          originalSize={current.originalSize}
          rhinoSimActive={rhinoSimActive && mode === 'perfil'}
          rhinoSim={rhinoSim}
          rhinoShowOriginal={rhinoShowOriginal}
          rhinoWarpPhoto={rhinoWarpPhoto}
          rhinoHandles={rhinoHandles}
          setRhinoHandles={setRhinoHandlesTracked}
          rhinoEditHandles={rhinoEditHandles}
          rhinoShowHandles={rhinoShowHandles}
          rhinoNewHandleRadius={rhinoNewHandleRadius}
          rhinoSplitView={rhinoSplitView}
          rhinoShowSimLine={rhinoShowSimLine}
          rhinoDividerRatio={rhinoDividerRatio}
          setRhinoDividerRatio={setRhinoDividerRatio}
          onRequestLoad={() => fileInputRef.current?.click()}
          onRequestCamera={() => setShowCamera(true)}
          sidebarHidden={sidebarHidden}
          onToggleSidebar={() => setSidebarHidden((v) => !v)}
          resultsHidden={resultsHidden}
          onToggleResults={() => setResultsHidden((v) => !v)}
          topbarHidden={topbarHidden}
          onToggleTopbar={() => setTopbarHidden((v) => !v)}
        />
        {annotationModeActive ? (
          <AnnotationPanel
            mode={mode}
            points={current.points}
            activePointId={current.activePointId}
            setActivePointId={setActivePointId}
            confirmedPoints={current.confirmedPoints}
            setConfirmed={setPointConfirmed}
            setAllConfirmed={setAllConfirmed}
            canvasRef={canvasRef}
            imageEl={imageEl}
            detectorSeed={detectionModel}
            onClose={() => {
              setAnnotationModeActive(false);
              setDatasetCount(loadDataset().cases.length); // refresca contador
            }}
          />
        ) : rhinoSimActive && mode === 'perfil' ? (
          <RhinoplastyPanel
            sim={rhinoSim}
            setSim={setRhinoSimTracked}
            showOriginal={rhinoShowOriginal}
            setShowOriginal={setRhinoShowOriginal}
            warpPhoto={rhinoWarpPhoto}
            setWarpPhoto={setRhinoWarpPhoto}
            splitView={rhinoSplitView}
            setSplitView={setRhinoSplitView}
            showSimLine={rhinoShowSimLine}
            setShowSimLine={setRhinoShowSimLine}
            handles={rhinoHandles}
            onRemoveHandle={(i) => {
              pushRhinoHistory(true);   // acción puntual: apila siempre
              setRhinoHandles((prev) => prev.filter((_, k) => k !== i));
            }}
            onResetHandles={() => {
              pushRhinoHistory(true);
              setRhinoHandles([]);
            }}
            onSetHandleRadius={(i, r) =>
              setRhinoHandlesTracked((prev) => prev.map((h, k) => (k === i ? { ...h, radius: r } : h)))}
            editHandles={rhinoEditHandles}
            setEditHandles={setRhinoEditHandles}
            showHandles={rhinoShowHandles}
            setShowHandles={setRhinoShowHandles}
            newHandleRadius={rhinoNewHandleRadius}
            setNewHandleRadius={setRhinoNewHandleRadius}
            onUndo={undoRhino}
            canUndo={rhinoCanUndo}
            onRedo={redoRhino}
            canRedo={rhinoCanRedo}
            points={current.points}
            mmPerPx={mmPerPx}
            onClose={() => setRhinoSimActive(false)}
          />
        ) : (
          <ResultsTable
            mode={mode} points={current.points} mmPerPx={mmPerPx}
            customLines={current.customLines} customAngles={current.customAngles}
            rulers={current.rulers}
            refCalibMm={current.refCalibMm} setRefCalibMm={setRefCalibMm}
            calibrationManual={!!current.calibration}
            confirmed={current.confirmed} detectionStatus={current.detectionStatus}
          />
        )}
      </div>

      {showCamera && (
        <CameraCapture
          onClose={() => setShowCamera(false)}
          onCapture={(dataUrl) => {
            void loadNewImageSrc(dataUrl);
            setShowCamera(false);
          }}
        />
      )}
    </div>
  );
}

function evalLabel(level: 'ok' | 'warn' | 'error' | 'muted') {
  if (level === 'ok') return 'OK';
  if (level === 'warn') return 'Leve';
  if (level === 'error') return 'Alto';
  return '—';
}
