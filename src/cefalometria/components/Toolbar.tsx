import {
  pointsForMode, linesForMode, FRONTAL_GUIDES, PROFILE_GUIDES,
  type PointId, type Pt, type Mode, type PointGroup,
} from '../cephalometry';
import type { Tool } from './CanvasArea';
import Icon from './Icon';

interface Props {
  mode: Mode;
  tool: Tool;
  activePointId: PointId | null;
  setActivePointId: (id: PointId | null) => void;
  /** Elige un punto concreto: selecciona + activa herramienta Punto sin limpiar. */
  onPickPoint: (id: PointId) => void;
  points: Partial<Record<PointId, Pt>>;
  visibleLines: Record<string, boolean>;
  setVisibleLines: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onResetMarks: () => void;
  hasImage: boolean;
  magnifierEnabled: boolean;
  setMagnifierEnabled: (v: boolean) => void;
  edgeSnapEnabled: boolean;
  setEdgeSnapEnabled: (v: boolean) => void;
  templateVisible: boolean;
  setTemplateVisible: (v: boolean) => void;
  labelScale: number;
  setLabelScale: (v: number) => void;
  /** Contenido inyectado al final del sidebar — pensado para el LayersPanel. */
  children?: React.ReactNode;
}

const PERFIL_GROUPS: { key: PointGroup; label: string }[] = [
  { key: 'p-frente',     label: 'Frente' },
  { key: 'p-nariz',      label: 'Nariz' },
  { key: 'p-boca',       label: 'Boca y mentolabial' },
  { key: 'p-menton',     label: 'Mentón y cuello' },
  { key: 'p-referencia', label: 'Plano de Frankfort' },
];

const FRENTE_GROUPS: { key: PointGroup; label: string }[] = [
  { key: 'fr-midline', label: 'Línea media (Farkas)' },
  { key: 'fr-eyes',    label: 'Ojos (pares)' },
  { key: 'fr-nose',    label: 'Nariz (pares)' },
  { key: 'fr-mouth',   label: 'Boca (pares)' },
  { key: 'fr-ears',    label: 'Orejas y contorno lateral' },
];

export default function Toolbar(props: Props) {
  const {
    mode, tool, activePointId, setActivePointId, onPickPoint, points,
    visibleLines, setVisibleLines, onResetMarks, hasImage,
    magnifierEnabled, setMagnifierEnabled,
    edgeSnapEnabled, setEdgeSnapEnabled,
    templateVisible, setTemplateVisible,
    labelScale, setLabelScale,
    children,
  } = props;

  const groups = mode === 'perfil' ? PERFIL_GROUPS : FRENTE_GROUPS;
  const allPoints = pointsForMode(mode);
  const lines = mode === 'perfil' ? linesForMode('perfil') : null;
  const guides = mode === 'perfil' ? PROFILE_GUIDES : FRONTAL_GUIDES;
  // Contador de la cabecera: solo puntos OBLIGATORIOS (los opcionales no cuentan)
  const mandatoryPoints = allPoints.filter((p) => !p.optional);
  const placedPoints = mandatoryPoints.filter((p) => points[p.id]).length;
  const totalMandatory = mandatoryPoints.length;
  const visibleGuideCount = guides.filter((g) => visibleLines[g.id]).length;
  const visibleLineCount = lines ? lines.filter((ln) => visibleLines[ln.id]).length : 0;

  return (
    <aside className="sidebar">
      {/* Las HERRAMIENTAS ya no viven aquí: se movieron a la barra flotante
          sobre la foto (CanvasArea), que libera altura en este panel y queda
          al alcance del pulgar en iPad. */}
      <details className="side-group">
        <summary>
          Puntos anatómicos
          <span className={`sg-count ${placedPoints >= totalMandatory ? 'complete' : ''}`}>
            {placedPoints}/{totalMandatory}
          </span>
        </summary>
        <div className="sg-body">
          {groups.map((g) => {
            const items = allPoints.filter((p) => p.group === g.key);
            if (items.length === 0) return null;
            return (
              <div key={g.key} style={{ marginBottom: 10 }}>
                <div style={{
                  fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase',
                  letterSpacing: 1, margin: '4px 0',
                }}>{g.label}</div>
                <div className="points-list">
                  {items.map((p) => {
                    const placed = !!points[p.id];
                    const active = p.id === activePointId && tool === 'point';
                    return (
                      <button
                        key={p.id}
                        className={`point-row ${placed ? 'placed' : ''} ${active ? 'active' : ''} ${p.optional ? 'optional' : ''}`}
                        onClick={() => onPickPoint(p.id)}
                        title={p.optional ? `${p.desc} · Opcional — colócalo solo si necesitas su medida` : p.desc}
                        disabled={!hasImage}
                      >
                        <span className="dot" style={{ background: p.color }} />
                        <span className="pr-name">{p.name}</span>
                        {p.optional && <span className="pr-opt">opc.</span>}
                        <span className="pr-id">{p.id}</span>
                        <span className="pr-state" aria-hidden>
                          {placed ? <Icon name="check" size={13} /> : '·'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </details>

      {mode === 'perfil' && lines && lines.length > 0 && (
        <details className="side-group">
          <summary>
            Líneas estéticas
            {visibleLineCount > 0 && <span className="sg-count">{visibleLineCount}</span>}
          </summary>
          <div className="sg-body">
            <div className="lines-toggles" style={{ gridTemplateColumns: '1fr' }}>
              {lines.map((ln) => (
                <label key={ln.id} title={ln.label}>
                  <input
                    type="checkbox"
                    checked={!!visibleLines[ln.id]}
                    onChange={(e) => setVisibleLines((prev) => ({ ...prev, [ln.id]: e.target.checked }))}
                  />
                  <span style={{
                    display: 'inline-block', width: 10, height: 2,
                    background: ln.color, marginRight: 4,
                  }} />
                  {ln.label}
                </label>
              ))}
            </div>
          </div>
        </details>
      )}

      <details className="side-group">
        <summary>
          Guías de análisis
          {visibleGuideCount > 0 && <span className="sg-count">{visibleGuideCount}</span>}
        </summary>
        <div className="sg-body">
          <div className="lines-toggles" style={{ gridTemplateColumns: '1fr' }}>
            {guides.map((g) => (
              <label key={g.id} title={g.label}>
                <input
                  type="checkbox"
                  checked={!!visibleLines[g.id]}
                  onChange={(e) => setVisibleLines((prev) => ({ ...prev, [g.id]: e.target.checked }))}
                />
                <span style={{
                  display: 'inline-block', width: 10, height: 2,
                  background: g.color, marginRight: 4,
                }} />
                {g.label}
              </label>
            ))}
          </div>
        </div>
      </details>

      <details className="side-group">
        <summary>Asistentes</summary>
        <div className="sg-body">
        <div className="lines-toggles" style={{ gridTemplateColumns: '1fr' }}>
          <label title="Muestra una lupa magnificada x4 sobre el cursor para colocar puntos con precisión píxel">
            <input type="checkbox" checked={magnifierEnabled}
              onChange={(e) => setMagnifierEnabled(e.target.checked)} />
            <Icon name="magnifier" size={14} /> Lupa al colocar
          </label>
          <label title="Al colocar un punto, snap al borde más fuerte cercano (8 px)">
            <input type="checkbox" checked={edgeSnapEnabled}
              onChange={(e) => setEdgeSnapEnabled(e.target.checked)} />
            <Icon name="magnet" size={14} /> Snap a borde
          </label>
          <label title="Marcas tenues con posiciones canónicas como referencia">
            <input type="checkbox" checked={templateVisible}
              onChange={(e) => setTemplateVisible(e.target.checked)} />
            <Icon name="ghost" size={14} /> Plantilla guía
          </label>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.4 }}>
          Rueda del ratón = zoom · Espacio + drag = pan
        </div>
        </div>
      </details>

      <details className="side-group">
        <summary>
          Etiquetas
          <span className="sg-count">{Math.round(labelScale * 100)} %</span>
        </summary>
        <div className="sg-body">
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}
                 title="Ajusta el tamaño del texto de las etiquetas dibujadas sobre la foto">
            <span style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Tamaño del texto</span>
              <b>{Math.round(labelScale * 100)} %</b>
            </span>
            <input
              type="range"
              min={0.8} max={2} step={0.1}
              value={labelScale}
              onChange={(e) => setLabelScale(parseFloat(e.target.value))}
            />
          </label>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4 }}>
            Afecta a medidas, ángulos y nombres de puntos sobre la imagen.
          </div>
        </div>
      </details>

      {children}

      <div style={{ marginTop: 'auto' }}>
        <button className="danger" onClick={onResetMarks} disabled={!hasImage}>
          Borrar todas las marcas
        </button>
      </div>
    </aside>
  );
}
