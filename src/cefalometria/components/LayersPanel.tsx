import {
  pointsForMode, POINT_BY_ID,
  type PointId, type Mode,
} from '../cephalometry';
import Icon from './Icon';

// ============ Catálogo de capas por modo ============

interface LayerItem { id: string; label: string; }

/** Líneas controlables — keys deben coincidir con `visibleLines[…]`. */
const PROFILE_LINES: LayerItem[] = [
  { id: 'E',               label: 'Línea E (Pn–Pog) — estética' },
  { id: 'S',               label: 'Línea S (Cm–Pog)' },
  { id: 'Riedel',          label: 'Línea de Riedel (N–Pog)' },
  { id: 'NSn',             label: 'Eje nasal (N–Sn)' },
  { id: 'NLs',             label: 'Aux: N–Ls' },
  { id: 'MeC',             label: 'Plano submentoniano (Me–C)' },
  { id: 'zero-meridian',   label: 'Vertical por N (cero meridiano)' },
  { id: 'thirds-profile',  label: 'Tercios verticales (Tr-G-Sn-Me)' },
  { id: 'frankfort',       label: 'Línea de Frankfort (Po–Or)' },
  { id: 'goode',           label: 'Triángulo Goode (N–Pn–AC)' },
  { id: 'alar-columellar', label: 'Eje narina + relación ala-columnela' },
  { id: 'profile-contour', label: 'Contorno real del perfil (auto)' },
  { id: 'contour-anchors', label: 'Puntos de ajuste del contorno (◇)' },
];

const FRONTAL_LINES: LayerItem[] = [
  { id: 'thirds',               label: 'Tercios verticales (tr-cejas-sn-gn)' },
  { id: 'fifths',               label: 'Quintos faciales (6 verticales)' },
  { id: 'pupil-line',           label: 'Línea bipupilar' },
  { id: 'midline-intercanthal', label: 'Línea media intercantal' },
  { id: 'midline-labial',       label: 'Línea media labial' },
  { id: 'ref-horizontal',       label: 'Refs. horizontales (ex/al/ch)' },
  { id: 'symmetry-marks',       label: 'Marcas de simetría' },
];

/** Ángulos que el LayersPanel puede pedir dibujar sobre el canvas. */
const PROFILE_ANGLES: LayerItem[] = [
  { id: 'nasolabial',     label: 'Ángulo nasolabial (Cm-Sn-Ls)' },
  { id: 'nasofrontal',    label: 'Ángulo nasofrontal (G-N-Pn)' },
  { id: 'mentolabial',    label: 'Ángulo mentolabial (Li-Sl-Pog)' },
  { id: 'nasomental',     label: 'Ángulo nasomental (N-Pn-Pog)' },
  { id: 'nasofacial',     label: 'Ángulo nasofacial (G-Pog vs N-Pn)' },
  { id: 'cervicoment',    label: 'Ángulo cervicomental (Me-C-Nk)' },
  { id: 'frankfortFacial', label: 'Ángulo facial vs Frankfort' },
  { id: 'frankfortTip',   label: 'Rotación punta vs Frankfort (Sn-Cm)' },
];

/** Categorías de medidas con etiqueta sobre la foto. */
const PROFILE_MEASURES: LayerItem[] = [
  { id: 'distance-labels', label: 'Etiquetas de distancias (mm)' },
  { id: 'ratio-goode',     label: 'Ratio de Goode' },
  { id: 'show-columellar', label: 'Show columelar' },
  { id: 'symmetry-index',  label: 'Índice de simetría' },
];

const FRONTAL_MEASURES: LayerItem[] = [
  { id: 'distance-labels', label: 'Etiquetas de distancias (mm)' },
  { id: 'symmetry-index',  label: 'Índice de simetría' },
];

// ============ Props ============

interface Props {
  mode: Mode;
  // Líneas
  visibleLines: Record<string, boolean>;
  setVisibleLines: (next: Record<string, boolean>) => void;
  // Puntos ocultos
  pointsHidden: PointId[];
  setPointsHidden: (next: PointId[]) => void;
  // Ángulos mostrados sobre canvas
  anglesShown: string[];
  setAnglesShown: (next: string[]) => void;
  // Medidas ocultas
  measuresHidden: string[];
  setMeasuresHidden: (next: string[]) => void;
  // Estados de colapso
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;
  sectionsOpen: { points: boolean; lines: boolean; angles: boolean; measures: boolean };
  setSectionsOpen: (next: Props['sectionsOpen']) => void;
}

// ============ Componente ============

export default function LayersPanel(p: Props) {
  const {
    mode, visibleLines, setVisibleLines,
    pointsHidden, setPointsHidden,
    anglesShown, setAnglesShown,
    measuresHidden, setMeasuresHidden,
    panelOpen, setPanelOpen,
    sectionsOpen, setSectionsOpen,
  } = p;

  const modePoints = pointsForMode(mode);
  const lines    = mode === 'perfil' ? PROFILE_LINES    : FRONTAL_LINES;
  const angles   = mode === 'perfil' ? PROFILE_ANGLES   : [];
  const measures = mode === 'perfil' ? PROFILE_MEASURES : FRONTAL_MEASURES;

  // --- Helpers de visibilidad ---
  const isPointVisible = (id: PointId) => !pointsHidden.includes(id);
  const isLineVisible  = (id: string)  => visibleLines[id] !== false;
  const isAngleShown   = (id: string)  => anglesShown.includes(id);
  const isMeasureVisible = (id: string) => !measuresHidden.includes(id);

  // --- Toggles individuales ---
  const togglePoint = (id: PointId) => {
    setPointsHidden(isPointVisible(id) ? [...pointsHidden, id] : pointsHidden.filter((x) => x !== id));
  };
  const toggleLine = (id: string) => {
    setVisibleLines({ ...visibleLines, [id]: !isLineVisible(id) });
  };
  const toggleAngle = (id: string) => {
    setAnglesShown(isAngleShown(id) ? anglesShown.filter((x) => x !== id) : [...anglesShown, id]);
  };
  const toggleMeasure = (id: string) => {
    setMeasuresHidden(isMeasureVisible(id) ? [...measuresHidden, id] : measuresHidden.filter((x) => x !== id));
  };

  // --- Section-level batch ---
  const allPointsOn  = () => setPointsHidden([]);
  const allPointsOff = () => setPointsHidden(modePoints.map((p) => p.id));
  const allLinesOn   = () => setVisibleLines({ ...visibleLines, ...Object.fromEntries(lines.map((l) => [l.id, true])) });
  const allLinesOff  = () => setVisibleLines({ ...visibleLines, ...Object.fromEntries(lines.map((l) => [l.id, false])) });
  const allAnglesOn  = () => setAnglesShown(angles.map((a) => a.id));
  const allAnglesOff = () => setAnglesShown([]);
  const allMeasuresOn  = () => setMeasuresHidden([]);
  const allMeasuresOff = () => setMeasuresHidden(measures.map((m) => m.id));

  // --- Global show/hide all ---
  const showAll = () => { allPointsOn(); allLinesOn(); allAnglesOn(); allMeasuresOn(); };
  const hideAll = () => { allPointsOff(); allLinesOff(); allAnglesOff(); allMeasuresOff(); };

  const Eye = ({ on }: { on: boolean }) =>
    <span className="eye" aria-hidden><Icon name={on ? 'eye' : 'eyeOff'} size={15} /></span>;

  return (
    <details className="layers-panel" open={panelOpen}
             onToggle={(e) => {
               // Guarda CLAVE: el evento `toggle` de las <details> internas
               // (secciones) se propaga hasta este onToggle del panel exterior
               // y, al montar con una sección abierta, abría el panel entero sin
               // querer. Solo atendemos el toggle del propio panel.
               if (e.target !== e.currentTarget) return;
               setPanelOpen((e.target as HTMLDetailsElement).open);
             }}>
      <summary><Icon name="layers" size={13} /> Capas de análisis</summary>

      <div className="global-actions">
        <button onClick={showAll} title="Mostrar todos los elementos"><Icon name="eye" size={13} /> Mostrar todo</button>
        <button onClick={hideAll} title="Ocultar todos los elementos"><Icon name="eyeOff" size={13} /> Ocultar todo</button>
      </div>

      {/* ============ Puntos ============ */}
      <details className="layers-section" open={sectionsOpen.points}
               onToggle={(e) => setSectionsOpen({
                 ...sectionsOpen,
                 points: (e.target as HTMLDetailsElement).open,
               })}>
        <summary>Puntos ({modePoints.length - pointsHidden.length}/{modePoints.length})</summary>
        <div className="section-body">
          <div className="section-actions">
            <button onClick={allPointsOn}>Mostrar todos</button>
            <button onClick={allPointsOff}>Ocultar todos</button>
          </div>
          {modePoints.map((pt) => {
            const visible = isPointVisible(pt.id);
            return (
              <div key={pt.id}
                   className={`layer-row ${visible ? '' : 'hidden'}`}
                   onClick={() => togglePoint(pt.id)}
                   role="button"
                   aria-pressed={visible}>
                <Eye on={visible} />
                <span className="dot" style={{ background: pt.color }} />
                <span className="layer-id">{pt.id}</span>
                <span className="layer-name" title={pt.desc}>{pt.name}</span>
              </div>
            );
          })}
        </div>
      </details>

      {/* ============ Líneas ============ */}
      <details className="layers-section" open={sectionsOpen.lines}
               onToggle={(e) => setSectionsOpen({
                 ...sectionsOpen,
                 lines: (e.target as HTMLDetailsElement).open,
               })}>
        <summary>Líneas ({lines.filter((l) => isLineVisible(l.id)).length}/{lines.length})</summary>
        <div className="section-body">
          <div className="section-actions">
            <button onClick={allLinesOn}>Mostrar todas</button>
            <button onClick={allLinesOff}>Ocultar todas</button>
          </div>
          {lines.map((l) => {
            const visible = isLineVisible(l.id);
            return (
              <div key={l.id}
                   className={`layer-row ${visible ? '' : 'hidden'}`}
                   onClick={() => toggleLine(l.id)}
                   role="button"
                   aria-pressed={visible}>
                <Eye on={visible} />
                <span className="layer-name">{l.label}</span>
              </div>
            );
          })}
        </div>
      </details>

      {/* ============ Ángulos ============ */}
      {angles.length > 0 && (
        <details className="layers-section" open={sectionsOpen.angles}
                 onToggle={(e) => setSectionsOpen({
                   ...sectionsOpen,
                   angles: (e.target as HTMLDetailsElement).open,
                 })}>
          <summary>Ángulos ({anglesShown.length}/{angles.length})</summary>
          <div className="section-body">
            <div className="section-actions">
              <button onClick={allAnglesOn}>Mostrar todos</button>
              <button onClick={allAnglesOff}>Ocultar todos</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, lineHeight: 1.4 }}>
              Los ángulos activados se dibujan sobre la foto (y salen así en los
              exports). Las tablas — en pantalla y en el PDF — siempre incluyen
              todas las medidas.
            </div>
            {angles.map((a) => {
              const on = isAngleShown(a.id);
              return (
                <div key={a.id}
                     className={`layer-row ${on ? '' : 'hidden'}`}
                     onClick={() => toggleAngle(a.id)}
                     role="button"
                     aria-pressed={on}>
                  <Eye on={on} />
                  <span className="layer-name">{a.label}</span>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* ============ Medidas ============ */}
      <details className="layers-section" open={sectionsOpen.measures}
               onToggle={(e) => setSectionsOpen({
                 ...sectionsOpen,
                 measures: (e.target as HTMLDetailsElement).open,
               })}>
        <summary>Medidas ({measures.length - measuresHidden.length}/{measures.length})</summary>
        <div className="section-body">
          <div className="section-actions">
            <button onClick={allMeasuresOn}>Mostrar todas</button>
            <button onClick={allMeasuresOff}>Ocultar todas</button>
          </div>
          {measures.map((m) => {
            const visible = isMeasureVisible(m.id);
            return (
              <div key={m.id}
                   className={`layer-row ${visible ? '' : 'hidden'}`}
                   onClick={() => toggleMeasure(m.id)}
                   role="button"
                   aria-pressed={visible}>
                <Eye on={visible} />
                <span className="layer-name">{m.label}</span>
              </div>
            );
          })}
        </div>
      </details>
    </details>
  );
}
