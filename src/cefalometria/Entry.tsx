// ============================================================================
// Entry.tsx — Punto de entrada del módulo de cefalometría dentro de RhinoPlan.
// ----------------------------------------------------------------------------
// Sustituye al antiguo main.tsx del proyecto independiente.
//
// Este archivo se carga con React.lazy(), de modo que ni su código ni sus
// dependencias pesadas (MediaPipe, onnxruntime, face-api) entran en el bundle
// principal: solo se descargan cuando el cirujano abre el módulo.
//
// El <div className="ceph-app"> es imprescindible: los estilos del módulo
// están aislados bajo esa clase para no reestilizar la app principal.
// ============================================================================

import './index.css';
import App from './App';

export default function Entry() {
  return (
    <div className="ceph-app" style={{ position: 'fixed', inset: 0, zIndex: 900 }}>
      <App />
    </div>
  );
}
