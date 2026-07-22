import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon, { type IconName } from './Icon';
import {
  pointsForMode, POINT_BY_ID, linesForMode,
  computeThirds, computeFifths, intercanthalMidline, browLineMid,
  intercanthalMidpointX, lipMidpointX,
  ANGLE_MEASURES,
  chinProjectionSigned, frankfortFacialAngle, nasofacialAngle, frankfortTipRotation,
  goodeNasalProjection, goodeVerdict,
  alarColumellarRelation, classifyGunter, gunterInfo,
  CANONICAL_PROFILE, CANONICAL_FRONTAL,
  type PointId, type Pt, type Mode,
  distance, angle3pt,
} from '../cephalometry';
import {
  computeSimulatedNose, originalNasalSilhouette, refineNoseTip,
  warpSegmentBySilhouettes, buildNoseWarpField, evalWarpAt, getActiveChanges,
  alarWarpControls, handleRadius, handleWarpControls, applyHandlesToSegment,
  splitHandlesBySegment,
  type RhinoplastySim, type NasalSilhouette, type NoseWarpField, type RhinoHandle,
} from '../rhinoplasty';
import {
  anchorContourToPoints, selectContourSide, nearestOnContour, sharpenCornerAt,
  removeSelfIntersections, smoothSpikes,
  type ContourCandidates,
} from '../profileContour';
import type { PointMeta, Viewport } from '../App';

// 'none' = estado NEUTRO: ninguna herramienta armada, tocar la foto no anota
// nada (solo zoom/pan). Se modela como un valor más de la unión, no como
// `Tool | null`, para que las comparaciones `tool === 'x'` existentes sigan
// siendo válidas sin sembrar comprobaciones de null por todo el archivo.
export type Tool = 'none' | 'point' | 'line' | 'angle' | 'erase' | 'calibrate' | 'measure' | 'contour';

export interface CustomLine { a: PointId; b: PointId; }
export interface CustomAngle { a: PointId; v: PointId; b: PointId; }
export interface Calibration { p1: Pt; p2: Pt; mm: number; }
/** Medición de distancia libre entre dos puntos arbitrarios de la imagen. */
export interface Ruler { p1: Pt; p2: Pt; }

type ImageLike = HTMLImageElement | HTMLCanvasElement;

interface Props {
  mode: Mode;
  imageEl: ImageLike | null;
  points: Partial<Record<PointId, Pt>>;
  setPoints: React.Dispatch<React.SetStateAction<Partial<Record<PointId, Pt>>>>;
  pointMeta: Partial<Record<PointId, PointMeta>>;
  onMarkPointAsUser: (id: PointId) => void;
  /** Apila un snapshot para Deshacer — llamar al INICIO de cada gesto mutador. */
  onBeforeChange: () => void;
  tool: Tool;
  /** Cambia de herramienta desde la barra flotante del visor. */
  setTool: (t: Tool) => void;
  /** Deshacer/Rehacer (la barra flotante los incluye junto a las herramientas). */
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
  activePointId: PointId | null;
  setActivePointId: (id: PointId | null) => void;
  customLines: CustomLine[];
  setCustomLines: React.Dispatch<React.SetStateAction<CustomLine[]>>;
  customAngles: CustomAngle[];
  setCustomAngles: React.Dispatch<React.SetStateAction<CustomAngle[]>>;
  rulers: Ruler[];
  setRulers: React.Dispatch<React.SetStateAction<Ruler[]>>;
  contourAnchors: Pt[];
  setContourAnchors: React.Dispatch<React.SetStateAction<Pt[]>>;
  contourCandidates: ContourCandidates | null;
  visibleLines: Record<string, boolean>;
  pointsHidden: PointId[];
  anglesShown: string[];
  measuresHidden: string[];
  calibration: Calibration | null;
  setCalibration: (c: Calibration | null) => void;
  mmPerPx: number | null;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  /** Compositor de exportación: App lo invoca para obtener foto + anotaciones
   *  en un único canvas a resolución de imagen (el principal ya no las lleva). */
  exportComposerRef?: React.MutableRefObject<(() => HTMLCanvasElement | null) | null>;
  viewport: Viewport;
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>;
  magnifierEnabled: boolean;
  edgeSnapEnabled: boolean;
  templateVisible: boolean;
  labelScale: number;
  rotationAngle: number;
  setRotation: (a: number | ((prev: number) => number)) => void;
  flipH: boolean;
  onFlipH: () => void;
  autoStraighten: () => void;
  canAutoStraighten: boolean;
  autoStraightenMethod: string;
  originalSize: { w: number; h: number } | null;
  rhinoSimActive: boolean;
  rhinoSim: RhinoplastySim;
  rhinoShowOriginal: boolean;
  rhinoWarpPhoto: boolean;
  rhinoHandles: RhinoHandle[];
  setRhinoHandles: React.Dispatch<React.SetStateAction<RhinoHandle[]>>;
  rhinoEditHandles: boolean;
  /** Mostrar las flechas ámbar de los deformadores (el warp se aplica igual).
   *  Con el modo edición activo se dibujan siempre — no se edita a ciegas. */
  rhinoShowHandles: boolean;
  /** Multiplicador de radio con el que se crean los deformadores NUEVOS. */
  rhinoNewHandleRadius: number;
  /** Vista dividida antes/después con divisor arrastrable. Apagada = foto
   *  completa proyectada (con la línea original tenue si está activada). */
  rhinoSplitView: boolean;
  /** Mostrar la línea VERDE de la silueta simulada sobre la foto. */
  rhinoShowSimLine: boolean;
  rhinoDividerRatio: number;
  setRhinoDividerRatio: (r: number) => void;
  /** CTAs del estado vacío: cargar foto / abrir cámara desde el centro del
   *  canvas (el usuario nuevo no debería tener que buscar en la topbar). */
  onRequestLoad?: () => void;
  onRequestCamera?: () => void;
  /** Paneles laterales retraíbles individualmente: botones en los bordes del
   *  visor (especialmente útiles en iPad para dar espacio a la foto). */
  sidebarHidden?: boolean;
  onToggleSidebar?: () => void;
  resultsHidden?: boolean;
  onToggleResults?: () => void;
  /** Barra superior retraíble (pestaña en el borde superior del visor). */
  topbarHidden?: boolean;
  onToggleTopbar?: () => void;
}

function imgSize(image: ImageLike) {
  return image instanceof HTMLImageElement
    ? { w: image.naturalWidth, h: image.naturalHeight }
    : { w: image.width, h: image.height };
}

/** Coalescencia por frame de pantalla para eventos de puntero de alta
 *  frecuencia (Apple Pencil ≈ 240 ev/s): guarda el ÚLTIMO evento y aplica una
 *  sola actualización por requestAnimationFrame. Sin esto, cada evento
 *  disparaba un render completo del canvas (~26 ms en desktop, 3-5× en iPad)
 *  y la cola de eventos se adelantaba segundos al dibujo.
 *  `flush()` aplica el pendiente de inmediato (llamar en pointerup para no
 *  perder la última posición); `cancel()` lo descarta (cleanup del efecto). */
function rafCoalesce<E>(apply: (e: E) => void) {
  let raf = 0;
  let last: E | null = null;
  const handler = ((e: E) => {
    last = e;
    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (last) { const ev = last; last = null; apply(ev); }
      });
    }
  }) as ((e: E) => void) & { flush: () => void; cancel: () => void };
  handler.flush = () => {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (last) { const ev = last; last = null; apply(ev); }
  };
  handler.cancel = () => {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    last = null;
  };
  return handler;
}

// Herramientas de la barra FLOTANTE del visor (antes vivían en el sidebar; se
// movieron sobre la foto para liberar altura lateral y quedar al alcance del
// pulgar en iPad). `hotkey` debe coincidir con el mapa de atajos de App.
const TOOLS: { id: Tool; label: string; icon: IconName; hotkey: string }[] = [
  { id: 'point',     label: 'Punto',    icon: 'point',    hotkey: '1' },
  { id: 'line',      label: 'Línea',    icon: 'line',     hotkey: '2' },
  { id: 'angle',     label: 'Ángulo',   icon: 'angle',    hotkey: '3' },
  { id: 'measure',   label: 'Medir',    icon: 'ruler',    hotkey: '4' },
  { id: 'contour',   label: 'Contorno', icon: 'diamond',  hotkey: '7' },
  { id: 'calibrate', label: 'Calibrar', icon: 'arrowsH',  hotkey: '5' },
  { id: 'erase',     label: 'Borrar',   icon: 'eraser',   hotkey: '6' },
];

const DETECTED_COLOR = '#60a5fa';
const USER_COLOR     = '#facc15';
const TEMPLATE_COLOR = 'rgba(96,165,250,0.42)';

// Cursor de precisión: cruz fina blanca con contorno negro y HUECO central
// (de 9 a 15 px) para ver el píxel exacto bajo el punto de inserción.
// Hotspot exacto en el centro (12,12) de un SVG de 24×24.
const PRECISION_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E" +
  "%3Cg fill='none' stroke='black' stroke-width='3' opacity='0.55'%3E" +
  "%3Cline x1='12' y1='1' x2='12' y2='9'/%3E%3Cline x1='12' y1='15' x2='12' y2='23'/%3E" +
  "%3Cline x1='1' y1='12' x2='9' y2='12'/%3E%3Cline x1='15' y1='12' x2='23' y2='12'/%3E%3C/g%3E" +
  "%3Cg fill='none' stroke='white' stroke-width='1.25'%3E" +
  "%3Cline x1='12' y1='1' x2='12' y2='9'/%3E%3Cline x1='12' y1='15' x2='12' y2='23'/%3E" +
  "%3Cline x1='1' y1='12' x2='9' y2='12'/%3E%3Cline x1='15' y1='12' x2='23' y2='12'/%3E%3C/g%3E" +
  "%3C/svg%3E\") 12 12, crosshair";

export default function CanvasArea(props: Props) {
  const {
    mode, imageEl, points, setPoints, pointMeta, onMarkPointAsUser,
    onBeforeChange,
    tool, setTool, onUndo, canUndo, onRedo, canRedo, activePointId, setActivePointId,
    customLines, setCustomLines, customAngles, setCustomAngles,
    rulers, setRulers,
    contourAnchors, setContourAnchors,
    contourCandidates,
    visibleLines, pointsHidden, anglesShown, measuresHidden,
    calibration, setCalibration, mmPerPx, canvasRef, exportComposerRef,
    viewport, setViewport,
    magnifierEnabled, edgeSnapEnabled, templateVisible, labelScale,
    rotationAngle, setRotation, flipH, onFlipH, autoStraighten, canAutoStraighten, autoStraightenMethod,
    originalSize,
    rhinoSimActive, rhinoSim, rhinoShowOriginal, rhinoWarpPhoto,
    rhinoHandles, setRhinoHandles, rhinoEditHandles, rhinoShowHandles,
    rhinoNewHandleRadius, rhinoSplitView, rhinoShowSimLine,
    rhinoDividerRatio, setRhinoDividerRatio,
    onRequestLoad, onRequestCamera,
    sidebarHidden, onToggleSidebar, resultsHidden, onToggleResults,
    topbarHidden, onToggleTopbar,
  } = props;

  const [linePick, setLinePick] = useState<PointId | null>(null);
  const [anglePick, setAnglePick] = useState<PointId[]>([]);
  const [calibPick, setCalibPick] = useState<Pt[]>([]);
  const [rulerPick, setRulerPick] = useState<Pt | null>(null);
  const [draggingAnchor, setDraggingAnchor] = useState<number | null>(null);
  // Deformadores libres del modo simulación
  const [draggingHandle, setDraggingHandle] = useState<number | null>(null);
  const [pendingHandleFrom, setPendingHandleFrom] = useState<Pt | null>(null);
  const handlesLenRef = useRef(0);
  const [dragging, setDragging] = useState<PointId | null>(null);
  const [hoverId, setHoverId] = useState<PointId | null>(null);
  const [cursorImgPt, setCursorImgPt] = useState<Pt | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [panning, setPanning] = useState(false);
  const [draggingDivider, setDraggingDivider] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Pseudo-fullscreen por CSS cuando la API nativa no existe/falla (iPad PWA)
  const [fsFallback, setFsFallback] = useState(false);
  // Barras flotantes minimizables: en táctil arrancan RECOGIDAS (pastillas)
  // para no tapar la foto — en el layout vertical del iPad la cubrían casi entera.
  const [rotateOpen, setRotateOpen] = useState<boolean>(
    () => !window.matchMedia('(any-pointer: coarse)').matches,
  );
  const [zoomOpen, setZoomOpen] = useState<boolean>(
    () => !window.matchMedia('(any-pointer: coarse)').matches,
  );
  const [toolsOpen, setToolsOpen] = useState<boolean>(
    () => !window.matchMedia('(any-pointer: coarse)').matches,
  );
  // Ráfaga de cambios de la SIMULACIÓN (arrastre de un slider del panel):
  // mientras lleguen cambios seguidos, el warp fotográfico dibuja en calidad
  // rápida (malla 13×13); 250 ms después del último cambio se asienta y se
  // redibuja a calidad completa. Complementa la coalescencia del panel.
  const [simSettled, setSimSettled] = useState(true);
  const simSettleTimerRef = useRef(0);
  const simFirstRef = useRef(true);
  useEffect(() => {
    if (simFirstRef.current) { simFirstRef.current = false; return; }
    setSimSettled(false);
    window.clearTimeout(simSettleTimerRef.current);
    simSettleTimerRef.current = window.setTimeout(() => setSimSettled(true), 250);
  }, [rhinoSim, rhinoHandles]);
  useEffect(() => () => window.clearTimeout(simSettleTimerRef.current), []);

  const wrapperRef = useRef<HTMLDivElement>(null);

  // ---- Overlay de anotaciones en RESOLUCIÓN DE PANTALLA ----
  // El canvas principal se rasteriza UNA vez a resolución de imagen y el zoom
  // lo estira por CSS: en pantallas retina las etiquetas salían borrosas. El
  // overlay cubre el visor, su respaldo mide (px CSS × devicePixelRatio) y se
  // redibuja al cambiar el viewport → el texto se rasteriza siempre a la
  // resolución física de la pantalla.
  const overlayRef = useRef<HTMLCanvasElement>(null);
  // drawAnnotations se recrea en cada render (cierra sobre el estado); el ref
  // permite llamarla desde callbacks estables (redrawOverlay, exportación).
  const drawAnnotationsRef = useRef<((ctx: CanvasRenderingContext2D) => void) | null>(null);
  const redrawOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    const canvas = canvasRef.current;
    if (!overlay) return;
    const octx = overlay.getContext('2d');
    if (!octx) return;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.max(1, Math.round(overlay.clientWidth * dpr));
    const bh = Math.max(1, Math.round(overlay.clientHeight * dpr));
    if (overlay.width !== bw) overlay.width = bw;
    if (overlay.height !== bh) overlay.height = bh;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, bw, bh);
    if (!canvas || !canvas.width) return;
    // Mapeo imagen→pantalla desde getBoundingClientRect: la MISMA fuente que
    // usa getImagePtFromClient para el mapeo inverso — alineación garantizada,
    // incluidos zoom y pan (el rect ya incluye el transform CSS del host).
    const cRect = canvas.getBoundingClientRect();
    if (!cRect.width) return;
    const oRect = overlay.getBoundingClientRect();
    const k = (cRect.width / canvas.width) * dpr;
    octx.save();
    octx.setTransform(k, 0, 0, k, (cRect.left - oRect.left) * dpr, (cRect.top - oRect.top) * dpr);
    // Clip al rect de la foto: replica el recorte natural del bitmap anterior
    // (una etiqueta cerca del borde no debe asomar fuera de la foto).
    octx.beginPath();
    octx.rect(0, 0, canvas.width, canvas.height);
    octx.clip();
    drawAnnotationsRef.current?.(octx);
    octx.restore();
  }, [canvasRef]);

  // Zoom/pan confirmados por ESTADO (rueda, pan con arrastre, commit del
  // pinch): redibujar para rasterizar nítido en la nueva escala. El pinch en
  // vivo (DOM directo, sin estado) llama a redrawOverlay por su cuenta.
  useEffect(() => { redrawOverlay(); }, [viewport, redrawOverlay]);

  // Cambios de tamaño del visor o de la caja del canvas (ventana, paneles
  // plegados, pantalla completa, otra foto): el respaldo del overlay y el
  // mapeo dependen de ambos.
  useEffect(() => {
    const ro = new ResizeObserver(() => redrawOverlay());
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [redrawOverlay, imageEl, canvasRef]);

  // Exportación: PNG/PDF necesitan foto + anotaciones en UN canvas a
  // resolución de imagen. Se compone bajo demanda con transform identidad —
  // resultado idéntico al del canvas único anterior. Sin lista de deps: el
  // closure debe capturar siempre el último drawAnnotations.
  useEffect(() => {
    if (!exportComposerRef) return;
    exportComposerRef.current = () => {
      const main = canvasRef.current;
      if (!main || !main.width) return null;
      const out = document.createElement('canvas');
      out.width = main.width;
      out.height = main.height;
      const octx = out.getContext('2d');
      if (!octx) return null;
      octx.drawImage(main, 0, 0);
      drawAnnotationsRef.current?.(octx);
      return out;
    };
  });

  const draggedDistanceRef = useRef(0);
  const justDraggedRef     = useRef(false);
  // Origen del arrastre en coordenadas de cliente. Va en un ref (no en una
  // variable local del efecto) porque el efecto de arrastre depende de props
  // que cambian de identidad en cada render: al mover el punto, App re-renderiza
  // y el efecto se recrea, reiniciando cualquier estado local a mitad del gesto.
  const dragStartClientRef = useRef<{ x: number; y: number } | null>(null);
  const dragMarkedRef      = useRef(false);
  const panStartRef        = useRef<{ panX: number; panY: number; mouseX: number; mouseY: number } | null>(null);
  // true mientras hay un gesto de 2 dedos (pinch-zoom): suspende cualquier
  // arrastre de 1 puntero para que el pellizco no mueva a la vez un punto.
  const pinchingRef        = useRef(false);

  // Listener global de teclado para Space (pan)
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault(); setSpacePressed(true);
      }
    }
    function up(e: KeyboardEvent) { if (e.code === 'Space') setSpacePressed(false); }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Reset viewport al cambiar de imagen
  const imageIdRef = useRef<ImageLike | null>(null);
  useEffect(() => {
    if (imageEl !== imageIdRef.current) {
      imageIdRef.current = imageEl;
      if (imageEl) setViewport({ zoom: 1, panX: 0, panY: 0 });
    }
  }, [imageEl, setViewport]);

  // ============ Contorno real del perfil ============
  // Los candidatos (ambos lados) vienen trazados desde App (una vez por imagen,
  // compartidos con la detección). Aquí: elegir lado + deformar con anclas.
  // La VISIBILIDAD de la capa solo controla el DIBUJO del contorno. El cálculo
  // se hace siempre en perfil: la simulación de rinoplastia usa el contorno
  // denso como base del warp — con la capa oculta, caer al fallback de ~5
  // puntos dispersos distorsionaba la silueta de la foto simulada.
  const contourVisible = mode === 'perfil' && visibleLines['profile-contour'] !== false;
  // Clave de recálculo del contorno: SOLO los insumos que el memo usa de
  // verdad (línea media + Cb del afilado de Sn + anclas ◇ + fuente de cada
  // punto). Antes dependía de `points` completo → arrastrar puntos ajenos al
  // contorno (Po, Or, AC…) re-anclaba miles de puntos en cada tick.
  const CONTOUR_INPUT_IDS: PointId[] = ['Tr', 'G', 'N', 'Rh', 'Sp', 'Pn', 'Cm', 'Cb', 'Sn', 'Ls', 'Li', 'Sl', 'Pog', 'Me', 'C', 'Nk'];
  const contourInputsKey = CONTOUR_INPUT_IDS.map((id) => {
    const p = points[id];
    return p ? `${p.x},${p.y},${pointMeta[id]?.source ?? ''}` : '·';
  }).join(';') + '|' + contourAnchors.map((a) => `${a.x},${a.y}`).join(';');
  const anchoredContour = useMemo(() => {
    if (mode !== 'perfil' || !contourCandidates) return null;
    const MIDLINE: PointId[] = ['Tr', 'G', 'N', 'Rh', 'Sp', 'Pn', 'Cm', 'Sn', 'Ls', 'Li', 'Sl', 'Pog', 'Me', 'C', 'Nk'];
    // Roles de los puntos:
    //  - selAnchors (puntos anatómicos colocados): eligen y VALIDAN el lado.
    //    Las anclas ◇ NO participan: son correcciones que legítimamente están
    //    lejos del trazo base — usarlas para validar hacía DESAPARECER el
    //    contorno al colocar varias.
    //  - warpAnchors: deforman el contorno. Son (a) los puntos ajustados por el
    //    USUARIO (mandan siempre, aunque estén lejos del borde visible —
    //    pelo/barba), (b) las anclas ◇, y (c) los puntos estándar detectados
    //    razonablemente cerca del borde — anclan el contorno (pasa por ellos)
    //    y actúan como PINES: una ancla ◇ solo corrige el tramo entre sus
    //    puntos estándar vecinos y no arrastra el resto del contorno. Los
    //    detectados MUY lejos (alucinación del modelo) no anclan.
    const selAnchors: Pt[] = [];
    const warpAnchors: Pt[] = [];
    const detectedMid: { id: PointId; p: Pt }[] = [];
    for (const id of MIDLINE) {
      const p = points[id];
      if (!p) continue;
      selAnchors.push(p);
      if (pointMeta[id]?.source === 'user') warpAnchors.push(p);
      else detectedMid.push({ id, p });
    }
    warpAnchors.push(...contourAnchors);

    const W = imageEl
      ? (imageEl instanceof HTMLImageElement ? imageEl.naturalWidth : imageEl.width)
      : 0;
    const base = selectContourSide(contourCandidates, selAnchors, W);
    if (!base) return null;
    // Los detectados TAMBIÉN anclan: el contorno debe pasar por los puntos
    // estandarizados (aunque el trazo base haya cambiado después del detect).
    // Pero SOLO si están CERCA del borde trazado: un punto detectado lejos de
    // la silueta (típico de Tr en la implantación del pelo, o C tras el pelo
    // del cuello) NO debe anclar — tirar de la silueta hacia él la distorsiona
    // con una muesca abrupta. Si el usuario quiere el contorno sobre el punto,
    // lo arrastra a mano (source='user' → va en warpAnchors y ancla siempre).
    const PIN_MAX = Math.max(20, W * 0.035);
    const detectedPins: Pt[] = [];
    for (const { p } of detectedMid) {
      if (nearestOnContour(base, p).dist <= PIN_MAX) detectedPins.push(p);
    }
    let out = base;
    if (warpAnchors.length + detectedPins.length > 0) {
      // Los pines detectados van aparte: en un conflicto de índice, el ancla
      // del USUARIO (◇ o punto ajustado) siempre gana sobre el detectado.
      try { out = anchorContourToPoints(base, detectedPins, warpAnchors); } catch { out = base; }
    }
    // Afilar el vértice de Sn: es el ÁPICE del ángulo nasolabial (quiebre
    // columela↔labio) — ahí el contorno debe formar un pico, no una curva.
    // El pico se acota al VECINO más próximo sobre el contorno: punto de
    // columela/labio o ancla ◇ del usuario — así el afilado no aplana la
    // columela NI pisa un ancla colocada en el labio.
    const sn = points['Sn'];
    if (sn && nearestOnContour(out, sn).dist <= Math.max(10, W * 0.02)) {
      const onContour = (p: Pt | undefined): p is Pt =>
        !!p && nearestOnContour(out, p).dist <= Math.max(12, W * 0.02);
      const anchorsOn = contourAnchors.filter(onContour);
      // Vecino inmediato por ARRIBA de Sn: columela más baja (Cb, Cm, Sp) o ancla ◇
      const up = [...(['Cb', 'Cm', 'Sp'] as PointId[]).map((id) => points[id]).filter(onContour), ...anchorsOn]
        .filter((p) => p.y < sn.y)
        .sort((a, b) => b.y - a.y)[0] ?? null;
      // Vecino inmediato por ABAJO de Sn: labio superior o ancla ◇
      const dn = [...(['Ls', 'Li'] as PointId[]).map((id) => points[id]).filter(onContour), ...anchorsOn]
        .filter((p) => p.y > sn.y)
        .sort((a, b) => a.y - b.y)[0] ?? null;
      out = sharpenCornerAt(out, sn, up, dn, Math.max(20, W * 0.03));
    }
    // PLANO submentoniano: clínicamente el tramo Me→C es RECTO (de ahí su
    // nombre). El trazo automático ahí sigue la base de la sombra que el
    // mentón proyecta (panza visible aunque Me y C anclen). Si ambos están
    // sobre el contorno, el tramo entre ellos se endereza pasando por las
    // anclas ◇ intermedias como puntos de paso.
    const me = points['Me'], cerv = points['C'];
    if (me && cerv) {
      // El auto-enderezado del plano submentoniano SOLO se aplica si el USUARIO
      // no ha colocado anclas ◇ en esa zona. Si las hay, manda su forma: el
      // anclaje general (suave) ya hace pasar el contorno por ellas. Antes
      // straightenBetween forzaba la recta e IGNORABA cualquier ancla fuera de
      // un bbox de ±5px → el contorno no seguía las anclas del submentón (p. ej.
      // para modelar un submentón que cuelga o sube).
      const bandX = Math.max(20, W * 0.02);
      const bandY = Math.max(40, W * 0.06);
      const userShapingSubmental = contourAnchors.some((a) =>
        a.x >= Math.min(me.x, cerv.x) - bandX && a.x <= Math.max(me.x, cerv.x) + bandX &&
        a.y >= Math.min(me.y, cerv.y) - bandY && a.y <= Math.max(me.y, cerv.y) + bandY);
      const near = (p: Pt): boolean => nearestOnContour(out, p).dist <= Math.max(12, W * 0.02);
      if (!userShapingSubmental && near(me) && near(cerv)) {
        out = straightenBetween(out, me, cerv, []);
      }
    }
    // Limpiar el resultado: quitar bucles que el anclaje de puntos lejanos
    // (Tr/C tras pelo) haya podido introducir, y aplanar picos agudos residuales
    // (anatómicamente el perfil no los tiene). Se PROTEGEN las anclas (para no
    // despegar el contorno de ellas) y, con ellas, el vértice de Sn.
    out = removeSelfIntersections(out);
    out = smoothSpikes(out, 3, -0.3, [...selAnchors, ...contourAnchors], Math.max(20, W * 0.01));
    return out;
    // points/pointMeta/contourAnchors se leen del closure; contourInputsKey
    // captura exactamente lo que el cuerpo usa de ellos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, contourCandidates, contourInputsKey, imageEl]);

  // ============ Render del canvas ============
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // `uiScale` (memo, arriba) es el factor de RESOLUCIÓN para etiquetas y
    // discos de punto: el canvas trabaja en px de imagen y esos elementos tienen
    // tamaño fijo, así que en imágenes pequeñas (p. ej. las reescaladas a
    // ≤2400 px al cargar) salían enormes relativos a la cara. Se normaliza a una
    // imagen de referencia de 3600 px (tamaño típico pre-reescalado con el que
    // se calibraron los tamaños). Determinista por imagen → la exportación
    // PDF/PNG no depende del zoom.
    // Nuevo frame de etiquetas: fija la escala del usuario y limpia el layout
    beginLabelFrame(labelScale, uiScale);

    if (imageEl) {
      const { w, h } = imgSize(imageEl);
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(imageEl, 0, 0);
    } else ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Plantilla guía (ghosts canónicos), por debajo de las líneas/puntos reales
    if (templateVisible && imageEl) {
      drawTemplate(ctx, imageEl, mode, points);
    }

    // Warp FOTOGRÁFICO de la simulación de rinoplastia: deforma los píxeles de
    // la región nasal en el lado SIMULACIÓN del divisor (la línea verde de la
    // silueta se dibuja después, encima). Va aquí para que líneas y puntos
    // queden por encima de la foto deformada.
    if (rhinoSimActive && rhinoWarpPhoto && imageEl && mode === 'perfil'
        && (getActiveChanges(rhinoSim).length > 0 || rhinoHandles.length > 0)) {
      const orig = originalNasalSilhouette(points);
      const simRaw = orig ? computeSimulatedNose(points, rhinoSim, mmPerPx) : null;
      const sim = simRaw ? refineNoseTip(simRaw, rhinoSim.tipRefinement) : null;
      if (orig && sim) {
        // Pares (original → simulado): tramo denso del contorno real si existe;
        // si no, los puntos de control de la silueta. El tramo se EXTIENDE con
        // margen sobre N y bajo Sn: warpSegmentBySilhouettes clava sus extremos
        // a cero, así los cambios en N (radix) se desvanecen suavemente en la
        // frente en vez de cortar con salto.
        let dOrig: Pt[] = [orig.N, ...orig.dorsal, orig.Pn, orig.Cm, orig.Sn];
        let dSim: Pt[] = [sim.N, ...sim.dorsal, sim.Pn, sim.Cm, sim.Sn];
        if (anchoredContour && anchoredContour.length > 10) {
          const noseH = Math.max(10, orig.Sn.y - orig.N.y);
          const seg = sliceContourByY(anchoredContour, orig.N.y - noseH * 0.22, orig.Sn.y + noseH * 0.08);
          if (seg && seg.length > 5) {
            dOrig = seg;
            dSim = warpSegmentBySilhouettes(seg, orig, sim);
          }
        }
        // Deformadores libres: los cercanos al borde se FUNDEN en el tramo
        // (línea y foto coinciden); los interiores van como controles extra.
        const extra = alarWarpControls(points, rhinoSim, mmPerPx);
        if (rhinoHandles.length > 0) {
          const HR = handleRadius(dOrig);
          const { near, far } = splitHandlesBySegment(dOrig, rhinoHandles, HR);
          dSim = applyHandlesToSegment(dSim, near, HR);
          // Con HR los controles interiores llevan su radio propio (HR × mult.)
          extra.push(...handleWarpControls(far, HR));
        }
        const field = buildNoseWarpField(dOrig, dSim, extra);
        if (field) {
          // Durante un arrastre activo o una ráfaga de sliders la malla baja a
          // la mitad de densidad (¼ de triángulos) — calidad completa al asentarse.
          const interacting = dragging != null || draggingHandle != null
            || draggingAnchor != null || draggingDivider || !simSettled;
          // Sin vista dividida: se deforma TODA la foto (clip en x=0). Con vista
          // dividida: solo el lado derecho del divisor.
          drawWarpedNoseMesh(
            ctx, imageEl, field,
            rhinoSplitView ? canvas.width * rhinoDividerRatio : 0, canvas.width, canvas.height,
            interacting,
          );
        }
      }
    }

    // Overlay rinoplastia: split before/after con divisor draggable
    if (rhinoSimActive) {
      const orig = originalNasalSilhouette(points);
      const simRaw = computeSimulatedNose(points, rhinoSim, mmPerPx);
      const sim = simRaw ? refineNoseTip(simRaw, rhinoSim.tipRefinement) : null;
      // Sin vista dividida el divisor está en x=0 → todo el lienzo es "proyectado"
      const dividerX = rhinoSplitView ? canvas.width * rhinoDividerRatio : 0;
      let handleBaseR: number | null = null;
      if (orig && sim) {
        // Contorno prequirúrgico REAL: tramo nasal (N→Sn) del contorno trazado.
        // La simulación es ese mismo tramo deformado por los sliders — conserva
        // la forma real (giba incluida) y aplica los cambios encima.
        let denseOrig: Pt[] | null = null, denseSim: Pt[] | null = null;
        if (anchoredContour && anchoredContour.length > 10) {
          // Mismo tramo EXTENDIDO que el warp fotográfico: la línea objetivo y
          // la foto deformada derivan de idénticos pares → coinciden siempre.
          const noseH = Math.max(10, orig.Sn.y - orig.N.y);
          const seg = sliceContourByY(anchoredContour, orig.N.y - noseH * 0.22, orig.Sn.y + noseH * 0.08);
          if (seg && seg.length > 5) {
            denseOrig = seg;
            denseSim = warpSegmentBySilhouettes(seg, orig, sim);
            // Deformadores libres cercanos al borde: misma fusión que la foto
            if (rhinoHandles.length > 0) {
              const HR = handleRadius(seg);
              const { near } = splitHandlesBySegment(seg, rhinoHandles, HR);
              denseSim = applyHandlesToSegment(denseSim, near, HR);
            }
          }
        }
        drawRhinoplastySplit(ctx, canvas, orig, sim, dividerX, rhinoShowOriginal, denseOrig, denseSim, rhinoSplitView, rhinoShowSimLine);
        // Radio base de los deformadores para el círculo de influencia (mismo
        // cálculo que usa el warp: tramo denso si existe, si no la silueta).
        handleBaseR = handleRadius(denseOrig ?? [orig.N, ...orig.dorsal, orig.Pn, orig.Cm, orig.Sn]);
      }
      // El divisor solo en vista dividida
      if (rhinoSplitView) drawBeforeAfterDivider(ctx, canvas, dividerX);
      // Deformadores libres: flecha origen→destino con empuñadura. Ocultables
      // desde el panel; en modo edición se muestran SIEMPRE (junto con su
      // círculo de influencia — radio base × multiplicador del deformador).
      if (rhinoShowHandles || rhinoEditHandles) {
        for (const h of rhinoHandles) {
          drawRhinoHandle(ctx, h,
            rhinoEditHandles && handleBaseR != null ? handleBaseR * (h.radius ?? 1) : null);
        }
      }
    }

    // Las ANOTACIONES ya no se dibujan aquí: viven en el overlay en resolución
    // de pantalla (drawAnnotations vía redrawOverlay), nítidas a cualquier
    // zoom. La exportación las compone aparte, en espacio de imagen.
    redrawOverlay();
  }, [
    mode, imageEl, points, pointMeta, customLines, customAngles, visibleLines, calibration,
    tool, anglePick, linePick, calibPick, activePointId, dragging, hoverId, mmPerPx, canvasRef,
    cursorImgPt, magnifierEnabled, templateVisible, labelScale, rotationAngle, originalSize,
    rhinoSimActive, rhinoSim, rhinoShowOriginal, rhinoWarpPhoto, rhinoHandles, rhinoDividerRatio, rhinoSplitView, rhinoShowSimLine,
    rhinoEditHandles, rhinoShowHandles,
    // el fin de un arrastre/ráfaga re-dibuja la malla del warp a calidad completa
    draggingHandle, draggingAnchor, draggingDivider, simSettled,
    pointsHidden, anglesShown, measuresHidden,
    rulers, rulerPick, anchoredContour, contourAnchors,
    redrawOverlay,
  ]);

  /** ANOTACIONES (líneas, guías, contorno, reglas, calibración, puntos,
   *  etiquetas, lupa), extraídas del efecto de render. El mismo código dibuja
   *  en DOS destinos: el overlay de pantalla (transform viewport×dpr → texto
   *  rasterizado a resolución física, nítido a cualquier zoom) y el canvas de
   *  exportación (transform identidad, espacio de imagen → PNG/PDF idénticos
   *  a antes). El canvas PRINCIPAL queda solo con foto + simulación.
   *  Coordenadas: SIEMPRE px de imagen; el destino decide la transformación. */
  function drawAnnotations(ctx: CanvasRenderingContext2D) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    beginLabelFrame(labelScale, uiScale);
    if (mode === 'perfil') {
      drawProfileLines(ctx, points, visibleLines);
      drawProfileGuides(ctx, canvas, points, visibleLines, mmPerPx, measuresHidden);
      // Contorno real del perfil: detectado (borde piel–fondo) y corregido por
      // los puntos de línea media colocados (pelo/barba se ajustan con Tr, Sl,
      // Pog, Me, etc. — la curva pasa exactamente por cada punto). Se DIBUJA
      // solo si la capa está visible (el cálculo existe siempre para el warp).
      if (contourVisible && anchoredContour && anchoredContour.length > 1) {
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        // Halo oscuro fino + trazo teal
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(anchoredContour[0].x, anchoredContour[0].y);
        for (let i = 1; i < anchoredContour.length; i++) ctx.lineTo(anchoredContour[i].x, anchoredContour[i].y);
        ctx.stroke();
        ctx.strokeStyle = '#2DE6C8';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(anchoredContour[0].x, anchoredContour[0].y);
        for (let i = 1; i < anchoredContour.length; i++) ctx.lineTo(anchoredContour[i].x, anchoredContour[i].y);
        ctx.stroke();
        ctx.restore();
        const MIDLINE_LBL: PointId[] = ['Tr', 'G', 'N', 'Rh', 'Sp', 'Pn', 'Cm', 'Sn', 'Ls', 'Li', 'Sl', 'Pog', 'Me', 'C'];
        const anchored = contourAnchors.length > 0
          || MIDLINE_LBL.some((id) => points[id] && pointMeta[id]?.source === 'user');
        drawText(ctx, 10, canvas.height - 12,
          anchored ? 'Contorno ajustado a puntos' : 'Contorno detectado',
          '#2DE6C8', { size: 11, background: true });
        // Anclas libres de ajuste: rombos teal (arrastrables con la herramienta
        // Contorno). Ocultables independientemente de la línea del contorno.
        if (visibleLines['contour-anchors'] !== false)
        for (const a of contourAnchors) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(a.x, a.y - 8);
          ctx.lineTo(a.x + 8, a.y);
          ctx.lineTo(a.x, a.y + 8);
          ctx.lineTo(a.x - 8, a.y);
          ctx.closePath();
          ctx.fillStyle = '#0b1220';
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(a.x, a.y - 6);
          ctx.lineTo(a.x + 6, a.y);
          ctx.lineTo(a.x, a.y + 6);
          ctx.lineTo(a.x - 6, a.y);
          ctx.closePath();
          ctx.fillStyle = '#2DE6C8';
          ctx.fill();
          ctx.restore();
        }
      }
    } else {
      drawFrontalGuides(ctx, canvas, points, visibleLines, mmPerPx, measuresHidden);
    }

    for (const cl of customLines) {
      const a = points[cl.a], b = points[cl.b];
      if (!a || !b) continue;
      drawLine(ctx, a, b, '#e6edf6', 2, true);
      const d = distance(a, b);
      drawMidLabel(ctx, a, b,
        mmPerPx ? `${(d * mmPerPx).toFixed(1)} mm` : `${d.toFixed(0)} px`, '#e6edf6');
    }
    for (const ag of customAngles) {
      const a = points[ag.a], v = points[ag.v], b = points[ag.b];
      if (!a || !v || !b) continue;
      drawLine(ctx, v, a, '#fbbf24', 2);
      drawLine(ctx, v, b, '#fbbf24', 2);
      drawAngleArc(ctx, a, v, b, '#fbbf24');
      drawText(ctx, v.x + 16, v.y - 12, `${angle3pt(a, v, b).toFixed(1)}°`, '#fde68a');
    }

    if (tool === 'calibrate' && calibPick.length === 1) drawCross(ctx, calibPick[0], '#22d3ee', 14);
    if (calibration) {
      drawLine(ctx, calibration.p1, calibration.p2, '#22d3ee', 2, true);
      drawCross(ctx, calibration.p1, '#22d3ee', 12);
      drawCross(ctx, calibration.p2, '#22d3ee', 12);
      drawMidLabel(ctx, calibration.p1, calibration.p2, `${calibration.mm} mm`, '#22d3ee');
    }

    // ============ Mediciones de distancia libres (herramienta Medir) ============
    const RULER_COLOR = '#a3e635'; // lima — distintivo, no usado en medidas clínicas
    for (const r of rulers) {
      drawLine(ctx, r.p1, r.p2, RULER_COLOR, 2, false);
      drawCross(ctx, r.p1, RULER_COLOR, 10);
      drawCross(ctx, r.p2, RULER_COLOR, 10);
      const d = distance(r.p1, r.p2);
      drawMidLabel(ctx, r.p1, r.p2,
        mmPerPx ? `${(d * mmPerPx).toFixed(1)} mm` : `${d.toFixed(0)} px`, RULER_COLOR);
    }
    // Primer punto ya marcado, esperando el segundo: cruz + línea elástica al cursor
    if (tool === 'measure' && rulerPick) {
      drawCross(ctx, rulerPick, RULER_COLOR, 14);
      if (cursorImgPt) {
        drawLine(ctx, rulerPick, cursorImgPt, RULER_COLOR, 2, true);
        const d = distance(rulerPick, cursorImgPt);
        drawMidLabel(ctx, rulerPick, cursorImgPt,
          mmPerPx ? `${(d * mmPerPx).toFixed(1)} mm` : `${d.toFixed(0)} px`, RULER_COLOR);
      }
    }

    const hiddenPointSet = new Set(pointsHidden);
    for (const def of pointsForMode(mode)) {
      if (hiddenPointSet.has(def.id)) continue;       // capas: punto oculto
      const p = points[def.id];
      if (!p) continue;
      const meta = pointMeta[def.id];
      const source = meta?.source ?? 'user';
      const color  = source === 'detected' ? DETECTED_COLOR : USER_COLOR;
      const confTxt = (source === 'detected' && meta)
        ? `·${Math.round(meta.confidence * 100)}%` : '';
      const label = `${def.id}${confTxt}`;
      const isActive = def.id === activePointId;
      const isHover  = def.id === hoverId || def.id === dragging;
      drawPoint(ctx, p, color, label, isActive, isHover, source);
    }

    // ============ Overlays de ÁNGULOS pedidos desde LayersPanel ============
    if (mode === 'perfil' && anglesShown.length > 0) {
      drawAngleOverlays(ctx, points, anglesShown);
    }

    if (tool === 'angle' && anglePick.length > 0) {
      for (const id of anglePick) { const p = points[id]; if (p) drawCross(ctx, p, '#fbbf24', 16); }
    }
    if (tool === 'line' && linePick) {
      const p = points[linePick]; if (p) drawCross(ctx, p, '#e6edf6', 16);
    }

    // (la imagen ya viene recortada al rect inscrito desde applyRotationToCanvas;
    //  no hace falta dibujar overlay/marco aquí)

    // Lupa al final, encima de todo, sin overlays propios. También DURANTE el
    // arrastre de un punto (reposicionar un punto automático necesita la misma
    // precisión que colocarlo) — con cualquier herramienta activa.
    if (magnifierEnabled && (tool === 'point' || dragging) && cursorImgPt && imageEl) {
      drawMagnifier(ctx, imageEl, cursorImgPt, canvas.width, canvas.height);
    }
  }
  drawAnnotationsRef.current = drawAnnotations;


  // ============ Coordenadas ============
  function getImagePtFromClient(clientX: number, clientY: number): Pt | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }
  function getImagePt(e: React.MouseEvent<HTMLCanvasElement>): Pt | null {
    return getImagePtFromClient(e.clientX, e.clientY);
  }

  // Factor de RESOLUCIÓN de la imagen, normalizado a una referencia de 3600 px
  // (ver el render del canvas, donde escala etiquetas y discos de punto).
  const uiScale = useMemo(
    () => (imageEl
      ? clamp(Math.max(imgSize(imageEl).w, imgSize(imageEl).h) / 3600, 0.5, 1.25)
      : 1),
    [imageEl],
  );

  // Multiplicador de los umbrales de acierto (en px de IMAGEN) para tocar un
  // punto o un ancla ya colocados.
  //   · uiScale: en imágenes grandes el disco dibujado crece, y el blanco debe
  //     crecer con él. Se acota con Math.max(…, 1) porque en imágenes
  //     reescaladas el disco encoge, pero encoger también el blanco lo dejaría
  //     casi imposible de acertar — el umbral nunca baja del valor histórico.
  //   · Puntero grueso (dedo/Pencil): sin hover no hay forma de afinar la
  //     puntería antes de tocar, así que se amplía el blanco.
  const hitScale = useMemo(() => {
    const coarse = window.matchMedia('(any-pointer: coarse)').matches;
    return Math.max(uiScale, 1) * (coarse ? 1.7 : 1);
  }, [uiScale]);

  // Puntos anatómicos BLOQUEADOS: durante la simulación no se colocan, mueven
  // ni borran. El agarre de un punto se evalúa antes que la rama de
  // deformadores libres, así que al crear un deformador cerca de un punto
  // (a menudo OCULTO, e invisible ≠ no interactivo) se arrastraba el punto sin
  // querer, alterando en silencio las medidas clínicas. Para corregir un punto
  // hay que salir de la simulación.
  //
  // El estado NEUTRO (`tool === 'none'`) bloquea lo mismo. En ambos casos el
  // bloqueo es deliberadamente ANTERIOR a la rama de deformadores libres de
  // `onPointerDown`: al no agarrar el punto, el gesto sigue su curso y la
  // simulación conserva sus deformadores.
  const pointsLocked = rhinoSimActive || tool === 'none';

  function nearestPoint(pt: Pt, threshold = 18): PointId | null {
    const t = threshold * hitScale;
    const hidden = new Set(pointsHidden);
    let best: PointId | null = null, bestD = Infinity;
    for (const def of pointsForMode(mode)) {
      const p = points[def.id];
      // Un punto oculto no es un blanco válido para NINGUNA interacción
      // (agarrar, borrar, hover, elegir para línea/ángulo).
      if (!p || hidden.has(def.id)) continue;
      const d = distance(p, pt);
      if (d < bestD) { bestD = d; best = def.id; }
    }
    return bestD <= t ? best : null;
  }

  /** Índice del ancla de contorno más cercana, o -1. */
  function nearestAnchor(pt: Pt, threshold = 14): number {
    const t = threshold * hitScale;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < contourAnchors.length; i++) {
      const d = distance(contourAnchors[i], pt);
      if (d < bestD) { bestD = d; best = i; }
    }
    return bestD <= t ? best : -1;
  }

  // ============ Edge-snap ============
  function maybeSnap(pt: Pt): Pt {
    if (!edgeSnapEnabled || !imageEl) return pt;
    return snapToEdge(pt, imageEl);
  }

  // ============ Pan (space + drag) ============
  function startPan(e: React.PointerEvent | React.MouseEvent) {
    panStartRef.current = {
      panX: viewport.panX, panY: viewport.panY,
      mouseX: e.clientX,   mouseY: e.clientY,
    };
    setPanning(true);
    e.preventDefault();
  }
  useEffect(() => {
    if (!panning) return;
    const onMove = rafCoalesce<PointerEvent>((e) => {
      if (pinchingRef.current) return;
      const s = panStartRef.current;
      if (!s) return;
      const dx = e.clientX - s.mouseX;
      const dy = e.clientY - s.mouseY;
      if (Math.hypot(dx, dy) > 3) {
        justDraggedRef.current = true;
      }
      setViewport((v) => ({ zoom: v.zoom, panX: s.panX + dx, panY: s.panY + dy }));
    });
    function onUp() {
      onMove.flush();
      setPanning(false);
      panStartRef.current = null;
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      onMove.cancel();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [panning, setViewport]);

  // Drag del divisor before/after
  useEffect(() => {
    if (!draggingDivider) return;
    const onMove = rafCoalesce<PointerEvent>((e) => {
      if (pinchingRef.current) return;
      const pt = getImagePtFromClient(e.clientX, e.clientY);
      const canvas = canvasRef.current;
      if (!pt || !canvas) return;
      const ratio = Math.max(0, Math.min(1, pt.x / canvas.width));
      setRhinoDividerRatio(ratio);
      justDraggedRef.current = true;
    });
    function onUp() {
      onMove.flush();
      setDraggingDivider(false);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      onMove.cancel();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [draggingDivider, setRhinoDividerRatio]);

  // ============ Wheel + Touch (registrados como NO-PASIVOS) ============
  // React 17+ registra onWheel/onTouch como passive por defecto → preventDefault()
  // no funcionaría y la página haría scroll. Usamos addEventListener nativo con
  // { passive: false } para impedirlo. Touch: pinch-to-zoom + pan de 2 dedos.
  const viewportRef = useRef(viewport);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !imageEl) return;

    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const wRect = wrapper!.getBoundingClientRect();
      const vcx = wRect.width / 2, vcy = wRect.height / 2;
      const cx = e.clientX - wRect.left - vcx;
      const cy = e.clientY - wRect.top - vcy;
      setViewport((v) => {
        const newZoom = clamp(v.zoom * factor, 0.4, 8);
        if (newZoom === v.zoom) return v;
        const ratio = newZoom / v.zoom;
        return {
          zoom: newZoom,
          panX: cx - (cx - v.panX) * ratio,
          panY: cy - (cy - v.panY) * ratio,
        };
      });
    }

    // Estado del gesto de 2 dedos
    let touchInit: {
      dist: number;
      center: { x: number; y: number }; // relativo al centro del viewport
      zoom: number;
      pan: { x: number; y: number };
    } | null = null;

    function getRelCenter(t1: Touch, t2: Touch, rect: DOMRect) {
      return {
        x: (t1.clientX + t2.clientX) / 2 - rect.left - rect.width / 2,
        y: (t1.clientY + t2.clientY) / 2 - rect.top - rect.height / 2,
      };
    }

    function handleTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault();
        // Segundo dedo → es un pinch: cancela cualquier arrastre de 1 puntero
        // en curso (punto/ancla/deformador/pan) para no moverlo mientras se
        // hace zoom. pinchingRef suspende también los onMove de esos arrastres.
        pinchingRef.current = true;
        setDragging(null); setDraggingAnchor(null); setDraggingHandle(null);
        setPendingHandleFrom(null); setPanning(false); panStartRef.current = null;
        const wRect = wrapper!.getBoundingClientRect();
        const t1 = e.touches[0], t2 = e.touches[1];
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        const v = viewportRef.current;
        touchInit = {
          dist: Math.hypot(dx, dy),
          center: getRelCenter(t1, t2, wRect),
          zoom: v.zoom,
          pan: { x: v.panX, y: v.panY },
        };
      } else {
        touchInit = null;
      }
    }

    // RENDIMIENTO del pinch: setViewport por cada touchmove re-renderizaba la
    // App ENTERA (tabla de resultados incluida) 60-120 veces/s → zoom lentísimo
    // en iPad. Durante el gesto se escribe el transform DIRECTO al DOM del
    // host (1 vez por frame); el estado de React se confirma UNA vez al soltar.
    const hostEl = wrapper.querySelector('.canvas-host') as HTMLElement | null;
    let liveVp: Viewport | null = null;
    let liveRaf = 0;
    function paintLive() {
      liveRaf = 0;
      if (liveVp && hostEl) {
        hostEl.style.transform =
          `translate(${liveVp.panX}px, ${liveVp.panY}px) scale(${liveVp.zoom})`;
        // El overlay vive FUERA del host (para no heredar el escalado CSS
        // que emborrona): durante el pinch hay que redibujarlo a mano en el
        // mismo frame o las anotaciones se quedarían clavadas bajo los dedos.
        redrawOverlay();
      }
    }

    function handleTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && touchInit) {
        e.preventDefault();
        const wRect = wrapper!.getBoundingClientRect();
        const t1 = e.touches[0], t2 = e.touches[1];
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        const dist = Math.hypot(dx, dy);
        const center = getRelCenter(t1, t2, wRect);
        const newZoom = clamp(touchInit.zoom * (dist / touchInit.dist), 0.4, 8);
        const ratio = newZoom / touchInit.zoom;
        // Zoom anclado al centro INICIAL del gesto + pan por desplazamiento del centro
        const deltaX = center.x - touchInit.center.x;
        const deltaY = center.y - touchInit.center.y;
        const cx0 = touchInit.center.x;
        const cy0 = touchInit.center.y;
        liveVp = {
          zoom: newZoom,
          panX: cx0 - (cx0 - touchInit.pan.x) * ratio + deltaX,
          panY: cy0 - (cy0 - touchInit.pan.y) * ratio + deltaY,
        };
        if (!liveRaf) liveRaf = requestAnimationFrame(paintLive);
      }
    }

    function handleTouchEnd(e: TouchEvent) {
      if (e.touches.length < 2) {
        touchInit = null;
        // COMMIT único del gesto a React (el transform en vivo ya está pintado)
        if (liveVp) {
          if (liveRaf) { cancelAnimationFrame(liveRaf); liveRaf = 0; }
          paintLive();
          setViewport(liveVp);
          liveVp = null;
        }
      }
      // Solo se sale del modo pinch cuando NO queda ningún dedo (evita reanudar
      // un arrastre a medias al levantar uno de los dos dedos).
      if (e.touches.length === 0) pinchingRef.current = false;
    }

    wrapper.addEventListener('wheel', handleWheel, { passive: false });
    wrapper.addEventListener('touchstart', handleTouchStart, { passive: false });
    wrapper.addEventListener('touchmove', handleTouchMove, { passive: false });
    wrapper.addEventListener('touchend', handleTouchEnd);
    wrapper.addEventListener('touchcancel', handleTouchEnd);
    return () => {
      if (liveRaf) cancelAnimationFrame(liveRaf);
      wrapper.removeEventListener('wheel', handleWheel);
      wrapper.removeEventListener('touchstart', handleTouchStart);
      wrapper.removeEventListener('touchmove', handleTouchMove);
      wrapper.removeEventListener('touchend', handleTouchEnd);
      wrapper.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [imageEl, setViewport, redrawOverlay]);

  // ============ Drag de puntos / Pan / Divisor (Pointer Events) ============
  // Pointer Events unifican ratón, dedo y Apple Pencil. Se ignora el puntero
  // secundario (isPrimary=false) y cualquier evento durante un pinch: esos
  // gestos de 2 dedos los maneja el handler de touch (zoom).
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!imageEl || pinchingRef.current || !e.isPrimary) return;
    // El flag "acabo de arrastrar" se limpia aquí, al EMPEZAR el siguiente
    // gesto, no por temporizador. Con el reset a 80 ms el `click` sintético del
    // táctil podía llegar más tarde, esquivar la guarda de onClick y volver a
    // seleccionar el punto recién soltado (quedaba marcado tras moverlo).
    justDraggedRef.current = false;
    if (spacePressed) { startPan(e); return; }
    const pt = getImagePt(e);
    if (!pt) return;
    // PRIORIDAD MÁXIMA: drag del divisor before/after (solo en vista dividida)
    if (rhinoSimActive && rhinoSplitView) {
      const canvas = canvasRef.current!;
      const dividerX = canvas.width * rhinoDividerRatio;
      if (Math.abs(pt.x - dividerX) < 16) {
        setDraggingDivider(true);
        e.preventDefault();
        return;
      }
    }
    // Herramienta contorno: arrastrar un ancla existente tiene prioridad
    if (tool === 'contour' && !pointsLocked) {
      const ai = nearestAnchor(pt, 16);
      if (ai >= 0) {
        onBeforeChange();   // snapshot pre-arrastre (dedupe si no se mueve)
        setDraggingAnchor(ai);
        draggedDistanceRef.current = 0;
        justDraggedRef.current = false;
        e.preventDefault();
        return;
      }
    }
    // En simulación NO se agarran puntos: la rama de deformadores libres (abajo)
    // debe recibir el gesto aunque caiga cerca de un punto anatómico.
    const id = pointsLocked ? null : nearestPoint(pt, 16);
    if (id) {
      onBeforeChange();   // snapshot pre-arrastre (dedupe si no se mueve)
      setDragging(id);
      draggedDistanceRef.current = 0;
      justDraggedRef.current = false;
      dragStartClientRef.current = { x: e.clientX, y: e.clientY };
      dragMarkedRef.current = false;
      e.preventDefault();
      return;
    }
    // Modo simulación: deformadores libres — SOLO con el modo edición activo
    // (checkbox del panel). Apagado, arrastrar en zona libre desplaza la foto
    // ampliada como siempre. Agarrar uno existente lo re-apunta; arrastrar en
    // zona libre crea uno nuevo (origen→destino). Un click simple (sin
    // arrastre) sigue colocando el punto activo.
    if (rhinoSimActive && rhinoEditHandles && mode === 'perfil') {
      const hi = nearestHandleGrip(pt, 20);
      if (hi >= 0) {
        setDraggingHandle(hi);
        justDraggedRef.current = false;
        e.preventDefault();
        return;
      }
      setPendingHandleFrom(pt);
      e.preventDefault();
      return;
    }
    if (viewport.zoom > 1.02) {
      startPan(e);
    }
  }

  /** Índice del deformador cuyo agarre (destino u origen) está más cerca. */
  function nearestHandleGrip(pt: Pt, threshold = 18): number {
    let best = -1, bd = threshold * threshold;
    rhinoHandles.forEach((h, i) => {
      for (const q of [h.to, h.from]) {
        const d = (q.x - pt.x) ** 2 + (q.y - pt.y) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    });
    return best;
  }

  // Hover coalescido a 1 actualización por frame. Además, `cursorImgPt` es un
  // objeto nuevo en cada movimiento (siempre fuerza un redibujado completo),
  // así que solo se fija cuando algo lo CONSUME: la lupa (herramienta Punto)
  // o la línea elástica de Medir con el primer punto ya marcado. Con las demás
  // herramientas, mover el puntero ya no redibuja el canvas.
  const hoverRafRef = useRef(0);
  const hoverPosRef = useRef<{ x: number; y: number } | null>(null);
  function onPointerMoveCanvas(e: React.PointerEvent<HTMLCanvasElement>) {
    if (dragging || panning || pinchingRef.current) return;
    hoverPosRef.current = { x: e.clientX, y: e.clientY };
    if (hoverRafRef.current) return;
    hoverRafRef.current = requestAnimationFrame(() => {
      hoverRafRef.current = 0;
      const c = hoverPosRef.current;
      if (!c) return;
      const pt = getImagePtFromClient(c.x, c.y);
      if (!pt) { setHoverId(null); setCursorImgPt(null); return; }
      // Sin herramienta / con puntos bloqueados no se resalta nada: el hover
      // prometía "arrastra para reposicionar", que ahí sería mentira.
      setHoverId(pointsLocked ? null : nearestPoint(pt, 14));
      const consumed = (tool === 'point' && magnifierEnabled)
        || (tool === 'measure' && rulerPick != null);
      setCursorImgPt(consumed ? pt : null);
    });
  }

  function onPointerLeaveCanvas() {
    hoverPosRef.current = null;   // descarta el rAF de hover pendiente
    setHoverId(null);
    setCursorImgPt(null);
  }
  useEffect(() => () => { if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current); }, []);

  useEffect(() => {
    if (!dragging) return;
    const draggedId = dragging;
    // Coalescido a 1 actualización por frame (ver rafCoalesce)
    const onMove = rafCoalesce<PointerEvent>((e) => {
      if (pinchingRef.current) return;
      if (!dragStartClientRef.current) dragStartClientRef.current = { x: e.clientX, y: e.clientY };
      const s = dragStartClientRef.current;
      draggedDistanceRef.current = Math.hypot(e.clientX - s.x, e.clientY - s.y);
      const pt = getImagePtFromClient(e.clientX, e.clientY);
      if (pt) {
        setPoints((p) => ({ ...p, [draggedId]: pt }));
        // La lupa sigue el arrastre: onPointerMoveCanvas se ignora durante un
        // drag (los listeners de ventana mandan), así que el cursor de imagen
        // se actualiza aquí — si no, la lupa quedaba congelada donde empezó.
        setCursorImgPt(pt);
      }
      // Marcar como punto de USUARIO al empezar a arrastrar (no al soltar):
      // un punto detectado solo ancla el contorno si está cerca del borde, así
      // que al arrastrarlo lejos el contorno "se soltaba" hasta el mouse-up.
      if (!dragMarkedRef.current && draggedDistanceRef.current > 3) {
        dragMarkedRef.current = true;
        onMarkPointAsUser(draggedId);
      }
    });
    function onUp(e: PointerEvent) {
      onMove.flush();   // aplicar la última posición pendiente antes de soltar
      dragStartClientRef.current = null;
      if (draggedDistanceRef.current > 3) {
        justDraggedRef.current = true;
        // Reposicionado terminado → DESELECCIONAR: si el punto quedara activo,
        // el siguiente click en el canvas lo movería sin querer.
        setActivePointId(null);
      }
      // Táctil/lápiz: sin hover, la lupa quedaría pegada en pantalla al soltar.
      // Con ratón el hover la mantiene/actualiza como siempre.
      if (e.pointerType !== 'mouse') setCursorImgPt(null);
      setDragging(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      onMove.cancel();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, onMarkPointAsUser, setPoints, setActivePointId]);

  // Deformador libre PENDIENTE: se crea al superar 4px de arrastre desde el
  // mousedown en zona libre (un click simple no crea nada).
  handlesLenRef.current = rhinoHandles.length;
  useEffect(() => {
    if (!pendingHandleFrom) return;
    const from = pendingHandleFrom;
    let created = false;
    const onMove = rafCoalesce<PointerEvent>((e) => {
      if (pinchingRef.current) return;
      if (created) return;
      const pt = getImagePtFromClient(e.clientX, e.clientY);
      if (!pt) return;
      if (Math.hypot(pt.x - from.x, pt.y - from.y) > 4) {
        created = true;
        const idx = handlesLenRef.current;
        // El deformador nace con el radio elegido en el panel (× radio base)
        setRhinoHandles((prev) => [...prev, { from, to: pt, radius: rhinoNewHandleRadius }]);
        setDraggingHandle(idx);
        setPendingHandleFrom(null);
      }
    });
    function onUp() {
      onMove.flush();   // un flick más corto que 1 frame también debe crear
      setPendingHandleFrom(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      onMove.cancel();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [pendingHandleFrom, setRhinoHandles, rhinoNewHandleRadius]);

  // Arrastre del destino de un deformador existente
  useEffect(() => {
    if (draggingHandle == null) return;
    const idx = draggingHandle;
    const onMove = rafCoalesce<PointerEvent>((e) => {
      if (pinchingRef.current) return;
      const pt = getImagePtFromClient(e.clientX, e.clientY);
      if (pt) setRhinoHandles((prev) => prev.map((h, i) => (i === idx ? { ...h, to: pt } : h)));
    });
    function onUp() {
      onMove.flush();
      justDraggedRef.current = true;
      setDraggingHandle(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      onMove.cancel();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [draggingHandle, setRhinoHandles]);

  // Arrastre de anclas de contorno (herramienta Contorno)
  useEffect(() => {
    if (draggingAnchor == null) return;
    const idx = draggingAnchor;
    let startCx: number | null = null;
    let startCy: number | null = null;
    const onMove = rafCoalesce<PointerEvent>((e) => {
      if (pinchingRef.current) return;
      if (startCx == null) { startCx = e.clientX; startCy = e.clientY; }
      draggedDistanceRef.current = Math.hypot(e.clientX - startCx!, e.clientY - startCy!);
      const pt = getImagePtFromClient(e.clientX, e.clientY);
      if (pt) setContourAnchors((prev) => prev.map((a, i) => (i === idx ? pt : a)));
    });
    function onUp() {
      onMove.flush();
      if (draggedDistanceRef.current > 3) justDraggedRef.current = true;
      setDraggingAnchor(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      onMove.cancel();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [draggingAnchor, setContourAnchors]);

  // ============ Click handler ============
  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (justDraggedRef.current) return;
    if (!imageEl || spacePressed) return;
    const pt = getImagePt(e);
    if (!pt) return;

    if (tool === 'point') {
      if (pointsLocked) return;   // simulación: puntos anatómicos bloqueados
      const onExisting = nearestPoint(pt, 14);
      if (onExisting) { setActivePointId(onExisting); return; }
      // Sin punto seleccionado, el click en zona libre no coloca nada: hay que
      // elegir primero un punto de la lista (o agarrar uno existente).
      if (!activePointId) return;
      onBeforeChange();
      const snapped = maybeSnap(pt);
      setPoints((prev) => ({ ...prev, [activePointId]: snapped }));
      onMarkPointAsUser(activePointId);
      // Avance guiado: siguiente punto OBLIGATORIO sin colocar; si no queda
      // ninguno, deseleccionar. Los opcionales (Nk/Cuello) NO entran en el
      // avance automático — se colocan a mano solo si se necesitan.
      const modePoints = pointsForMode(mode);
      const idx = modePoints.findIndex((p) => p.id === activePointId);
      let advanced = false;
      for (let i = 1; i <= modePoints.length; i++) {
        const next = modePoints[(idx + i) % modePoints.length];
        if (!next.optional && !points[next.id] && next.id !== activePointId) {
          setActivePointId(next.id); advanced = true; break;
        }
      }
      if (!advanced) setActivePointId(null);
      return;
    }
    if (tool === 'erase') {
      // Bloqueado en simulación: el borrador solo elimina deformadores libres.
      const id = pointsLocked ? null : nearestPoint(pt);
      if (id) {
        onBeforeChange();
        setPoints((prev) => { const c = { ...prev }; delete c[id]; return c; });
        setCustomLines((prev) => prev.filter((l) => l.a !== id && l.b !== id));
        setCustomAngles((prev) => prev.filter((a) => a.a !== id && a.v !== id && a.b !== id));
        return;
      }
      // ¿Un deformador libre de la simulación? (fuera del historial de Deshacer)
      if (rhinoSimActive) {
        const hi = nearestHandleGrip(pt, 16);
        if (hi >= 0) {
          setRhinoHandles((prev) => prev.filter((_, i) => i !== hi));
          return;
        }
      }
      // Sin punto cerca: ¿un ancla de contorno? (también bloqueadas en simulación)
      const ai = pointsLocked ? -1 : nearestAnchor(pt, 14);
      if (ai >= 0) {
        onBeforeChange();
        setContourAnchors((prev) => prev.filter((_, i) => i !== ai));
        return;
      }
      // ¿Una medición? (clic cerca de su recta)
      const ri = rulers.findIndex((r) => distToSegment(pt, r.p1, r.p2) <= 10);
      if (ri >= 0) { onBeforeChange(); setRulers((prev) => prev.filter((_, i) => i !== ri)); }
      return;
    }
    if (tool === 'line') {
      const id = nearestPoint(pt);
      if (!id) return;
      if (!linePick) { setLinePick(id); return; }
      if (linePick !== id) { onBeforeChange(); setCustomLines((prev) => [...prev, { a: linePick, b: id }]); }
      setLinePick(null);
      return;
    }
    if (tool === 'angle') {
      const id = nearestPoint(pt);
      if (!id) return;
      const next = [...anglePick, id];
      if (next.length === 3) {
        onBeforeChange();
        setCustomAngles((prev) => [...prev, { a: next[0], v: next[1], b: next[2] }]);
        setAnglePick([]);
      } else setAnglePick(next);
      return;
    }
    if (tool === 'calibrate') {
      if (calibPick.length === 0) { setCalibPick([pt]); return; }
      const p1 = calibPick[0], p2 = pt;
      const mmStr = window.prompt('Distancia real entre los 2 puntos (mm):', '10');
      const mm = mmStr ? parseFloat(mmStr) : NaN;
      if (mm > 0 && isFinite(mm)) { onBeforeChange(); setCalibration({ p1, p2, mm }); }
      setCalibPick([]);
      return;
    }
    if (tool === 'measure') {
      if (!rulerPick) { setRulerPick(pt); return; }
      onBeforeChange();
      setRulers((prev) => [...prev, { p1: rulerPick, p2: pt }]);
      setRulerPick(null);
      return;
    }
    if (tool === 'contour') {
      if (pointsLocked) return;   // simulación: contorno bloqueado
      // Clic en zona libre → nueva ancla de ajuste del contorno (sin snap:
      // justo aquí el borde detectado engaña — pelo/barba — y manda el usuario)
      if (nearestAnchor(pt, 16) < 0) {
        onBeforeChange();
        setContourAnchors((prev) => [...prev, pt]);
      }
      return;
    }
  }

  useEffect(() => { setLinePick(null); setAnglePick([]); setCalibPick([]); setRulerPick(null); }, [tool, mode]);

  // ============ Zoom controls ============
  // Zoom hacia el centro del viewport — sin desplazamiento.
  function zoomBy(factor: number) {
    setViewport((v) => {
      const newZoom = clamp(v.zoom * factor, 0.4, 8);
      if (newZoom === v.zoom) return v;
      const ratio = newZoom / v.zoom;
      // Como cx, cy son 0 (relativos al centro), la fórmula se reduce a:
      return { zoom: newZoom, panX: v.panX * ratio, panY: v.panY * ratio };
    });
  }
  function zoomReset() { setViewport({ zoom: 1, panX: 0, panY: 0 }); }

  // ============ Pantalla completa ============
  // iPad/iOS: Safari solo expone la API con prefijo webkit (y en PWA
  // standalone puede no existir ninguna). Cadena de intentos:
  // requestFullscreen → webkitRequestFullscreen → modo PSEUDO-fullscreen por
  // CSS (posición fija a pantalla completa), que funciona siempre.
  function toggleFullscreen() {
    const el = wrapperRef.current as (HTMLDivElement & {
      webkitRequestFullscreen?: () => void;
    }) | null;
    if (!el) return;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => void;
    };
    if (fsFallback) { setFsFallback(false); return; }
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
      else doc.webkitExitFullscreen?.();
      return;
    }
    if (el.requestFullscreen) {
      const p = el.requestFullscreen();
      // si el navegador rechaza la petición (iOS), caer al modo CSS
      (p as Promise<void> | undefined)?.catch?.(() => setFsFallback(true));
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else {
      setFsFallback(true);
    }
  }
  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    function onFsChange() {
      setIsFullscreen(!!(document.fullscreenElement || doc.webkitFullscreenElement));
    }
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  // ============ Hint ============
  let hint = '';
  if (!imageEl) hint = '';
  else if (spacePressed) hint = 'Modo pan — arrastra para mover';
  // Bloqueo en simulación: sin este aviso, la herramienta parece rota (haces
  // click y no pasa nada) en vez de protegida.
  else if (rhinoSimActive && (tool === 'point' || tool === 'erase' || tool === 'contour'))
    hint = 'Puntos bloqueados durante la simulación — sal de Rinoplastia para editarlos';
  else if (tool === 'none')
    hint = 'Sin herramienta — solo zoom y desplazamiento · elige una abajo para anotar';
  else if (dragging) {
    const def = POINT_BY_ID[dragging];
    hint = `Arrastrando: ${def?.name ?? dragging}`;
  } else if (hoverId) {
    const def = POINT_BY_ID[hoverId];
    const meta = pointMeta[hoverId];
    const conf = meta?.source === 'detected' ? ` · IA ${Math.round(meta.confidence * 100)} %` : '';
    hint = `${def?.name ?? hoverId} (${hoverId})${conf} — arrastra para reposicionar`;
  } else if (tool === 'point') {
    const def = activePointId ? POINT_BY_ID[activePointId] : null;
    hint = def
      ? `Click para colocar: ${def.name} (${def.id})${edgeSnapEnabled ? ' · snap a borde' : ''}${viewport.zoom > 1.02 ? ' · arrastra para mover' : ''}`
      : 'Punto: elige uno de la lista o arrastra uno existente para reposicionarlo';
  } else if (tool === 'line') hint = linePick ? 'Línea: 2.º punto' : 'Línea: 1.er punto';
  else if (tool === 'angle') {
    const labels = ['1.er punto', 'vértice', '2.º punto'];
    hint = `Ángulo: ${labels[anglePick.length]} (${anglePick.length}/3)`;
  } else if (tool === 'erase') hint = 'Click sobre un punto para borrarlo';
  else if (tool === 'calibrate') hint = calibPick.length === 0
    ? 'Calibración: marca el 1.er punto'
    : 'Calibración: marca el 2.º punto';
  else if (tool === 'measure') hint = rulerPick
    ? `Medir: 2.º punto${mmPerPx ? '' : ' · sin calibrar (resultado en px)'}`
    : 'Medir: marca el 1.er punto de la distancia';
  else if (tool === 'contour') hint = mode === 'perfil'
    ? 'Contorno: click sobre el borde real añade un ancla de ajuste · arrastra para mover · Borrar para eliminar'
    : 'Contorno: solo disponible en modo perfil';

  // Herramientas de precisión: siempre cruz fina, aunque haya zoom (el pan se
  // hace con Espacio+arrastre). Solo se muestra la mano para el pan explícito.
  const precisionTool = tool === 'point' || tool === 'line' || tool === 'angle'
    || tool === 'calibrate' || tool === 'measure' || tool === 'contour';
  const cursor = draggingDivider ? 'ew-resize'
    : panning ? 'grabbing'
    : spacePressed ? 'grab'
    : dragging || draggingAnchor != null ? 'none'  // arrastrando: ocultar cursor
    : hoverId ? 'move'             // sobre un punto existente: lo vas a reposicionar
    : precisionTool ? PRECISION_CURSOR
    : tool === 'erase' ? 'pointer'
    : viewport.zoom > 1.02 ? 'grab'
    : 'crosshair';

  const transform = `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`;

  return (
    <div className="canvas-wrap">
      {!imageEl ? (
        <div className="canvas-empty">
          <div className="icon"><Icon name="photo" size={46} /></div>
          <h2>
            {mode === 'perfil'
              ? 'Modo PERFIL — carga una foto lateral'
              : 'Modo FRENTE — carga una foto frontal'}
          </h2>
          <p>
            Sube una foto o captúrala con la cámara y pulsa <b>Detectar auto</b>.
            La IA coloca los puntos automáticamente; luego usa la <b>lupa</b>
            y <b>zoom (rueda) / pan (Espacio+drag)</b> para ajustar con precisión píxel.
          </p>
          {(onRequestLoad || onRequestCamera) && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
              {onRequestLoad && (
                <button className="primary" style={{ padding: '10px 20px', fontSize: 14 }} onClick={onRequestLoad}>
                  <Icon name="folder" /> Cargar foto
                </button>
              )}
              {onRequestCamera && (
                <button style={{ padding: '10px 20px', fontSize: 14 }} onClick={onRequestCamera}>
                  <Icon name="camera" /> Usar cámara
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className={`canvas-viewport ${fsFallback ? 'fs-fallback' : ''}`} ref={wrapperRef}>
          {onToggleSidebar && (
            <button
              className="panel-toggle left"
              onClick={onToggleSidebar}
              title={sidebarHidden
                ? 'Mostrar el panel de herramientas'
                : 'Ocultar el panel de herramientas'}
              aria-expanded={!sidebarHidden}
            >
              {sidebarHidden ? '▸' : '◂'}
            </button>
          )}
          {onToggleResults && (
            <button
              className="panel-toggle right"
              onClick={onToggleResults}
              title={resultsHidden
                ? 'Mostrar el panel de resultados'
                : 'Ocultar el panel de resultados'}
              aria-expanded={!resultsHidden}
            >
              {resultsHidden ? '◂' : '▸'}
            </button>
          )}
          {onToggleTopbar && (
            <button
              className="panel-toggle top"
              onClick={onToggleTopbar}
              title={topbarHidden
                ? 'Mostrar la barra superior'
                : 'Ocultar la barra superior'}
              aria-expanded={!topbarHidden}
            >
              {topbarHidden ? '▾' : '▴'}
            </button>
          )}
          <div className="zoom-controls">
            {zoomOpen ? (
              <>
                <button onClick={() => zoomBy(1.25)} title="Zoom in (rueda hacia arriba / pellizco)">+</button>
                <span className="zoom-level">{Math.round(viewport.zoom * 100)} %</span>
                <button onClick={() => zoomBy(1 / 1.25)} title="Zoom out (rueda hacia abajo / pellizco)">−</button>
                <button onClick={zoomReset} title="Restaurar 100% sin pan">1:1</button>
                <button
                  onClick={toggleFullscreen}
                  title={(isFullscreen || fsFallback) ? 'Salir de pantalla completa' : 'Ver imagen en pantalla completa'}
                >{(isFullscreen || fsFallback) ? '⛗' : '⛶'}</button>
                <button className="rc-min" onClick={() => setZoomOpen(false)} title="Minimizar barra de zoom">⌄</button>
              </>
            ) : (
              <>
                <button
                  className="zoom-level-btn"
                  onClick={() => setZoomOpen(true)}
                  title="Zoom (pellizca con 2 dedos sobre la foto) — toca para ver los controles"
                >{Math.round(viewport.zoom * 100)} %</button>
                <button
                  onClick={toggleFullscreen}
                  title={(isFullscreen || fsFallback) ? 'Salir de pantalla completa' : 'Ver imagen en pantalla completa'}
                >{(isFullscreen || fsFallback) ? '⛗' : '⛶'}</button>
              </>
            )}
          </div>
          {/* Franja inferior flotante: apila "ajustar imagen" y la barra de
              herramientas en columna. Al estar en un contenedor común no hacen
              falta offsets fijos — si la barra envuelve a 2 filas, la de arriba
              se desplaza sola y nunca se solapan. */}
          <div className="canvas-bottom">
          {!rotateOpen ? (
            // Minimizada: una pastilla que no tapa la foto (estado inicial en táctil)
            <button
              className="rotate-controls rc-collapsed"
              onClick={() => setRotateOpen(true)}
              title="Ajustar la imagen: rotación, inclinación fina, volteo y auto-enderezado"
            >
              {/* Solo el icono (+ el ángulo si lo hay): el nombre completo vive
                  en el `title`. Tapaba demasiada foto en el iPad. */}
              ⟲{rotationAngle !== 0 ? ` ${rotationAngle.toFixed(1)}°` : ''}
            </button>
          ) : (
          <div className="rotate-controls">
            <button className="rc-min" onClick={() => setRotateOpen(false)} title="Minimizar barra de ajuste de imagen">⌄</button>
            <span className="rc-label">Ajustar</span>
            <button onClick={() => setRotation((a) => a - 90)} title="Girar 90° izquierda">⟲</button>
            <button onClick={() => setRotation((a) => a - 1)} title="−1°">−1°</button>
            <input
              type="range"
              min={-45} max={45} step={0.5}
              value={rotationAngle}
              onChange={(e) => setRotation(parseFloat(e.target.value))}
              title="Inclinación fina (−45° a +45°)"
            />
            <input
              type="number"
              value={Number(rotationAngle.toFixed(1))}
              step={0.5}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) setRotation(v);
              }}
              title="Ángulo exacto"
            />
            <span className="rc-unit">°</span>
            <button onClick={() => setRotation((a) => a + 1)} title="+1°">+1°</button>
            <button onClick={() => setRotation((a) => a + 90)} title="Girar 90° derecha">⟳</button>
            <button onClick={() => setRotation(0)} title="Reset rotación" disabled={rotationAngle === 0}>Reset</button>
            <button
              onClick={onFlipH}
              className={flipH ? 'auto' : ''}
              title="Voltear horizontal (espejo) — canonizar el lado del perfil"
            >⇄ Voltear</button>
            <button
              onClick={autoStraighten}
              disabled={!canAutoStraighten}
              title={canAutoStraighten
                ? `Auto-enderezar ${autoStraightenMethod}`
                : mode === 'frente'
                  ? 'Coloca pupilas o cantos internos para auto-enderezar'
                  : 'Coloca Po+Or (Frankfort) o G+Me para auto-enderezar'}
              className={canAutoStraighten ? 'auto' : ''}
            >Auto</button>
          </div>
          )}

            {!toolsOpen ? (
              // Recogida: una pastilla que anuncia la herramienta activa (o el
              // estado neutro) sin tapar la foto. Estado inicial en táctil.
              <button
                className="canvas-toolbar ct-collapsed"
                onClick={() => setToolsOpen(true)}
                title="Mostrar la barra de herramientas"
              >
                {tool === 'none'
                  ? <><Icon name="eyeOff" size={15} /> Sin herramienta</>
                  : <>
                      <Icon name={TOOLS.find((t) => t.id === tool)!.icon} size={15} />
                      {TOOLS.find((t) => t.id === tool)!.label}
                    </>}
              </button>
            ) : (
            <div className="canvas-toolbar" role="toolbar" aria-label="Herramientas">
              <button
                className="ct-min"
                onClick={() => setToolsOpen(false)}
                title="Recoger la barra de herramientas"
              >⌄</button>
              {TOOLS.map((t) => (
                <button
                  key={t.id}
                  className={`ct-tool ${tool === t.id ? 'active' : ''}`}
                  // Pulsar la herramienta ACTIVA la apaga (estado neutro): así se
                  // puede dejar la foto "en frío" para mirarla o hacer zoom sin
                  // riesgo de anotar algo sin querer.
                  onClick={() => setTool(tool === t.id ? 'none' : t.id)}
                  title={tool === t.id
                    ? `${t.label} — pulsa para desactivar (tecla ${t.hotkey})`
                    : `${t.label} (tecla ${t.hotkey})`}
                  aria-pressed={tool === t.id}
                >
                  <Icon name={t.icon} size={18} />
                  <span className="ct-label">{t.label}</span>
                </button>
              ))}
              <span className="ct-sep" />
              <button
                className="ct-tool"
                onClick={onUndo}
                disabled={!canUndo}
                title="Deshacer la última acción (Ctrl+Z)"
              >
                <Icon name="undo" size={18} />
                <span className="ct-label">Deshacer</span>
              </button>
              <button
                className="ct-tool"
                onClick={onRedo}
                disabled={!canRedo}
                title="Rehacer (Ctrl+Shift+Z o Ctrl+Y)"
              >
                <span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}>
                  <Icon name="undo" size={18} />
                </span>
                <span className="ct-label">Rehacer</span>
              </button>
            </div>
            )}
          </div>

          {hint && <div className="hint">{hint}</div>}
          <div className="canvas-host" style={{ transform, transformOrigin: 'center center' }}>
            <canvas
              ref={canvasRef}
              onClick={onClick}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMoveCanvas}
              onPointerLeave={onPointerLeaveCanvas}
              // touchAction none → el navegador no hace scroll/zoom propio sobre
              // el canvas; el pan de 1 dedo y el pinch de 2 los gestionamos aquí.
              style={{ cursor, touchAction: 'none' }}
            />
          </div>
          {/* Overlay de anotaciones: HERMANO del host, no hijo — si viviera
              dentro heredaría el transform CSS del zoom y se emborronaría
              igual que antes. Sin eventos de puntero: el canvas de abajo
              sigue recibiendo todos los gestos. */}
          <canvas ref={overlayRef} className="anno-overlay" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

// ============ Marco recto sobre imagen rotada ============
// Dibuja un overlay oscurecedor fuera del rectángulo inscrito y un marco
// brillante en su borde — esconde las esquinas inclinadas que dan sensación
// de "bordes torcidos" cuando la imagen está rotada.
function drawRotationFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  angleDeg: number,
  original: { w: number; h: number },
) {
  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.abs(Math.cos(rad));
  const sinA = Math.abs(Math.sin(rad));
  const oW = original.w, oH = original.h;
  // El mayor rectángulo recto con relación oW:oH inscrito en la imagen rotada
  const sideX = Math.min(
    (oW * oW) / (oW * cosA + oH * sinA),
    (oW * oH) / (oW * sinA + oH * cosA),
  );
  const sideY = sideX * (oH / oW);
  const rx = (canvas.width  - sideX) / 2;
  const ry = (canvas.height - sideY) / 2;

  ctx.save();
  // Overlay oscurecedor en las 4 bandas fuera del marco
  ctx.fillStyle = 'rgba(11, 18, 32, 0.72)';
  // arriba
  ctx.fillRect(0, 0, canvas.width, ry);
  // abajo
  ctx.fillRect(0, ry + sideY, canvas.width, canvas.height - (ry + sideY));
  // izquierda
  ctx.fillRect(0, ry, rx, sideY);
  // derecha
  ctx.fillRect(rx + sideX, ry, canvas.width - (rx + sideX), sideY);
  ctx.restore();

  // Marco brillante del área útil
  ctx.save();
  ctx.strokeStyle = 'rgba(74, 222, 128, 0.9)';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 4;
  ctx.strokeRect(rx + 0.5, ry + 0.5, sideX - 1, sideY - 1);
  ctx.restore();

  // Pequeñas esquinas decorativas
  const cornerLen = Math.min(20, sideX * 0.06, sideY * 0.06);
  ctx.save();
  ctx.strokeStyle = '#86efac';
  ctx.lineWidth = 3;
  ctx.lineCap = 'square';
  const drawCorner = (cx: number, cy: number, dx: number, dy: number) => {
    ctx.beginPath();
    ctx.moveTo(cx + dx * cornerLen, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * cornerLen);
    ctx.stroke();
  };
  drawCorner(rx,            ry,            +1, +1); // top-left
  drawCorner(rx + sideX,    ry,            -1, +1); // top-right
  drawCorner(rx,            ry + sideY,    +1, -1); // bottom-left
  drawCorner(rx + sideX,    ry + sideY,    -1, -1); // bottom-right
  ctx.restore();
}

// ============ Edge-snap (gradiente local en imageEl) ============
function snapToEdge(pt: Pt, image: ImageLike, radius = 8): Pt {
  const W = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const H = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  const x0 = Math.max(0, Math.round(pt.x) - radius);
  const y0 = Math.max(0, Math.round(pt.y) - radius);
  const w  = Math.min(W - x0, radius * 2 + 1);
  const h  = Math.min(H - y0, radius * 2 + 1);
  if (w < 3 || h < 3) return pt;
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const octx = off.getContext('2d');
  if (!octx) return pt;
  octx.drawImage(image, x0, y0, w, h, 0, 0, w, h);
  const d = octx.getImageData(0, 0, w, h).data;
  const lum = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  };
  let bestX = pt.x, bestY = pt.y, bestG = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = lum(x + 1, y) - lum(x - 1, y);
      const gy = lum(x, y + 1) - lum(x, y - 1);
      const g = Math.hypot(gx, gy);
      if (g > bestG) { bestG = g; bestX = x + x0; bestY = y + y0; }
    }
  }
  // Sólo snap si el borde es notablemente fuerte
  return bestG > 30 ? { x: bestX, y: bestY } : pt;
}

// ============ Magnifier ============
function drawMagnifier(
  ctx: CanvasRenderingContext2D,
  image: ImageLike,
  cursor: Pt,
  W: number, H: number,
) {
  const R = 90;          // radio dibujado en canvas
  const sample = 22;     // radio de imagen muestreado
  const zoom = R / sample; // ~4x
  // Posición de la lupa: a la dcha del cursor, a 60 px de distancia.
  // Si se sale por la derecha, ponemos a la izquierda. Si arriba, vamos abajo.
  let mx = cursor.x + 60 + R;
  let my = cursor.y - 60 - R;
  if (mx + R > W) mx = cursor.x - 60 - R;
  if (my - R < 0) my = cursor.y + 60 + R;
  if (mx - R < 0) mx = R + 4;
  if (my + R > H) my = H - R - 4;

  ctx.save();
  // Sombra suave
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(mx, my, R + 2, 0, Math.PI * 2);
  ctx.fillStyle = '#0b1220';
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, my, R, 0, Math.PI * 2);
  ctx.clip();
  // Pixelado nítido para precisión
  (ctx as any).imageSmoothingEnabled = false;
  ctx.drawImage(
    image,
    cursor.x - sample, cursor.y - sample, sample * 2, sample * 2,
    mx - R, my - R, R * 2, R * 2,
  );
  ctx.restore();

  // Borde + crosshair central
  ctx.save();
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(mx, my, R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(250,204,21,0.95)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(mx - 14, my); ctx.lineTo(mx - 4, my);
  ctx.moveTo(mx + 4, my); ctx.lineTo(mx + 14, my);
  ctx.moveTo(mx, my - 14); ctx.lineTo(mx, my - 4);
  ctx.moveTo(mx, my + 4); ctx.lineTo(mx, my + 14);
  ctx.stroke();
  // Punto exacto en el centro
  ctx.fillStyle = '#facc15';
  ctx.beginPath(); ctx.arc(mx, my, 1.5, 0, Math.PI * 2); ctx.fill();

  // Etiqueta zoom
  ctx.font = '600 11px -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillStyle = 'rgba(11,18,32,.85)';
  const lbl = `${zoom.toFixed(0)}×`;
  const m = ctx.measureText(lbl);
  ctx.fillRect(mx - m.width / 2 - 5, my + R + 4, m.width + 10, 14);
  ctx.fillStyle = '#facc15';
  ctx.fillText(lbl, mx - m.width / 2, my + R + 14);
  ctx.restore();
}

// ============ Template (ghost canónico) ============
function getFaceBbox(image: ImageLike, points: Partial<Record<PointId, Pt>>): { x: number; y: number; w: number; h: number } {
  const placed = Object.values(points);
  if (placed.length >= 3) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of placed) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = 0.1;
    const w = (maxX - minX) * (1 + pad), h = (maxY - minY) * (1 + pad);
    return { x: minX - (maxX - minX) * pad / 2, y: minY - (maxY - minY) * pad / 2, w, h };
  }
  const W = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const H = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  return { x: W * 0.2, y: H * 0.08, w: W * 0.55, h: H * 0.85 };
}

function drawTemplate(
  ctx: CanvasRenderingContext2D,
  image: ImageLike,
  mode: Mode,
  points: Partial<Record<PointId, Pt>>,
) {
  const bbox = getFaceBbox(image, points);
  const canonical = mode === 'perfil' ? CANONICAL_PROFILE : CANONICAL_FRONTAL;

  // ----- 1) Silueta canónica "ideal" -----
  if (mode === 'perfil') {
    // Curva suave Catmull-Rom por los puntos canónicos del perfil, en orden
    // anatómico (corona → mentón → cuello). Esto es la "forma esperada".
    const order: PointId[] = ['Tr','G','N','Pn','Cm','Sn','Ls','Li','Sl','Pog','Me','C'];
    const pts: Pt[] = [];
    for (const id of order) {
      const cp = canonical[id];
      if (cp) pts.push({ x: bbox.x + cp[0] * bbox.w, y: bbox.y + cp[1] * bbox.h });
    }
    if (pts.length >= 3) {
      ctx.save();
      // Sombra suave para destacar sobre cualquier fondo
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 4;
      ctx.strokeStyle = 'rgba(96,165,250,0.85)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      drawSmoothCurve(ctx, pts);
      ctx.restore();
      // Etiqueta de la silueta
      const labelPt = pts[0];
      drawText(ctx, labelPt.x - 80, labelPt.y + 14, 'Silueta canónica', 'rgba(147,197,253,0.95)', { size: 11 });
    }
  } else {
    // Frente: óvalo facial canónico
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.strokeStyle = 'rgba(96,165,250,0.85)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, bbox.w * 0.40, bbox.h * 0.50, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawText(ctx, cx - bbox.w * 0.40 + 8, cy - bbox.h * 0.50 + 14, 'Óvalo canónico', 'rgba(147,197,253,0.95)', { size: 11 });
  }

  // ----- 2) Marcas ghost individuales (puntos canónicos no colocados aún) -----
  ctx.save();
  for (const entry of Object.entries(canonical) as [PointId, [number, number]][]) {
    const [id, [cxR, cyR]] = entry;
    if (points[id]) continue;
    const x = bbox.x + cxR * bbox.w;
    const y = bbox.y + cyR * bbox.h;
    // Círculo con borde + fill semitransparente
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(96,165,250,0.18)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(96,165,250,0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const entry of Object.entries(canonical) as [PointId, [number, number]][]) {
    const [id, [cxR, cyR]] = entry;
    if (points[id]) continue;
    const x = bbox.x + cxR * bbox.w;
    const y = bbox.y + cyR * bbox.h;
    drawText(ctx, x + 11, y - 7, `~${id}`, 'rgba(147,197,253,0.85)', { size: 11, bold: false });
  }
  ctx.restore();
}

/** Curva suave Catmull-Rom → Bezier para una secuencia de puntos. */
function drawSmoothCurve(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i + 2 < pts.length ? pts[i + 2] : p2;
    const cp1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const cp2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p2.x, p2.y);
  }
  ctx.stroke();
}

// ============ Dibujo: PERFIL — líneas estéticas ============
function drawProfileLines(
  ctx: CanvasRenderingContext2D,
  points: Partial<Record<PointId, Pt>>,
  visibleLines: Record<string, boolean>,
) {
  for (const ln of linesForMode('perfil')) {
    if (!visibleLines[ln.id]) continue;
    const a = points[ln.from], b = points[ln.to];
    if (!a || !b) continue;
    // Líneas estéticas principales del perfil: 3 px con contorno + etiqueta con fondo
    drawLine(ctx, a, b, ln.color, 3, ln.dashed);
    drawLineLabel(ctx, a, b, ln.label, ln.color);
  }
}

function drawProfileGuides(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  points: Partial<Record<PointId, Pt>>,
  visibleLines: Record<string, boolean>,
  mmPerPx: number | null,
  measuresHidden: string[] = [],
) {
  if (visibleLines['zero-meridian']) {
    // Cero meridiano de González-Ulloa: línea por NASIÓN perpendicular al
    // plano de Frankfort (Po–Or). Sin Po/Or se degrada a la vertical de la
    // foto, igual que chinProjectionSigned — guía y número siempre coinciden.
    const n = points['N'];
    if (n) {
      const po = points['Po'], or = points['Or'];
      const pog = points['Pog'], pn = points['Pn'];
      let u: Pt | null = null;   // unitario ANTERIOR de Frankfort (Po→Or)
      if (po && or) {
        const dx = or.x - po.x, dy = or.y - po.y;
        const len = Math.hypot(dx, dy);
        if (len > 1e-6) u = { x: dx / len, y: dy / len };
      }
      if (u) {
        // Perpendicular a Frankfort por N, extendida a todo el lienzo
        const v = { x: -u.y, y: u.x };
        const L = canvas.width + canvas.height;
        drawLine(ctx, { x: n.x - v.x * L, y: n.y - v.y * L },
                      { x: n.x + v.x * L, y: n.y + v.y * L }, '#22d3ee', 1.5, true);
        drawText(ctx, n.x + 6, 24, '⊥ Frankfort por N', '#a5f3fc');
      } else {
        drawVertical(ctx, canvas, n.x, '#22d3ee', true);
        drawText(ctx, n.x + 6, 24, 'Vertical por N (sin Po/Or)', '#a5f3fc');
      }
      if (pog && (u || pn)) {
        // Segmento de medida: de Pog al PIE de la perpendicular sobre la línea
        const foot = u
          ? (() => {
              const v = { x: -u.y, y: u.x };
              const t = (pog.x - n.x) * v.x + (pog.y - n.y) * v.y;
              return { x: n.x + v.x * t, y: n.y + v.y * t };
            })()
          : { x: n.x, y: pog.y };
        drawLine(ctx, pog, foot, '#fde68a', 2);
        const cp = chinProjectionSigned(n, pog, pn, po, or);
        const cpMm = cp != null && mmPerPx ? cp * mmPerPx : null;
        const txt = cpMm != null
          ? `Proyec. mentón: ${cpMm >= 0 ? '+' : ''}${cpMm.toFixed(1)} mm`
          : cp != null
            ? `Proyec. mentón: ${cp >= 0 ? '+' : ''}${cp.toFixed(0)} px`
            : '';
        if (txt) drawText(ctx, (pog.x + foot.x) / 2 - 60, Math.min(pog.y, foot.y) - 8, txt,
          cpMm != null && Math.abs(cpMm) <= 2 ? '#86efac' : '#fbbf24');
      }
    }
  }
  if (visibleLines['thirds-profile']) {
    const tr = points['Tr'], g = points['G'], sn = points['Sn'], me = points['Me'];
    const ys = [tr?.y, g?.y, sn?.y, me?.y].filter((v): v is number => v != null);
    for (const y of ys) drawHorizontal(ctx, canvas, y, '#60a5fa', true);
    const t = computeThirds(tr, g, sn, me);
    if (t && tr && g && sn && me) {
      const xL = Math.max(8, Math.min(canvas.width - 140, (tr.x + me.x) / 2 + 60));
      drawText(ctx, xL, (tr.y + g.y) / 2,  `Sup: ${(t.ratios[0] * 100).toFixed(0)} %`, '#bfdbfe');
      drawText(ctx, xL, (g.y + sn.y) / 2,  `Medio: ${(t.ratios[1] * 100).toFixed(0)} %`, '#bfdbfe');
      drawText(ctx, xL, (sn.y + me.y) / 2, `Inf: ${(t.ratios[2] * 100).toFixed(0)} %`, '#bfdbfe');
    }
  }
  // ----- Triángulo Goode (N–Pn–AC) — proyección nasal -----
  if (visibleLines['goode']) {
    const N = points['N'], Pn = points['Pn'], AC = points['AC'];
    const g = goodeNasalProjection(points);
    if (N && Pn && AC && g) {
      // 1) Longitud nasal N–Pn — verde brillante, 3 px
      drawLine(ctx, N, Pn, '#00FF88', 3);
      // 2) Línea base N–AC — azul brillante, 3 px
      drawLine(ctx, N, AC, '#00AAFF', 3);
      // 3) Perpendicular Pn → foot — naranja brillante, 3 px
      drawLine(ctx, Pn, g.foot, '#FF8800', 3);
      // Marcador de ángulo recto en el pie de la perpendicular
      drawRightAngleMark(ctx, g.foot, N, AC, Pn, '#FF8800');
      // Etiquetas con valor numérico (con fondo oscuro semitransparente)
      const lenTxt  = mmPerPx ? `${(g.nasalLength * mmPerPx).toFixed(1)} mm` : `${g.nasalLength.toFixed(0)} px`;
      const baseTxt = mmPerPx ? `${(g.baseLine    * mmPerPx).toFixed(1)} mm` : `${g.baseLine.toFixed(0)} px`;
      const projTxt = mmPerPx ? `${(g.projection  * mmPerPx).toFixed(1)} mm` : `${g.projection.toFixed(0)} px`;
      // Gating de etiquetas según LayersPanel
      if (!measuresHidden.includes('distance-labels')) {
        drawText(ctx, (N.x + Pn.x) / 2 + 10,      (N.y + Pn.y) / 2 - 8,  `Long. nasal: ${lenTxt}`,   '#00FF88', { size: 13, background: true });
        drawText(ctx, (N.x + AC.x) / 2 - 10,      (N.y + AC.y) / 2 + 18, `Base N–AC: ${baseTxt}`,     '#00AAFF', { size: 13, background: true });
        drawText(ctx, (Pn.x + g.foot.x) / 2 - 95, (Pn.y + g.foot.y) / 2,  `Proyección: ${projTxt}`,    '#FF8800', { size: 13, background: true });
      }
      // Ratio Goode y veredicto
      if (!measuresHidden.includes('ratio-goode')) {
        const v = goodeVerdict(g.ratio);
        const verdictTxt = v === 'adecuada' ? 'adecuada'
          : v === 'subproyectada' ? 'subproyectada'
          : v === 'sobreproyectada' ? 'sobreproyectada' : '';
        const verdictColor = v === 'adecuada' ? '#86efac' : '#fbbf24';
        drawText(ctx, N.x - 110, N.y - 14,
          `Goode: ${g.ratio.toFixed(2)}  ${verdictTxt ? `(${verdictTxt})` : ''}`,
          verdictColor, { size: 14, background: true });
      }
    }
  }
  // ----- Línea de Frankfort (Po–Or) -----
  if (visibleLines['frankfort']) {
    const po = points['Po'], or = points['Or'];
    if (po && or) {
      // Azul cielo brillante, 2 px, punteada — sobre todo el ancho de la foto
      drawExtendedLine(ctx, canvas, po, or, '#44CCFF', 2, true);
      // Etiqueta corta "Frankfort" cerca del extremo más alejado de Po
      const ends = lineCanvasIntersections(po, or, canvas);
      if (ends) {
        const farEnd = distance(ends.left, po) > distance(ends.right, po) ? ends.left : ends.right;
        const labelX = Math.max(8, Math.min(canvas.width - 110, farEnd.x - 110));
        const labelY = Math.max(20, Math.min(canvas.height - 8, farEnd.y - 10));
        drawText(ctx, labelX, labelY, 'Frankfort', '#44CCFF', { size: 13, background: true });
      }
      // Ángulo plano facial vs Frankfort
      const g = points['G'], pog = points['Pog'];
      if (g && pog) {
        const ang = frankfortFacialAngle(points);
        if (ang != null) {
          // Refuerzo visual del plano facial (G–Pog) para mostrar la medida
          drawLine(ctx, g, pog, 'rgba(68,204,255,0.7)', 2, true);
          const mid = { x: (g.x + pog.x) / 2, y: (g.y + pog.y) / 2 };
          const delta = ang - 90;
          const txt = `∠ Facial-FH: ${ang.toFixed(1)}° (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}°)`;
          const ok = Math.abs(delta) <= 5;
          drawText(ctx, mid.x + 14, mid.y, txt, ok ? '#86efac' : '#fbbf24', { size: 13, background: true });
        }
      }
    }
  }
  // ----- Relación ala–columnela: eje Ba–Bp + perpendiculares -----
  if (visibleLines['alar-columellar']) {
    const r = alarColumellarRelation(points);
    if (r) {
      // 1) Eje longitudinal de la narina (Ba–Bp) extendido un poco a ambos lados
      //    en blanco PUNTEADO.
      const axisDx = r.Bp.x - r.Ba.x, axisDy = r.Bp.y - r.Ba.y;
      const axisLen = Math.hypot(axisDx, axisDy);
      if (axisLen > 0) {
        const extend = 30; // px más allá de cada extremo
        const ux = axisDx / axisLen, uy = axisDy / axisLen;
        const axisStart = { x: r.Ba.x - ux * extend, y: r.Ba.y - uy * extend };
        const axisEnd   = { x: r.Bp.x + ux * extend, y: r.Bp.y + uy * extend };
        drawLine(ctx, axisStart, axisEnd, '#ffffff', 2, true);
        // Etiqueta del eje, cerca de Bp
        const lblPt = { x: r.Bp.x + ux * (extend + 6), y: r.Bp.y + uy * (extend + 6) };
        drawText(ctx, lblPt.x, lblPt.y, 'Eje narina', '#ffffff', { size: 11, background: true });
      }

      // 2) Perpendiculares desde A y desde Cb al eje (rosa / amarillo)
      drawLine(ctx, r.A,  r.footA,  '#FF66AA', 3, false);
      drawLine(ctx, r.Cb, r.footCb, '#FFCC00', 3, false);
      drawRightAngleMark(ctx, r.footA,  r.Ba, r.Bp, r.A,  '#FF66AA');
      drawRightAngleMark(ctx, r.footCb, r.Ba, r.Bp, r.Cb, '#FFCC00');

      // 3) Flechas de doble punta sobre cada perpendicular indicando la distancia
      drawDoubleArrow(ctx, r.A,  r.footA,  '#FF66AA', 2);
      drawDoubleArrow(ctx, r.Cb, r.footCb, '#FFCC00', 2);

      // 4) Etiquetas de distancia en mm sobre cada perpendicular
      const abMm = mmPerPx ? r.abSignedPx * mmPerPx : null;
      const cbMm = mmPerPx ? r.cbSignedPx * mmPerPx : null;
      const showMm = mmPerPx ? r.showSignedPx * mmPerPx : null;
      const abTxt = abMm != null
        ? `AB: ${abMm >= 0 ? '+' : ''}${abMm.toFixed(1)} mm`
        : `AB: ${r.abSignedPx >= 0 ? '+' : ''}${r.abSignedPx.toFixed(0)} px`;
      const cbTxt = cbMm != null
        ? `BC: ${cbMm >= 0 ? '+' : ''}${cbMm.toFixed(1)} mm`
        : `BC: ${r.cbSignedPx >= 0 ? '+' : ''}${r.cbSignedPx.toFixed(0)} px`;
      // Etiquetas de distancia AB/BC en mm — gating por LayersPanel
      if (!measuresHidden.includes('distance-labels')) {
        drawText(ctx,
          (r.A.x + r.footA.x) / 2 + 10,
          (r.A.y + r.footA.y) / 2 + 4,
          abTxt, '#FF66AA', { size: 12, background: true });
        drawText(ctx,
          (r.Cb.x + r.footCb.x) / 2 - 90,
          (r.Cb.y + r.footCb.y) / 2 + 4,
          cbTxt, '#FFCC00', { size: 12, background: true });
      }

      // 5) Etiqueta principal: show + tipo de Gunter sobre la foto
      if (!measuresHidden.includes('show-columellar')) {
        const t = classifyGunter(abMm, cbMm);
        const info = gunterInfo(t);
        const showTxt = showMm != null
          ? `${showMm >= 0 ? '+' : ''}${showMm.toFixed(1)} mm`
          : `${r.showSignedPx >= 0 ? '+' : ''}${r.showSignedPx.toFixed(0)} px (sin calib.)`;
        const labelColor = t === 'normal' ? '#86efac' : t === 'muted' ? '#e6edf6' : '#fbbf24';
        // Ubicar la etiqueta cerca del punto más a la izquierda y abajo del bracket
        const yLow = Math.max(r.A.y, r.Cb.y) + 30;
        const xLow = Math.max(8, Math.min(canvas.width - 280, Math.min(r.A.x, r.Cb.x) - 30));
        drawText(ctx, xLow, yLow,
          `Show columelar: ${showTxt}`,
          labelColor, { size: 13, background: true });
        drawText(ctx, xLow, yLow + 20,
          info.short !== '—' ? info.short : 'Sin clasificar',
          labelColor, { size: 13, background: true });
      }
    }
  }
}

function drawFrontalGuides(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  points: Partial<Record<PointId, Pt>>,
  visibleLines: Record<string, boolean>,
  mmPerPx: number | null,
  measuresHidden: string[] = [],
) {
  if (visibleLines['thirds']) {
    // Tercios faciales: tr → línea cb_d–cb_i (cejas) → sn → gn
    const tr = points['tr'], sn = points['sn'], me = points['gn'];
    const cbD = points['cb_d'], cbI = points['cb_i'];
    const browMid = browLineMid(points);
    // Horizontales azules punteadas en tr, sn, gn
    const ys = [tr?.y, sn?.y, me?.y].filter((v): v is number => v != null);
    for (const y of ys) drawHorizontal(ctx, canvas, y, '#60a5fa', true);
    // Límite T. Superior / T. Medio: línea blanca continua por las cabezas de ceja,
    // extendida de borde a borde de la imagen
    if (cbD && cbI) {
      drawExtendedLine(ctx, canvas, cbD, cbI, '#FFFFFF', 2, false);
      const labelY = Math.max(16, Math.min(cbD.y, cbI.y) - 8);
      drawText(ctx, 10, labelY, 'Límite T. Superior / T. Medio', '#FFFFFF', { size: 12, background: true });
    }
    if (tr && browMid && sn && me) {
      const xLabel = Math.max(20, Math.min(canvas.width - 80, (tr.x + me.x) / 2 - 100));
      drawText(ctx, xLabel, (tr.y + browMid.y) / 2, 'Tercio superior (tr–cejas)', '#bfdbfe', { size: 12, background: true });
      drawText(ctx, xLabel, (browMid.y + sn.y) / 2, 'Tercio medio (cejas–sn)',    '#bfdbfe', { size: 12, background: true });
      drawText(ctx, xLabel, (sn.y + me.y) / 2,      'Tercio inferior (sn–gn)',    '#bfdbfe', { size: 12, background: true });
    }
  }
  if (visibleLines['fifths']) {
    // 6 verticales: lat_d · ex_d · en_d · en_i · ex_i · lat_i — verde claro,
    // 1.5 px, punteadas, de borde a borde. Dibuja las disponibles aunque
    // falten puntos; las etiquetas de quintos requieren las 6.
    const seq = [
      points['lat_d'], points['ex_d'], points['en_d'],
      points['en_i'],  points['ex_i'], points['lat_i'],
    ];
    for (const p of seq) {
      if (p) drawVertical(ctx, canvas, p.x, '#88FF88', true, 1.5);
    }
    const f = computeFifths(points);
    if (f && !measuresHidden.includes('distance-labels')) {
      // Etiqueta de cada quinto: % (mm) — alternando altura para no solaparse
      for (let i = 0; i < 5; i++) {
        const midX = (f.xs[i] + f.xs[i + 1]) / 2;
        const pct = (f.ratios[i] * 100).toFixed(0);
        const wTxt = mmPerPx
          ? `${(f.widths[i] * mmPerPx).toFixed(1)} mm`
          : `${f.widths[i].toFixed(0)} px`;
        const y = 44 + (i % 2) * 20;
        drawText(ctx, midX - 26, y, `${pct} %`, '#88FF88', { size: 12, background: true });
        drawText(ctx, midX - 26, y + 14, wTxt, '#88FF88', { size: 10, background: true });
      }
    }
  }
  if (visibleLines['pupil-line']) {
    const pR = points['pu_d'], pL = points['pu_i'];
    if (pR && pL) drawLine(ctx, pR, pL, '#22d3ee', 1.5, true);
  }
  // Líneas de referencia horizontales (ocular, nasal, bucal) — Farkas
  if (visibleLines['ref-horizontal']) {
    const drawRef = (a?: Pt, b?: Pt, color = '#7dd3fc', label = '') => {
      if (!a || !b) return;
      drawLine(ctx, a, b, color, 2, false);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      drawText(ctx, mid.x - 30, mid.y - 8, label, color, { size: 11, background: true });
    };
    drawRef(points['ex_d'], points['ex_i'], '#fb923c', 'Ref. ocular (ex_d–ex_i)');
    drawRef(points['al_d'], points['al_i'], '#fdba74', 'Ref. nasal (al_d–al_i)');
    drawRef(points['ch_d'], points['ch_i'], '#34d399', 'Ref. bucal (ch_d–ch_i)');
  }
  // ----- Líneas medias VERTICALES (atraviesan toda la imagen) -----
  const xEye = intercanthalMidpointX(points);
  const xLip = lipMidpointX(points);
  const showIntercanthal = visibleLines['midline-intercanthal'] && xEye != null;
  const showLabial       = visibleLines['midline-labial']       && xLip != null;

  if (showIntercanthal) {
    // Línea vertical continua a lo largo de toda la foto
    drawLine(ctx, { x: xEye!, y: 0 }, { x: xEye!, y: canvas.height }, '#44CCFF', 2, false);
    drawText(ctx, xEye! + 8, 22, 'L. media intercantal', '#44CCFF', { size: 12, background: true });
  }
  if (showLabial) {
    drawLine(ctx, { x: xLip!, y: 0 }, { x: xLip!, y: canvas.height }, '#FFCC00', 2, false);
    drawText(ctx, xLip! + 8, 42, 'L. media labial', '#FFCC00', { size: 12, background: true });
  }
  if (showIntercanthal && showLabial) {
    // Desviación lateral entre ambas líneas (paciente: x absolutos)
    const devPx = Math.abs(xLip! - xEye!);
    const devMm = mmPerPx ? devPx * mmPerPx : null;
    // Conector horizontal a la altura del mentón (o 86% del canvas si no hay)
    const yCon = points.gn?.y ?? canvas.height * 0.86;
    drawLine(ctx, { x: xEye!, y: yCon }, { x: xLip!, y: yCon }, '#ffffff', 3, false);
    drawCross(ctx, { x: xEye!, y: yCon }, '#44CCFF', 9);
    drawCross(ctx, { x: xLip!, y: yCon }, '#FFCC00', 9);
    // Código de color según umbrales clínicos:
    //   verde  → < 1 mm    (alineación normal)
    //   amber  → 1 – 3 mm  (desviación leve)
    //   rojo   → > 3 mm    (desviación marcada)
    const devColor = devMm == null ? '#e6edf6'
      : devMm < 1 ? '#22c55e'
      : devMm <= 3 ? '#facc15'
      : '#ef4444';
    const valueTxt = devMm != null
      ? `${devMm.toFixed(1)} mm`
      : `${devPx.toFixed(0)} px (sin calibrar)`;
    const sideArrow = xLip! > xEye! ? ' →' : xLip! < xEye! ? ' ←' : '';
    drawText(ctx,
      (xEye! + xLip!) / 2 - 70,
      yCon + 24,
      `Desviación líneas medias: ${valueTxt}${sideArrow}`,
      devColor, { size: 13, background: true });
  }

  // Para "symmetry-marks" seguimos usando la perpendicular anatómica del eje
  // intercantal (más correcta cuando la foto está ligeramente inclinada).
  const imSym = visibleLines['symmetry-marks'] ? intercanthalMidline(points) : null;
  if (imSym) {
    const imMid = imSym.mid, imFoot = imSym.foot;
    const dirX = imFoot.x - imMid.x, dirY = imFoot.y - imMid.y;
    const pairs: Array<[PointId, PointId, string]> = [
      ['ex_d', 'ex_i', '#fb923c'], ['en_d', 'en_i', '#f87171'],
      ['pu_d', 'pu_i', '#22d3ee'], ['al_d', 'al_i', '#fdba74'],
      ['ch_d', 'ch_i', '#34d399'], ['t_d',  't_i',  '#a78bfa'],
    ];
    for (const [rId, lId, color] of pairs) {
      const r = points[rId], l = points[lId];
      if (!r || !l) continue;
      drawLine(ctx, r, projectOntoLine(r, imMid, { x: dirX, y: dirY }), color, 1, true);
      drawLine(ctx, l, projectOntoLine(l, imMid, { x: dirX, y: dirY }), color, 1, true);
    }
  }
  // Conectores horizontales auxiliares — ligados al switch de refs. horizontales
  // para que el panel de capas (y los exports PNG/PDF) los controle de verdad.
  if (visibleLines['ref-horizontal']) {
    const enR = points['en_d'], enL = points['en_i'];
    if (enR && enL) drawLine(ctx, enR, enL, '#f87171', 1.5);
  }
}

/** Distancia mínima del punto p al segmento a–b (para detectar clics sobre reglas). */
function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function projectOntoLine(p: Pt, origin: Pt, dir: Pt): Pt {
  const dx = p.x - origin.x, dy = p.y - origin.y;
  const len2 = dir.x * dir.x + dir.y * dir.y;
  if (!len2) return origin;
  const t = (dx * dir.x + dy * dir.y) / len2;
  return { x: origin.x + t * dir.x, y: origin.y + t * dir.y };
}

// ============ Overlay de ángulos solicitados desde el LayersPanel ============
// Dibuja sobre el canvas los ángulos angulares (perfil) que el usuario activa
// en la sección "Ángulos" del panel de capas. La medida en grados se obtiene
// de `angle3pt`. Sólo pinta si los 3 puntos están colocados.
const ANGLE_COLORS: Record<string, string> = {
  nasolabial:     '#fbbf24',
  nasofrontal:    '#a78bfa',
  mentolabial:    '#fb7185',
  nasomental:     '#f97316',
  nasofacial:     '#4ade80',
  cervicoment:    '#22d3ee',
  frankfortFacial: '#7dd3fc',
  frankfortTip:   '#e879f9',
};
function drawAngleOverlays(
  ctx: CanvasRenderingContext2D,
  points: Partial<Record<PointId, Pt>>,
  anglesShown: string[],
) {
  for (const m of ANGLE_MEASURES) {
    if (!anglesShown.includes(m.id)) continue;
    const [aId, vId, bId] = m.points;
    const a = points[aId], v = points[vId], b = points[bId];
    if (!a || !v || !b) continue;
    const color = ANGLE_COLORS[m.id] ?? '#fbbf24';
    drawLine(ctx, v, a, color, 2, false);
    drawLine(ctx, v, b, color, 2, false);
    drawAngleArc(ctx, a, v, b, color);
    const deg = angle3pt(a, v, b);
    drawText(ctx, v.x + 18, v.y - 14, `${m.label.replace('Ángulo ', '∠ ')}: ${deg.toFixed(1)}°`,
      color, { size: 12, background: true });
  }
  // Frankfort facial — necesita Po, Or, G, Pog
  if (anglesShown.includes('frankfortFacial')) {
    const Po = points.Po, Or = points.Or, G = points.G, Pog = points.Pog;
    if (Po && Or && G && Pog) {
      const color = ANGLE_COLORS.frankfortFacial;
      drawLine(ctx, Po, Or, color, 2, true);
      drawLine(ctx, G,  Pog, color, 2, false);
      // Etiqueta del ángulo en el punto medio del plano facial
      const mid = { x: (G.x + Pog.x) / 2, y: (G.y + Pog.y) / 2 };
      // Calcular ángulo agudo entre las dos rectas
      const fhAng = Math.atan2(Or.y - Po.y, Or.x - Po.x);
      const fpAng = Math.atan2(Pog.y - G.y, Pog.x - G.x);
      let diff = Math.abs(fpAng - fhAng) * 180 / Math.PI;
      diff = diff % 180; if (diff > 90) diff = 180 - diff;
      drawText(ctx, mid.x + 14, mid.y, `∠ Facial-FH: ${diff.toFixed(1)}°`,
        color, { size: 12, background: true });
    }
  }
  // Nasofacial — recta–recta: plano facial (G–Pog) vs dorso nasal (N–Pn)
  if (anglesShown.includes('nasofacial')) {
    const G = points.G, Pog = points.Pog, N = points.N, Pn = points.Pn;
    if (G && Pog && N && Pn) {
      const color = ANGLE_COLORS.nasofacial;
      drawLine(ctx, G, Pog, color, 2, true);   // plano facial
      drawLine(ctx, N, Pn, color, 2, false);   // dorso nasal
      const deg = nasofacialAngle(points);
      if (deg != null) {
        const mid = { x: (N.x + Pn.x) / 2, y: (N.y + Pn.y) / 2 };
        drawText(ctx, mid.x + 14, mid.y, `∠ Nasofacial: ${deg.toFixed(1)}°`,
          color, { size: 12, background: true });
      }
    }
  }
  // Rotación de punta vs Frankfort — columela (Sn–Cm) vs Frankfort HORIZONTAL
  if (anglesShown.includes('frankfortTip')) {
    const Po = points.Po, Or = points.Or, Sn = points.Sn, Cm = points.Cm;
    if (Po && Or && Sn && Cm) {
      const color = ANGLE_COLORS.frankfortTip;
      // Referencia horizontal desde Sn, paralela a Frankfort (Po→Or), en el
      // sentido de la columela para que el ángulo dibujado sea el medido.
      const fx = Or.x - Po.x, fy = Or.y - Po.y;
      const flen = Math.hypot(fx, fy) || 1;
      let hx = fx / flen, hy = fy / flen;
      if ((Cm.x - Sn.x) * hx + (Cm.y - Sn.y) * hy < 0) { hx = -hx; hy = -hy; }
      const colLen = Math.hypot(Cm.x - Sn.x, Cm.y - Sn.y) || 40;
      const hEnd = { x: Sn.x + hx * colLen, y: Sn.y + hy * colLen };
      drawLine(ctx, Po, Or, color, 2, true);       // plano de Frankfort (referencia)
      drawLine(ctx, Sn, hEnd, color, 1.5, true);   // horizontal de Frankfort desde Sn
      drawLine(ctx, Sn, Cm, color, 2, false);      // columela
      const deg = frankfortTipRotation(points);
      if (deg != null) {
        drawText(ctx, Cm.x + 12, Cm.y - 6, `Rot. punta: ${deg.toFixed(1)}°`,
          color, { size: 12, background: true });
      }
    }
  }
}

// ============ Primitivas ============
// Factor global para engrosar todas las líneas de análisis de forma uniforme,
// aunque cada llamada pase su propio grosor.
const LINE_SCALE = 1.45;
function drawLine(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, color: string, w = 3, dashed = false) {
  const lw = w * LINE_SCALE;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dashed) ctx.setLineDash([9, 6]);
  // Contorno negro fino bajo el trazo — contraste sin apagar el color
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.lineWidth = lw + 2.5;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  // Trazo de color, opaco y más grueso → color más definido y protagonista
  ctx.setLineDash(dashed ? [9, 6] : []);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.restore();
}
function drawHorizontal(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, y: number, color: string, dashed = false) {
  drawLine(ctx, { x: 0, y }, { x: canvas.width, y }, color, 2, dashed);
}
function drawVertical(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, x: number, color: string, dashed = false, w = 2) {
  drawLine(ctx, { x, y: 0 }, { x, y: canvas.height }, color, w, dashed);
}
/** Intersección de la recta (p1,p2) con los bordes del canvas.
 *  Devuelve los puntos donde la recta entra/sale del rectángulo. */
function lineCanvasIntersections(
  p1: Pt, p2: Pt, canvas: HTMLCanvasElement,
): { left: Pt; right: Pt } | null {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return null;
  // Si es casi-vertical, devolver intersecciones con bordes horizontales (top/bottom)
  if (Math.abs(dx) < 1e-6) {
    return { left: { x: p1.x, y: 0 }, right: { x: p1.x, y: canvas.height } };
  }
  const m = dy / dx;
  const yAtX = (x: number) => p1.y + m * (x - p1.x);
  return {
    left:  { x: 0,            y: yAtX(0)            },
    right: { x: canvas.width, y: yAtX(canvas.width) },
  };
}
/** Dibuja la recta que pasa por p1 y p2, extendida a los bordes del canvas. */
function drawExtendedLine(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement,
  p1: Pt, p2: Pt, color: string, w = 2, dashed = false,
) {
  const ends = lineCanvasIntersections(p1, p2, canvas);
  if (!ends) return;
  drawLine(ctx, ends.left, ends.right, color, w, dashed);
}
function drawPoint(
  ctx: CanvasRenderingContext2D, p: Pt,
  color: string, label: string, active: boolean, hover: boolean, source: 'detected' | 'user',
) {
  ctx.save();
  // Todos los radios escalan con la resolución de la imagen (_uiScale) para
  // que el disco ocupe lo mismo RELATIVO a la cara en fotos grandes y chicas.
  const s = _uiScale;
  // Halo si activo o hover (escalado proporcionalmente al nuevo tamaño)
  if (active || hover) {
    ctx.beginPath(); ctx.arc(p.x, p.y, (hover ? 22 : 18) * s, 0, Math.PI * 2);
    ctx.fillStyle = color + '44';
    ctx.fill();
  }
  // Capa 1 — anillo negro exterior (1.5 px) para contraste sobre cualquier fondo
  ctx.beginPath(); ctx.arc(p.x, p.y, 13.5 * s, 0, Math.PI * 2);
  ctx.fillStyle = '#0b1220';
  ctx.fill();
  // Capa 2 — borde BLANCO de 2 px
  ctx.beginPath(); ctx.arc(p.x, p.y, 12 * s, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  // Capa 3 — disco de color (radio 10 → 20 px visibles)
  ctx.beginPath(); ctx.arc(p.x, p.y, 10 * s, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  // Punto central blanco para puntos detectados por IA (diferenciador visual)
  if (source === 'detected') {
    ctx.beginPath(); ctx.arc(p.x, p.y, 3.5 * s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
  }
  ctx.restore();
  // Etiqueta con fondo semitransparente oscuro
  drawText(ctx, p.x + 15 * s, p.y - 12 * s, label, color, { background: true });
}
/** Pequeño cuadrado (símbolo de ángulo recto) en el pie de una perpendicular.
 *  baseA y baseB definen la línea base; perp es el punto desde donde sale la
 *  perpendicular (sólo se usa para orientación del cuadrado). */
function drawRightAngleMark(
  ctx: CanvasRenderingContext2D, foot: Pt,
  baseA: Pt, baseB: Pt, perp: Pt, color: string,
  size = 9,
) {
  // Vector unitario a lo largo de la base
  const bx = baseB.x - baseA.x, by = baseB.y - baseA.y;
  const bl = Math.hypot(bx, by); if (!bl) return;
  const ux = bx / bl, uy = by / bl;
  // Vector unitario hacia el lado del punto perp (perpendicular)
  const px = perp.x - foot.x, py = perp.y - foot.y;
  const pl = Math.hypot(px, py); if (!pl) return;
  const vx = px / pl, vy = py / pl;
  // Esquinas del cuadrado: foot, foot+u*s, foot+u*s+v*s, foot+v*s
  const p1 = { x: foot.x + ux * size,             y: foot.y + uy * size };
  const p2 = { x: foot.x + (ux + vx) * size,      y: foot.y + (uy + vy) * size };
  const p3 = { x: foot.x + vx * size,             y: foot.y + vy * size };
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
  ctx.stroke();
  ctx.restore();
}
function drawCross(ctx: CanvasRenderingContext2D, p: Pt, color: string, size = 14) {
  ctx.save();
  ctx.lineCap = 'round';
  // Outline oscuro
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(p.x - size, p.y); ctx.lineTo(p.x + size, p.y);
  ctx.moveTo(p.x, p.y - size); ctx.lineTo(p.x, p.y + size);
  ctx.stroke();
  // Color encima
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x - size, p.y); ctx.lineTo(p.x + size, p.y);
  ctx.moveTo(p.x, p.y - size); ctx.lineTo(p.x, p.y + size);
  ctx.stroke();
  ctx.restore();
}
// ============ Sistema de etiquetas (escala + anti-colisión por frame) ============
// `_labelScale` lo fija el componente al inicio de cada render: slider del
// usuario × factor de resolución de la imagen (uiScale). `_uiScale` guarda el
// factor de resolución solo, para los elementos NO textuales (discos de punto).
// `_labelBoxes` acumula las cajas ya colocadas en el frame actual para que las
// etiquetas nuevas se desplacen verticalmente y no se superpongan.
let _labelScale = 1.2;
let _uiScale = 1;
interface LabelRect { x: number; y: number; w: number; h: number; }
let _labelBoxes: LabelRect[] = [];

/** Reinicia el layout de etiquetas para un nuevo frame de render. */
function beginLabelFrame(scale: number, uiScale = 1) {
  _labelScale = scale * uiScale;
  _uiScale = uiScale;
  _labelBoxes = [];
}

/** Devuelve una `y` para la caja que no colisione con las ya colocadas,
 *  desplazándose en pasos alternos (abajo/arriba). Registra la caja elegida. */
function resolveLabelBox(bx: number, by: number, bw: number, bh: number): number {
  const STEP = 4, MAX = 36;
  const hits = (yy: number) => _labelBoxes.some((r) =>
    bx < r.x + r.w && bx + bw > r.x && yy < r.y + r.h && yy + bh > r.y);
  let chosen = by;
  if (hits(chosen)) {
    for (let i = 1; i <= MAX; i++) {
      const down = by + i * STEP;
      if (!hits(down)) { chosen = down; break; }
      const up = by - i * STEP;
      if (up >= 2 && !hits(up)) { chosen = up; break; }
    }
  }
  _labelBoxes.push({ x: bx, y: chosen, w: bw, h: bh });
  return chosen;
}

interface TextOpts { background?: boolean; bold?: boolean; size?: number; noCollide?: boolean; }
function drawText(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, text: string, color: string,
  opts: TextOpts = {},
) {
  // Tamaño base escalado por la preferencia del usuario (slider).
  const baseSize = opts.size ?? (opts.background ? 14 : 13);
  const size = Math.round(baseSize * _labelScale);
  const weight = opts.bold === false ? 600 : 800;
  ctx.save();
  ctx.font = `${weight} ${size}px -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  let dy = 0;   // desplazamiento vertical aplicado por anti-colisión
  if (opts.background) {
    const padX = 7, padY = 4;
    const m = ctx.measureText(text);
    const bx = x - padX;
    const byWanted = y - size + 1 - padY + 2;
    const bw = m.width + padX * 2;
    const bh = size + padY * 2 + 2;
    const r = 5;
    // Reubicar verticalmente si choca con otra etiqueta del frame
    const by = opts.noCollide === true ? byWanted : resolveLabelBox(bx, byWanted, bw, bh);
    dy = by - byWanted;
    // Sombra suave para despegar la caja de la foto
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1.5;
    // Caja en el navy de la app, translúcida (≈40 %): cohesiva con la interfaz
    // pero sin oscurecer/velar la foto.
    ctx.fillStyle = 'rgba(11,18,32,0.40)';
    roundRectPath(ctx, bx, by, bw, bh, r);
    ctx.fill();
    ctx.restore();
    // Borde FINO del color del dato — asocia la etiqueta con su línea/medida
    // sin recargar de color (el texto ya va en el mismo tono).
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    roundRectPath(ctx, bx, by, bw, bh, r);
    ctx.stroke();
  }
  const ty = y + dy;
  // Outline negro grueso (legible aun con fondo translúcido)
  ctx.lineWidth = opts.background ? 3.5 : 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.92)';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeText(text, x, ty);
  // Fill en color
  ctx.fillStyle = color;
  ctx.fillText(text, x, ty);
  ctx.restore();
}
/** Traza (sin pintar) un rectángulo de esquinas redondeadas, con fallback
 *  si el navegador no soporta CanvasRenderingContext2D.roundRect. */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof (ctx as any).roundRect === 'function') {
    (ctx as any).roundRect(x, y, w, h, r);
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y,     x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x,     y + h, rr);
  ctx.arcTo(x,     y + h, x,     y,     rr);
  ctx.arcTo(x,     y,     x + w, y,     rr);
  ctx.closePath();
}
function drawLineLabel(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, label: string, color: string) {
  drawText(ctx, (a.x + b.x) / 2 + 6, (a.y + b.y) / 2 - 6, label, color, { background: true, size: 12 });
}
function drawMidLabel(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, label: string, color: string) {
  drawText(ctx, (a.x + b.x) / 2 + 6, (a.y + b.y) / 2 + 14, label, color, { background: true, size: 12 });
}
// ============ Overlay simulación rinoplastia (split before/after) ============
// Renderiza la silueta ORIGINAL solo en la mitad izquierda del divisor y la
// SIMULADA solo en la mitad derecha — usa canvas clipping para confinar cada
// dibujo a su zona.
/** Endereza el tramo del contorno entre dos puntos que YA están sobre él
 *  (p. ej. el plano submentoniano Me→C): sustituye el tramo por la polilínea
 *  recta a→(waypoints ◇ ordenados)→b. Los índices se buscan por distancia
 *  euclídea (la Y del contorno no es monótona). */
function straightenBetween(contour: Pt[], a: Pt, b: Pt, waypoints: Pt[]): Pt[] {
  const idxOf = (p: Pt): number => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < contour.length; i++) {
      const d = (contour[i].x - p.x) ** 2 + (contour[i].y - p.y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  const stops = [a, ...waypoints, b]
    .map((p) => ({ p, i: idxOf(p) }))
    .sort((s, t) => s.i - t.i);
  const first = stops[0], last = stops[stops.length - 1];
  if (last.i - first.i < 2) return contour;
  const out = contour.slice();
  for (let k = 0; k < stops.length - 1; k++) {
    const s0 = stops[k], s1 = stops[k + 1];
    for (let i = s0.i; i <= s1.i; i++) {
      const t = s1.i === s0.i ? 0 : (i - s0.i) / (s1.i - s0.i);
      out[i] = { x: s0.p.x + (s1.p.x - s0.p.x) * t, y: s0.p.y + (s1.p.y - s0.p.y) * t };
    }
  }
  return out;
}

/** Extrae el tramo del contorno entre dos alturas. Se recorre entero: la Y ya
 *  no es estrictamente creciente (los saltos horizontales ahora siguen la
 *  frontera real de la máscara, que baja y sube en los huecos). */
function sliceContourByY(contour: Pt[], y1: number, y2: number): Pt[] | null {
  const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
  const out: Pt[] = [];
  for (const p of contour) {
    if (p.y >= lo && p.y <= hi) out.push(p);
  }
  return out.length > 1 ? out : null;
}

/** Dibuja la región nasal DEFORMADA según el campo de warp, recortada al lado
 *  derecho del divisor (lado SIMULACIÓN). Malla de triángulos: cada celda de
 *  la rejilla se mapea con una transformación afín de su posición original a
 *  la desplazada — la foto se deforma de verdad, sin salir del navegador. */
// Caché del canvas de recorte de drawWarpedNoseMesh: crear + pintar un canvas
// nuevo POR FRAME era parte del lag en iPad. Se reutiliza mientras la imagen y
// el rect cuantizado (a 64 px, para que el jitter del bbox durante un arrastre
// no invalide la caché) no cambien.
let _meshCrop: HTMLCanvasElement | null = null;
let _meshCropImage: ImageLike | null = null;
let _meshCropKey = '';

function drawWarpedNoseMesh(
  ctx: CanvasRenderingContext2D,
  image: ImageLike,
  field: NoseWarpField,
  clipX0: number,
  W: number, H: number,
  fast = false,
) {
  const x0 = Math.max(0, field.bbox.x0), y0 = Math.max(0, field.bbox.y0);
  const x1 = Math.min(W, field.bbox.x1), y1 = Math.min(H, field.bbox.y1);
  if (x1 - x0 < 4 || y1 - y0 < 4 || clipX0 >= x1) return;

  // Recorte de la región nasal a un canvas pequeño: mapear cada triángulo
  // desde la imagen completa (24MP en fotos de cámara) tarda segundos; desde
  // el recorte es instantáneo. El recorte se CUANTIZA a 64 px y se cachea.
  const Q = 64;
  const qx0 = Math.max(0, Math.floor(x0 / Q) * Q);
  const qy0 = Math.max(0, Math.floor(y0 / Q) * Q);
  const qx1 = Math.min(W, Math.ceil(x1 / Q) * Q);
  const qy1 = Math.min(H, Math.ceil(y1 / Q) * Q);
  const cw = Math.ceil(qx1 - qx0), chh = Math.ceil(qy1 - qy0);
  const cropKey = `${qx0}|${qy0}|${cw}|${chh}`;
  if (!_meshCrop) _meshCrop = document.createElement('canvas');
  if (_meshCropImage !== image || _meshCropKey !== cropKey) {
    _meshCrop.width = cw; _meshCrop.height = chh;
    const cctx = _meshCrop.getContext('2d');
    if (!cctx) return;
    cctx.drawImage(image, qx0, qy0, cw, chh, 0, 0, cw, chh);
    _meshCropImage = image;
    _meshCropKey = cropKey;
  }
  const crop = _meshCrop;
  const offX = x0 - qx0, offY = y0 - qy0;   // origen del bbox dentro del recorte

  // Rejilla ADAPTATIVA: 26 celdas/eje en reposo (el campo v2 es exacto en el
  // borde); 13 durante un arrastre activo (¼ de triángulos → fluidez en iPad;
  // al soltar se redibuja a calidad completa).
  const G = fast ? 13 : 26;
  const nx = G + 1;
  const sx = (x1 - x0) / G, sy = (y1 - y0) / G;
  const vx = new Float32Array(nx * nx), vy = new Float32Array(nx * nx);
  for (let j = 0; j <= G; j++) {
    for (let i = 0; i <= G; i++) {
      const X = x0 + i * sx, Y = y0 + j * sy;
      const d = evalWarpAt(field, X, Y);
      vx[j * nx + i] = X + d.x;
      vy[j * nx + i] = Y + d.y;
    }
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(Math.max(clipX0, x0), y0, x1 - Math.max(clipX0, x0), y1 - y0);
  ctx.clip();
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      // Coordenadas fuente RELATIVAS al recorte
      const X = offX + i * sx, Y = offY + j * sy;
      const s00 = { x: X, y: Y },           s10 = { x: X + sx, y: Y };
      const s11 = { x: X + sx, y: Y + sy }, s01 = { x: X, y: Y + sy };
      const k = j * nx + i;
      const d00 = { x: vx[k], y: vy[k] },               d10 = { x: vx[k + 1], y: vy[k + 1] };
      const d11 = { x: vx[k + nx + 1], y: vy[k + nx + 1] }, d01 = { x: vx[k + nx], y: vy[k + nx] };
      drawWarpTriangle(ctx, crop, s00, s10, s11, d00, d10, d11);
      drawWarpTriangle(ctx, crop, s00, s11, s01, d00, d11, d01);
    }
  }
  ctx.restore();
}

/** Pinta un triángulo de la imagen origen (s0-s1-s2) en destino (d0-d1-d2)
 *  con la afín que los relaciona. El clip se expande ~0.5px para no dejar
 *  costuras visibles entre triángulos vecinos. */
function drawWarpTriangle(
  ctx: CanvasRenderingContext2D, image: ImageLike,
  s0: Pt, s1: Pt, s2: Pt, d0: Pt, d1: Pt, d2: Pt,
) {
  const u1x = s1.x - s0.x, u1y = s1.y - s0.y;
  const u2x = s2.x - s0.x, u2y = s2.y - s0.y;
  const den = u1x * u2y - u2x * u1y;
  if (Math.abs(den) < 1e-6) return;
  const v1x = d1.x - d0.x, v1y = d1.y - d0.y;
  const v2x = d2.x - d0.x, v2y = d2.y - d0.y;
  const a = (v1x * u2y - v2x * u1y) / den;
  const c = (v2x * u1x - v1x * u2x) / den;
  const b = (v1y * u2y - v2y * u1y) / den;
  const d = (v2y * u1x - v1y * u2x) / den;
  const e = d0.x - a * s0.x - c * s0.y;
  const f = d0.y - b * s0.x - d * s0.y;

  const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
  const grow = (p: Pt): Pt => {
    const gx = p.x - cx, gy = p.y - cy;
    const l = Math.hypot(gx, gy) || 1;
    return { x: p.x + (gx / l) * 0.5, y: p.y + (gy / l) * 0.5 };
  };
  const g0 = grow(d0), g1 = grow(d1), g2 = grow(d2);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(g0.x, g0.y);
  ctx.lineTo(g1.x, g1.y);
  ctx.lineTo(g2.x, g2.y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

function drawRhinoplastySplit(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  orig: NasalSilhouette,
  sim: NasalSilhouette,
  dividerX: number,
  showOriginal: boolean,
  denseOrig?: Pt[] | null,
  denseSim?: Pt[] | null,
  splitView = true,
  showSimLine = true,
) {
  const origPts: Pt[] = [orig.N, ...orig.dorsal, orig.Pn, orig.Cm, orig.Sn];
  const simPts:  Pt[] = [sim.N,  ...sim.dorsal,  sim.Pn,  sim.Cm,  sim.Sn];

  // Trazo: si hay contorno real denso, se dibuja tal cual (polilínea fiel);
  // si no, fallback a la spline suave por los puntos de control.
  const strokePath = (dense: Pt[] | null | undefined, sparse: Pt[]) => {
    ctx.beginPath();
    if (dense && dense.length > 1) {
      ctx.moveTo(dense[0].x, dense[0].y);
      for (let i = 1; i < dense.length; i++) ctx.lineTo(dense[i].x, dense[i].y);
    } else {
      drawSmoothCurveOpen(ctx, sparse);
    }
    ctx.stroke();
  };

  // ===== SIN vista dividida: foto completa proyectada. Se dibuja la silueta
  // simulada (verde) a todo el ancho y, si el usuario lo pidió, la ORIGINAL
  // como línea TENUE punteada de referencia (antes vs después superpuestos). =====
  if (!splitView) {
    if (showOriginal) {
      ctx.save();
      ctx.setLineDash([7, 6]);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      strokePath(denseOrig, origPts);
      ctx.restore();
    }
    if (showSimLine) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 5;
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      strokePath(denseSim, simPts);
      for (const p of simPts) {
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#0b1220'; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#86efac'; ctx.fill();
      }
      ctx.restore();
      drawText(ctx, canvas.width - 130, 26, 'PROYECCIÓN', '#86efac', { size: 13, background: true });
    }
    if (showOriginal) {
      drawText(ctx, 14, 26, 'Original (tenue)', 'rgba(255,255,255,0.9)', { size: 12, background: true });
    }
    return;
  }

  // --- Mitad IZQUIERDA: silueta ORIGINAL (contorno real si existe) ---
  if (showOriginal && dividerX > 1) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, dividerX, canvas.height);
    ctx.clip();
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 5;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    strokePath(denseOrig, origPts);
    // Marcadores
    for (const p of origPts) {
      ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#0b1220'; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
    }
    ctx.restore();
  }

  // --- Mitad DERECHA: silueta SIMULADA (contorno real deformado si existe) ---
  if (showSimLine && dividerX < canvas.width - 1) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(dividerX, 0, canvas.width - dividerX, canvas.height);
    ctx.clip();
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 5;
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    strokePath(denseSim, simPts);
    for (const p of simPts) {
      ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#0b1220'; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#86efac'; ctx.fill();
    }
    ctx.restore();
  }

  // --- Etiquetas ORIGINAL / SIMULACIÓN en las esquinas superiores ---
  if (showOriginal && dividerX > 80) {
    drawText(ctx, 14, 26, 'ORIGINAL', 'rgba(255,255,255,0.95)', { size: 13, background: true });
  }
  if (showSimLine && dividerX < canvas.width - 110) {
    drawText(ctx, canvas.width - 130, 26, 'SIMULACIÓN', '#86efac', { size: 13, background: true });
  }
}

/** Deformador libre de la simulación: anillo en el origen, flecha al destino
 *  con empuñadura arrastrable. Ámbar para distinguirlo de anclas ◇ (teal) y
 *  puntos (amarillo/azul). `influenceR` (px de imagen): dibuja además el
 *  círculo punteado del área de influencia (solo en modo edición). */
function drawRhinoHandle(ctx: CanvasRenderingContext2D, h: RhinoHandle, influenceR?: number | null) {
  const color = '#f59e0b';
  ctx.save();
  if (influenceR != null && influenceR > 0) {
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(245,158,11,0.55)';
    ctx.beginPath(); ctx.arc(h.from.x, h.from.y, influenceR, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  // halo oscuro de la línea
  ctx.beginPath(); ctx.moveTo(h.from.x, h.from.y); ctx.lineTo(h.to.x, h.to.y); ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = color;
  ctx.beginPath(); ctx.moveTo(h.from.x, h.from.y); ctx.lineTo(h.to.x, h.to.y); ctx.stroke();
  // origen: anillo hueco
  ctx.fillStyle = '#0b1220';
  ctx.beginPath(); ctx.arc(h.from.x, h.from.y, 6, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = color;
  ctx.beginPath(); ctx.arc(h.from.x, h.from.y, 6, 0, Math.PI * 2); ctx.stroke();
  // destino: empuñadura sólida + punta de flecha
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(h.to.x, h.to.y, 8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#0b1220'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(h.to.x, h.to.y, 8, 0, Math.PI * 2); ctx.stroke();
  const len = Math.hypot(h.to.x - h.from.x, h.to.y - h.from.y);
  if (len > 14) {
    const ang = Math.atan2(h.to.y - h.from.y, h.to.x - h.from.x);
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(h.to.x - Math.cos(ang) * 8, h.to.y - Math.sin(ang) * 8);
      ctx.lineTo(
        h.to.x - Math.cos(ang + s * 0.5) * 20,
        h.to.y - Math.sin(ang + s * 0.5) * 20,
      );
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Línea vertical divisora con handle central para drag. */
function drawBeforeAfterDivider(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  x: number,
) {
  const h = canvas.height;
  // Línea vertical con sombra suave
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, h);
  ctx.stroke();
  ctx.restore();

  // Handle central (pill con flechas izq/der)
  const cy = h / 2;
  const W = 26, H = 44;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  // roundRect (con fallback)
  const r = 8;
  ctx.moveTo(x - W/2 + r, cy - H/2);
  ctx.lineTo(x + W/2 - r, cy - H/2);
  ctx.quadraticCurveTo(x + W/2, cy - H/2, x + W/2, cy - H/2 + r);
  ctx.lineTo(x + W/2, cy + H/2 - r);
  ctx.quadraticCurveTo(x + W/2, cy + H/2, x + W/2 - r, cy + H/2);
  ctx.lineTo(x - W/2 + r, cy + H/2);
  ctx.quadraticCurveTo(x - W/2, cy + H/2, x - W/2, cy + H/2 - r);
  ctx.lineTo(x - W/2, cy - H/2 + r);
  ctx.quadraticCurveTo(x - W/2, cy - H/2, x - W/2 + r, cy - H/2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Flechas dentro del handle
  ctx.save();
  ctx.strokeStyle = '#0b1220';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  // <
  ctx.moveTo(x - 4, cy - 5);
  ctx.lineTo(x - 8, cy);
  ctx.lineTo(x - 4, cy + 5);
  // >
  ctx.moveTo(x + 4, cy - 5);
  ctx.lineTo(x + 8, cy);
  ctx.lineTo(x + 4, cy + 5);
  ctx.stroke();
  ctx.restore();
}

function drawSmoothCurveOpen(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i + 2 < pts.length ? pts[i + 2] : p2;
    const cp1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const cp2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p2.x, p2.y);
  }
}

/** Flecha de DOBLE punta entre `a` y `b` (para medidas tipo "X mm de A a B"). */
function drawDoubleArrow(
  ctx: CanvasRenderingContext2D, a: Pt, b: Pt, color: string, w = 2,
) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Contorno negro para visibilidad sobre cualquier fondo
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = w + 3;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  // Trazo principal
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  // Cabezas de flecha en ambos extremos
  const ah = 8; // longitud cabeza
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const drawHead = (tip: Pt, theta: number) => {
    const p1 = { x: tip.x - ah * Math.cos(theta - 0.5), y: tip.y - ah * Math.sin(theta - 0.5) };
    const p2 = { x: tip.x - ah * Math.cos(theta + 0.5), y: tip.y - ah * Math.sin(theta + 0.5) };
    // Contorno negro
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y); ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y); ctx.closePath();
    ctx.stroke();
    // Relleno
    ctx.fillStyle = color;
    ctx.fill();
  };
  drawHead(b, ang);
  drawHead(a, ang + Math.PI);
  ctx.restore();
}

function drawDispArrow(ctx: CanvasRenderingContext2D, from: Pt, to: Pt, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.setLineDash([]);
  // punta de flecha
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const ah = 6;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - ah * Math.cos(ang - 0.5), to.y - ah * Math.sin(ang - 0.5));
  ctx.lineTo(to.x - ah * Math.cos(ang + 0.5), to.y - ah * Math.sin(ang + 0.5));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawAngleArc(ctx: CanvasRenderingContext2D, a: Pt, v: Pt, b: Pt, color: string) {
  const r = 30;
  const ang1 = Math.atan2(a.y - v.y, a.x - v.x);
  const ang2 = Math.atan2(b.y - v.y, b.x - v.x);
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  let delta = ang2 - ang1;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  ctx.beginPath(); ctx.arc(v.x, v.y, r, ang1, ang1 + delta, delta < 0); ctx.stroke();
  ctx.restore();
}
