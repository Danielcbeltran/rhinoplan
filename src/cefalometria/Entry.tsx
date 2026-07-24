// ============================================================================
// Entry.tsx — Punto de entrada del módulo de cefalometría dentro de RhinoPlan.
// ----------------------------------------------------------------------------
// Sustituye al antiguo main.tsx del proyecto independiente.
//
// Se carga con React.lazy(), así que ni este código ni sus dependencias pesadas
// (MediaPipe, onnxruntime, face-api) entran en el bundle principal: sólo se
// descargan cuando el cirujano abre el módulo.
//
// El <div className="ceph-app"> es imprescindible: los estilos del módulo están
// aislados bajo esa clase para no reestilizar la app principal.
// ============================================================================

import './index.css';
import App from './App';
import type { CephProps } from './bridge';

export default function Entry(props: CephProps) {
  return (
    <div className="ceph-app" style={{ position: 'fixed', inset: 0, zIndex: 900 }}>
      <App {...props} />
    </div>
  );
}
