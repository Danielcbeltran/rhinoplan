import { useEffect, useRef } from 'react';
import {
  RHINO_SLIDERS, DEFAULT_RHINO_SIM, getActiveChanges,
  computeSimulatedNose, refineNoseTip, originalNasalSilhouette,
  nasolabialFromSilhouette, nasofrontalFromSilhouette, nasalProjectionFromSilhouette,
  tipAngleFromSilhouette, distance,
  handleRadius, applyHandlesToSilhouette,
  type RhinoplastySim, type RhinoHandle,
} from '../rhinoplasty';
import { angleBetweenLines, type PointsMap } from '../cephalometry';
import Icon from './Icon';

interface Props {
  sim: RhinoplastySim;
  setSim: (s: RhinoplastySim) => void;
  showOriginal: boolean;
  setShowOriginal: (b: boolean) => void;
  warpPhoto: boolean;
  setWarpPhoto: (b: boolean) => void;
  splitView: boolean;
  setSplitView: (b: boolean) => void;
  showSimLine: boolean;
  setShowSimLine: (b: boolean) => void;
  handles: RhinoHandle[];
  onRemoveHandle: (i: number) => void;
  onResetHandles: () => void;
  /** Fija el multiplicador de radio de influencia del deformador i (×0.3–×2). */
  onSetHandleRadius: (i: number, r: number) => void;
  editHandles: boolean;
  setEditHandles: (b: boolean) => void;
  showHandles: boolean;
  setShowHandles: (b: boolean) => void;
  /** Radio (multiplicador) con el que se crearán los deformadores nuevos. */
  newHandleRadius: number;
  setNewHandleRadius: (r: number) => void;
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
  points: PointsMap;
  mmPerPx: number | null;
  onClose: () => void;
}

const REQUIRED_POINTS = ['N', 'Pn', 'Cm', 'Sn'] as const;

export default function RhinoplastyPanel(props: Props) {
  const {
    sim, setSim, showOriginal, setShowOriginal,
    warpPhoto, setWarpPhoto, splitView, setSplitView,
    showSimLine, setShowSimLine, handles, onRemoveHandle, onResetHandles,
    onSetHandleRadius, editHandles, setEditHandles,
    showHandles, setShowHandles, newHandleRadius, setNewHandleRadius,
    onUndo, canUndo, onRedo, canRedo,
    points, mmPerPx, onClose,
  } = props;

  const missing = REQUIRED_POINTS.filter((id) => !points[id]);
  const ready = missing.length === 0;
  const changes = getActiveChanges(sim);

  // Silueta original (sin cambios) y simulada para comparativa. La simulada
  // incluye TAMBIÉN los deformadores libres (mismo empuje smoothstep que el
  // canvas aplica al tramo), para que "Original vs proyectado" refleje los
  // cambios hechos arrastrando y no solo los sliders.
  const original = ready ? originalNasalSilhouette(points) : null;
  const simRaw = ready ? computeSimulatedNose(points, sim, mmPerPx) : null;
  const simRefined = simRaw ? refineNoseTip(simRaw, sim.tipRefinement) : null;
  const simulated = (simRefined && original && handles.length > 0)
    ? applyHandlesToSilhouette(
        simRefined, handles,
        handleRadius([original.N, ...original.dorsal, original.Pn, original.Cm, original.Sn]))
    : simRefined;
  const nasolabialOrig = original ? nasolabialFromSilhouette(original, points.Ls) : null;
  const nasolabialSim  = simulated ? nasolabialFromSilhouette(simulated, points.Ls) : null;
  const nasofrontalOrig = original ? nasofrontalFromSilhouette(original, points.G) : null;
  const nasofrontalSim  = simulated ? nasofrontalFromSilhouette(simulated, points.G) : null;
  const projOrig = original ? nasalProjectionFromSilhouette(original, points.AC) : null;
  const projSim  = simulated ? nasalProjectionFromSilhouette(simulated, points.AC) : null;
  const tipAngOrig = original ? tipAngleFromSilhouette(original) : null;
  const tipAngSim  = simulated ? tipAngleFromSilhouette(simulated) : null;
  // Rotación de punta vs plano de Frankfort: ángulo entre la columela (Sn–Cm)
  // y el plano de Frankfort (Po–Or). El plano Po–Or NO cambia con la simulación;
  // sí lo hacen Sn/Cm, así que la comparativa refleja la rotación proyectada.
  // Requiere Po y Or colocados.
  const frankfortReady = !!(points.Po && points.Or);
  const tipRotFrankOrig = (frankfortReady && original)
    ? angleBetweenLines(points.Po!, points.Or!, original.Sn, original.Cm) : null;
  const tipRotFrankSim = (frankfortReady && simulated)
    ? angleBetweenLines(points.Po!, points.Or!, simulated.Sn, simulated.Cm) : null;
  // Distancias: largo de la nariz (N–Pn) y proyección nasal (AC–Pn). AC no se
  // mueve en la simulación (es el pivote de la rotación), así que la proyección
  // AC–Pn permite verificar que la rotación de punta la conserva.
  const noseLenOrig = original ? distance(original.N, original.Pn) : null;
  const noseLenSim  = simulated ? distance(simulated.N, simulated.Pn) : null;
  const nasProjOrig = (original && points.AC) ? distance(points.AC, original.Pn) : null;
  const nasProjSim  = (simulated && points.AC) ? distance(points.AC, simulated.Pn) : null;
  const fmtDist = (px: number | null) =>
    px == null ? '—' : mmPerPx ? `${(px * mmPerPx).toFixed(1)} mm` : `${px.toFixed(0)} px`;
  const fmtDistDelta = (a: number | null, b: number | null) => {
    if (a == null || b == null) return '—';
    const d = mmPerPx ? (b - a) * mmPerPx : b - a;
    const unit = mmPerPx ? ' mm' : ' px';
    return `${d >= 0 ? '+' : ''}${d.toFixed(mmPerPx ? 1 : 0)}${unit}`;
  };

  // Cambios de slider COALESCIDOS a 1 commit por frame: en iPad el arrastre
  // dispara 60-120 eventos `input`/s y cada uno re-renderizaba la App entera
  // + el warp fotográfico → la simulación iba lentísima. Se acumula el último
  // valor y se aplica en el siguiente requestAnimationFrame.
  const pendingSimRef = useRef<RhinoplastySim | null>(null);
  const simRafRef = useRef(0);
  const simRef = useRef(sim);
  useEffect(() => { simRef.current = sim; }, [sim]);
  useEffect(() => () => cancelAnimationFrame(simRafRef.current), []);
  function updateSlider<K extends keyof RhinoplastySim>(id: K, value: number) {
    pendingSimRef.current = { ...(pendingSimRef.current ?? simRef.current), [id]: value };
    if (!simRafRef.current) {
      simRafRef.current = requestAnimationFrame(() => {
        simRafRef.current = 0;
        if (pendingSimRef.current) {
          setSim(pendingSimRef.current);
          pendingSimRef.current = null;
        }
      });
    }
  }
  function resetAll() { setSim(DEFAULT_RHINO_SIM); }

  return (
    <aside className="results rhino-panel">
      <div>
        <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Icon name="flask" size={15} /> Simulación rinoplastia
          </span>
          <button className="rhino-close" onClick={onClose} title="Cerrar simulación">✕</button>
        </h3>
        {!ready ? (
          <div className="pending-note" style={{ marginTop: 8 }}>
            ⚠ Faltan puntos nasales: <b>{missing.join(', ')}</b>.<br />
            Coloca los puntos (manual o con detección automática) para activar la simulación.
          </div>
        ) : (
          <div className="calibration-status ok" style={{ marginTop: 8 }}>
            ✓ Puntos nasales listos. {mmPerPx
              ? <>Escala: <b>{(1 / mmPerPx).toFixed(2)} px/mm</b></>
              : <>Sin calibración: los mm asumen <b>1 mm ≈ 5 px</b>. Calibra para precisión.</>}
          </div>
        )}
      </div>

      <div>
        <h3>Controles</h3>
        <div className="rhino-sliders">
          {RHINO_SLIDERS.map((s) => {
            const val = sim[s.id];
            const isZero = Math.abs(val) < 0.05;
            return (
              <div key={s.id} className={`rhino-slider ${isZero ? 'inactive' : 'active'}`}>
                <div className="rs-header">
                  <span className="rs-label">{s.label}{s.frontalOnly && <span className="rs-tag">solo frente</span>}</span>
                  <span className="rs-value">
                    {val >= 0 && val !== 0 ? '+' : ''}{val.toFixed(s.step < 1 ? 1 : 0)}{s.unit ? ' ' + s.unit : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min={s.min} max={s.max} step={s.step}
                  value={val}
                  onChange={(e) => updateSlider(s.id, parseFloat(e.target.value))}
                  disabled={!ready}
                />
                <div className="rs-desc">{s.desc}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={onUndo} disabled={!canUndo} style={{ flex: 1 }}
            title="Deshacer el último cambio de la simulación (sliders o deformadores)">
            ↩ Deshacer
          </button>
          <button onClick={onRedo} disabled={!canRedo} style={{ flex: 1 }}
            title="Rehacer el cambio deshecho">
            ↪ Rehacer
          </button>
          <button onClick={resetAll} disabled={changes.length === 0} style={{ flex: 1 }}>
            ↻ Restablecer
          </button>
        </div>
      </div>

      <div>
        <h3>Vista</h3>
        <label className="rhino-toggle">
          <input
            type="checkbox"
            checked={showOriginal}
            onChange={(e) => setShowOriginal(e.target.checked)}
          />
          Mostrar perfil original (línea tenue)
        </label>
        <label className="rhino-toggle">
          <input
            type="checkbox"
            checked={warpPhoto}
            onChange={(e) => setWarpPhoto(e.target.checked)}
          />
          Deformar la fotografía
        </label>
        <label className="rhino-toggle">
          <input
            type="checkbox"
            checked={showSimLine}
            onChange={(e) => setShowSimLine(e.target.checked)}
          />
          Mostrar línea de simulación (verde)
        </label>
        <label className="rhino-toggle">
          <input
            type="checkbox"
            checked={splitView}
            onChange={(e) => setSplitView(e.target.checked)}
          />
          Vista dividida antes/después (divisor)
        </label>
        <label className="rhino-toggle">
          <input
            type="checkbox"
            checked={editHandles}
            onChange={(e) => setEditHandles(e.target.checked)}
          />
          <Icon name="move" size={14} /> Editar deformadores libres (arrastrar sobre la foto)
        </label>
        <label className="rhino-toggle">
          <input
            type="checkbox"
            checked={showHandles}
            onChange={(e) => setShowHandles(e.target.checked)}
          />
          <Icon name="eye" size={14} /> Mostrar deformadores (las flechas ámbar)
        </label>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.45 }}>
          Editar activado: arrastrar sobre la foto crea un empuje local; arrastra
          la empuñadura ámbar para reajustarlo. Desactivado: arrastrar desplaza
          la foto ampliada como siempre (Espacio+arrastre también desplaza).
          Ocultar las flechas no quita su efecto sobre la foto.
        </div>
        {editHandles && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
            <span title="Área de influencia con la que nacen los deformadores nuevos (× del radio base)">
              radio de nuevos deformadores
            </span>
            <input
              type="range" min={0.3} max={2} step={0.05} value={newHandleRadius}
              onChange={(e) => setNewHandleRadius(parseFloat(e.target.value))}
              style={{ flex: 1, minHeight: 0 }}
            />
            <span style={{ width: 38, textAlign: 'right' }}>×{newHandleRadius.toFixed(2)}</span>
          </div>
        )}
        {handles.length > 0 && (
          <div style={{ marginTop: 6 }}>
            {handles.map((h, i) => {
              const len = Math.hypot(h.to.x - h.from.x, h.to.y - h.from.y);
              const lenTxt = mmPerPx ? `${(len * mmPerPx).toFixed(1)} mm` : `${len.toFixed(0)} px`;
              const rMult = h.radius ?? 1;
              return (
                <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ color: '#f59e0b', display: 'inline-flex' }}><Icon name="move" size={13} /></span>
                    <span style={{ flex: 1 }}>Deformador {i + 1} · {lenTxt}</span>
                    <button
                      onClick={() => onRemoveHandle(i)}
                      title={`Eliminar deformador ${i + 1}`}
                      style={{ padding: '1px 8px', fontSize: 12 }}
                    >✕</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
                    <span title="Radio de influencia (× del radio base)">radio</span>
                    <input
                      type="range" min={0.3} max={2} step={0.05} value={rMult}
                      onChange={(e) => onSetHandleRadius(i, parseFloat(e.target.value))}
                      style={{ flex: 1, minHeight: 0 }}
                    />
                    <span style={{ width: 38, textAlign: 'right' }}>×{rMult.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
            <button onClick={onResetHandles} style={{ marginTop: 4, width: '100%' }}>
              ✕ Quitar todos ({handles.length})
            </button>
          </div>
        )}
      </div>

      <div>
        <h3>Original vs proyectado</h3>
        {!ready ? (
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>—</div>
        ) : (
          <table className="ceph">
            <thead>
              <tr>
                <th>Medida</th>
                <th className="num">Original</th>
                <th className="num">Proyectado</th>
                <th className="num">Δ</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>∠ nasolabial</td>
                <td className="num">{nasolabialOrig != null ? `${nasolabialOrig.toFixed(1)}°` : '—'}</td>
                <td className="num" style={{ color: 'var(--ok-strong)' }}>
                  {nasolabialSim != null ? `${nasolabialSim.toFixed(1)}°` : '—'}
                </td>
                <td className="num">
                  {nasolabialOrig != null && nasolabialSim != null
                    ? `${nasolabialSim - nasolabialOrig >= 0 ? '+' : ''}${(nasolabialSim - nasolabialOrig).toFixed(1)}°`
                    : '—'}
                </td>
              </tr>
              <tr>
                <td>∠ nasofrontal</td>
                <td className="num">{nasofrontalOrig != null ? `${nasofrontalOrig.toFixed(1)}°` : '—'}</td>
                <td className="num" style={{ color: 'var(--ok-strong)' }}>
                  {nasofrontalSim != null ? `${nasofrontalSim.toFixed(1)}°` : '—'}
                </td>
                <td className="num">
                  {nasofrontalOrig != null && nasofrontalSim != null
                    ? `${nasofrontalSim - nasofrontalOrig >= 0 ? '+' : ''}${(nasofrontalSim - nasofrontalOrig).toFixed(1)}°`
                    : '—'}
                </td>
              </tr>
              <tr>
                <td title="Ángulo N–Pn–Sn: la cuña que forma la punta nasal, con vértice en Pn. Menor = punta más afilada; mayor = más roma.">
                  ∠ de punta (N–Pn–Sn)
                </td>
                <td className="num">{tipAngOrig != null ? `${tipAngOrig.toFixed(1)}°` : '—'}</td>
                <td className="num" style={{ color: 'var(--ok-strong)' }}>
                  {tipAngSim != null ? `${tipAngSim.toFixed(1)}°` : '—'}
                </td>
                <td className="num">
                  {tipAngOrig != null && tipAngSim != null
                    ? `${tipAngSim - tipAngOrig >= 0 ? '+' : ''}${(tipAngSim - tipAngOrig).toFixed(1)}°`
                    : '—'}
                </td>
              </tr>
              <tr>
                <td title="Rotación de la punta: ángulo entre la columela (Sn–Cm) y el plano de Frankfort (Po–Or). Requiere Po y Or colocados. Normal 0–30°.">
                  Rotación punta (Frankfort)
                </td>
                <td className="num">{tipRotFrankOrig != null ? `${tipRotFrankOrig.toFixed(1)}°` : '—'}</td>
                <td className="num" style={{ color: 'var(--ok-strong)' }}>
                  {tipRotFrankSim != null ? `${tipRotFrankSim.toFixed(1)}°` : '—'}
                </td>
                <td className="num">
                  {tipRotFrankOrig != null && tipRotFrankSim != null
                    ? `${tipRotFrankSim - tipRotFrankOrig >= 0 ? '+' : ''}${(tipRotFrankSim - tipRotFrankOrig).toFixed(1)}°`
                    : '—'}
                </td>
              </tr>
              <tr>
                <td>Largo nariz (N–Pn)</td>
                <td className="num">{fmtDist(noseLenOrig)}</td>
                <td className="num" style={{ color: 'var(--ok-strong)' }}>{fmtDist(noseLenSim)}</td>
                <td className="num">{fmtDistDelta(noseLenOrig, noseLenSim)}</td>
              </tr>
              <tr>
                <td>Proyec. nasal (AC–Pn)</td>
                <td className="num">{fmtDist(nasProjOrig)}</td>
                <td className="num" style={{ color: 'var(--ok-strong)' }}>{fmtDist(nasProjSim)}</td>
                <td className="num">{fmtDistDelta(nasProjOrig, nasProjSim)}</td>
              </tr>
              <tr>
                <td>{points.AC ? 'Ratio Goode' : 'Proyec. nasal'}</td>
                <td className="num">{projOrig != null ? projOrig.toFixed(2) : '—'}</td>
                <td className="num" style={{ color: 'var(--ok-strong)' }}>
                  {projSim != null ? projSim.toFixed(2) : '—'}
                </td>
                <td className="num">
                  {projOrig != null && projSim != null
                    ? `${projSim - projOrig >= 0 ? '+' : ''}${(projSim - projOrig).toFixed(2)}`
                    : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        )}
        {nasolabialSim == null && ready && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            (Coloca Ls para el ángulo nasolabial; G para el nasofrontal)
          </div>
        )}
        {ready && !frankfortReady && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            (Coloca Po y Or para la rotación de punta respecto a Frankfort)
          </div>
        )}
      </div>

      <div>
        <h3>Cambios aplicados</h3>
        {changes.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Sin cambios. Mueve los sliders para simular.
          </div>
        ) : (
          <ul className="rhino-changes">
            {changes.map((c, i) => (
              <li key={i}>
                <span className="rc-label">{c.label}:</span>
                <span className="rc-value">{c.value}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
        Simulación geométrica — modela el nuevo perfil esperado tras la cirugía
        basándose en los desplazamientos de los puntos blandos. Es <b>orientativa</b>
        y debe complementarse con la planificación quirúrgica del cirujano.
      </div>
    </aside>
  );
}
