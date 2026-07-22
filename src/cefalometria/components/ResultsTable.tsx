import {
  ANGLE_MEASURES,
  computeThirds, computeFifths,
  lipVsEyeVerticalDeviation,
  goodeNasalProjection, goodeVerdict, chinProjectionSigned, frankfortFacialAngle,
  nasofacialAngle, NASOFACIAL_IDEAL, NASOFACIAL_TOL,
  frankfortTipRotation, TIPROT_IDEAL, TIPROT_TOL,
  alarColumellarRelation, classifyGunter, gunterInfo,
  farkasMeasurements, farkasSymmetryIndex, pairSymmetry, symmetryLevel,
  evaluateThirds, frontalThirds, FIFTH_LABELS,
  type BilateralMeasure,
  angle3pt, distance, evaluate,
  type PointId, type Pt, type Mode,
} from '../cephalometry';
import type { CustomLine, CustomAngle, Ruler } from './CanvasArea';

interface Props {
  mode: Mode;
  points: Partial<Record<PointId, Pt>>;
  mmPerPx: number | null;
  customLines: CustomLine[];
  customAngles: CustomAngle[];
  rulers?: Ruler[];
  refCalibMm?: number | null;
  setRefCalibMm?: (v: number | null) => void;
  calibrationManual?: boolean;   // hay calibración manual activa (prioritaria)
  confirmed?: boolean;
  detectionStatus?: 'idle' | 'detecting' | 'done' | 'failed';
}

function badge(level: 'ok' | 'warn' | 'error' | 'muted', text: string) {
  return <span className={`badge ${level}`}>{text}</span>;
}
function deltaLabel(val: number, ideal: number, unit: string, decimals = 1) {
  const d = val - ideal;
  const sign = d >= 0 ? '+' : '−';
  return `${sign}${Math.abs(d).toFixed(decimals)}${unit}`;
}

/** Gauge de normalidad: banda verde = rango normal (ideal ± tol); marcador =
 *  dónde cae el paciente. El track cubre ideal ± 2.5·tol (más allá, el
 *  marcador se pega al extremo). Es SOLO visual — la evaluación clínica sigue
 *  siendo la de `evaluate` (el badge de la columna Eval.). */
function RangeGauge({ value, ideal, tol }: { value: number | null; ideal: number; tol: number }) {
  if (value == null || !isFinite(value) || tol <= 0) return null;
  const span = tol * 2.5;
  const pos = Math.max(0.03, Math.min(0.97, (value - (ideal - span)) / (2 * span)));
  const dev = Math.abs(value - ideal);
  const level = dev <= tol ? 'ok' : dev <= tol * 2 ? 'warn' : 'error';
  return (
    <span className="gauge" title={`Normal: ${ideal} ±${tol}`}>
      <span
        className="g-band"
        style={{ left: `${((span - tol) / (2 * span)) * 100}%`, width: `${(tol / span) * 100}%` }}
      />
      <span className={`g-marker ${level}`} style={{ left: `${pos * 100}%` }} />
    </span>
  );
}

/** Tarjeta de una medida clínica CLAVE. Presentación pura: los valores,
 *  rangos y veredictos son los mismos que en las tablas (mismas funciones de
 *  cephalometry). Reúne en un bloque legible lo que la tabla reparte en 4
 *  columnas: nombre, valor, veredicto en color y gauge de rango. */
function MetricCard({
  label, sublabel, value, delta, level, verdict, normalLabel, gauge,
}: {
  label: string;
  sublabel?: string;
  value: string;
  delta?: string | null;
  level: 'ok' | 'warn' | 'error' | 'muted';
  verdict: string;
  normalLabel?: string;
  gauge?: { value: number | null; ideal: number; tol: number };
}) {
  return (
    <div className="metric-card" title={sublabel}>
      <div className="mc-head">
        <span className="mc-label">{label}</span>
        <span className={`badge ${level}`}>{verdict}</span>
      </div>
      <div className="mc-value-row">
        <span className="mc-value">{value}</span>
        {delta && <span className={`mc-delta ${level}`}>{delta}</span>}
      </div>
      {normalLabel && <div className="mc-normal">{normalLabel}</div>}
      {gauge && <RangeGauge value={gauge.value} ideal={gauge.ideal} tol={gauge.tol} />}
    </div>
  );
}

export default function ResultsTable(props: Props) {
  const {
    mode, points, mmPerPx, customLines, customAngles, rulers = [],
    refCalibMm, setRefCalibMm, calibrationManual, confirmed, detectionStatus,
  } = props;
  const showPendingNote = detectionStatus === 'done' && !confirmed;

  // Calibración anatómica predeterminada: intercantal (frente) o N–Pn (perfil)
  const refA = mode === 'frente' ? points['en_d'] : points['N'];
  const refB = mode === 'frente' ? points['en_i'] : points['Pn'];
  const refReady = !!(refA && refB);
  const refLabel = mode === 'frente' ? 'Distancia intercantal (en_d–en_i)' : 'Nasion–Pronasale (N–Pn)';
  const refHint  = mode === 'frente' ? 'ej. ~31 mm en adultos' : 'longitud nasal del paciente';

  return (
    <aside className="results">
      {showPendingNote && (
        <div className="pending-note">
          ⚠ Los puntos no están <b>confirmados</b>. Revísalos y pulsa
          <b>Confirmar puntos</b> en la barra superior para fijar el análisis.
        </div>
      )}
      <div>
        <h3>Calibración</h3>
        <div className={`calibration-status ${mmPerPx ? 'ok' : ''}`}>
          {mmPerPx
            ? <>Escala: <b>{(1 / mmPerPx).toFixed(2)} px/mm</b> &middot; <b>{mmPerPx.toFixed(4)} mm/px</b></>
            : <>Sin calibración — distancias en píxeles. Usa la herramienta <b>Calibrar</b> o la calibración predeterminada de abajo.</>
          }
        </div>

        {setRefCalibMm && (
          <div className="ref-calib" style={{ marginTop: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
              <span style={{ color: 'var(--text-dim)' }}>
                Calibración predeterminada — <b>{refLabel}</b>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number" min={1} step={0.5}
                  value={refCalibMm ?? ''}
                  placeholder={refHint}
                  disabled={!refReady}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setRefCalibMm(isFinite(v) && v > 0 ? v : null);
                  }}
                  style={{ width: 110 }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>mm</span>
                {refCalibMm != null && (
                  <button style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setRefCalibMm(null)}>
                    Quitar
                  </button>
                )}
              </div>
            </label>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, lineHeight: 1.45 }}>
              {!refReady
                ? <>Coloca primero los puntos <b>{mode === 'frente' ? 'en_d y en_i' : 'N y Pn'}</b> para usar esta calibración.</>
                : calibrationManual
                  ? <>Introduce la medida real de esa distancia. <b>Nota:</b> hay una calibración manual activa que tiene prioridad; quítala para usar esta.</>
                  : <>Introduce la medida real (mm) de esa distancia en el paciente y la escala se calcula automáticamente.</>}
            </div>
          </div>
        )}
      </div>

      {mode === 'perfil'
        ? <ProfileResults points={points} mmPerPx={mmPerPx} />
        : <FrontalResults points={points} mmPerPx={mmPerPx} />}

      {(customLines.length > 0 || customAngles.length > 0 || rulers.length > 0) && (
        <div>
          <h3>Medidas personalizadas</h3>
          <table className="ceph">
            <tbody>
              {rulers.map((r, i) => {
                const d = distance(r.p1, r.p2);
                const txt = mmPerPx ? `${(d * mmPerPx).toFixed(1)} mm` : `${d.toFixed(0)} px`;
                return (
                  <tr key={`R-${i}`}>
                    <td>Distancia {i + 1}</td>
                    <td className="num">{txt}</td>
                  </tr>
                );
              })}
              {customLines.map((l, i) => {
                const a = points[l.a], b = points[l.b];
                const d = (a && b) ? distance(a, b) : null;
                const txt = d == null ? '—'
                  : mmPerPx ? `${(d * mmPerPx).toFixed(1)} mm`
                  : `${d.toFixed(0)} px`;
                return (
                  <tr key={`L-${i}`}>
                    <td>Línea {l.a}–{l.b}</td>
                    <td className="num">{txt}</td>
                  </tr>
                );
              })}
              {customAngles.map((a, i) => {
                const pa = points[a.a], pv = points[a.v], pb = points[a.b];
                const deg = (pa && pv && pb) ? angle3pt(pa, pv, pb) : null;
                return (
                  <tr key={`A-${i}`}>
                    <td>Ángulo {a.a}–{a.v}–{a.b}</td>
                    <td className="num">{deg != null ? `${deg.toFixed(1)}°` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rulers.length > 0 && !mmPerPx && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.45 }}>
              Sin calibración las distancias se muestran en píxeles. Usa la
              herramienta <b>⇿ Calibrar</b> con una medida conocida para verlas en mm.
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.55 }}>
        {mode === 'perfil'
          ? 'Referencias: ángulos faciales blandos (Powell-Humphreys, Ricketts), proyección nasal (Goode adaptado) y mentón (cero meridiano González-Ulloa).'
          : 'Referencias: cánones de proporción facial (tercios y quintos clásicos, ratios Powell).'}
        {' '}Esta herramienta es orientativa y no sustituye el juicio clínico.
      </div>
    </aside>
  );
}

// ============ Resultados PERFIL — Perfilometría blanda ============
function ProfileResults({ points, mmPerPx }: { points: Partial<Record<PointId, Pt>>; mmPerPx: number | null }) {
  const goode = goodeNasalProjection(points);
  const goodeV = goodeVerdict(goode?.ratio);
  const cp = chinProjectionSigned(points['N'], points['Pog'], points['Pn'], points['Po'], points['Or']);
  // Con Po+Or la referencia es la perpendicular REAL a Frankfort; sin ellos se
  // degrada a la vertical de la foto (solo válida con la imagen enderezada).
  const cpFrankfort = !!(points['Po'] && points['Or']);
  const cpMm = (cp != null && mmPerPx) ? cp * mmPerPx : null;
  const cpLevel = cpMm == null ? 'muted' as const : evaluate(cpMm, 0, 2);
  const thirds = computeThirds(points['Tr'], points['G'], points['Sn'], points['Me']);
  const fhAngle = frankfortFacialAngle(points);
  const fhLevel = fhAngle == null ? 'muted' as const : evaluate(fhAngle, 90, 5);
  const nfacAngle = nasofacialAngle(points);
  const nfacLevel = nfacAngle == null ? 'muted' as const : evaluate(nfacAngle, NASOFACIAL_IDEAL, NASOFACIAL_TOL);
  const tipRot = frankfortTipRotation(points);
  const tipRotLevel = tipRot == null ? 'muted' as const : evaluate(tipRot, TIPROT_IDEAL, TIPROT_TOL);
  const rel = alarColumellarRelation(points);
  const abMm   = (rel && mmPerPx) ? rel.abSignedPx   * mmPerPx : null;
  const cbMm   = (rel && mmPerPx) ? rel.cbSignedPx   * mmPerPx : null;
  const showMm = (rel && mmPerPx) ? rel.showSignedPx * mmPerPx : null;
  const gType  = classifyGunter(abMm, cbMm);
  const gInfo  = gunterInfo(gType);

  const fmtDist = (px: number) =>
    mmPerPx ? `${(px * mmPerPx).toFixed(1)} mm` : `${px.toFixed(0)} px`;
  const goodeLevel = goodeV === 'adecuada' ? 'ok'
    : goodeV === 'muted' ? 'muted'
    : 'warn';
  const goodeText = goodeV === 'adecuada' ? 'Proyección adecuada'
    : goodeV === 'subproyectada' ? 'Nariz subproyectada'
    : goodeV === 'sobreproyectada' ? 'Nariz sobreproyectada'
    : '—';

  // Medidas CLAVE (tarjetas). Mismos ideales/tolerancias que las filas de tabla
  // de las que proceden (ANGLE_MEASURES): nasolabial 100±10, nasofrontal 125±8.
  const nlAngle = (points['Cm'] && points['Sn'] && points['Ls'])
    ? angle3pt(points['Cm']!, points['Sn']!, points['Ls']!) : null;
  const nlLevel = nlAngle == null ? 'muted' as const : evaluate(nlAngle, 100, 10);
  const nfrAngle = (points['G'] && points['N'] && points['Pn'])
    ? angle3pt(points['G']!, points['N']!, points['Pn']!) : null;
  const nfrLevel = nfrAngle == null ? 'muted' as const : evaluate(nfrAngle, 125, 8);
  const verdict = (v: number | null, lv: 'ok' | 'warn' | 'error' | 'muted') =>
    v == null ? '—' : lv === 'ok' ? 'Normal' : lv === 'muted' ? '—' : 'Fuera de rango';

  return (
    <>
      <div>
        <h3>Medidas clave</h3>
        <div className="result-cards">
          <MetricCard
            label="Ángulo nasolabial" sublabel="Cm–Sn–Ls"
            value={nlAngle != null ? `${nlAngle.toFixed(1)}°` : '—'}
            delta={nlAngle != null ? deltaLabel(nlAngle, 100, '°') : null}
            level={nlLevel} verdict={verdict(nlAngle, nlLevel)}
            normalLabel="Normal 100° ±10"
            gauge={{ value: nlAngle, ideal: 100, tol: 10 }}
          />
          <MetricCard
            label="Ángulo nasofrontal" sublabel="G–N–Pn"
            value={nfrAngle != null ? `${nfrAngle.toFixed(1)}°` : '—'}
            delta={nfrAngle != null ? deltaLabel(nfrAngle, 125, '°') : null}
            level={nfrLevel} verdict={verdict(nfrAngle, nfrLevel)}
            normalLabel="Normal 125° ±8"
            gauge={{ value: nfrAngle, ideal: 125, tol: 8 }}
          />
          <MetricCard
            label="Proyección nasal (Goode)" sublabel="Proyección ÷ Longitud (req. N, Pn, AC)"
            value={goode ? goode.ratio.toFixed(2) : '—'}
            delta={goode ? deltaLabel(goode.ratio, 0.575, '', 2) : null}
            level={goodeLevel} verdict={goode ? goodeText : '—'}
            normalLabel="Normal 0.55 – 0.60"
            gauge={{ value: goode ? goode.ratio : null, ideal: 0.575, tol: 0.025 }}
          />
          <MetricCard
            label="Rotación de punta (Frankfort)" sublabel="Columela Sn–Cm vs vertical de Frankfort (Po–Or)"
            value={tipRot != null ? `${tipRot.toFixed(1)}°` : '—'}
            delta={tipRot != null ? deltaLabel(tipRot, TIPROT_IDEAL, '°') : null}
            level={tipRotLevel} verdict={verdict(tipRot, tipRotLevel)}
            normalLabel="Normal 0 – 30°"
            gauge={{ value: tipRot, ideal: TIPROT_IDEAL, tol: TIPROT_TOL }}
          />
        </div>
      </div>

      <div>
        <h3>Ángulos faciales blandos</h3>
        <table className="ceph">
          <thead>
            <tr>
              <th>Medida</th><th className="num">Paciente</th>
              <th className="num">Normal</th><th>Eval.</th>
            </tr>
          </thead>
          <tbody>
            {/* nasolabial y nasofrontal se muestran como tarjetas CLAVE arriba */}
            {ANGLE_MEASURES.filter((m) => m.id !== 'nasolabial' && m.id !== 'nasofrontal').map((m) => {
              const [a, v, b] = m.points;
              const pa = points[a], pv = points[v], pb = points[b];
              const value = (pa && pv && pb) ? angle3pt(pa, pv, pb) : null;
              const level = evaluate(value, m.ideal, m.tolerance);
              // El cervicomental usa Nk (opcional). Si falta, se pide AQUÍ —
              // solo cuando se busca esta medida, no en el flujo general.
              const needsNk = m.id === 'cervicoment' && !points['Nk'];
              return (
                <tr key={m.id}>
                  <td title={m.desc}>
                    <b>{m.label}</b>
                    {needsNk && (
                      <div style={{ fontSize: 10.5, color: 'var(--warn)', fontWeight: 400, marginTop: 2 }}>
                        Coloca el punto <b>Cuello (Nk)</b> — opcional — desde la lista de puntos.
                      </div>
                    )}
                  </td>
                  <td className="num">
                    {value != null ? `${value.toFixed(1)}°` : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
                  <td className="num" style={{ color: 'var(--text-dim)' }}>
                    {m.ideal}° ±{m.tolerance}
                    <RangeGauge value={value} ideal={m.ideal} tol={m.tolerance} />
                  </td>
                  <td>{value != null
                    ? badge(level, deltaLabel(value, m.ideal, '°'))
                    : badge('muted', '—')}</td>
                </tr>
              );
            })}
            {/* Ángulo nasofacial — recta–recta (plano facial G–Pog vs dorso N–Pn) */}
            <tr>
              <td title="Ángulo agudo entre el plano facial (G–Pog) y el dorso nasal (N–Pn). Requiere G, Pog, N, Pn.">
                <b>Ángulo nasofacial</b>
              </td>
              <td className="num">
                {nfacAngle != null ? `${nfacAngle.toFixed(1)}°` : <span style={{ color: 'var(--muted)' }}>—</span>}
              </td>
              <td className="num" style={{ color: 'var(--text-dim)' }}>
                {NASOFACIAL_IDEAL}° ±{NASOFACIAL_TOL}
                <RangeGauge value={nfacAngle} ideal={NASOFACIAL_IDEAL} tol={NASOFACIAL_TOL} />
              </td>
              <td>{nfacAngle != null
                ? badge(nfacLevel, deltaLabel(nfacAngle, NASOFACIAL_IDEAL, '°'))
                : badge('muted', '—')}</td>
            </tr>
            {/* Rotación de punta (Frankfort) se muestra como tarjeta CLAVE arriba */}
          </tbody>
        </table>
      </div>

      <div>
        <h3>Proyección nasal (Goode) — componentes</h3>
        <table className="ceph">
          <thead>
            <tr>
              <th>Medida</th><th className="num">Paciente</th>
              <th className="num">Normal</th><th>Eval.</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td title="Distancia desde Nasion hasta Pronasale">
                <b>Longitud nasal</b><br />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                  N → Pn
                </span>
              </td>
              <td className="num">{goode ? fmtDist(goode.nasalLength)
                : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
              <td className="num" style={{ color: 'var(--text-dim)' }}>—</td>
              <td>{badge('muted', '—')}</td>
            </tr>
            <tr>
              <td title="Distancia desde Nasion hasta Pliegue alar">
                <b>Línea base</b><br />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                  N → AC (pliegue alar)
                </span>
              </td>
              <td className="num">{goode ? fmtDist(goode.baseLine)
                : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
              <td className="num" style={{ color: 'var(--text-dim)' }}>—</td>
              <td>{badge('muted', '—')}</td>
            </tr>
            <tr>
              <td title="Distancia perpendicular desde Pronasale hasta la recta N–AC">
                <b>Proyección nasal</b><br />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                  Perpendicular Pn → N–AC
                </span>
              </td>
              <td className="num">{goode ? fmtDist(goode.projection)
                : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
              <td className="num" style={{ color: 'var(--text-dim)' }}>—</td>
              <td>{badge('muted', '—')}</td>
            </tr>
            {/* El ratio Goode (veredicto) se muestra como tarjeta CLAVE arriba;
                aquí quedan sus componentes de medida. */}
          </tbody>
        </table>
      </div>

      <div>
        <h3>Relación ala–columnela (eje Ba–Bp)</h3>
        <table className="ceph">
          <thead>
            <tr>
              <th>Medida</th><th className="num">Paciente</th>
              <th className="num">Normal</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td title="Distancia perpendicular signada desde A (punto más bajo del ala) a la recta Ba–Bp. Positivo = A por debajo del eje.">
                <b>AB</b> · Distancia A → eje Ba–Bp<br />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>req. A, Ba, Bp</span>
              </td>
              <td className="num">
                {rel == null
                  ? <span style={{ color: 'var(--muted)' }}>—</span>
                  : abMm != null
                    ? `${abMm >= 0 ? '+' : ''}${abMm.toFixed(1)} mm`
                    : `${rel.abSignedPx >= 0 ? '+' : ''}${rel.abSignedPx.toFixed(0)} px`}
              </td>
              <td className="num" style={{ color: 'var(--text-dim)' }}>1 – 2 mm</td>
            </tr>
            <tr>
              <td title="Distancia perpendicular signada desde Cb (punto más bajo de la columnela) a la recta Ba–Bp. Positivo = Cb por debajo del eje.">
                <b>BC</b> · Distancia C → eje Ba–Bp<br />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>req. Cb, Ba, Bp</span>
              </td>
              <td className="num">
                {rel == null
                  ? <span style={{ color: 'var(--muted)' }}>—</span>
                  : cbMm != null
                    ? `${cbMm >= 0 ? '+' : ''}${cbMm.toFixed(1)} mm`
                    : `${rel.cbSignedPx >= 0 ? '+' : ''}${rel.cbSignedPx.toFixed(0)} px`}
              </td>
              <td className="num" style={{ color: 'var(--text-dim)' }}>1 – 2 mm</td>
            </tr>
            <tr>
              <td title="Show columelar: BC − AB. Positivo = columnela visible bajo el ala.">
                <b>Show columelar</b><br />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>BC − AB</span>
              </td>
              <td className="num">
                {rel == null
                  ? <span style={{ color: 'var(--muted)' }}>—</span>
                  : showMm != null
                    ? `${showMm >= 0 ? '+' : ''}${showMm.toFixed(1)} mm`
                    : `${rel.showSignedPx >= 0 ? '+' : ''}${rel.showSignedPx.toFixed(0)} px`}
              </td>
              <td className="num" style={{ color: 'var(--text-dim)' }}>1 – 4 mm</td>
            </tr>
          </tbody>
        </table>
        <div className="gunter-result" style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Clasificación
          </div>
          {rel == null
            ? badge('muted', 'Faltan A, Ba, Bp o C')
            : abMm == null || cbMm == null
              ? badge('muted', 'sin calibrar')
              : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  {badge(gType === 'normal' ? 'ok' : gType === 'muted' ? 'muted' : 'warn', gInfo.short)}
                  <b style={{ fontSize: 13 }}>{gInfo.name}</b>
                </div>
              )}
          {gInfo.desc && (
            <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
              {gInfo.desc}
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.45 }}>
          Sobre la foto: <b>eje blanco punteado</b> = Ba–Bp (eje longitudinal de
          la narina); <b>perpendicular rosa</b> = distancia AB del ala al eje;
          <b> perpendicular amarilla</b> = distancia BC de la columnela al eje.
        </div>
      </div>

      <div>
        <h3>Proyección del mentón</h3>
        <table className="ceph">
          <thead>
            <tr>
              <th>Medida</th><th className="num">Paciente</th>
              <th className="num">Normal</th><th>Eval.</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td title="Cero meridiano de González-Ulloa: distancia de Pog a la línea por N perpendicular a Frankfort (Po–Or); sin Po/Or, vertical de la foto">
                <b>Proyección del mentón</b><br />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                  {cpFrankfort
                    ? 'Cero meridiano ⊥ Frankfort (N, Pog, Po, Or)'
                    : 'Cero meridiano · vertical de foto (faltan Po/Or)'}
                </span>
              </td>
              <td className="num">
                {cpMm != null
                  ? `${cpMm >= 0 ? '+' : ''}${cpMm.toFixed(1)} mm`
                  : cp != null
                    ? `${cp >= 0 ? '+' : ''}${cp.toFixed(0)} px`
                    : <span style={{ color: 'var(--muted)' }}>—</span>}
              </td>
              <td className="num" style={{ color: 'var(--text-dim)' }}>
                0 mm ±2
                <RangeGauge value={cpMm} ideal={0} tol={2} />
              </td>
              <td>{cpMm != null
                ? badge(cpLevel, deltaLabel(cpMm, 0, ' mm'))
                : cp != null
                  ? badge('muted', 'sin calibrar')
                  : badge('muted', '—')}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <h3>Plano de Frankfort</h3>
        <table className="ceph">
          <thead>
            <tr>
              <th>Medida</th><th className="num">Paciente</th>
              <th className="num">Normal</th><th>Eval.</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td title="Ángulo agudo entre la línea de Frankfort (Po–Or) y el plano facial blando (G–Pog). 90° = cara perpendicular al cráneo.">
                <b>Inclinación facial vs FH</b><br />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                  ∠(Po–Or, G–Pog) — req. Po, Or, G, Pog
                </span>
              </td>
              <td className="num">
                {fhAngle != null
                  ? `${fhAngle.toFixed(1)}°`
                  : <span style={{ color: 'var(--muted)' }}>—</span>}
              </td>
              <td className="num" style={{ color: 'var(--text-dim)' }}>
                90° ±5
                <RangeGauge value={fhAngle} ideal={90} tol={5} />
              </td>
              <td>{fhAngle != null
                ? badge(fhLevel, deltaLabel(fhAngle, 90, '°'))
                : badge('muted', '—')}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.45 }}>
          La línea Po–Or se dibuja automáticamente en azul claro sobre la foto
          y sirve como referencia horizontal para evaluar la inclinación general
          del plano facial.
        </div>
      </div>

      <div>
        <h3>Tercios faciales verticales</h3>
        <table className="ceph">
          <thead>
            <tr><th>Tercio</th><th className="num">Paciente</th><th className="num">Normal</th><th>Eval.</th></tr>
          </thead>
          <tbody>
            {(['Superior (Tr–G)', 'Medio (G–Sn)', 'Inferior (Sn–Me)'] as const).map((label, i) => {
              const r = thirds?.ratios[i] ?? null;
              const pct = r != null ? r * 100 : null;
              const level = pct != null ? evaluate(pct, 33.33, 4) : 'muted';
              return (
                <tr key={label}>
                  <td><b>{label}</b></td>
                  <td className="num">{pct != null ? `${pct.toFixed(1)} %`
                    : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                  <td className="num" style={{ color: 'var(--text-dim)' }}>
                    33.3 % ±4
                    <RangeGauge value={pct} ideal={33.33} tol={4} />
                  </td>
                  <td>{pct != null
                    ? badge(level, deltaLabel(pct, 33.33, ' %'))
                    : badge('muted', '—')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ============ Resultados FRENTE — Análisis antropométrico de Farkas ============
function FrontalResults({ points, mmPerPx }: { points: Partial<Record<PointId, Pt>>; mmPerPx: number | null }) {
  const f = farkasMeasurements(points);
  const sym = farkasSymmetryIndex(f);
  const thirds = frontalThirds(points);
  const fifths = computeFifths(points);
  const thirdsEval = thirds
    ? evaluateThirds(thirds.ratios[0], thirds.ratios[1], thirds.ratios[2])
    : evaluateThirds(null, null, null);

  // Helpers de formateo
  const fmtDist = (px: number | null) => {
    if (px == null) return '—';
    if (mmPerPx) return `${(px * mmPerPx).toFixed(1)} mm`;
    return `${px.toFixed(0)} px`;
  };
  const fmtAng = (deg: number | null) =>
    deg == null ? '—' : `${deg.toFixed(1)}°`;

  // Desviación de la línea media intercantal vs la interlabial (tarjeta CLAVE).
  const vd = lipVsEyeVerticalDeviation(points);
  const vdMm = vd != null && mmPerPx ? Math.abs(vd) * mmPerPx : null;
  const vdMmSigned = vd != null && mmPerPx ? vd * mmPerPx : null;
  const vdLevel: 'ok' | 'warn' | 'error' | 'muted' =
    vd == null || vdMm == null ? 'muted' : vdMm < 1 ? 'ok' : vdMm <= 3 ? 'warn' : 'error';
  const vdArrow = vd != null ? (vd > 0 ? '→' : '←') : '';
  const vdVerdict = vd == null ? '—'
    : vdMm == null ? 'sin calibrar'
    : vdMm < 1 ? 'Alineadas'
    : vdMm <= 3 ? `Leve ${vdArrow}`
    : `Marcada ${vdArrow}`;

  return (
    <>
      <div>
        <h3>Medida clave</h3>
        <div className="result-cards">
          <MetricCard
            label="Desviación intercantal vs labial"
            sublabel="Vertical por midpoint(en_d, en_i) vs vertical por sto/midpoint(ch_d, ch_i)"
            value={vdMm != null ? `${vdMm.toFixed(2)} mm` : vd != null ? `${Math.abs(vd).toFixed(0)} px` : '—'}
            delta={null}
            level={vdLevel}
            verdict={vdVerdict}
            normalLabel="Alineadas < 1 mm"
            gauge={vdMmSigned != null ? { value: vdMmSigned, ideal: 0, tol: 1 } : undefined}
          />
        </div>
      </div>

      {/* --- 1. Medidas globales --- */}
      <div>
        <h3>Farkas — medidas globales</h3>
        <table className="ceph">
          <thead>
            <tr><th>Medida</th><th className="num">Paciente</th></tr>
          </thead>
          <tbody>
            <GlobalRow label="Altura fisiognómica (tr–gn)"          v={fmtDist(f.faceHeight)} />
            <GlobalRow label="Altura nasal media (n–sn)"            v={fmtDist(f.noseHeightMid)} />
            <GlobalRow label="Altura nasal (n–prn)"                 v={fmtDist(f.noseHeight)} />
            <GlobalRow label="Altura mucosa bucal (sto–gn)"         v={fmtDist(f.mouthHeight)} />
            <GlobalRow label="Anchura interocular interna (en_d–en_i)" v={fmtDist(f.interEndoCanth)} />
            <GlobalRow label="Anchura interocular externa (ex_d–ex_i)" v={fmtDist(f.interExoCanth)} />
            <GlobalRow label="Anchura bi-auricular (t_d–t_i)"       v={fmtDist(f.biauricular)} />
            <GlobalRow label="Anchura nasal (al_d–al_i)"            v={fmtDist(f.noseWidth)} />
            <GlobalRow label="Anchura bucal (ch_d–ch_i)"            v={fmtDist(f.mouthWidth)} />
          </tbody>
        </table>
      </div>

      {/* --- 2. Tercios faciales verticales (tr–g–sn–gn) --- */}
      <div>
        <h3>Tercios faciales verticales</h3>
        <table className="ceph">
          <thead>
            <tr>
              <th>Tercio</th>
              <th className="num">Altura</th>
              <th className="num">% del total</th>
              <th className="num">Ideal</th>
              <th>Eval.</th>
            </tr>
          </thead>
          <tbody>
            {(['Superior (tr–cejas)', 'Medio (cejas–sn)', 'Inferior (sn–gn)'] as const).map((label, i) => {
              const heights = thirds ? [thirds.upper, thirds.middle, thirds.lower] : [null, null, null];
              const h = heights[i];
              const r = thirds?.ratios[i] ?? null;
              const pct = r != null ? r * 100 : null;
              const level = pct != null ? evaluate(pct, 33.33, 4) : 'muted';
              return (
                <tr key={label}>
                  <td><b>{label}</b></td>
                  <td className="num">{fmtDist(h)}</td>
                  <td className="num">{pct != null ? `${pct.toFixed(1)} %` : '—'}</td>
                  <td className="num" style={{ color: 'var(--text-dim)' }}>
                    33.3 % ±4
                    <RangeGauge value={pct} ideal={33.33} tol={4} />
                  </td>
                  <td>{pct != null
                    ? badge(level, deltaLabel(pct, 33.33, ' %'))
                    : badge('muted', '—')}</td>
                </tr>
              );
            })}
            {thirds && (
              <tr style={{ borderTop: '1px solid var(--border)' }}>
                <td><b>TOTAL (tr–gn)</b></td>
                <td className="num"><b>{fmtDist(thirds.total)}</b></td>
                <td className="num" style={{ color: 'var(--text-dim)' }}>100 %</td>
                <td className="num" style={{ color: 'var(--text-dim)' }}>—</td>
                <td>
                  {thirdsEval.verdict === 'equilibrado' ? badge('ok',   'Equilibrado')
                    : thirdsEval.verdict === 'sup'    ? badge('warn', 'Predominio sup.')
                    : thirdsEval.verdict === 'medio'  ? badge('warn', 'Predominio medio')
                    : thirdsEval.verdict === 'inf'    ? badge('warn', 'Predominio inf.')
                    : badge('muted', '—')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.45 }}>
          <b>Tercios:</b> tr (trichion) → línea de cabezas de ceja (cb_d–cb_i) →
          sn (subnasal) → gn (gnation). El límite superior/medio es la línea
          blanca que une ambas cabezas de ceja. Ideal: cada tercio ≈ 33.3 % de la
          altura facial total. Si la desviación máxima ≤ 4 pts. % →
          <b> equilibrado</b>; si no, se identifica el tercio dominante.
        </div>
      </div>

      {/* --- 2b. Quintos faciales (5 quintos / 6 verticales) --- */}
      <div>
        <h3>Quintos faciales verticales</h3>
        {fifths ? (
          <table className="ceph">
            <thead>
              <tr>
                <th>Quinto</th>
                <th className="num">Anchura</th>
                <th className="num">% del total</th>
                <th className="num">Ideal</th>
                <th>Eval.</th>
              </tr>
            </thead>
            <tbody>
              {FIFTH_LABELS.map((label, i) => {
                const pct = fifths.ratios[i] * 100;
                const level = evaluate(pct, 20, 2.5);
                return (
                  <tr key={`fifth-${label}`}>
                    <td><b>{label}</b></td>
                    <td className="num">{fmtDist(fifths.widths[i])}</td>
                    <td className="num">{pct.toFixed(1)} %</td>
                    <td className="num" style={{ color: 'var(--text-dim)' }}>
                      20 % ±2.5
                      <RangeGauge value={pct} ideal={20} tol={2.5} />
                    </td>
                    <td>{badge(level, deltaLabel(pct, 20, ' %'))}</td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: '1px solid var(--border)' }}>
                <td><b>TOTAL (lat_d–lat_i)</b></td>
                <td className="num"><b>{fmtDist(fifths.total)}</b></td>
                <td className="num" style={{ color: 'var(--text-dim)' }}>100 %</td>
                <td className="num" style={{ color: 'var(--text-dim)' }}>—</td>
                <td>{badge('muted', '—')}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Coloca los 6 puntos de los quintos: <code>lat_d</code>, <code>ex_d</code>,
            <code> en_d</code>, <code>en_i</code>, <code>ex_i</code>, <code>lat_i</code>.
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.45 }}>
          Los quintos se delimitan con 6 verticales verdes: contorno lateral D →
          exocantión D → endocantión D → endocantión I → exocantión I → contorno
          lateral I. Ideal: cada quinto ≈ 20 % del ancho facial total.
        </div>
      </div>

      {/* Líneas medias verticales: promovido a tarjeta CLAVE al inicio */}

      {/* --- 4. Medidas bilaterales (derecha vs izquierda) --- */}
      <div>
        <h3>Farkas — medidas bilaterales</h3>
        <table className="ceph">
          <thead>
            <tr>
              <th>Medida</th>
              <th className="num">Derecha</th>
              <th className="num">Izquierda</th>
              <th className="num">Simetría</th>
            </tr>
          </thead>
          <tbody>
            <BilateralRow label="Anchura palpebral (en–ex)"     b={f.palpebralWidth}    fmt={fmtDist} />
            <BilateralRow label="Inclinación ojo (vs horiz.)"   b={f.eyeSlant}          fmt={fmtAng} />
            <BilateralRow label="Distancia pronasal–alar (prn–al)" b={f.pronasalAlar}   fmt={fmtDist} />
            <BilateralRow label="Distancia stomion–chelion"     b={f.stomionChelion}    fmt={fmtDist} />
            <BilateralRow label="∠ óculo-oto-nasal (t–en–al)"   b={f.oculoOtoNasal}     fmt={fmtAng} />
            <BilateralRow label="∠ naso-ocular externo (al–n–ex)" b={f.nasoOcularExterno} fmt={fmtAng} />
            <BilateralRow label="∠ separación ojo–eje cara"     b={f.eyeSeparationAng}  fmt={fmtAng} />
            <BilateralRow label="∠ naso-bucal (al–sn–ch)"       b={f.nasoBuccalAng}     fmt={fmtAng} />
            <BilateralRow label="Distancia pupila ↔ eje cara"   b={f.pupilToMidline}    fmt={fmtDist} />
            <BilateralRow label="Altura pupila–subnasal (pu–sn)" b={f.pupilSubnasal}    fmt={fmtDist} />
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.45 }}>
          La columna <b>Simetría</b> compara magnitud D vs I:
          100 % = idénticos, menor = más asimétrico.
        </div>
      </div>

      {/* --- 5. Índice de simetría por zona --- */}
      <div>
        <h3>Índice de simetría facial</h3>
        <table className="ceph">
          <thead>
            <tr>
              <th>Zona</th>
              <th className="num">% simetría</th>
              <th>Eval.</th>
            </tr>
          </thead>
          <tbody>
            <SymmetryRow label="Ocular" pct={sym.ocular} />
            <SymmetryRow label="Nasal"  pct={sym.nasal} />
            <SymmetryRow label="Bucal"  pct={sym.bucal} />
            <tr style={{ borderTop: '1px solid var(--border)' }}>
              <td><b>GLOBAL</b></td>
              <td className="num"><b>{sym.global != null ? `${sym.global.toFixed(1)} %` : '—'}</b></td>
              <td>{symBadge(sym.global, true)}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.45 }}>
          Umbrales: <b style={{ color: '#22c55e' }}>&gt; 90 %</b> simetría excelente ·
          <b style={{ color: '#facc15' }}> 80–90 %</b> simetría leve ·
          <b style={{ color: '#ef4444' }}> &lt; 80 %</b> asimetría marcada.
        </div>
      </div>
    </>
  );
}

// ============ Pequeños componentes auxiliares (Farkas) ============
function GlobalRow({ label, v }: { label: string; v: string }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{v === '—' ? <span style={{ color: 'var(--muted)' }}>—</span> : v}</td>
    </tr>
  );
}

function BilateralRow({
  label, b, fmt,
}: {
  label: string;
  b: BilateralMeasure;
  fmt: (v: number | null) => string;
}) {
  const pct = pairSymmetry(b);
  const lvl = symmetryLevel(pct);
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{b.right == null ? <span style={{ color: 'var(--muted)' }}>—</span> : fmt(b.right)}</td>
      <td className="num">{b.left  == null ? <span style={{ color: 'var(--muted)' }}>—</span> : fmt(b.left)}</td>
      <td className="num">{pct == null
        ? <span style={{ color: 'var(--muted)' }}>—</span>
        : badge(lvl, `${pct.toFixed(0)} %`)}</td>
    </tr>
  );
}

function SymmetryRow({ label, pct }: { label: string; pct: number | null }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{pct != null ? `${pct.toFixed(1)} %` : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
      <td>{symBadge(pct)}</td>
    </tr>
  );
}

function symBadge(pct: number | null, bigText = false) {
  const lvl = symmetryLevel(pct);
  if (pct == null) return badge('muted', '—');
  const text = bigText
    ? (lvl === 'ok' ? 'Excelente' : lvl === 'warn' ? 'Leve' : 'Marcada')
    : (lvl === 'ok' ? 'OK' : lvl === 'warn' ? 'Leve' : 'Asim.');
  return badge(lvl, text);
}
