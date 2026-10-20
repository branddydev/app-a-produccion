# Despliegue en Railway con dominio propio

Contenido:
1. Topología recomendada
2. Preparar el repo
3. Crear el proyecto y los servicios
4. Variables y secretos
5. Primer despliegue, migraciones y semilla
6. Dominio propio (Cloudflare u otro DNS)
7. Login con Google (OAuth)
8. Despliegue automático desde GitHub
9. Día a día
10. Checklist final del despliegue

Cada paso que crea o cambia algo fuera del repo (proyectos, DNS, OAuth, aceptar condiciones, apps de GitHub) se confirma antes con la persona.

## 1. Topología recomendada

```
                 https://app.midominio.com
                           │
                ┌──────────▼───────────┐
                │ web  (Node, 1 archivo)│  sirve la SPA y reenvía /api y /mcp
                └──────────┬───────────┘  por la red privada de Railway
                           │ http://api.railway.internal:3001
                ┌──────────▼───────────┐
                │ api  (NestJS)         │  API + MCP + workers de BullMQ
                └────┬────────────┬────┘
            ┌────────▼───┐   ┌────▼────┐
            │ Postgres   │   │ Redis   │
            │ + pgvector │   └─────────┘
            │ + volumen  │
            └────────────┘
```

**Un solo dominio público.** La web hace de proxy de `/api` y `/mcp` hacia la API por la red privada. Ventajas: cookies de primera parte (el login no se pelea con SameSite ni con CORS), una sola entrada DNS y un solo certificado, y la API no está expuesta directamente. El servidor de la web son ~70 líneas sin dependencias: `assets/web-server.mjs`. Debe pasar el streaming tal cual (el MCP usa SSE) y servir `index.html` sin caché y los assets con hash con caché larga.

Con Next.js en vez de Vite, Next ya es un servidor: usa `rewrites` hacia la URL interna de la API para el mismo efecto.

**Dos servicios desde el mismo repo,** cada uno con sus *watch paths*: un cambio solo en el front no redespliega el backend.

## 2. Preparar el repo

Antes de crear nada, comprueba en local lo que hará el servidor:

```bash
pnpm build --force                       # build limpio de todo el monorepo
NODE_ENV=production PORT=3099 node apps/api/dist/main.js   # ¿arranca? ¿responde /api/health?
PORT=8090 API_INTERNAL_URL=http://localhost:3001 node apps/web/server.mjs
```

- Un endpoint `/api/health` que compruebe base de datos y Redis, y `/healthz` en la web.
- **Lo que se usa al desplegar va en `dependencies`, no en `devDependencies`:** el CLI de Prisma, `tsx` si las vistas o la semilla se lanzan con él, `dotenv`.
- `.gitignore` con `.env` y `.env.*` (salvo `.env.example`), `dist`, `node_modules`, el cliente generado de Prisma.
- Repo en GitHub, privado.

## 3. Crear el proyecto y los servicios

1. Proyecto nuevo en el workspace que corresponda. Si la persona ya tiene otros proyectos con nombres parecidos, no los toques.
2. **Postgres con pgvector:** la plantilla estándar de Postgres no siempre trae la extensión. Opción fiable: servicio desde la imagen oficial `pgvector/pgvector:pg17` con un **volumen en `/var/lib/postgresql/data`** y `PGDATA=/var/lib/postgresql/data/pgdata` (el volumen trae `lost+found` en la raíz y Postgres no arranca en una carpeta no vacía).
3. **Redis:** la plantilla oficial.
4. **api** y **web:** crea servicios vacíos, configúralos y después conéctales el repo (o despliega con la CLI).

Configuración por servicio (Railway ya no lee `railway.json`; se pone en el servicio, desde el panel o la API):

| | api | web |
|---|---|---|
| Builder | Railpack | Railpack |
| Build | `pnpm turbo run build --filter=@app/api...` | `pnpm turbo run build --filter=@app/web...` |
| Pre-deploy | `pnpm --filter @app/db migrate:deploy` (+ vistas SQL) | — |
| Start | `NODE_ENV=production node apps/api/dist/main.js` | `NODE_ENV=production node apps/web/server.mjs` |
| Healthcheck | `/api/health` | `/healthz` |
| Watch paths | `apps/api/**`, `packages/db/**`, `packages/contracts/**`, `pnpm-lock.yaml` | `apps/web/**`, `packages/ui/**`, `packages/contracts/**`, `pnpm-lock.yaml` |
| Reinicio | On failure | On failure |

**`NODE_ENV=production` va en el comando de arranque, no como variable del servicio.** Las variables también existen durante el build, y con `NODE_ENV=production` pnpm no instala `devDependencies`: TypeScript, Nest CLI, Vite y Turbo desaparecen y el build falla.

## 4. Variables y secretos

**api:**
- `DATABASE_URL=${{Postgres.DATABASE_URL}}` y `REDIS_URL=${{Redis.REDIS_URL}}` (referencias de Railway; la de Postgres usa el dominio privado).
- `PORT=3001` fijo (la web lo necesita para llegar por la red privada).
- `API_URL`, `WEB_URL`, `BETTER_AUTH_URL` = el dominio público (`https://app.midominio.com`). Mientras no haya dominio, el `*.up.railway.app` de la web.
- `BETTER_AUTH_SECRET`, `INTEGRATIONS_KEY` y la contraseña de Postgres: **nuevos para producción**, nunca los de desarrollo.
- Cuando existan: `GOOGLE_CLIENT_ID/SECRET`, `RESEND_API_KEY` + `EMAIL_FROM`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`.

**web:** `PORT=8080`, `API_INTERNAL_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:3001`.

**Secretos sin pasar por el chat:** genéralos y escríbelos con la CLI en la misma línea, desde una carpeta enlazada al proyecto:

```bash
railway variables --service api --skip-deploys \
  --set "BETTER_AUTH_SECRET=$(openssl rand -base64 48)" \
  --set "INTEGRATIONS_KEY=$(openssl rand -base64 32)"
```

Para un secreto que muestra una web (por ejemplo el de Google), usa su botón de copiar y pásalo desde el portapapeles: `--set "GOOGLE_CLIENT_SECRET=$(pbpaste)"`, y vacía el portapapeles después.

**Copia local:** guarda una copia de los secretos de producción en `.env.production` en la raíz (ignorado por Git, `chmod 600`), generada desde Railway con `railway variables --kv`. Railway es la fuente de verdad. Algunos proveedores (Google) no vuelven a mostrar el secreto.

## 5. Primer despliegue, migraciones y semilla

- Si el repo aún no está conectado: `railway up --service api --detach`. **Desde una ruta con espacios falla** con `prefix not found`: despliega desde una exportación limpia (`git archive main | tar -x -C /tmp/deploy`), que además sube solo lo commiteado. Añade un `.railwayignore` para carpetas pesadas que no hacen falta.
- Las migraciones corren en el pre-deploy. Si Prisma no sabe declarar algo (un índice HNSW de pgvector), mantenlo en una migración SQL propia y vigila que futuras migraciones no propongan borrarlo.
- **Semilla en producción** dentro del contenedor: `railway ssh --service api -- sh -c "cd /app && pnpm --filter @app/db seed"`. Así no hace falta exponer la base de datos a internet.
- Comprueba: `/api/health` con `db: true` y `redis: true`, `/api/me` → 401 sin sesión, `/mcp` → 401 sin key, y la pantalla de login sin errores en consola.

## 6. Dominio propio (Cloudflare u otro DNS)

1. Añade el dominio personalizado al servicio **web** (puerto 8080). Railway devuelve dos registros: un **CNAME** (`app` → `xxxx.up.railway.app`) y un **TXT** de verificación (`_railway-verify.app`).
2. En Cloudflare, crea los dos con el proxy **desactivado** ("DNS only", nube gris) hasta que Railway emita el certificado. Si existe un comodín `*.dominio` proxied, el registro concreto tiene prioridad.
3. Comprueba con `dig +short CNAME app.midominio.com @1.1.1.1` y espera a que el dominio responda por HTTPS.
4. Solo entonces cambia `API_URL`, `WEB_URL` y `BETTER_AUTH_URL` al dominio nuevo. Antes rompería el login en la URL provisional.

Si no hay token de Cloudflare con permiso de editar DNS, se puede hacer desde el panel en el navegador de la persona, con su sesión y su confirmación.

## 7. Login con Google (OAuth)

En Google Cloud Console, con la cuenta de la organización:

1. Proyecto nuevo para la app, dentro de la organización.
2. Google Auth Platform → configurar: nombre de la app, email de soporte, audiencia y contacto. Hay que aceptar la política de datos de las APIs de Google: **pídele permiso a la persona antes de aceptarla en su nombre**.
   - **Interna:** solo cuentas del Workspace de la organización, sin revisión de Google. Ideal para una intranet.
   - **Externa:** cualquier cuenta. Necesaria cuando se vende a otras empresas; con scopes básicos (email, perfil) basta publicarla.
3. Clientes → Crear → Aplicación web, con:
   - Origen: `https://app.midominio.com`
   - Redirección: `https://app.midominio.com/api/auth/callback/google`
4. Copia ID y secreto a las variables de la API (sección 4) y guarda la copia local.
5. Prueba el login de punta a punta y comprueba que llega al usuario correcto.

## 8. Despliegue automático desde GitHub

- Instala la app de GitHub de Railway en la organización, **solo con acceso al repo de la app**. GitHub puede pedir confirmación en el móvil (GitHub Mobile): eso lo tiene que aprobar la persona.
- Conecta el repo (rama `main`) a `api` y `web`. Desde ahí, cada push despliega solo el servicio cuyos watch paths cambian.

## 9. Día a día

- Trabajo en ramas o directamente en `main` según el equipo; push a `main` = producción.
- Tras desplegar algo del front, recarga una vez: la PWA guarda la versión anterior hasta que su service worker se actualiza.
- Variables nuevas: ponlas en Railway primero, actualiza `.env.example` y la copia local.
- Logs: `railway logs --service api`. Ante un fallo de despliegue, lee los logs de build y de pre-deploy antes de tocar nada.

## 10. Checklist final del despliegue

- [ ] `/api/health` OK con base de datos y Redis
- [ ] HTTPS en el dominio propio y URLs de la API apuntando a él
- [ ] Login con Google probado de punta a punta
- [ ] Secretos de producción nuevos, en Railway y en la copia local ignorada por Git
- [ ] Semilla aplicada y un Owner real que puede entrar
- [ ] Despliegue automático desde GitHub funcionando (un push de prueba)
- [ ] Backups de Postgres activados en el volumen
