// ============================================================================
// Entry.tsx — Punto de entrada del módulo de cefalometría dentro de RhinoPlan.
// ----------------------------------------------------------------------------
// Se carga con React.lazy(), así que ni este código ni sus dependencias pesadas
// (MediaPipe, onnxruntime, face-api) entran en el bundle principal: sólo se
// descargan cuando el cirujano abre el módulo.
//
// El <div className="ceph-app"> aísla los estilos del módulo bajo esa clase.
// El LangContext.Provider propaga el idioma a todos los componentes hijos, que
// lo consumen con useT() — así se traduce sin pasar `lang` por props una a una.
// ============================================================================

import './index.css';
import App from './App';
import type { CephProps } from './bridge';
import { LangContext, type Lang } from './i18n';

export default function Entry(props: CephProps) {
  // El módulo solo tiene diccionarios completos en español e inglés. Para el
  // resto de idiomas de la app (fr, pt, de, it, tr) se usa INGLÉS como idioma
  // del módulo — no español —, que es el idioma común en cirugía y en el curso
  // internacional. Regla: español solo si el idioma es explícitamente 'es';
  // cualquier otro caso → inglés.
  const raw = (props.lang || 'es').slice(0, 2).toLowerCase();
  const lang: Lang = raw === 'es' ? 'es' : 'en';

  return (
    <LangContext.Provider value={lang}>
      <div className="ceph-app" style={{ position: 'fixed', inset: 0, zIndex: 900 }}>
        <App {...props} />
      </div>
    </LangContext.Provider>
  );
}
