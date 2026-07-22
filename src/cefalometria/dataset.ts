// Gestión del dataset de anotaciones para entrenar el modelo propio.
//
// Almacenamiento:
//   - localStorage: SOLO coordenadas + metadatos (ligero, ~1-3 KB por caso).
//   - Las fotos (JPG) NO se guardan en localStorage. Se descargan al PC del
//     usuario en el momento de guardar cada caso → caso_001.jpg, caso_002.jpg…
//   - Junto con cada JPG se descarga caso_001.json con sus coordenadas.
//
// Exportación: "Exportar dataset" descarga un ZIP con TODOS los metadatos
// agregados (annotations.json + coco_keypoints.json + keypoints.csv + README +
// una copia individual de cada caso_NNN.json). Las imágenes ya están en el
// PC del usuario; el README explica cómo combinarlas con el ZIP.

import type { Mode, PointId } from './cephalometry';
import { CEPH_POINTS } from './cephalometry';

const STORAGE_KEY = 'rhinoplan_dataset_v1';
const COUNTER_KEY = 'rhinoplan_dataset_counter_v1';
export const SCHEMA_VERSION = '2.0';

export interface DatasetPoint {
  id: PointId;
  name: string;
  x: number;       // coords del canvas final (post-rotación/crop)
  y: number;
}

export interface DatasetCase {
  id: string;            // 'caso_001', 'caso_002', …  (también filename base)
  number: number;        // 1, 2, …  (correlativo persistente)
  filename: string;      // 'caso_001.jpg'
  timestamp: number;     // unix ms
  mode: Mode;            // 'perfil' | 'frente'
  imageWidth: number;
  imageHeight: number;
  points: DatasetPoint[];
  detectorSeed?: string; // qué modelo dio el seed (mediapipe | faceapi | manual)
  notes?: string;
}

export interface Dataset {
  version: string;
  cases: DatasetCase[];
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

// ============ Migración de formato antiguo ============

function migrate(parsed: any): Dataset {
  const rawCases: any[] = Array.isArray(parsed?.cases) ? parsed.cases : [];
  const cases: DatasetCase[] = rawCases.map((c, i) => {
    const num = typeof c.number === 'number' ? c.number : i + 1;
    const id = typeof c.id === 'string' && c.id.startsWith('caso_')
      ? c.id
      : `caso_${pad3(num)}`;
    return {
      id,
      number: num,
      filename: `${id}.jpg`,
      timestamp: typeof c.timestamp === 'number' ? c.timestamp : Date.now(),
      mode: c.mode === 'frente' ? 'frente' : 'perfil',
      imageWidth: typeof c.imageWidth === 'number' ? c.imageWidth : 0,
      imageHeight: typeof c.imageHeight === 'number' ? c.imageHeight : 0,
      points: Array.isArray(c.points) ? c.points : [],
      detectorSeed: c.detectorSeed,
      notes: c.notes,
      // imageDataUrl del formato v1 se descarta — ya no se guarda en localStorage.
    };
  });
  return { version: SCHEMA_VERSION, cases };
}

// ============ CRUD localStorage ============

export function loadDataset(): Dataset {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: SCHEMA_VERSION, cases: [] };
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch {
    return { version: SCHEMA_VERSION, cases: [] };
  }
}

export function saveDataset(ds: Dataset): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ds));
    return true;
  } catch {
    return false;
  }
}

function nextCaseNumber(ds: Dataset): number {
  const stored = parseInt(localStorage.getItem(COUNTER_KEY) || '0', 10) || 0;
  const fromDataset = ds.cases.reduce((m, c) => Math.max(m, c.number || 0), 0);
  const next = Math.max(stored, fromDataset) + 1;
  localStorage.setItem(COUNTER_KEY, String(next));
  return next;
}

export function deleteCase(id: string): Dataset {
  const ds = loadDataset();
  ds.cases = ds.cases.filter((c) => c.id !== id);
  saveDataset(ds);
  return ds;
}

export function clearDataset(): Dataset {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(COUNTER_KEY);
  return { version: SCHEMA_VERSION, cases: [] };
}

export function estimateSizeBytes(ds: Dataset): number {
  try { return new Blob([JSON.stringify(ds)]).size; }
  catch { return 0; }
}

// ============ Guardar caso (metadatos) + descargas al PC ============

interface SaveResult {
  ok: boolean;
  ds: Dataset;
  case?: DatasetCase;
  error?: string;
}

/**
 * Guarda un caso nuevo:
 *  1) Asigna número correlativo + filename caso_NNN.jpg
 *  2) Persiste SOLO metadatos en localStorage (sin la imagen)
 *  3) Descarga el JPG y el JSON al PC del usuario
 *
 * Si falla la escritura en localStorage (quota), igual se descargan los
 * archivos para que el usuario no pierda el trabajo.
 */
export async function saveCaseAndDownload(args: {
  mode: Mode;
  canvas: HTMLCanvasElement;
  /** Imagen LIMPIA (sin overlays) para el JPG de entrenamiento. Si falta, se
   *  cae al canvas (con marcas) — solo por compatibilidad. */
  image?: HTMLImageElement | HTMLCanvasElement | null;
  points: Partial<Record<PointId, { x: number; y: number }>>;
  detectorSeed?: string;
  notes?: string;
  jpegQuality?: number; // 0..1, default 0.92
}): Promise<SaveResult> {
  const { mode, canvas, image, points, detectorSeed, notes, jpegQuality = 0.92 } = args;

  let ds = loadDataset();
  const number = nextCaseNumber(ds);
  const id = `caso_${pad3(number)}`;
  const filename = `${id}.jpg`;

  const pointsList: DatasetPoint[] = [];
  for (const def of CEPH_POINTS.filter((p) => p.mode === mode)) {
    const p = points[def.id];
    if (!p) continue;
    pointsList.push({ id: def.id, name: def.name, x: p.x, y: p.y });
  }

  const newCase: DatasetCase = {
    id, number, filename,
    timestamp: Date.now(),
    mode,
    imageWidth: canvas.width,
    imageHeight: canvas.height,
    points: pointsList,
    detectorSeed,
    notes,
  };

  // Render JPEG de la imagen LIMPIA (sin puntos/líneas dibujados). Crucial para
  // entrenar: si el JPG llevara los overlays, el modelo aprendería a detectar los
  // círculos en vez de la anatomía. Dibujamos la imagen base en un canvas
  // temporal del mismo tamaño que el canvas anotado (las coords coinciden).
  let jpegBlob: Blob | null;
  try {
    let toEncode: HTMLCanvasElement = canvas;
    if (image) {
      const clean = document.createElement('canvas');
      clean.width = canvas.width;
      clean.height = canvas.height;
      const cctx = clean.getContext('2d');
      if (cctx) {
        cctx.drawImage(image, 0, 0, clean.width, clean.height);
        toEncode = clean;
      }
    }
    jpegBlob = await canvasToJpegBlob(toEncode, jpegQuality);
  } catch (e: any) {
    return { ok: false, ds, error: `Error generando JPG: ${e?.message ?? e}` };
  }
  if (!jpegBlob) {
    return { ok: false, ds, error: 'No se pudo generar el JPG limpio' };
  }

  // Persistir metadatos (sin imagen)
  ds.cases.push(newCase);
  const persisted = saveDataset(ds);

  // Descargar siempre los archivos (incluso si localStorage falló)
  const jsonBlob = new Blob(
    [JSON.stringify(buildPerCaseJson(newCase), null, 2)],
    { type: 'application/json' },
  );
  downloadBlob(jpegBlob, filename);
  // Pequeño delay para que el navegador no agrupe/bloquee la segunda descarga
  await wait(150);
  downloadBlob(jsonBlob, `${id}.json`);

  if (!persisted) {
    // Revertir el push para que el estado in-memory coincida con localStorage
    ds.cases.pop();
    return {
      ok: false,
      ds: loadDataset(),
      case: newCase,
      error: 'Los archivos se descargaron, pero el índice no se pudo actualizar en localStorage.',
    };
  }

  return { ok: true, ds, case: newCase };
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
  });
}

function buildPerCaseJson(c: DatasetCase) {
  return {
    schema: 'rhinoplan-perfilometria/case',
    version: SCHEMA_VERSION,
    id: c.id,
    number: c.number,
    filename: c.filename,
    timestamp: c.timestamp,
    iso: new Date(c.timestamp).toISOString(),
    mode: c.mode,
    width: c.imageWidth,
    height: c.imageHeight,
    detectorSeed: c.detectorSeed,
    notes: c.notes,
    points: c.points,
  };
}

// ============ Export ZIP (solo metadatos, sin imágenes) ============

const README_CONTENT = `# RhinoPlan Perfilometría — Dataset exportado

Este ZIP contiene los **metadatos** del dataset de anotaciones manuales generado
con RhinoPlan Perfilometría. Las **imágenes JPG no están dentro del ZIP**: cada
foto se descargó por separado a tu PC en el momento de guardar el caso
(\`caso_001.jpg\`, \`caso_002.jpg\`, …).

## Estructura del ZIP

- \`annotations.json\`     — Formato propio (legible) con todos los casos.
- \`coco_keypoints.json\`  — Formato COCO Keypoints (importable en Roboflow,
                            FiftyOne, MMPose, etc.).
- \`keypoints.csv\`        — CSV plano (una fila por punto).
- \`cases/caso_NNN.json\`  — Una copia individual del JSON de cada caso
                            (mismo contenido que el JSON descargado junto al
                            JPG en su momento).
- \`README.md\`            — Este archivo.

## Cómo combinar imágenes + metadatos

1. Crea una carpeta \`dataset/\`.
2. Crea \`dataset/images/\` y mueve ahí todos los \`caso_NNN.jpg\` que tienes
   en tu PC (típicamente en la carpeta de Descargas).
3. Descomprime este ZIP dentro de \`dataset/\`.

Estructura final:
\`\`\`
dataset/
├── images/
│   ├── caso_001.jpg
│   ├── caso_002.jpg
│   └── …
├── cases/
│   ├── caso_001.json
│   └── …
├── annotations.json
├── coco_keypoints.json
├── keypoints.csv
└── README.md
\`\`\`

## Importar en Roboflow

1. En Roboflow: New Project → Type: **Keypoint Detection**.
2. Define las clases que aparecen en \`coco_keypoints.json\`
   (categorías "face_profile" y "face_frontal").
3. Upload → arrastra el contenido de \`images/\` + el archivo
   \`coco_keypoints.json\`.
4. Roboflow detecta el formato COCO y mapea los keypoints automáticamente.

## Formatos de keypoints

- **perfil**: 12 puntos blandos (Tr, G, N, Pn, Cm, Sn, Ls, Li, Sl, Pog, Me, C)
- **frente**: 21 puntos (incluye pupilas, comisuras, alas nasales, etc.)

Cada keypoint tiene visibilidad: 2 = visible y anotado, 0 = no anotado.
`;

export async function exportDatasetZip(ds: Dataset): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  // 1) annotations.json — formato propio agregado
  zip.file('annotations.json', JSON.stringify({
    version: ds.version,
    generator: 'RhinoPlan Perfilometría',
    exported: new Date().toISOString(),
    note: 'Las imágenes JPG no están en este ZIP. Se descargaron individualmente al guardar cada caso.',
    cases: ds.cases.map((c) => ({
      id: c.id,
      number: c.number,
      filename: c.filename,
      timestamp: c.timestamp,
      mode: c.mode,
      width: c.imageWidth,
      height: c.imageHeight,
      detectorSeed: c.detectorSeed,
      notes: c.notes,
      points: c.points,
    })),
  }, null, 2));

  // 2) coco_keypoints.json (compatible con Roboflow)
  zip.file('coco_keypoints.json', JSON.stringify(buildCocoKeypoints(ds), null, 2));

  // 3) CSV plano
  zip.file('keypoints.csv', buildCsv(ds));

  // 4) Una copia individual de cada caso (cases/caso_NNN.json)
  const casesFolder = zip.folder('cases')!;
  for (const c of ds.cases) {
    casesFolder.file(`${c.id}.json`, JSON.stringify(buildPerCaseJson(c), null, 2));
  }

  // 5) README
  zip.file('README.md', README_CONTENT);

  return zip.generateAsync({ type: 'blob' });
}

function buildCocoKeypoints(ds: Dataset) {
  const perfilPoints = CEPH_POINTS.filter((p) => p.mode === 'perfil').map((p) => p.id);
  const frentePoints = CEPH_POINTS.filter((p) => p.mode === 'frente').map((p) => p.id);

  const categories = [
    { id: 1, name: 'face_profile', supercategory: 'face', keypoints: perfilPoints, skeleton: [] },
    { id: 2, name: 'face_frontal', supercategory: 'face', keypoints: frentePoints, skeleton: [] },
  ];

  const images: any[] = [];
  const annotations: any[] = [];
  let imgId = 1, annId = 1;

  for (const c of ds.cases) {
    images.push({
      id: imgId,
      file_name: c.filename,
      width: c.imageWidth,
      height: c.imageHeight,
    });

    const cat = c.mode === 'perfil' ? 1 : 2;
    const keypointNames = cat === 1 ? perfilPoints : frentePoints;
    const flat: number[] = [];
    let numKp = 0;
    const placed = new Map(c.points.map((p) => [p.id, p]));
    for (const id of keypointNames) {
      const p = placed.get(id);
      if (p) { flat.push(p.x, p.y, 2); numKp++; }
      else   { flat.push(0, 0, 0); }
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of c.points) {
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
    }
    const bbox = numKp > 0
      ? [Math.round(minX), Math.round(minY), Math.round(maxX - minX), Math.round(maxY - minY)]
      : [0, 0, c.imageWidth, c.imageHeight];

    annotations.push({
      id: annId++,
      image_id: imgId,
      category_id: cat,
      keypoints: flat,
      num_keypoints: numKp,
      bbox,
      area: bbox[2] * bbox[3],
      iscrowd: 0,
    });

    imgId++;
  }

  return {
    info: {
      description: 'RhinoPlan Perfilometría dataset',
      version: SCHEMA_VERSION,
      year: new Date().getFullYear(),
      date_created: new Date().toISOString(),
    },
    licenses: [],
    images,
    annotations,
    categories,
  };
}

function buildCsv(ds: Dataset): string {
  const lines: string[] = ['filename,width,height,mode,point_id,point_name,x,y'];
  for (const c of ds.cases) {
    for (const p of c.points) {
      lines.push([
        c.filename,
        c.imageWidth,
        c.imageHeight,
        c.mode,
        p.id,
        `"${p.name.replace(/"/g, '""')}"`,
        p.x.toFixed(2),
        p.y.toFixed(2),
      ].join(','));
    }
  }
  return lines.join('\n');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
