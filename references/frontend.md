# Frontend

Contenido:
1. ¿Next.js o Vite?
2. Estructura recomendada con Vite
3. Cliente tipado y datos
4. Permisos en la interfaz
5. Design system por tokens
6. Que se sienta app (PWA y móvil)
7. Detalles que marcan la diferencia

## 1. ¿Next.js o Vite?

| Pregunta | Si la respuesta es sí… |
|---|---|
| ¿Tiene que salir en Google o compartirse con vista previa (landing, blog, catálogo, perfiles públicos)? | **Next.js** |
| ¿Todo está detrás de login (intranet, panel, CRM, herramienta interna)? | **Vite + React (SPA)** |
| ¿Quiere sentirse como app nativa, ir a las stores con Capacitor o funcionar como PWA? | **Vite** |
| ¿Mezcla las dos cosas? | Separarlas: parte pública en Next.js (o un builder), app en Vite, misma API. |

Por qué Vite para lo privado: sin SSR, RSC ni hidratación, el bundle es pequeño, la navegación es instantánea, el despliegue es un build estático más un servidor mínimo, y las convenciones cambian poco con los años. Next.js aporta valor cuando hay SEO; tras un login es peso sin beneficio.

Si alguien ya tiene la app en Next.js y funciona, no la migres por migrar. Asegúrate de que la lógica está en la API y no en las rutas del servidor de Next.

## 2. Estructura recomendada con Vite

- **React** + **TanStack Router** (rutas por archivos, tipadas, con loaders y code-splitting) + **TanStack Query** (caché, refetch, optimistic updates).
- Rutas: `routes/login.tsx`, `routes/invite.$token.tsx` (pública), `routes/_app.tsx` (layout protegido que comprueba la sesión y carga `/api/me`) y debajo las pantallas.
- `lib/http.ts` (fetch con credenciales y errores tipados), `lib/api.ts` (cliente del registro de operaciones), `lib/me.ts`, `lib/org.tsx` (empresa activa), `lib/permissions.ts`.
- Componentes del design system en un paquete aparte (`packages/ui`), pantallas en la app.
- Mensajes de zod en el idioma del usuario configurados una vez al arrancar.

## 3. Cliente tipado y datos

- `api.call(nombre, input)` construye la URL desde el registro de operaciones, valida la entrada con el mismo esquema que la API y, en desarrollo, valida también la respuesta: si la API cambia el contrato, salta enseguida.
- Hooks `useOp(nombre, input)` y `useMutationOp(nombre, { invalidate: [...] })`, con claves de caché `[operación, empresa, input]` para invalidar por operación.
- Al cambiar de empresa, limpiar la caché de la empresa anterior.
- Tras login o logout, resetear la query de sesión (si no, bucle de login).

## 4. Permisos en la interfaz

- La API expone las reglas del usuario para la empresa activa (`GET /api/orgs/:org/permissions`).
- El front crea la misma ability con CASL y ofrece `can(acción, sujeto, campo?)` y un helper para construir el objeto de una fila (`personSubject(p)`).
- Úsalo para esconder botones, pestañas, entradas de menú y campos de formularios que no puede tocar.
- En edición, **envía solo los campos que han cambiado**: así nunca choca con campos que no puede editar.
- Si un dato llega oculto por permisos, muéstralo como "Privado", no como "—" o "Sin acceso": lo segundo miente.
- Secciones enteras sin permiso de lectura (accesos, actividad de otra persona) se ocultan en vez de pintarse vacías.

## 5. Design system por tokens

- `tokens.css` con variables (`--color-*`, `--radius-*`, `--shadow-*`, `--blur-*`, duraciones, easings) y `components.css` con clases propias (`x-button`, `x-card`, `x-menu`…). Componentes React finos encima, accesibilidad con Radix Primitives.
- Si se replica un diseño de referencia, se mide en el original (estilos computados, no a ojo) y se apuntan los valores en un documento del design system.
- Cristal (glass): escribe solo `backdrop-filter`, nunca también `-webkit-backdrop-filter` (ver trampa 16).
- Tooltips, flyouts y menús en portales sobre `body`.
- Animaciones en CSS (keyframes, transiciones) y respetar `prefers-reduced-motion`.

## 6. Que se sienta app (PWA y móvil)

- Manifest con `display: standalone`, iconos y `theme-color`; service worker que cachea la shell y **nunca** la API (`navigateFallbackDenylist` para `/api` y `/mcp`).
- `100dvh`, `env(safe-area-inset-*)`, inputs de 16 px en móvil, objetivos táctiles de 44 px.
- Drawer lateral y bottom sheets en móvil; diálogos como sheets.
- Skeletons en vez de spinners, optimistic updates en toggles.
- Capacitor sobre la misma SPA cuando haga falta ir a las stores.

## 7. Detalles que marcan la diferencia

- `⌘K` como buscador y agente: una sola caja para buscar y pedir acciones.
- Formularios con validación del mismo esquema que la API, errores bajo cada campo.
- Cuando un proceso no puede completarse solo (no hay proveedor de email), la interfaz da la alternativa (el enlace para copiar) en vez de fallar en silencio.
- Pantallas para los casos límite: sin empresa (crear una o pedir invitación), invitación caducada, sesión con otra cuenta.
