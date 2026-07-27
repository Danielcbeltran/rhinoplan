// ============================================================================
// i18n.ts — Traducción del módulo de cefalometría.
// ----------------------------------------------------------------------------
// El módulo nació solo en español, con el texto incrustado en el código. Este
// archivo centraliza las cadenas y permite cambiar de idioma.
//
// Estrategia (para el curso internacional): se traduce POR CAPAS. Primero la
// interfaz visible (esta primera tanda), la nomenclatura clínica después. Cada
// clave que aún no esté traducida cae automáticamente al español, así el módulo
// nunca muestra una clave cruda ni texto vacío mientras la traducción avanza.
//
// Uso en un componente:
//   import { useT } from '../i18n';
//   const t = useT();
//   <button>{t('undo')}</button>
// ============================================================================

import { createContext, useContext } from 'react';

export type Lang = 'es' | 'en' | 'fr' | 'pt' | 'de' | 'it' | 'tr';

// Diccionario base (español) = fuente de verdad de las claves.
// Cualquier idioma que no tenga una clave hereda el español.
const ES: Record<string, string> = {
  // — Barra de herramientas / capas —
  layersTitle: 'Capas de análisis',
  clearMarks: 'Borrar todas las marcas',
  clearMarksTitle: 'Borrar todas las marcas',
  magnifier: 'Lupa',
  magnifierTitle: 'Muestra una lupa magnificada x4 sobre el cursor para colocar puntos con precisión píxel',
  edgeSnap: 'Ajuste al borde',
  edgeSnapTitle: 'Al colocar un punto, snap al borde más fuerte cercano (8 px)',
  guides: 'Guías',
  guidesTitle: 'Marcas tenues con posiciones canónicas como referencia',
  labelSize: 'Tamaño de etiqueta',
  labelSizeTitle: 'Ajusta el tamaño del texto de las etiquetas dibujadas sobre la foto',

  // — Grupos de capas (perfil) —
  'p-frente': 'Frente',
  'p-nariz': 'Nariz',
  'p-boca': 'Boca y mentolabial',
  'p-menton': 'Mentón y cuello',
  'p-referencia': 'Plano de Frankfort',
  // — Grupos de capas (frontal) —
  'fr-midline': 'Línea media (Farkas)',
  'fr-eyes': 'Ojos (pares)',
  'fr-nose': 'Nariz (pares)',
  'fr-mouth': 'Boca (pares)',
  'fr-ears': 'Orejas y contorno lateral',

  // — Modos —
  modeProfile: 'Perfil',
  modeFrontal: 'Frontal',

  // — Acciones comunes —
  undo: 'Deshacer',
  redo: 'Rehacer',
  close: 'Cerrar',
  closeAnnotation: 'Cerrar modo anotación',
  closeSimulation: 'Cerrar simulación',

  // — Barra superior (App) —
  patientPhotos: 'Fotos del paciente',
  loadPhoto: 'Cargar foto',
  detectAuto: 'Detectar auto',
  detectAutoTitle: 'Detectar puntos automáticamente con IA en el navegador',
  detecting: 'Detectando…',
  detectRedo: 'Redetectar',
  rhinoplasty: 'Rinoplastia',
  rhinoplastyClose: 'Cerrar simulación',
  annotation: 'Anotación',
  annotationClose: 'Cerrar anotación',
  saveToPatient: 'Guardar en paciente',
  updateMeasurement: 'Actualizar medición',
  pdfReport: 'Informe PDF',
  pointsPlaced: 'Puntos anatómicos colocados',

  // — Stepper del flujo —
  stepLoad: 'Cargar foto',
  stepDetect: 'Detectar puntos',
  stepCorrect: 'Corregir',
  stepAnalyze: 'Analizar',

  // — Selector de fotos del paciente —
  patientPhotosTitle: 'Fotos del paciente',
  noPhotos: 'Este paciente no tiene fotos todavía.',
  preop: 'Preoperatorio',
  postop: 'Postoperatorio',

  // — Paneles de puntos / calibración / medidas —
  anatomicalPoints: 'Puntos anatómicos',
  calibration: 'Calibración',
  keyMeasures: 'Medidas clave',
  annotationMode: 'Modo Anotación',

  // — LayersPanel: líneas de perfil —
  'line-E': 'Línea E (Pn–Pog) — estética',
  'line-S': 'Línea S (Cm–Pog)',
  'line-Riedel': 'Línea de Riedel (N–Pog)',
  'line-NSn': 'Eje nasal (N–Sn)',
  'line-NLs': 'Aux: N–Ls',
  'line-MeC': 'Plano submentoniano (Me–C)',
  'line-zero-meridian': 'Vertical por N (cero meridiano)',
  'line-thirds-profile': 'Tercios verticales (Tr-G-Sn-Me)',
  'line-frankfort': 'Línea de Frankfort (Po–Or)',
  'line-goode': 'Triángulo Goode (N–Pn–AC)',
  'line-alar-columellar': 'Eje narina + relación ala-columela',
  'line-profile-contour': 'Contorno real del perfil (auto)',
  'line-contour-anchors': 'Puntos de ajuste del contorno (◇)',
  // — LayersPanel: líneas frontales —
  'line-thirds': 'Tercios verticales (tr-cejas-sn-gn)',
  'line-fifths': 'Quintos faciales (6 verticales)',
  'line-pupil-line': 'Línea bipupilar',
  'line-midline-intercanthal': 'Línea media intercantal',
  'line-midline-labial': 'Línea media labial',
  'line-ref-horizontal': 'Refs. horizontales (ex/al/ch)',
  'line-symmetry-marks': 'Marcas de simetría',
  // — LayersPanel: ángulos —
  'ang-nasolabial': 'Ángulo nasolabial (Cm-Sn-Ls)',
  'ang-nasofrontal': 'Ángulo nasofrontal (G-N-Pn)',
  'ang-mentolabial': 'Ángulo mentolabial (Li-Sl-Pog)',
  'ang-nasomental': 'Ángulo nasomental (N-Pn-Pog)',
  'ang-nasofacial': 'Ángulo nasofacial (G-Pog vs N-Pn)',
  'ang-cervicoment': 'Ángulo cervicomental (Me-C-Nk)',
  'ang-frankfortFacial': 'Ángulo facial vs Frankfort',
  'ang-frankfortTip': 'Rotación punta vs Frankfort (Sn-Cm)',
  // — LayersPanel: medidas —
  'meas-distance-labels': 'Etiquetas de distancias (mm)',
  'meas-ratio-goode': 'Ratio de Goode',
  'meas-show-columellar': 'Mostrar columelar',
  'meas-symmetry-index': 'Índice de simetría',
  // — LayersPanel: controles —
  showAll: 'Mostrar todos los elementos',
  hideAll: 'Ocultar todos los elementos',
  linesSection: 'Líneas',
  anglesSection: 'Ángulos',
  measuresSection: 'Medidas',
};

// Traducciones. Solo las claves que difieren del español; el resto hereda ES.
const EN: Record<string, string> = {
  layersTitle: 'Analysis layers',
  clearMarks: 'Clear all marks',
  clearMarksTitle: 'Clear all marks',
  magnifier: 'Magnifier',
  magnifierTitle: 'Shows a 4x magnified loupe over the cursor for pixel-precise point placement',
  edgeSnap: 'Edge snap',
  edgeSnapTitle: 'When placing a point, snap to the nearest strong edge (8 px)',
  guides: 'Guides',
  guidesTitle: 'Faint marks at canonical positions for reference',
  labelSize: 'Label size',
  labelSizeTitle: 'Adjusts the text size of labels drawn on the photo',

  'p-frente': 'Forehead',
  'p-nariz': 'Nose',
  'p-boca': 'Mouth & mentolabial',
  'p-menton': 'Chin & neck',
  'p-referencia': 'Frankfort plane',
  'fr-midline': 'Midline (Farkas)',
  'fr-eyes': 'Eyes (pairs)',
  'fr-nose': 'Nose (pairs)',
  'fr-mouth': 'Mouth (pairs)',
  'fr-ears': 'Ears & lateral contour',

  modeProfile: 'Profile',
  modeFrontal: 'Frontal',

  undo: 'Undo',
  redo: 'Redo',
  close: 'Close',
  closeAnnotation: 'Close annotation mode',
  closeSimulation: 'Close simulation',

  patientPhotos: 'Patient photos',
  loadPhoto: 'Load photo',
  detectAuto: 'Auto-detect',
  detectAutoTitle: 'Automatically detect landmarks with in-browser AI',
  detecting: 'Detecting…',
  detectRedo: 'Re-detect',
  rhinoplasty: 'Rhinoplasty',
  rhinoplastyClose: 'Close simulation',
  annotation: 'Annotation',
  annotationClose: 'Close annotation',
  saveToPatient: 'Save to patient',
  updateMeasurement: 'Update measurement',
  pdfReport: 'PDF report',
  pointsPlaced: 'Anatomical landmarks placed',

  stepLoad: 'Load photo',
  stepDetect: 'Detect landmarks',
  stepCorrect: 'Correct',
  stepAnalyze: 'Analyze',

  patientPhotosTitle: 'Patient photos',
  noPhotos: 'This patient has no photos yet.',
  preop: 'Preoperative',
  postop: 'Postoperative',

  anatomicalPoints: 'Anatomical landmarks',
  calibration: 'Calibration',
  keyMeasures: 'Key measurements',
  annotationMode: 'Annotation mode',

  'line-E': 'E-line (Pn–Pog) — aesthetic',
  'line-S': 'S-line (Cm–Pog)',
  'line-Riedel': 'Riedel line (N–Pog)',
  'line-NSn': 'Nasal axis (N–Sn)',
  'line-NLs': 'Aux: N–Ls',
  'line-MeC': 'Submental plane (Me–C)',
  'line-zero-meridian': 'Vertical through N (zero meridian)',
  'line-thirds-profile': 'Vertical thirds (Tr-G-Sn-Me)',
  'line-frankfort': 'Frankfort line (Po–Or)',
  'line-goode': 'Goode triangle (N–Pn–AC)',
  'line-alar-columellar': 'Nostril axis + alar-columellar relation',
  'line-profile-contour': 'Real profile contour (auto)',
  'line-contour-anchors': 'Contour adjustment points (◇)',
  'line-thirds': 'Vertical thirds (tr-brows-sn-gn)',
  'line-fifths': 'Facial fifths (6 verticals)',
  'line-pupil-line': 'Interpupillary line',
  'line-midline-intercanthal': 'Intercanthal midline',
  'line-midline-labial': 'Labial midline',
  'line-ref-horizontal': 'Horizontal refs (ex/al/ch)',
  'line-symmetry-marks': 'Symmetry marks',
  'ang-nasolabial': 'Nasolabial angle (Cm-Sn-Ls)',
  'ang-nasofrontal': 'Nasofrontal angle (G-N-Pn)',
  'ang-mentolabial': 'Mentolabial angle (Li-Sl-Pog)',
  'ang-nasomental': 'Nasomental angle (N-Pn-Pog)',
  'ang-nasofacial': 'Nasofacial angle (G-Pog vs N-Pn)',
  'ang-cervicoment': 'Cervicomental angle (Me-C-Nk)',
  'ang-frankfortFacial': 'Facial angle vs Frankfort',
  'ang-frankfortTip': 'Tip rotation vs Frankfort (Sn-Cm)',
  'meas-distance-labels': 'Distance labels (mm)',
  'meas-ratio-goode': 'Goode ratio',
  'meas-show-columellar': 'Show columellar',
  'meas-symmetry-index': 'Symmetry index',
  showAll: 'Show all elements',
  hideAll: 'Hide all elements',
  linesSection: 'Lines',
  anglesSection: 'Angles',
  measuresSection: 'Measurements',
};

// Los demás idiomas se irán llenando; por ahora heredan español.
const DICTS: Record<Lang, Record<string, string>> = {
  es: ES, en: EN, fr: {}, pt: {}, de: {}, it: {}, tr: {},
};

/** Traduce una clave al idioma dado, con caída a español y luego a la clave. */
export function translate(lang: Lang, key: string): string {
  const d = DICTS[lang] || {};
  return d[key] ?? ES[key] ?? key;
}

// Contexto: el idioma activo del módulo. Entry.tsx lo provee.
export const LangContext = createContext<Lang>('es');

/** Hook para componentes: devuelve una función t(key). */
export function useT(): (key: string) => string {
  const lang = useContext(LangContext);
  return (key: string) => translate(lang, key);
}
