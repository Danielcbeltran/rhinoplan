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
  optionalHint: 'Opcional — colócalo solo si necesitas su medida',

  // — Descripciones de puntos anatómicos (nombres latinos intactos) —
  'desc-Tr': 'Línea anterior de implantación capilar',
  'desc-G': 'Punto más prominente entre las cejas',
  'desc-N': 'Punto más posterior de la raíz nasal (blando)',
  'desc-Rh': 'Transición hueso-cartílago en el dorso nasal',
  'desc-Sp': 'Punto más alto del lóbulo de la punta nasal (entre Rh y Pn)',
  'desc-Pn': 'Punta de la nariz (pronasale)',
  'desc-Cm': 'Punto más prominente de la columela',
  'desc-Sn': 'Base de la columela / inicio del filtrum',
  'desc-AC': 'Alar Crease — unión del ala nasal con la mejilla',
  'desc-A': 'Punto más inferior del borde alar — Gunter "A"',
  'desc-Ba': 'Punto anterior del eje longitudinal de la narina',
  'desc-Bp': 'Punto posterior del eje longitudinal de la narina',
  'desc-Cb': 'Punto más inferior de la columnela — Gunter "C"',
  'desc-Ls': 'Labrale superius — borde bermellón labio sup.',
  'desc-Li': 'Labrale inferius — borde bermellón labio inf.',
  'desc-Sl': 'Sublabial — punto más posterior surco mentolabial',
  'desc-Pog': 'Punto más anterior del mentón (blando)',
  'desc-Me': 'Punto más inferior del mentón (blando)',
  'desc-C': 'Intersección cuello–submentón (vértice del ángulo cervicomental)',
  'desc-Nk': 'Punto del plano cervical bajo C, tangente al cuello — define el 2º lado del ángulo cervicomental',
  'desc-Po': 'Punto más alto del conducto auditivo externo',
  'desc-Or': 'Punto más bajo del reborde infraorbitario',
  'desc-tr': 'Punto medio del nacimiento del cabello',
  'desc-g': 'Punto más prominente de la frente en la línea media, entre las cejas',
  'desc-n': 'Punto medio entre ojos al nivel del hueso nasal',
  'desc-prn': 'Punto más prominente de la punta nasal',
  'desc-sn': 'Punto donde la columnela se une al labio',
  'desc-sto': 'Punto medio entre labios cerrados',
  'desc-gn': 'Punto más inferior del mentón',
  'desc-cb_d': 'Punto más medial de la ceja derecha, en su borde inferior',
  'desc-cb_i': 'Punto más medial de la ceja izquierda, en su borde inferior',
  'desc-en_d': 'Canto interno del ojo derecho del paciente',
  'desc-en_i': 'Canto interno del ojo izquierdo del paciente',
  'desc-ex_d': 'Canto externo del ojo derecho del paciente',
  'desc-ex_i': 'Canto externo del ojo izquierdo del paciente',
  'desc-pu_d': 'Centro de la pupila derecha',
  'desc-pu_i': 'Centro de la pupila izquierda',
  'desc-al_d': 'Punto más lateral del ala nasal derecha',
  'desc-al_i': 'Punto más lateral del ala nasal izquierda',
  'desc-ch_d': 'Comisura derecha de la boca',
  'desc-ch_i': 'Comisura izquierda de la boca',
  'desc-t_d': 'Punto más anterior del trago de la oreja derecha',
  'desc-t_i': 'Punto más anterior del trago de la oreja izquierda',
  'desc-lat_d': 'Punto más externo del contorno facial derecho a nivel ocular (hélix/contorno)',
  'desc-lat_i': 'Punto más externo del contorno facial izquierdo a nivel ocular (hélix/contorno)',

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
  optionalHint: 'Optional — place only if you need its measurement',

  'desc-Tr': 'Anterior hairline',
  'desc-G': 'Most prominent point between the eyebrows',
  'desc-N': 'Most posterior point of the nasal root (soft tissue)',
  'desc-Rh': 'Bone–cartilage transition on the nasal dorsum',
  'desc-Sp': 'Highest point of the nasal tip lobule (between Rh and Pn)',
  'desc-Pn': 'Tip of the nose (pronasale)',
  'desc-Cm': 'Most prominent point of the columella',
  'desc-Sn': 'Base of the columella / start of the philtrum',
  'desc-AC': 'Alar crease — junction of the nasal ala with the cheek',
  'desc-A': 'Most inferior point of the alar rim — Gunter "A"',
  'desc-Ba': 'Anterior point of the nostril long axis',
  'desc-Bp': 'Posterior point of the nostril long axis',
  'desc-Cb': 'Most inferior point of the columella — Gunter "C"',
  'desc-Ls': 'Labrale superius — upper lip vermilion border',
  'desc-Li': 'Labrale inferius — lower lip vermilion border',
  'desc-Sl': 'Sublabial — deepest point of the mentolabial sulcus',
  'desc-Pog': 'Most anterior point of the chin (soft tissue)',
  'desc-Me': 'Most inferior point of the chin (soft tissue)',
  'desc-C': 'Neck–submental intersection (cervicomental angle vertex)',
  'desc-Nk': 'Cervical plane point below C, tangent to the neck — defines the 2nd side of the cervicomental angle',
  'desc-Po': 'Highest point of the external auditory canal',
  'desc-Or': 'Lowest point of the infraorbital rim',
  'desc-tr': 'Midpoint of the hairline',
  'desc-g': 'Most prominent midline point of the forehead, between the eyebrows',
  'desc-n': 'Midpoint between the eyes at the level of the nasal bone',
  'desc-prn': 'Most prominent point of the nasal tip',
  'desc-sn': 'Point where the columella meets the lip',
  'desc-sto': 'Midpoint between closed lips',
  'desc-gn': 'Most inferior point of the chin',
  'desc-cb_d': 'Most medial point of the right eyebrow, at its lower border',
  'desc-cb_i': 'Most medial point of the left eyebrow, at its lower border',
  'desc-en_d': "Inner canthus of the patient's right eye",
  'desc-en_i': "Inner canthus of the patient's left eye",
  'desc-ex_d': "Outer canthus of the patient's right eye",
  'desc-ex_i': "Outer canthus of the patient's left eye",
  'desc-pu_d': 'Center of the right pupil',
  'desc-pu_i': 'Center of the left pupil',
  'desc-al_d': 'Most lateral point of the right nasal ala',
  'desc-al_i': 'Most lateral point of the left nasal ala',
  'desc-ch_d': 'Right corner of the mouth',
  'desc-ch_i': 'Left corner of the mouth',
  'desc-t_d': 'Most anterior point of the right ear tragus',
  'desc-t_i': 'Most anterior point of the left ear tragus',
  'desc-lat_d': 'Most lateral point of the right facial contour at eye level (helix/contour)',
  'desc-lat_i': 'Most lateral point of the left facial contour at eye level (helix/contour)',

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
