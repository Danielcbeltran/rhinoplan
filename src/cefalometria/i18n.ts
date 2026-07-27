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
