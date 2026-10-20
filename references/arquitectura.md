# Arquitectura de referencia

Contenido:
1. Estructura del monorepo
2. Registro de operaciones (una definición, cuatro salidas)
3. Cómo viaja una petición
4. Multi-tenant
5. Usuario, miembro y ficha
6. Permisos granulares
7. Primer login, invitaciones y alta de empresas
8. API keys y MCP
9. Datos pensados para IA
10. Convenciones de la base de datos

## 1. Estructura del monorepo

```
mi-app/
├─ apps/
│  ├─ web/            Vite + React (o Next.js si es pública) · solo pinta y llama a la API
│  └─ api/            NestJS: REST, auth, permisos, colas, agente IA y servidor MCP
├─ packages/
│  ├─ db/             Prisma: schema, migraciones, semilla, vistas SQL para IA, roles por defecto
│  ├─ contracts/      zod: esquemas y registro de operaciones (compartido por api y web)
│  ├─ ui/             tokens CSS + componentes del design system
│  ├─ integrations/   un adaptador por herramienta externa (opcional)
│  └─ config/         tsconfig base
├─ turbo.json · pnpm-workspace.yaml · .env.example
```

- **pnpm workspaces + Turborepo.** `turbo run build --filter=@app/api...` construye la API y solo los paquetes de los que depende. Ponle `dependsOn: ["^build", "generate"]` al build para que Prisma genere el cliente antes de compilar.
- **Paquetes internos compilados a `dist/`** con `exports` en su `package.json`. Las apps importan `@app/db` y `@app/contracts` como cualquier dependencia.
- **Una `.env` en la raíz** y un `.env.example` completo con comentarios. Los paquetes que necesitan variables (Prisma) las cargan desde la raíz.
- **Añadir apps no obliga a refactorizar:** un portal nuevo, un script o un bot importan `contracts` o `db`, o llaman a la API con una API key.

## 2. Registro de operaciones (una definición, cuatro salidas)

El patrón con más retorno del proyecto. En `packages/contracts`:

```ts
export const operations = {
  'people.create': op({
    name: 'people.create',
    description: 'Da de alta a una persona…',      // también es la descripción de la tool de IA
    method: 'POST', path: '/people',                // ruta relativa a /api/orgs/:org
    input: PersonCreate, output: PersonSummary,     // esquemas zod
    permission: { action: 'create', subject: 'Person' },
    mutating: true,                                 // el agente pide confirmación antes de ejecutarla
  }),
  // …
} as const;
```

De esa única definición salen:
- **La ruta REST** (el controlador solo llama a `registry.execute(name, ctx, input)`).
- **El cliente tipado del front** (`api.call('people.create', input)` y hooks `useOp` / `useMutationOp` con React Query).
- **Las tools del agente interno** de IA.
- **Las tools del servidor MCP.**

`OperationsRegistry.execute` hace siempre lo mismo: valida la entrada con zod, comprueba el permiso por tipo y ejecuta el handler. Así una operación se valida y autoriza igual entre por la web, por MCP o por el agente.

**Esquemas de edición:** genéralos desde los de alta con un helper que haga todo opcional y **quite los `.default()`** (ver `assets/patchOf.ts` y la trampa nº 1). `.partial()` de zod conserva los defaults y cada PATCH acaba reseteando campos.

## 3. Cómo viaja una petición

```
Web / MCP / Agente
  → AuthGuard      ¿quién eres? cookie de sesión o "Authorization: Bearer <api key>"
  → OrgGuard       ¿existe la empresa del :org de la URL? ¿perteneces? construye tus permisos para ESA empresa
  → Registro       ¿datos válidos? ¿puedes hacer esta acción sobre este tipo?
  → Servicio       comprueba permisos sobre la fila concreta y los campos; filtra por orgId; escribe activity_log
  → Colas          lo lento (emails, integraciones, embeddings) se encola y la respuesta vuelve ya
```

Errores claros: 401 si no hay identidad, 403 si no hay permiso (con el motivo en español), 400 con el campo y el mensaje si los datos no valen, 409 si choca con algo existente.

## 4. Multi-tenant

- **Todas las tablas de negocio llevan `orgId`** y todas las consultas filtran por él. Índices compuestos que empiezan por `orgId`.
- **La empresa va en la URL** (`/api/orgs/:org/...`, acepta id o slug). El front guarda la empresa activa (localStorage) y la pone en cada llamada.
- **El guard construye un contexto** `{ org, member, person, user, apiKey, ability }` que reciben todos los servicios. Nada lee la empresa de otro sitio.
- **Las API keys son por empresa** y no sirven en otra.
- Vender el producto a otra empresa = crear una fila en `organization` con sus roles por defecto. Mismo despliegue, misma base de datos.

**Pasar una app de una sola empresa a multi-empresa (con datos ya existentes):**
1. Crea `organization` y `org_member`, y la organización actual como primera fila.
2. Añade `orgId` **nullable** a cada tabla de negocio, rellénalo con el id de esa organización (backfill) y después hazlo `NOT NULL` con su índice. Todo en una migración probada sobre una copia de la base de producción.
3. Crea las pertenencias de los usuarios actuales (el dueño como Owner).
4. Añade el guard y el filtro por `orgId` en **todas** las consultas antes de dar de alta a la segunda empresa, y pruébalo con dos empresas y usuarios cruzados.
5. Revisa los uniques: `email` único global pasa a ser único por (`orgId`, `email`) en las tablas de negocio.

## 5. Usuario, miembro y ficha

Tres conceptos que conviene no mezclar:

| Tabla | Qué es | Notas |
|---|---|---|
| `user` | El login. Uno por email, global. | Lo gestiona la librería de auth. No guarda datos de negocio. |
| `org_member` | El permiso para entrar en una empresa, con rol base `OWNER` / `ADMIN` / `MEMBER`. | Único por (org, user). |
| `person` | La ficha de la persona dentro de esa empresa: puesto, equipos, manager, roles, datos laborales. | `userId` opcional: la ficha existe antes de que la persona tenga cuenta. |

Así un mismo login puede ser Owner en una empresa y Miembro en otra, y RR. HH. puede dar de alta a alguien que aún no ha entrado nunca.

## 6. Permisos granulares

**Dos capas que se suman:**
1. **Rol base del miembro.** `OWNER` y `ADMIN` → `manage all`. `MEMBER` no puede nada por sí mismo.
2. **Roles de la ficha** (`role` → `role_permission`, asignados vía `person_role`). Cada empresa tiene los suyos; la semilla crea Owner, Admin, Manager y Miembro. Una persona puede tener varios y se suman.
3. **API keys:** además, se recorta todo a sus scopes (`read:Person`, `manage:AccessGrant`, `*`).

**Cada regla tiene cinco partes:** acción (`read`, `create`, `update`, `delete`, `manage`…), sujeto (`Person`, `Team`, `all`…), condición (JSON con variables `${user.personId}`, `${user.teamIds}`), campos (lista; vacía = todos) e invertida (prohíbe en vez de permitir).

```ts
// "un manager ve y edita a la gente de sus equipos, pero no su compensación ni sus roles"
{ action: 'read',   subject: 'Person', conditions: { teamIds: '${user.teamIds}' }, fields: TEAM_FIELDS },
{ action: 'update', subject: 'Person', conditions: { teamIds: '${user.teamIds}' }, fields: TEAM_EDITABLE },
```

Guarda los roles por defecto en código compartido (`packages/db/src/defaults.ts`, ver `assets/default-roles.ts`) y úsalos tanto en la semilla como al crear empresas nuevas.

**La tabla `role_permission` no puede tener un unique en (rol, acción, sujeto):** hacen falta varias reglas por par (leer lo básico de todos + leer todo de uno mismo). Usa un índice normal.

**Dónde se aplican (las tres, no solo la primera):**

1. **Por tipo**, en el registro de operaciones: `can('update', 'Person')`. Rápido, pero no basta.
2. **Por fila**, en cada servicio: carga la fila, construye el objeto con los campos que usan las condiciones (`{ id, personId, teamIds }`) y comprueba `can('update', subject('Person', inst))`.
3. **En listados y búsquedas:** traduce las reglas a un `where` del ORM para devolver solo las filas permitidas (ver `assets/accessible.ts`). Sin esto, un miembro ve el directorio entero aunque no pueda abrir cada ficha.
4. **Por campo:** al leer, pon a `null` (o `[]`) los campos que la regla no deja ver y marca `restricted: true`; al editar, rechaza con 403 los campos que no puede tocar, y exige permiso sobre `Role` para asignar roles. Si no, **un miembro puede darse el rol de admin editando su propia ficha**.

No olvides aplicar lo mismo en la búsqueda, en los recursos del MCP y en cualquier vista SQL que se exponga: son puertas laterales a los mismos datos.

**En el front:** expón `GET /api/orgs/:org/permissions` con las reglas ya interpoladas y construye la misma ability con CASL para esconder botones. La API sigue siendo quien decide.

## 7. Primer login, invitaciones y alta de empresas

- **Enlace automático cuenta ↔ ficha solo con email verificado.** Si alguien entra con Google (email verificado) y existe una ficha con su email, se enlaza y se le hace miembro. Con email y contraseña sin verificar **no se enlaza nada**: cualquiera podría registrarse con el email de otra persona y quedarse su ficha.
- **Invitaciones por enlace con token.** Al crear la ficha, opción "Invitar a la app". El enlace `/invite/:token` muestra la empresa sin sesión, deja crear cuenta (email fijo) o entrar, y al aceptar exige que el email de la sesión coincida. Aceptar marca el email como verificado.
- **Sin proveedor de correo, la app no se rompe:** devuelve el enlace para copiarlo. Con Resend (u otro) configurado, lo envía.
- **Reglas de rango:** nadie da un rol base mayor que el suyo, nadie toca a alguien de rango superior y la empresa nunca se queda sin Owner.
- **Crear empresa** (`POST /api/orgs`): cualquier usuario con sesión; crea la empresa, sus roles por defecto y la ficha del creador como Owner.
- Con Google como proveedor, activa el enlace de cuentas para Google (`trustedProviders`) si la semilla crea usuarios sin contraseña: así el primer login con Google se une al usuario existente.

## 8. API keys y MCP

- Formato `prefijo_<aleatorio>`; se guarda **solo el hash** (sha256) y un prefijo visible para reconocerla. La clave completa se muestra una vez.
- La key **actúa con los permisos de quien la creó**, recortados a sus scopes. Una key sin usuario actúa como Admin recortado.
- **Una key no puede crear otras keys:** se crean desde la app con sesión.
- Quitar a un miembro revoca sus keys.
- El **servidor MCP** (Streamable HTTP en `/mcp`) expone una tool por operación del registro y recursos de solo lectura (vistas para IA), todo con los mismos permisos.

## 9. Datos pensados para IA

- **`activity_log`**: quién, qué, cuándo, antes y después (sin secretos: filtra `password`, `secrets`, `hash`…). Es auditoría y memoria.
- **Vistas SQL `ai_*`** denormalizadas y en texto legible (personas con su puesto, equipos y accesos; organigrama; matriz de accesos). Un LLM las entiende sin joins.
- **Embeddings** (pgvector) regenerados por cola cuando cambia una fila; búsqueda semántica con caída a texto si no hay embeddings.
- **Agente ⌘K:** interpreta preguntas o acciones, usa las mismas operaciones y pide confirmación antes de las que modifican (`mutating: true`).

## 10. Convenciones de la base de datos

- `id` UUID v7 (ordenable) o ULID, `slug` legible y estable, `metadata jsonb` para extras sin migrar, `createdAt`, `updatedAt`, `archivedAt`.
- Nombres de esquema en inglés, textos de la UI en el idioma del usuario.
- Datos sensibles (legales, bancarios) en una columna aparte que **la API nunca devuelve**; secretos de integraciones cifrados con AES-256-GCM y una clave de entorno.
- Migraciones versionadas con Prisma y `migrate deploy` antes de arrancar en producción. La semilla debe ser idempotente (upsert por slug) para poder relanzarla.
