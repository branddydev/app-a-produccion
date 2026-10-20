# Tu app de citas a producción para 4 clínicas

Hola. Buena noticia primero: **no tienes que cambiar de tecnología.** Next.js 15 + Supabase sirve de sobra para 4 clínicas. Lo que sí tienes que cambiar es **cómo están separados los datos y quién puede ver qué**. Ahora mismo tu app está pensada para "una clínica, todos ven todo", y vas a guardar **datos de salud de pacientes de cuatro clínicas distintas**. Es el tipo de dato más delicado que hay, así que el orden importa: primero la seguridad, después subirla.

**Veredicto:** todavía no está lista para producción (es lo normal en una app que solo ha corrido en tu Mac). Calculo de 1 a 3 semanas de trabajo con Claude, según cómo esté hecha hoy.

## Lo que doy por hecho (corrígeme si algo no cuadra)

No he visto tu código, así que parto de esto:

1. **Estás en España (o en la UE).** Eso implica el RGPD, y los datos de salud son "categoría especial". Si estás en Latinoamérica, la lógica es la misma con otra ley.
2. **Supabase:** o lo tienes en local (Docker en tu Mac) o en un proyecto de desarrollo en supabase.com. En los dos casos, producción tiene que ser **un proyecto nuevo y separado**.
3. **Cada clínica tiene sus propios pacientes.** Si el paciente de una clínica de tu amigo va a otra de las suyas, cada una tiene su ficha y no comparten historial. *Esto tienes que confirmarlo tú, porque cambia el diseño.*
4. **Una persona puede trabajar en varias clínicas.** Tu amigo seguramente estará en sus 3 y algún dentista quizá también.
5. **La app la hizo Claude "a lo rápido"**, que es lo habitual. Por eso es probable que la seguridad de las tablas de Supabase (RLS, te lo explico abajo) esté desactivada o muy abierta, y que alguna clave secreta se use donde no toca. Si ya lo tienes bien, mejor: te saltas ese paso.

## Riesgos que hay que arreglar antes de que entre nadie más

### 1. Que cualquiera pueda leer tu base de datos desde el navegador
Supabase funciona así: el navegador lleva una clave pública (`anon` o `publishable`) que **cualquiera puede ver** abriendo las herramientas del navegador. Lo que protege los datos no es esa clave, sino la **RLS (Row Level Security)**: reglas dentro de Postgres que dicen "esta fila solo la puede leer tal usuario".

- **Qué saldría mal:** si la RLS está desactivada en `patients`, alguien con esa clave puede descargarse todos los pacientes de las 4 clínicas con una sola línea de código, sin entrar en tu app.
- **Arreglo:** activar la RLS en **todas** las tablas y escribir sus políticas (abajo te pongo cómo). Para comprobarlo, en el panel de Supabase, en *Advisors → Security*, no debe salir ningún aviso de "RLS disabled".

### 2. Usar la clave secreta (`service_role` o `secret`) en las API routes
Esa clave **se salta la RLS por completo**. Si tus API routes de Next la usan para todo, la RLS no sirve de nada: lo único que impide que una recepcionista lea notas clínicas es que te acuerdes de comprobarlo a mano en cada ruta.

- **Arreglo:** en las API routes, crea el cliente de Supabase **con la sesión del usuario** (`createServerClient` de `@supabase/ssr`). Así cada consulta va "como ese usuario" y la RLS se aplica sola. Deja la clave secreta solo para tareas de administración (invitar usuarios, crear clínicas), en un archivo aparte.
- **Comprueba** que ninguna variable que empiece por `NEXT_PUBLIC_` contiene la clave secreta. Todo lo que empieza por `NEXT_PUBLIC_` acaba en el navegador.

### 3. Esconder las notas clínicas solo en la pantalla
Quitar la pestaña "Notas" para la recepcionista no basta. Si la API sigue devolviendo las notas dentro del JSON del paciente, la recepcionista las puede ver abriendo las herramientas del navegador.

- **Arreglo:** saca las notas a **su propia tabla** (`clinical_notes`), con una política RLS que solo deje leerla a dentistas. Así la base de datos ni siquiera se las entrega a una recepcionista, aunque la pida directamente. Es mucho más seguro que ocultar una columna.
- Revisa también las "puertas laterales": el listado de pacientes, el buscador, las exportaciones a PDF o Excel, los recordatorios por email y los archivos (si guardas radiografías en Supabase Storage, sus *buckets* necesitan políticas igual que las tablas).

### 4. Que cualquiera se registre
Si tu pantalla de login tiene "Crear cuenta", cualquiera podría registrarse en tu app de producción.

- **Qué saldría mal:** si en algún momento tu código vincula usuarios a una clínica por email ("si existe una recepcionista con este email, es ella"), alguien podría registrarse con el email de otra persona y quedarse su acceso.
- **Arreglo:** desactiva el registro público (en Supabase, *Authentication → Sign In / Providers → Allow new users to sign up*: off) y da acceso **solo por invitación**: el admin de la clínica invita por email (`auth.admin.inviteUserByEmail`), la persona pone su contraseña y queda ligada a esa clínica con ese rol.

### 5. Next.js sin actualizar y protección solo en el `middleware`
Algunas versiones de Next.js 15 anteriores a la 15.2.3 tenían un fallo que permitía **saltarse el middleware** con una cabecera. Si tu login solo se comprueba en `middleware.ts`, actualiza Next a la última 15.x y comprueba la sesión **también dentro de cada API route** (con RLS bien hecha, esto ya pasa solo).

### 6. Borrar historias clínicas
Una historia clínica no se puede borrar a la ligera: hay obligación legal de conservarla durante años. Cambia los "eliminar" por **archivar** (una columna `archived_at`), y deja el borrado real para un proceso manual y deliberado.

## Lo que hay que cambiar para tener varias clínicas y roles

### El modelo de datos
En la jerga se llama hacer la app **multi-tenant**: varios clientes (las clínicas) en la misma app y la misma base de datos, cada uno viendo solo lo suyo.

```
clinics           id, name, slug, created_at
memberships       clinic_id, user_id, role ('admin' | 'dentist' | 'receptionist')   ← único por (clinic_id, user_id)
patients          id, clinic_id, nombre, teléfono, …            ← datos administrativos, los ve recepción
appointments      id, clinic_id, patient_id, dentist_id, fecha, estado, …
clinical_notes    id, clinic_id, patient_id, author_id, texto, created_at, archived_at   ← solo dentistas
activity_log      id, clinic_id, user_id, acción, tabla, fila, antes, después, created_at
```

Reglas que te ahorran problemas:
- **Toda tabla de negocio lleva `clinic_id`** y toda consulta filtra por ella. Nada se "sabe" de qué clínica es por otro camino.
- **Usuario y pertenencia van por separado.** El login (`auth.users`) es uno por email; `memberships` dice en qué clínicas está y con qué rol. Así tu amigo puede ser admin en sus 3 clínicas con un solo login, y tú admin en la tuya.
- **Tus datos actuales:** crea tu clínica en `clinics`, añade `clinic_id` a las tablas, rellénalo con el id de tu clínica y después márcalo como obligatorio (`NOT NULL`). Todo en una migración.
- **Añadir otra clínica = crear una fila** en `clinics` e invitar a su admin. Mismo despliegue, misma base de datos.

### Los permisos, en la base de datos
Con Supabase, lo natural es poner las reglas en la RLS. Dos funciones de ayuda y las políticas quedan cortas:

```sql
-- ¿pertenezco a esta clínica?
create function is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where clinic_id = c and user_id = auth.uid());
$$;

-- ¿tengo alguno de estos roles en esta clínica?
create function has_role(c uuid, roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships
                 where clinic_id = c and user_id = auth.uid() and role = any(roles));
$$;

alter table patients enable row level security;
create policy "personal de la clínica ve sus pacientes" on patients
  for select using (is_member(clinic_id));

alter table clinical_notes enable row level security;
create policy "solo dentistas leen notas" on clinical_notes
  for select using (has_role(clinic_id, array['dentist']));
create policy "solo dentistas escriben notas" on clinical_notes
  for insert with check (has_role(clinic_id, array['dentist']) and author_id = auth.uid());
```

Además de lectura, cada tabla necesita sus políticas de `insert`, `update` y `delete`. Y hay dos cosas que no pueden quedarse fuera:

- **Nadie puede subirse de rol.** La tabla `memberships` solo la puede modificar un `admin` de esa clínica. Si no, una recepcionista podría cambiar su propia fila a `dentist` y leer todas las notas.
- **¿El admin lee notas?** Decide si el dueño de la clínica, cuando no es dentista, puede leer notas clínicas. Por defecto, yo diría que no: que solo las lea quien atiende.

En la interfaz, carga el rol del usuario en la clínica activa y úsalo para **esconder** pestañas y botones. Pero quien decide siempre es la base de datos.

### Registro de accesos
En datos de salud conviene saber **quién ha visto o tocado cada historia**. Apunta en `activity_log` cada creación o edición de notas (un *trigger* de Postgres lo hace solo) y, si puedes, cada vez que un dentista abre las notas de un paciente (desde la API route). Si una clínica tiene una reclamación, esto es lo que te salva.

### Selector de clínica
Si alguien pertenece a varias clínicas, la app necesita un selector ("Clínica Centro / Clínica Norte"). Guarda la clínica activa y pásala en cada llamada (por ejemplo en la URL: `/c/clinica-norte/citas`).

## Cómo subirla a producción

**Recomendación: Vercel para la app y Supabase Cloud para la base de datos.** Si toda tu app es Next.js y no tienes procesos en segundo plano, es lo más simple: Vercel está hecho por los creadores de Next. Railway también funcionaría, pero aquí no te aporta nada extra.

### Paso 0: en tu Mac, antes de nada
- `npm run build` (o `pnpm build`) tiene que pasar **sin errores**. Lo que falla aquí, falla en el servidor.
- Tu `.gitignore` tiene que incluir `.env*.local` y `.env` (pero no un `.env.example` sin valores reales). Revisa que **ninguna clave** se haya subido nunca a Git. Si alguna se subió, cámbiala.
- Sube el código a un repositorio **privado** de GitHub.

### Paso 1: base de datos de producción en Supabase
1. Crea un **proyecto nuevo** en supabase.com, en una **región de la UE** (Frankfurt, por ejemplo), con contraseña de base de datos nueva.
2. **Plan Pro** (unos 25 USD al mes; confirma el precio actual). El gratuito se pausa si nadie lo usa en una semana y no tiene copias de seguridad que puedas descargar. Con historias clínicas no es una opción. Valora además el *Point-in-Time Recovery*, que te deja volver a cualquier minuto.
3. Lleva tu esquema como **migraciones** (archivos SQL en `supabase/migrations`), no tocando tablas a mano en el panel. Con la CLI: `supabase link --project-ref <id>` y `supabase db push`. (Ojo: en Supabase, `db push` aplica tus archivos de migración, que es lo correcto. No lo confundas con `prisma db push`, que no debe usarse en producción.)
4. En **Authentication**:
   - Registro público desactivado y confirmación de email activada.
   - *Site URL* y *Redirect URLs* = tu dominio final (`https://app.tuclinica.com`).
   - **SMTP propio** (Resend, Brevo…): el correo integrado de Supabase solo deja enviar unos pocos emails por hora, y las invitaciones no llegarían.
   - Contraseña mínima de 10–12 caracteres y, si puedes, 2FA (MFA) para dentistas y admins.

### Paso 2: la app en Vercel
1. Importa el repo de GitHub en Vercel. **Ojo:** el plan gratuito (Hobby) es solo para uso no comercial. Para dar servicio a clínicas necesitas Pro (unos 20 USD al mes por miembro del equipo).
2. Variables de entorno:
   - `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (o la *publishable key*): son públicas, no pasa nada.
   - `SUPABASE_SERVICE_ROLE_KEY` (o la *secret key*): **sin** `NEXT_PUBLIC_`, solo para el servidor.
   - No escribas las claves en ningún chat. Cópialas del panel de Supabase al de Vercel directamente.
3. **Región de las funciones = Frankfurt (`fra1`)**, la misma zona que la base de datos. Por defecto Vercel las pone en EE. UU.: cada consulta cruzaría el Atlántico (más lento) y los datos de salud se procesarían fuera de la UE.
4. Despliega. A partir de ahí, **cada push a `main` despliega solo**, y cada rama tiene su URL de prueba.

### Paso 3: dominio
Añade `app.tuclinica.com` en Vercel, que te da un registro CNAME para tu proveedor de dominio. El HTTPS es automático. **Después** actualiza la *Site URL* de Supabase a ese dominio: si lo haces antes, los enlaces de invitación apuntarán a un sitio que aún no responde.

### Paso 4: primeras clínicas y usuarios
- Crea las 4 clínicas y la `membership` de admin de cada una (tú y tu amigo) con un script SQL que se pueda relanzar sin duplicar nada.
- Cada admin invita a sus recepcionistas y dentistas desde la app.
- Una página `/api/health` que compruebe que la base de datos responde, y un aviso si cae (UptimeRobot o Better Stack, que tienen plan gratuito).

### Paso 5: pruébalo como lo usaría cada uno (esto no te lo saltes)
Con usuarios de prueba (emails `@example.com`), en la URL de producción:

| Prueba | Resultado esperado |
|---|---|
| Recepcionista abre un paciente | Ve los datos y citas, **no** las notas |
| Recepcionista pide las notas a la API o a Supabase directamente (consola del navegador) | 0 filas o error 403 |
| Recepcionista intenta cambiarse el rol a `dentist` | Rechazado |
| Dentista de la clínica A pide un paciente de la clínica B cambiando el id en la URL | No lo encuentra (404 o 403) |
| Buscador y exportaciones desde una cuenta de recepción | Sin notas clínicas |
| Alguien intenta registrarse sin invitación | No puede |
| Sin sesión, llamar a cualquier API route | 401 |

Estas pruebas encuentran los fallos que "parece que funciona" no encuentra. Pídele a Claude que las deje escritas como tests automáticos y se convierten en tu red de seguridad para cada cambio futuro.

## La parte legal, en corto (no soy abogado: confírmalo con un asesor)
Al alojar los datos de las clínicas de tu amigo pasas a ser **encargado del tratamiento** de datos de salud. En la práctica:
- **Firma un contrato de encargo de tratamiento** (art. 28 del RGPD) con cada clínica que no sea tuya.
- Acepta los acuerdos de tratamiento de datos (DPA) de **Supabase** y **Vercel** (los tienen estándar) y usa regiones de la UE.
- Mantén copias de seguridad, registro de accesos y 2FA. Son justo las "medidas técnicas" que te pedirían si hay un incidente.
- Cada clínica debe informar a sus pacientes de que usa este software.

## Lo que no cambiaría
- **Next.js + Supabase.** Para 4 clínicas va sobrado; migrar a otro stack te costaría semanas y no ganarías nada ahora.
- **Las API routes de Next** como backend. Con la RLS haciendo de guardián funcionan bien. Si algún día vendes esto a 50 clínicas o añades trabajos en segundo plano (recordatorios por WhatsApp, facturación), entonces sí valdría la pena separar un backend propio. Hoy no.
- **El login con email y contraseña** de Supabase, añadiendo invitaciones y 2FA.

## El orden que te propongo
1. **Seguridad de la base actual:** RLS en todas las tablas, clave secreta fuera de las rutas normales, Next actualizado (1–3 días).
2. **Multi-clínica:** `clinics`, `memberships`, `clinic_id` en todo y selector de clínica (3–5 días).
3. **Roles y notas aparte:** tabla `clinical_notes`, políticas por rol, registro de accesos e invitaciones (2–4 días).
4. **Producción:** Supabase Pro en la UE, Vercel en `fra1`, dominio, SMTP y pruebas por rol (1–2 días).
5. **Piloto con una sola clínica de tu amigo** durante una o dos semanas; luego las otras dos.

## Siguiente paso
Si me pasas el proyecto (o abres esta conversación dentro de la carpeta de la app), empiezo por el punto 1: reviso qué tablas tienen la RLS desactivada, dónde se usa la clave secreta y si las notas viajan al navegador, y te devuelvo la lista exacta de cambios antes de tocar nada.

Y dos preguntas que cambian el diseño:
1. ¿Las 3 clínicas de tu amigo deben **compartir pacientes** (un paciente puede ir a cualquiera de ellas con la misma ficha) o cada una lleva los suyos?
2. ¿El dueño de una clínica que no es dentista debe poder **leer notas clínicas**?
