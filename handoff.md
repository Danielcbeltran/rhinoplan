# RhinoPlan — Handoff
*Actualizado: agosto 2026 (sesión: persistencia de simulación + foto simulada + fix aplanar dorso + QA clínico). Documento personal de Daniel — NO va a ningún repo.*

---

## 1. Qué es y dónde vive

**RhinoPlan**: PWA de planificación y documentación quirúrgica de rinoplastia. React + Vite (App.jsx único, JS), Supabase (proyecto `tzmbybwytfpaqaajwumz`), Vercel (auto-deploy al hacer push), Creem (pagos), Resend (email). 7 idiomas vía `translations.js` + `LanguageContext.jsx`.

| Repo (GitHub `Danielcbeltran`) | Despliegue |
|---|---|
| `rhinoplan` | app.rhinoplan.app |
| `rhinoplan-landing` | www.rhinoplan.app (incluye `api/checkout.js` y `api/webhook.js`) |

**Módulo de cefalometría/perfilometría**: fusionado en `src/cefalometria/` del repo `rhinoplan`.
- Raíz del módulo: `App.tsx`, `Entry.tsx`, `i18n.ts`, `cephalometry.ts`, `rhinoplasty.ts`, `bridge.ts`, `index.css`
- `src/cefalometria/components/`: `CanvasArea.tsx`, `Toolbar.tsx`, `LayersPanel.tsx`, `ResultsTable.tsx`, `RhinoplastyPanel.tsx`, `AnnotationPanel.tsx`, `CameraCapture.tsx`, `Icon.tsx`
- ⚠ El nombre `cefalometria/` se quedó corto (el módulo ya incluye simulación, anotación, informes). Renombrar a `perfilometria/` es deuda técnica menor — requiere tocar imports; no urgente.
- ⚠ NUNCA dejar copias duplicadas de un componente en raíz y en `components/` — ya causó una desincronización (slider que se movía sin efecto). App.tsx importa de `./components/`.
- ⚠ `bridge.ts` lo importa TAMBIÉN App.jsx (fuera del chunk del módulo): NUNCA importar `rhinoplasty.ts` u otro código del módulo desde bridge — arrastraría el módulo al bundle principal. Por eso los campos de simulación en bridge son tipos opacos (`Record<string, unknown>`).

**Flujo de trabajo**: GitHub Desktop (Windows 10, `C:\Users\dcbc8\Downloads\rhinoplan-app\src\`) o subida web desde iPad → push → Vercel. **El service worker cachea agresivo**: tras cada deploy, probar en incógnito o limpiar SW (DevTools → Application → Service Workers → Unregister + Clear site data). Varias "regresiones" fantasma han sido solo caché.

**Con Claude**: el entorno se reinicia entre sesiones — re-subir los archivos que se vayan a tocar. Claude entrega archivos COMPLETOS listos para pegar + summary de commit. ⚠ Si una entrega toca varios archivos (p. ej. App.tsx que importa algo nuevo de bridge.ts), subir TODOS en el mismo push — un archivo suelto rompe el build o desincroniza en silencio.

---

## 2. Planes y pagos (Creem) — COMPLETO

- Gratis: 3 pacientes · **Pro $29/mes** (`prod_77Edh860PtALnRskMGpnP`) · **Plus $49/mes con cefalometría** (`prod_1GhmbZie1e3Qw584kZa7gC`).
- Webhook con **upsert atómico** (requiere constraint `UNIQUE subscriptions_user_id_unique`). El patrón SELECT-then-INSERT causaba condición de carrera — no volver a él.
- **PENDIENTE**: verificar un cobro real end-to-end con el primer cliente de pago.

---

## 3. Traducción del módulo — COMPLETA Y VERIFICADA

Sistema propio del módulo: `src/cefalometria/i18n.ts` con `LangContext` + `useT()`, diccionarios `const ES` (fuente) y `const EN`, **fallback a español**. `Entry.tsx`: el módulo va en **inglés por defecto** para todos los idiomas; español solo si `raw === 'es'`.

Traducido TODO: Toolbar, App (cabecera, stepper, banners, toasts), LayersPanel, ResultsTable (~173 cadenas: medidas, veredictos, Goode, Gunter, Farkas, simetría), RhinoplastyPanel completo, AnnotationPanel, CanvasArea (herramientas, hints, **etiquetas dibujadas sobre la foto** vía diccionarios `CL`/`LL`/`GUNTER_SHORT` pasados como parámetro a las funciones de dibujo externas), y los **dos PDFs** (perfil y frontal — son bloques de generación separados).

**Excepción deliberada**: la capa de integración con el paciente (guardarEnPaciente, picker de fotos, botón "Foto simulada", sus toasts) va **hardcodeada en español**. Si algún día se traduce, va toda junta en una sola tanda con `i18n.ts` — no gotear claves sueltas.

### Lecciones críticas de i18n (leer antes de tocar traducciones)

1. **El fallback esconde errores**: si una clave existe en el código pero falta en el bloque EN, NO da error — cae al español silenciosamente. Compila, pasa typecheck, y se ve en español.
2. **BUG RECURRENTE de inserción**: las claves ES usan comilla simple (`rpRadius: 'radio'`) y las EN a veces doble (`rpRadius: "radius"`). Un replace con ancla de comilla equivocada falla en silencio → clave solo en ES → se ve en español. Pasó con 10 claves del panel de simulación.
3. **Detección**: auditoría ES-vs-EN comparando sets de claves de ambos bloques (script Python con regex `^\s*'?([\w-]+)'?\s*:` sobre los tramos `const ES`→`const EN`→`const DICTS`). Última cuenta: **667/667, cero desajustes**. Correr tras CADA tanda de claves nuevas.
4. Funciones fuera del componente React (drawProfileGuides, drawFrontalGuides, drawRhinoplastySplit, evalLabel...) no ven `useT` → pasarles diccionario de labels como parámetro.
5. Shadowing de `t`: en App.tsx la traducción es `tt`; en ResultsTable los subcomponentes necesitan su propio `const t = useT()`.
6. Reemplazos de texto que no encajan exactos → frases mitad y mitad. Verificar en pantalla siempre.

La app principal (`translations.js`, 7 idiomas) se audita con `node check-translations.js App.jsx translations.js`.

**Landing** (`index.html` raíz de rhinoplan-landing): sección funciones reescrita — 3 destacados `.hcard` (Cefalometría / Simulación / Historia visual) + 6 `.fcard` de apoyo (incluida "Medición libre"). 15 claves nuevas × 7 idiomas, verificadas ejecutando el diccionario. `f6Desc` aclara "Módulo de cefalometría en español e inglés" (no prometer de más).

---

## 4. App principal — mejoras recientes

- **Etiquetas de color siguen el idioma**: `getDefaultColors(t)` estaba bien, pero localStorage `rhinoplan_colors` Y Supabase `user_settings.colores` pisaban con labels viejos en español. Fix doble: refrescar labels de los primeros N colores POR POSICIÓN (conservando hex) tanto al leer localStorage como en `loadColors()`; useEffect `[lang]` re-sincroniza en caliente. Colores personalizados (posición ≥ 5) se respetan.
- **Carga rápida de pacientes**: `loadPacientes` bajaba TODAS las columnas (fotos base64 = MB). Fix: `PACIENTE_LIST_COLS = "id,nombre,documento,tipo_doc,fecha,created_at"` + `abrirPaciente(p)` que trae la fila completa al abrir (estado `abriendoPacId`, indicador `t.loading`, error `t.loadPatientError` — claves en 7 idiomas). El límite de 3 pacientes y el buscador usan `.length` y nombre/documento → intactos.
- **Fotos con etiqueta (proyección simulada)**: las fotos ahora admiten campo opcional `etiqueta` (p. ej. "Simulación"). `normFotos` la CONSERVA al recargar (sin esto la marca médico-legal se perdía). Badge verde en miniaturas del modal Y en el lightbox al ampliar. `savePaciente(overrideCefalo, overrideFotos)`: segundo parámetro por la misma razón que el primero — setState asíncrono; quien acaba de añadir una foto pasa el conjunto nuevo explícito para persistir ya.
- **`onAddFoto` cableado** en el montaje del módulo: agrega la foto al grupo de su `momento`, conserva la etiqueta y persiste de inmediato (mismo patrón que `onSave`).
- **Causa de fondo pendiente**: migrar fotos base64 → Supabase Storage (URL en la fila). Anotado junto a HIPAA.

---

## 5. Módulo — funcionalidad y simulador

### Estado general
- **Modo anotación OCULTO**: flag `SHOW_ANNOTATION = false` en App.tsx del módulo (3 usos: definición + botón + render del panel). Es la herramienta interna de captura de dataset; reactivar a `true` cuando haga falta entrenar.
- **Columna Δ** = desviación sobre el **BORDE** del rango normal (0 si dentro), no vs el promedio. `deltaLabel(..., tol)` en ResultsTable + helper `edgeDelta` en el PDF. Ej.: nasolabial 114.8° (90–110) → +4.8°; Goode 0.66 (0.55–0.60) → +0.06.

### Persistencia de la simulación en mediciones — HECHO
- `MedicionEstado` (bridge.ts) gana campos opcionales retrocompatibles: `freeAngles` (¡los ángulos libres de 3 clicks tampoco se persistían!), `rhinoSim` y `rhinoHandles` (tipos opacos — ver ⚠ de la sección 1).
- `extraerEstado(ms, rhino?)`: 2º parámetro opcional con la simulación (vive FUERA del ModeState). Llamadas antiguas sin él siguen compilando. Solo se adjunta en **perfil** (en frente no hay simulación).
- `estadoAParche` restaura `freeAngles` con fallback `?? []` — de paso cerró una fuga: los ángulos libres de la foto anterior contaminaban la restaurada.
- **Rehidratación al restaurar** (cargarFotoPaciente): merge `{...DEFAULT_RHINO_SIM, ...guardado}` (mediciones de otra versión no rompen: sliders nuevos caen a 0), historial de deshacer limpio, y la simulación se **auto-activa** si trae cambios reales — reconstruir la simulación al reabrir ES verla. Mediciones de formato viejo caen limpiamente a simulación en cero.
- **BUG latente corregido**: `loadNewImageSrc` reseteaba deformadores pero NO sliders — al cargar otra foto quedaban aplicados los valores de la anterior. Ahora `setRhinoSim(DEFAULT_RHINO_SIM)` también.

### Export y foto simulada — HECHO
- **El export PNG/PDF SÍ incluye el warp** (sospecha infundada): el compositor copia el canvas principal, que ya lleva la foto deformada. Es WYSIWYG: con "Deformar foto" apagado exporta la original con la línea verde (coherente).
- **`withCleanCanvas`**: si el modo edición de deformadores está activo al exportar, las flechas ámbar están pintadas EN el canvas principal y salían en el PNG/PDF. Se apaga la edición y se difiere 150 ms (ciclo de React + frame) para repintar limpio. Exportar = terminar de editar.
- **Botón "Foto simulada"** (grupo de exportación, solo dentro de RhinoPlan con `onAddFoto` cableado; habilitado con foto del paciente activa + perfil + simulación con cambios reales): compone la proyección LIMPIA (imagen + warp, sin línea verde/divisor/flechas/anotaciones — médico-legalmente no debe llevar superposiciones), recomprime a ~1600 px JPEG 85 % (150–300 KB, no los MB del canvas) y la guarda como foto del paciente con `etiqueta: 'Simulación'` en el mismo `momento` que la foto de origen. Badge visible en el picker del módulo y en la app principal.
- **`buildPhotoWarpField`** (CanvasArea): la construcción del campo de warp fotográfico está FACTORIZADA en una función pura compartida entre el render y el compositor `simPhotoComposerRef` — un solo sitio que mantener. La caché de recorte de `drawWarpedNoseMesh` se comparte sin conflicto (misma imagen y bbox).
- `nuevaFotoId()` exportado de bridge.ts (mismo formato `f_...` que App.jsx).

### Motor de warp (rhinoplasty.ts) — reescrito
- **Contorno por PROYECCIÓN PARAMÉTRICA** sobre polilínea ordenada (`field.contour`, submuestreo 120 vértices): lerp del desplazamiento A LO LARGO + falloff smoothstep con la distancia PERPENDICULAR. Error 0.0000 px verificado sobre toda la curva. El esquema anterior (controles IDW sueltos + falloff a distancia mínima) producía **festón/muescas periódicas** de 2–5 px — no volver a él.
- **Deformadores libres = capa ADITIVA independiente** (`field.handles`, kernel smoothstep propio, el mismo que `applyHandlesToSegment` sobre la línea verde): precisos (el centro mueve exactamente lo arrastrado), locales estrictos (cero fuera del radio). Mezclarlos en el IDW del contorno los diluía.
- `handleRadius`: 0.18 → **0.12×** tamaño nasal. `splitHandlesBySegment` umbral 0.8 → **1.0** (si el círculo toca el borde, se funde al segmento; línea y foto se mueven juntas).
- **Aplanar dorso POR VÉRTICE — fix ago 2026**: al 100 % los CONTROLES (Rh, Sp) aterrizaban exactos en la recta N'–Pn', pero el contorno denso ENTRE controles heredaba deltas interpolados que no saben de la altura propia de cada vértice sobre la cuerda → **giba residual de ~5.4 px** (el pico real suele caer entre N y Rh). Fix: `warpSegmentBySilhouettes` gana 4º parámetro opcional `dorsumFlatten01` (retrocompatible) — tras los deltas, cada vértice del tramo dorsal (entre las marcas de N y Pn, capturadas ANTES del unshift de anclas) se proyecta ÉL MISMO contra la cuerda mezclado por f. Al 100 %: 0.0000 px verificado. Los dos call sites de CanvasArea (línea verde + campo fotográfico) pasan `rhinoSim.dorsumFlatten / 100` — línea y foto quedan planas JUNTAS. Matiz documentado: a valores intermedios el tramo entre controles queda algo más aplanado que los controles (monótono, exacto en 0 %/100 %; clínicamente, la lima rebaja de más entre apoyos). Lo destapó una Línea N–Pn sobre la verde — ver QA clínico abajo.

### Deformadores — UX
- **Se BLOQUEAN al soltar** (`locked: true`): el hit-test los ignora, se dibujan atenuados (0.45, sin círculo de influencia). **Candado 🔒/🔓 en el panel** para desbloquear (`onToggleHandleLock` en App); ✕ borra. Al re-arrastrar y soltar, se vuelve a bloquear.
- **Sin flush al soltar** (`onMove.cancel()`): "lo que ves es lo que queda" — el flush aplicaba la posición real del dedo con lag y causaba un salto a deformación mayor.
- Malla del warp: `const G = fast ? 10 : 40` en `drawWarpedNoseMesh` (10 durante arrastre para fluidez en iPad; 40 al asentarse, 250 ms tras el último cambio).
- Casilla "Mostrar deformadores" ELIMINADA: se ven cuando el modo edición está activo, punto.

### Medición
- **Línea y Ángulo (fuera de simulación) conectan puntos anatómicos COLOCADOS y VISIBLES** — no dibujan libre. Un punto oculto en LayersPanel NO es blanco válido. El trazo libre es **Medir** (regla, 2 clicks donde sea); Ángulo solo es libre (3 clicks) dentro de simulación. Esto confundió al propio Daniel → desde ago 2026 el fallo YA NO es silencioso: **anillo ámbar** efímero en el punto del toque fallido (800 ms, radio final ≈ umbral de captura real — el anillo "enseña" cuánto acercarse) + **flash de la barra de hint** (que ya muestra la instrucción traducida — cero claves i18n nuevas). Animación por refs + rAF sin setState por frame (disciplina Apple Pencil); se limpia al cambiar de herramienta/modo.
- **Medir y Ángulo funcionan EN SIMULACIÓN** (el gate de deformadores cede si `tool` es measure/angle/erase). En simulación, Ángulo = **3 clicks LIBRES** (tipo `FreeAngle {p1,p2,p3}` — p2 vértice); fuera de simulación sigue siendo por puntos anatómicos (que en simulación medirían la anatomía original, no la proyectada). Estado por foto en App (`freeAngles` en modeStates, `setFreeAngles`, transformado en rotación/volteo con tf/fx; `cur.freeAngles ?? []` para estados antiguos). Erase también los borra. **Ahora se persisten en la medición** (sección de persistencia).
- **Marcas finas**: `drawTick` = cruz de trazo 1 px con halo 2.5, brazos 6 px (8 en vértices), hueco central 1.5 px que deja ver el píxel medido. `drawOffsetLabel` desplaza la etiqueta PERPENDICULAR a la línea. Líneas de medición 1.2 px continuas (nada discontinuo). Línea de simulación verde: 1.8 px (antes 3.2), sombra 3, nodos 3/1.8.
- **Lag del Apple Pencil ELIMINADO**: la previsualización viva (línea elástica + grados) se pinta DIRECTO en el overlay (`anno-overlay`) sin setState — refs `livePreviewRef` + `previewStateRef`, `drawLivePreview` llamado al final de `redrawOverlay`, `getCoalescedEvents()` para la última muestra (~120 Hz), hover saltado durante la medición. Antes cada muestra re-renderizaba el canvas entero.

### Punto Infrapunta (It) y definición de punta
- Punto **`It`** (Infrapunta / Infratip, `#fda4af`, grupo p-nariz, **OPCIONAL**, entre Pn y Cm) en `PointId` y puntos de cephalometry.ts; claves `name-It`/`desc-It`.
- `refineNoseTip`: **REQUIERE It** (sin él no aplica nada). Mueve suprapunta (dorsales) + It hacia Pn; **Cm ya no se toca**. Peso por DISTANCIA a Pn relativa a la longitud N–Pn con `TIP_ZONE = 0.5` y smoothstep → el rhinion queda en 0.00 px exactos (el peso por índice anterior movía el dorso). Slider ±25 % (interno ±60 %, `t = refinement * 0.024`).
- It sigue proyección global y rotación (`newIt` en computeSimulatedNose; columela-proj/lift a la mitad), entra en el warp entre Pn y Cm, y en `applyHandlesToSilhouette` (índices desplazados si `hasIt`).
- **Bloqueo del slider**: `RhinoSlider.requires?: PointId[]` (`tipRefinement: ['It','Sp']`) + `missingPointsFor()` en rhinoplasty.ts. En RhinoplastyPanel, **RED DE SEGURIDAD** `SLIDER_REQUIRES = {tipRefinement:['It','Sp']}` local con acceso tolerante `(s as {requires?: PointId[]}).requires ?? SLIDER_REQUIRES[s.id] ?? []` → funciona aunque rhinoplasty.ts desplegado sea de otra versión (lección: la desincronización de archivos dejó el slider movible sin efecto ni bloqueo). Estado bloqueado: 🔒 en el label, opacity 0.45 + grayscale + pointerEvents none + disabled, aviso naranja nombrando SOLO los puntos que faltan. **Si se borra un punto requerido, el valor del slider se RESETEA a 0** (decisión de Daniel; useEffect que vigila points).
- **Colocación en zonas densas**: con un punto ELEGIDO en la lista (tool point + activePointId), el gesto es **EXCLUSIVO** suyo — el clic siempre coloca/recoloca (nunca salta a un vecino), pointerdown no agarra vecinos, hover no los resalta. Sin nada elegido, comportamiento normal. (La 1.ª versión exigía "no colocado" y fallaba al recolocar — la regla final es sin excepción.)
- **Puntos anatómicos un 45 % más pequeños** (27 → 14.8 px de diámetro; radios 7.4/6.4/5.2, halo 11.6/9.6). El radio de CAPTURA táctil no cambió (14/16).
- **Contador del Toolbar, opción A**: `21/21` (obligatorios, marca "completo") + badge atenuado `+N/2 OPC.` con los opcionales (Nk e It) aparte.

### QA clínico del simulador (correr tras CADA cambio del motor)

**Qué es**: control de calidad del motor usando las propias herramientas de medición (Línea / Ángulo / Medir) como instrumento independiente. Cada slider hace una promesa geométrica escrita en el código; aquí se verifica sobre una foto REAL con puntos colocados, calibrada, en ~10 min. Complementa (no reemplaza) la verificación numérica con `node`: los scripts prueban funciones aisladas, esto prueba el pipeline completo (motor → warp → render → ojos).

**Origen**: así se cazó el bug de "aplanar dorso" (ago 2026) — los tests numéricos verificaban los puntos de CONTROL (exactos), pero el contorno denso ENTRE controles conservaba 5.4 px de giba residual al 100 %. Una Línea N–Pn sobre la verde lo destapó en segundos. Si Daniel puede medir una promesa rota, un cirujano cliente también.

**Regla de oro**: la mitad de los checks no miden lo que el slider HACE sino lo que NO debe tocar. Los bugs del motor casi siempre son fugas — un cambio que se derrama fuera de su zona (ej.: el peso por índice del refinamiento antiguo movía el dorso). Las fugas son invisibles a ojo y triviales de medir.

Protocolo (foto de perfil real, 21/21 puntos, calibrada, contorno trazado):

| Slider / gesto | Promesa (del código) | Cómo medir | Esperado |
|---|---|---|---|
| Aplanar dorso 100 % | Dorso sobre la recta N–Pn | Línea de N a Pn superpuesta a la verde | Coinciden en TODO el tramo (0.00 px) |
| Aplanar dorso 0 % | Identidad | Verde vs contorno original | Idénticas |
| Rotación de punta +10° | Δ nasolabial = valor del slider (calibrado numéricamente) | Ángulo libre sobre el nasolabial antes/después | Diferencia ≈ 10° |
| Rotación de punta (2ª promesa) | Distancia pliegue alar–Pn se CONSERVA (pivote en AC) | Medir AC–Pn antes/después | Idéntica al 0.1 mm |
| Refinamiento de punta | Rhinion en 0.00 px — el dorso no se mueve | Regla desde referencia fija hasta Rh en la verde, mover slider | La medida no cambia |
| Rhinion / suprapunta (zona) | Efecto LOCAL: N y Pn quietos | Regla desde referencia fija a N y a Pn | No cambian |
| Deformador libre | El centro mueve EXACTO lo arrastrado; cero fuera del radio | Medir desplazamiento de la verde en el centro vs longitud de flecha; medir un punto fuera del círculo | Iguales; quieto |
| Proyección / columela / subnasal | Desplazamiento en mm = valor del slider | Medir con foto calibrada | Coincide |

Cualquier promesa que no aguante la medición = bug de credibilidad → arreglar ANTES de que lo encuentre un cliente con las mismas herramientas que se le venden.

---

## 6. HECHO esta sesión / pendiente que deja

**Hecho** (3 commits): ① persistencia de simulación en mediciones + rehidratación + reset de sliders al cambiar foto + export sin flechas + botón "Foto simulada" con etiqueta médico-legal (tocó bridge.ts, App.tsx, CanvasArea.tsx, App.jsx); ② aviso de toque fallido en Línea/Ángulo (CanvasArea.tsx); ③ aplanar dorso por vértice (rhinoplasty.ts + CanvasArea.tsx).

**Pendiente que deja esta sesión**:
- Correr el QA clínico completo (tabla de la sección 5) sobre una foto real — la fila 1 es la prueba de aceptación del fix del aplanado.
- Decisión de producto abierta: la simulación se AUTO-ACTIVA al restaurar una medición con cambios. Si molesta, es un cambio de una línea (restaurar valores sin activar). Ojo: con simulación activa, Ángulo pasa a 3 clicks libres y Línea dibuja sobre la anatomía original — comportamiento por diseño que puede sorprender.

---

## 7. Horizonte

- **Curso internacional**: módulo en inglés listo; usarlo.
- **Validación con cirujanos reales** (colega de EE. UU., Cirujano A): enseñar cefalometría + simulador y preguntar directamente si pagarían $49/mes. El producto avanzó mucho; la validación de mercado no se ha movido. ← lo más importante. La "Foto simulada" etiquetada es argumento de venta directo vs Rhinoplanner.
- **Verificar cobro real de Creem** con el primer cliente.
- **HIPAA para EE. UU.**: Supabase Team + HIPAA add-on (~$350/mes BAA), RLS, MFA, audit logging, plantilla BAA para cirujanos-clientes. Junto con la migración de fotos a Storage. Vanta/Drata en consideración.
- Capacitor / App Store (largo plazo). Reactivar anotación (`SHOW_ANNOTATION = true`) cuando toque capturar dataset.
- Marketing: Google Workspace para contact@rhinoplan.app, Instagram @rhinoplan.app, demo reel, cold email.

---

## 8. Cómo trabajar con Claude en este proyecto

- Entorno se reinicia entre sesiones → subir los archivos a tocar al empezar. Entregas multi-archivo: subir todos en el mismo push (sección 1).
- Validaciones estándar: `tsc --noEmit --strict --skipLibCheck --jsx react-jsx --target ES2020 --moduleResolution bundler --module ESNext --esModuleInterop` (recrear `src/` con stubs de Icon/App/profileContour si hace falta; ignorar errores de los stubs — mejor aún: comparar errores del original vs el modificado, solo importan los NUEVOS). App principal: Babel presets react+env y `check-translations.js`. Cambios de motor: verificación numérica con `node` replicando la función + **QA clínico** (sección 5) en la app.
- Tras CADA tanda de i18n del módulo: auditoría ES-vs-EN (sección 3).
- Entregas: archivos completos con ruta de destino explícita + summary de commit de una línea.
- Convención de colores de diagramas (Gunter): azul=cartílago, amarillo=hueso, verde=injertos, rojo=resecciones, negro=suturas. PDF con jsPDF.
