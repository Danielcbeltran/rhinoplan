# RhinoPlan — Handoff Document

## 1. Resumen del Proyecto

**RhinoPlan** es una aplicación web (PWA) de planificación quirúrgica para rinoplastia. Permite a cirujanos anotar 6 vistas anatómicas, gestionar pacientes, adjuntar fotos pre/postquirúrgicas, guardar plantillas y exportar reportes PDF profesionales.

- **Desarrollador:** Daniel Camilo Beltran (Bogotá, Colombia)
- **Dominio:** rhinoplan.app (Namecheap, ~$13/año)
- **Stack:** React + Vite, Supabase (backend/auth/db), Vercel (deploy), Creem (pagos), Resend (correos transaccionales)
- **Idiomas:** 7 — Español, Inglés, Francés, Portugués, Alemán, Italiano, Turco
- **Modelo de negocio:** Freemium con suscripción Pro a **$29 USD/mes** (subido desde $14.99 el 23/jun). Roadmap: tier superior "RhinoPlan Medidas / Cefalometría" (sin construir aún)

---

## 2. Repositorios (GitHub)

### App principal
- **Repo:** `github.com/Danielcbeltran/rhinoplan`
- **Deploy:** `app.rhinoplan.app` (dominio propio, Vercel auto-deploy desde `main`). `rhinoplan.vercel.app` sigue activo en paralelo como respaldo
- **Archivos clave:**
  - `src/App.jsx` — App principal (auth con confirmación de email, dibujo, pacientes, Pro/trial, checkout vía API). **Disclaimer médico bajo el formulario de login**
  - `src/translations.js` — 90+ claves × 7 idiomas (incluye `confirmEmailSent`, `emailNotConfirmed`, **`medicalDisclaimer`**; bug de `passwordMin` duplicado corregido)
  - `src/LanguageContext.jsx` — Context provider i18n con lectura de `?lang=` URL param
  - `src/main.jsx` — Entry point con LanguageProvider
  - `public/manifest.json` — PWA manifest
  - `public/sw.js` — Service Worker **v2**: network-first, solo cachea recursos del mismo origen (los datos de Supabase NO se guardan en caché del navegador), solo respuestas exitosas
  - `public/icon-192.png`, `public/icon-512.png` — Iconos PWA

### Landing page
- **Repo:** `github.com/Danielcbeltran/rhinoplan-landing`
- **Deploy:** `rhinoplan.app` / canónico `www.rhinoplan.app` (Vercel, auto-deploy desde `main`)
- **Archivos clave:**
  - `index.html` — Landing multiidioma. Sin "usage claims". **Disclaimer médico en footer (7 idiomas)**. Enlace **Contacto → mailto:contact@rhinoplan.app** (antes `href="#"`). Enlace al DPA en footer. Todos los enlaces a la app apuntan a **app.rhinoplan.app**
  - `privacy.html` — Política de privacidad v2: **11 secciones**, 7 idiomas. Cubre roles responsable/encargado, subencargados (Supabase/AWS, Vercel, Creem, Resend), Ley 1581, GDPR/LGPD/KVKK, retención, no-IA, enlace al DPA
  - `terms.html` — Términos con **10 secciones**: la 9 incorpora el DPA como parte integral, aceptado al crear cuenta
  - `dpa.html` — **Acuerdo de Encargo de Tratamiento de Datos** (15 cláusulas, ES+EN vinculantes). Incluye cláusula 14: NO es un BAA — prohibido usar con pacientes HIPAA (EE. UU.) hasta nuevo aviso
  - `install.html` — Instrucciones PWA
  - `api/webhook.js` — Webhook Creem→Supabase **con verificación de firma HMAC-SHA256** (`creem-signature`, body crudo, `timingSafeEqual`). Vincula por `user_id` de metadata con fallback a email. Columnas `provider_*`
  - `api/checkout.js` — Crea checkout sessions de Creem vía API: valida el token Supabase del usuario, pasa `metadata: { user_id }` y email, devuelve URL. CORS incluye **app.rhinoplan.app**. `success_url` → `https://app.rhinoplan.app/?upgrade=success`. **`TEST_MODE = false` (producción)**

---

## 3. Servicios y Cuentas

### Supabase (Backend)
- **URL:** `https://tzmbybwytfpaqaajwumz.supabase.co`
- **Plan:** Free — ⚠️ ACTUALIZAR A PRO (~$25/mes) cuando Creem apruebe y empiecen los cobros: elimina pausas por inactividad y mejora backups. Con datos reales de pacientes es prerrequisito
- **Tablas:**
  - `pacientes` — RLS por `user_id`
  - `plantillas` — RLS por `user_id`
  - `subscriptions` — columnas: `email`, `user_id`, `status`, `trial_ends_at`, **`provider_customer_id`**, **`provider_subscription_id`** (renombradas de `lemon_*` el 10/jun)
- **RLS en subscriptions:** solo 2 políticas — "Users can insert own trial" (INSERT) y "Users can read own subscription" (SELECT). La política redundante de service fue eliminada (el webhook usa service key que bypasea RLS)
- **Auth:** Email/password **con confirmación de email ACTIVADA** (10/jun). **Recuperación de contraseña funcionando (26/jun)** por dos vías: (a) "¿Olvidaste tu contraseña?" en el login → correo con enlace → pantalla aislada de nueva contraseña; (b) "Cambiar contraseña" dentro de Ajustes para usuarios con sesión
- **Manejo de enlaces de Supabase:** la app ahora procesa el `#access_token` que llega en la URL (magic link, recovery, confirmación de email). El recovery se maneja en un **wrapper de arranque** (`RhinoPlanner` → `RecoveryScreen` aislado vs `RhinoPlannerMain`) para no montar el canvas y evitar render en blanco
- **SMTP custom:** Resend — host `smtp.resend.com`, **puerto 587** (¡465 produce timeout!), user `resend`, password = API key de Resend
- **Site URL (Auth → URL Configuration):** `https://app.rhinoplan.app` · **Redirect URLs:** `https://app.rhinoplan.app/**` (+ vercel.app como fallback). Actualizado en la migración de dominio (16/jun)
- **Filas de prueba:** eliminadas (quedó solo la cuenta real de Daniel)

### Resend (Correos transaccionales) — NUEVO
- **Dominio verificado:** `rhinoplan.app` (región São Paulo)
- **DNS en Namecheap:** TXT `resend._domainkey` (DKIM), MX `send` (priority 10), TXT `send` (SPF), TXT `_dmarc` — todos en subdominios, no chocan con el MX de Google del dominio raíz
- **API key:** `supabase-smtp` — Sending access, solo dominio rhinoplan.app. Pegada en SMTP de Supabase
- **Remitente:** `noreply@rhinoplan.app`
- **Plan free:** 3,000 correos/mes
- **Pendiente cosmético:** personalizar plantilla del correo de confirmación (hoy sale la de Supabase en inglés)

### Vercel (Deploy)
- **Proyecto 1:** `rhinoplan` → `rhinoplan.vercel.app`
- **Proyecto 2:** `rhinoplan-landing` → `www.rhinoplan.app` (canónico con www)
- **Variables de entorno (rhinoplan-landing, Production):**
  - `SUPABASE_SERVICE_KEY` (revisar etiqueta "Needs Attention" — marcar como Sensitive)
  - `CREEM_WEBHOOK_SECRET` (Sensitive) — secret de firma del webhook
  - `CREEM_API_KEY` (Sensitive) — para crear checkout sessions

### Namecheap (Dominio)
- DNS: A `76.76.21.21`, CNAME www → `cname.vercel-dns.com`, MX Google (`@`), + 4 registros de Resend (ver arriba)

### Creem (Pagos)
- **Tienda:** RhinoPlan · **Producto:** RhinoPlan Pro **$29/mes** (`prod_77Edh860...`; el product_id no cambió al editar precio)
- **Producto producción:** `prod_77Edh860PtALnRskMGpnP` · **test:** `prod_2eCcODskMCdbcSKMVc5LXP`
- **Checkout:** la app llama a `https://www.rhinoplan.app/api/checkout` (⚠️ con www; sin www el POST muere en la redirección). `success_url` → `app.rhinoplan.app`
- **Webhook:** `https://rhinoplan.app/api/webhook` con eventos checkout.completed, subscription.active/paid/canceled/expired. Firma verificada
- **API key:** `rhinoplan-checkout` (Full Access, producción) — en Vercel
- **Onboarding: ✅ COMPLETO Y APROBADO (17/jun).** Los 5 pasos en verde: detalles de producto ✓ · KYC/KYB ✓ · cuenta bancaria ✓ · Review by Creem Team ✓ · **Payouts Enabled ✓**. Requirió 2 rondas de "Cambios solicitados": (1) disclaimer médico, (2) arreglar enlace contacto + migrar a dominio propio app.rhinoplan.app
- **Prueba de pago real: ✅ COMPLETA (20/jun).** Pago $14.99 (tarjeta ···4874) → webhook → Pro activado automáticamente → verificado en Supabase (user_id `2dda6891...` vinculado, `cust_7PSjKrPjApnKJGpCaWzilv`, `sub_2v7eGJsTNHLj2xbWbFnQiF`, status active). Luego cancelación inmediata → Pro revocado automáticamente → reembolso solicitado. **Ciclo completo activación/revocación verificado en producción**
- **Payouts:** 2 veces/mes (día 1 y 15), mínimo $50, comisión payout 7 USD o 1% (la mayor). Comisión por transacción 3.9% + $0.40

### Google Workspace ✅ RESUELTO
- `contact@rhinoplan.app` — acceso recuperado (11/jun). Entrega de correo externo verificada (recibe correos de prueba). Es el correo de contacto en Creem Business Details y en las páginas legales — coincidencia que Creem exige

---

## 4. Flujo de Pagos (arquitectura actual)

1. Usuario hace clic en "Actualizar a Pro" en Settings
2. App envía POST a `https://www.rhinoplan.app/api/checkout` con `Authorization: Bearer <rhinoplan_token>`
3. `checkout.js` valida el token contra Supabase Auth, crea checkout session en Creem con `metadata: { user_id }` y email prellenado, devuelve `url`
4. App redirige al checkout de Creem
5. Al pagar, Creem envía evento firmado al webhook
6. `webhook.js` verifica la firma HMAC → busca la suscripción por `user_id` (fallback email) → upsert con `status: active`
7. `checkPro()` en la app detecta el estado Pro

**Eventos que activan Pro:** checkout.completed, subscription.active, subscription.paid
**Eventos que desactivan:** subscription.canceled, subscription.expired
**Webhook sin firma válida → 401** (el botón "Send test event" de Creem fallará: es lo esperado)

---

## 5. Autenticación (flujo actual)

1. Registro con email/password (mín. 6 caracteres). Si el email YA existe, Supabase NO reenvía confirmación (revisar en Auth→Users antes de diagnosticar "no llega el correo")
2. **Confirmación de email obligatoria**: la app muestra mensaje verde "Cuenta creada. Revisa tu correo..." y pasa a la pestaña login. El correo llega de noreply@rhinoplan.app vía Resend
3. Login sin confirmar → mensaje "Tu correo aún no está confirmado..."
4. Tokens en localStorage: `rhinoplan_token`, `rhinoplan_user` + refresh token; renovación automática al expirar (1h)
5. checkPro consulta `subscriptions` por email (RLS limita a filas propias por user_id)

---

## 6. Paquete Legal (completado 10/jun)

- **privacy.html (11 secciones):** roles responsable/encargado, datos recopilados, subencargados, seguridad, retención, derechos (Ley 1581 + SIC, GDPR, LGPD, KVKK según idioma), responsabilidad del profesional, no-IA, cookies
- **dpa.html (15 cláusulas, ES+EN):** contrato de encargo — instrucciones, confidencialidad, seguridad, subencargados con derecho de oposición, transferencias, notificación de incidentes, supresión, auditoría vía SOC 2/ISO de proveedores, **cláusula anti-HIPAA**, aceptación al crear cuenta
- **terms.html (10 secciones):** sección 9 incorpora el DPA como parte integral
- ⚠️ Antes de escalar (clínicas grandes / EE. UU.): revisión por abogado colombiano especialista en datos. Para entrar a EE. UU.: Supabase Team + HIPAA add-on, BAA con Supabase, BAA propio para clientes, MFA, audit logging

---

## 7. Monetización

- **Gratis:** 3 pacientes, **0 plantillas propias** (puede usar las predefinidas, pero NO guardar las suyas — cambiado 23/jun), sin fotos. Límite en App.jsx: `userTemplates.length>=0`
- **Pro $29/mes:** ilimitado + plantillas propias + fotos + PDF completo
- **Tier futuro (roadmap, NO construido):** "RhinoPlan Medidas / Cefalometría" — mediciones cefalométricas (puntos de referencia, ángulos, distancias, calibración sobre imagen). Validar con cirujanos ANTES de invertir en desarrollo; es buena pregunta para las primeras entrevistas (¿pagarían más por esto?)
- **Trial 30 días:** activación manual con botón en Settings. Con confirmación de email ahora es más difícil de abusar

---

## 7b. Tracción real (26/jun)

**Hay cirujanos registrándose por su cuenta.** En Supabase Auth aparecen cuentas nuevas no-test (`cristianruminot@gmail.com`, `pacolorenzo10@hotmail.com`, etc.) con inicios de sesión recientes. Daniel mencionó que "varios cirujanos están revisando" la app. **El siguiente paso decisivo del proyecto es obtener feedback real de ellos** — guía de entrevista preparada en `guia_conversacion_cirujano.md`.

**Competidor directo identificado: Rhinoplanner.com** — producto maduro, mismo nicho (planificación/documentación quirúrgica de rinoplastia, no simulación estética). €499/año (oferta lanzamiento, desde €599), 7 días free trial, un solo tier. Multiplataforma (web/iPad/iPhone), plantillas nariz+costilla+oreja+fascia, compartir planes, YA tiene español y testimonios de cirujanos de LatAm/España (incl. Paul Nassif). Ventajas de RhinoPlan: precio mensual accesible ($29/mes vs $540/año), free tier, transparencia de precio. NO competir por funciones; buscar nicho específico vía conversación con cirujanos.

## 8. Pendientes (en orden)

**✅ Cerrados en esta fase:** Creem aprobado y payouts habilitados · prueba de pago real de punta a punta (activación + revocación + reembolso) · Google Workspace · dominio propio app.rhinoplan.app · disclaimers médicos.

**Por hacer:**
1. **Supabase Pro** (~$25/mes) — activar JUSTO ANTES del primer cirujano real, no antes (evita pagar capacidad sin usar). Elimina pausa por inactividad, mejora backups. Mientras tanto, entrar al dashboard cada tanto para que el proyecto free no se pause
2. ~~Bug del webhook (filas duplicadas)~~ **✅ RESUELTO (22/jun).** Causa: condición de carrera (checkout.completed + subscription.active concurrentes hacían SELECT-then-INSERT y ambos insertaban). Solución: (a) limpieza de duplicados + `ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id)`; (b) webhook reescrito a **upsert atómico** (`POST subscriptions?on_conflict=user_id` con header `Prefer: resolution=merge-duplicates`). SQL guardado en `fix_subscriptions_final.sql`
3. **Plantilla de correo** de confirmación en español/branded (hoy sale la de Supabase en inglés). Supabase → Auth → Emails → Templates
4. **Limpiar usuarios de prueba** en Supabase Auth (varias cuentas acumuladas). En `subscriptions` quedan 2 filas: una de prueba (`2dda6891...`, inactive) y una vieja de LemonSqueezy (`3ad5b0aa...`, abril) — borrables cuando se quiera, ya no estorban
5. **⚠️ Correos caen en spam** (descubierto 26/jun): los correos de Resend (confirmación, recovery) llegan a spam. Riesgo real: un cirujano que se registra y no ve el correo, no activa la cuenta. Revisar config DKIM/DMARC en Resend o esperar reputación del dominio. PRIORITARIO antes de captar usuarios en serio
6. **Marketing (fase 1):** Instagram @rhinoplan.app, primer reel, emails a cirujanos (con opción de baja e identificación clara — cumplimiento anti-spam)
6. ~~Decisión de precio~~ **✅ Subido a $29 (23/jun)** en Creem + app + landing. Sigue siendo hipótesis hasta que un cirujano pague o rechace; validar con los primeros clientes
7. **Capacitor / App Store** cuando haya usuarios activos
8. **HIPAA / EE. UU.** como proyecto aparte (ver sección 6)

---

## 9. Lecciones Aprendidas (acumuladas)

- **Cloudflare** inyecta scripts y trunca JS al copiar desde la web en vivo. Siempre descargar archivos generados, nunca copiar del sitio. Emails en HTML: `&#64;`, `\u0040` o `<span>@</span>`
- **Archivos grandes** con bash heredoc se truncan → usar Python `open().write()`
- **Supabase token** expira cada hora → usar refresh_token
- **Supabase free** pausa por inactividad >7 días → visitar dashboard semanal (hasta migrar a Pro)
- **LemonSqueezy** inviable (>5 semanas sin activación). **PayU** sin pagos recurrentes. **Creem** funciona
- **URL canónica importa:** POST a `rhinoplan.app` (sin www) muere en la redirección 308 → siempre `www.rhinoplan.app` para llamadas API
- **SMTP Supabase+Resend: puerto 587, no 465.** El 465 (TLS implícito) cuelga la conexión → error "upstream request timeout" no-JSON
- **Webhooks:** verificar firma SIEMPRE, sobre el body crudo (`bodyParser: false` en Vercel), con `timingSafeEqual`
- **Identidad en pagos:** pasar `user_id` como metadata del checkout; nunca depender de coincidencia de emails
- **Permisos mínimos en todo:** API keys con scope limitado (Sending access, un dominio), RLS sin políticas redundantes
- **Debugging:** cambiar una variable a la vez; el TIPO de error orienta (respuesta no-JSON = falla de gateway/infraestructura, JSON con error = falla de lógica)
- **Service Worker:** nunca cachear respuestas de API con datos sensibles; solo recursos del mismo origen; versionar el caché para forzar actualizaciones
- **Registro de email duplicado:** si el correo ya existe en Supabase Auth, NO se reenvía el correo de confirmación (la app muestra el mensaje verde igual, por seguridad). Si "no llega el correo", verificar primero en Auth → Users si ya existe. Resend → Emails muestra si el correo salió o no
- **Verificación automatizada poco fiable contra Vercel:** curl/wget a los dominios devuelve 403 o respuestas de ~104 bytes (firewall/CDN de Vercel filtra bots). La verificación válida es desde el navegador del usuario. `raw.githubusercontent.com` SÍ es accesible y sirve para confirmar que el archivo subió bien al repo
- **Migración de dominio (Vercel + Namecheap):** agregar dominio en Vercel (Add Existing → Production) → copiar el CNAME exacto → crear CNAME en Namecheap (Host `app`, sin el punto final si da error) → Refresh en Vercel. Propaga en minutos. El dominio viejo de Vercel sigue activo en paralelo (sin downtime). Después actualizar enlaces en landing, checkout.js (CORS + success_url) y Supabase Auth (Site URL + Redirect URLs)
- **Cancelación en Creem:** "cancelar inmediatamente" corta acceso ya (dispara `subscription.canceled` al instante); "al final del período" espera. Cancelar ≠ reembolsar: el refund es aparte, en el detalle del pago (Pagos → transacción → Refund)

---

*Última actualización: 26 de junio de 2026*
