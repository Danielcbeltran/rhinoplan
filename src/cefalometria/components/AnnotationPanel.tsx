import { useEffect, useState } from 'react';
import {
  pointsForMode, type PointId, type Pt, type Mode,
} from '../cephalometry';
import {
  loadDataset, clearDataset, deleteCase, estimateSizeBytes,
  exportDatasetZip, downloadBlob, saveCaseAndDownload,
  type Dataset,
} from '../dataset';
import Icon from './Icon';

interface Props {
  mode: Mode;
  points: Partial<Record<PointId, Pt>>;
  activePointId: PointId | null;
  setActivePointId: (id: PointId | null) => void;
  confirmedPoints: Partial<Record<PointId, boolean>>;
  setConfirmed: (id: PointId, value: boolean) => void;
  setAllConfirmed: (map: Partial<Record<PointId, boolean>>) => void;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  /** Imagen base limpia (sin overlays) — para guardar el JPG de entrenamiento. */
  imageEl: HTMLImageElement | HTMLCanvasElement | null;
  detectorSeed?: string;
  onClose: () => void;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export default function AnnotationPanel(props: Props) {
  const {
    mode, points, activePointId, setActivePointId,
    confirmedPoints, setConfirmed, setAllConfirmed,
    canvasRef, imageEl, detectorSeed, onClose,
  } = props;

  const [dataset, setDataset] = useState<Dataset>(() => loadDataset());
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);

  const modePoints = pointsForMode(mode);
  const placed = modePoints.filter((p) => points[p.id]);
  const confirmedList = modePoints.filter((p) => confirmedPoints[p.id]);
  const progress = modePoints.length > 0 ? confirmedList.length / modePoints.length : 0;
  const allConfirmed = confirmedList.length === modePoints.length;

  useEffect(() => {
    function onStorage() { setDataset(loadDataset()); }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function confirmAllPlaced() {
    const next: Partial<Record<PointId, boolean>> = { ...confirmedPoints };
    for (const p of placed) next[p.id] = true;
    setAllConfirmed(next);
  }
  function resetAllConfirmed() {
    setAllConfirmed({});
  }

  async function saveCurrentCase() {
    setSaveError(null);
    const canvas = canvasRef.current;
    if (!canvas) { setSaveError('No hay canvas'); return; }
    setSaving(true);
    try {
      const res = await saveCaseAndDownload({
        mode, canvas, image: imageEl, points, detectorSeed,
      });
      setDataset(res.ds);
      if (!res.ok) {
        setSaveError(res.error ?? 'Error al guardar');
        return;
      }
      if (res.case) {
        setLastSavedId(res.case.id);
        setTimeout(() => setLastSavedId(null), 3500);
      }
    } finally {
      setSaving(false);
    }
  }

  async function exportZip() {
    if (dataset.cases.length === 0) return;
    setExporting(true);
    try {
      const blob = await exportDatasetZip(dataset);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      downloadBlob(blob, `rhinoplan-dataset_${dataset.cases.length}casos_${stamp}.zip`);
    } finally {
      setExporting(false);
    }
  }

  function handleClearDataset() {
    if (!confirm(`¿Borrar el índice de ${dataset.cases.length} casos del navegador?\n\nNo se eliminan los archivos JPG/JSON que ya descargaste al PC.`)) return;
    setDataset(clearDataset());
  }

  function handleDeleteCase(id: string) {
    if (!confirm(`¿Eliminar "${id}" del índice?\n\nNo se elimina el JPG/JSON que ya descargaste al PC.`)) return;
    setDataset(deleteCase(id));
  }

  const sizeBytes = estimateSizeBytes(dataset);

  return (
    <aside className="results annotation-panel">
      <div>
        <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Icon name="dataset" size={14} /> Modo Anotación
          </span>
          <button className="rhino-close" onClick={onClose} title="Cerrar modo anotación">✕</button>
        </h3>
        <div className="ann-intro">
          Corrige los puntos detectados arrastrándolos y confirma cada uno cuando esté
          exactamente en la posición correcta. Al guardar, se descargarán
          automáticamente <code>caso_NNN.jpg</code> y <code>caso_NNN.json</code> a tu PC.
        </div>
      </div>

      <div>
        <h3>Progreso ({mode === 'perfil' ? 'PERFIL' : 'FRENTE'})</h3>
        <div className="ann-progress">
          <div className="ann-bar"><div className="ann-bar-fill" style={{ width: `${progress * 100}%` }} /></div>
          <div className="ann-progress-label">
            <b>{confirmedList.length}</b>/{modePoints.length} confirmados
            <span style={{ color: 'var(--muted)', marginLeft: 6 }}>· {placed.length} colocados</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={confirmAllPlaced} disabled={placed.length === 0} style={{ flex: 1 }}>
            ✓ Confirmar todos los colocados
          </button>
          <button onClick={resetAllConfirmed} disabled={confirmedList.length === 0}>
            ↻ Reset
          </button>
        </div>
      </div>

      <div>
        <h3>Puntos a anotar</h3>
        <ul className="ann-list">
          {modePoints.map((p) => {
            const isPlaced = !!points[p.id];
            const isConfirmed = !!confirmedPoints[p.id];
            const isActive = p.id === activePointId;
            const status = isConfirmed ? 'confirmed' : isPlaced ? 'placed' : 'pending';
            return (
              <li key={p.id} className={`ann-item ${status} ${isActive ? 'active' : ''}`}
                  onClick={() => setActivePointId(p.id)}>
                <span className="ann-dot" style={{ background: p.color }} />
                <span className="ann-id">{p.id}</span>
                <span className="ann-name">{p.name}</span>
                <span className={`ann-status ann-${status}`}>
                  {isConfirmed ? '✓' : isPlaced ? '⌛' : '◯'}
                </span>
                {isPlaced && (
                  <button
                    className={`ann-confirm-btn ${isConfirmed ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setConfirmed(p.id, !isConfirmed); }}
                    title={isConfirmed ? 'Quitar confirmación' : 'Confirmar este punto'}
                  >
                    {isConfirmed ? '✓' : 'Confirmar'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h3>Guardar caso</h3>
        <button
          className="primary"
          onClick={saveCurrentCase}
          disabled={!allConfirmed || placed.length === 0 || saving}
          style={{ width: '100%' }}
          title={allConfirmed ? 'Guardar caso y descargar JPG + JSON al PC' : 'Confirma todos los puntos primero'}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {saving
              ? <><span className="spinner" /> Guardando y descargando…</>
              : <><Icon name="save" size={14} /> Guardar caso ({confirmedList.length}/{modePoints.length})</>}
          </span>
        </button>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
          Se descargarán <code>caso_NNN.jpg</code> y <code>caso_NNN.json</code> a
          tu carpeta de Descargas. El índice del dataset se guarda en el navegador.
        </div>
        {saveError && <div className="ann-error">{saveError}</div>}
        {lastSavedId && <div className="ann-ok">✓ Descargado: <code>{lastSavedId}.jpg</code> + <code>{lastSavedId}.json</code></div>}
      </div>

      <div>
        <h3>Dataset local</h3>
        <div className="ann-stats">
          <div><b>{dataset.cases.length}</b> {dataset.cases.length === 1 ? 'caso indexado' : 'casos indexados'}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>
            ≈ {formatBytes(sizeBytes)} · solo coordenadas en localStorage
          </div>
          {dataset.cases.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button onClick={exportZip} disabled={exporting} className="primary" style={{ flex: 1 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {exporting ? <><span className="spinner" /> Empaquetando…</> : <><Icon name="download" size={14} /> Exportar dataset (ZIP)</>}
                  </span>
                </button>
                <button onClick={handleClearDataset} className="danger" title="Borrar el índice del navegador (no borra los archivos en disco)" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-dim)' }}>
                  Ver casos guardados
                </summary>
                <ul className="ann-cases">
                  {dataset.cases.slice().reverse().map((c) => (
                    <li key={c.id}>
                      <span className="ac-mode">{c.mode === 'perfil' ? '◐' : '◉'}</span>
                      <span className="ac-id">{c.id}</span>
                      <span className="ac-pts">{c.points.length} pts</span>
                      <span className="ac-date">{new Date(c.timestamp).toLocaleString()}</span>
                      <button onClick={() => handleDeleteCase(c.id)} title="Eliminar del índice">✕</button>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.55 }}>
        <b>Cómo funciona:</b> cada vez que guardas un caso, su foto se descarga a
        tu PC como <code>caso_NNN.jpg</code> junto con <code>caso_NNN.json</code>.
        El navegador solo guarda las coordenadas (muy ligero). El ZIP de
        "Exportar dataset" agrupa todos los metadatos + instrucciones para
        combinarlos con las fotos descargadas.
      </div>
    </aside>
  );
}
