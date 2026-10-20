# Cuando la app ya está en Next.js + Supabase (o Firebase) y Vercel

Es el stack más habitual en apps hechas con Claude. No hace falta migrarlo al molde NestJS + Prisma + Railway para salir a producción: los principios (separar empresas, permisos en el servidor, nada de secretos en el cliente, probar como cada rol) se aplican igual, cambia **dónde** se aplican.

Recomienda pasar a un backend propio (NestJS) solo cuando aparezcan trabajos en segundo plano serios (colas, integraciones, IA por lotes), muchos clientes con reglas complejas, o un MCP / API pública para terceros.

## Permisos: RLS es tu CASL

En Supabase el navegador habla directamente con la base de datos con una clave **pública** (`anon` o `publishable`). Lo único que protege los datos es la **Row Level Security** de Postgres.

- **RLS activada en todas las tablas**, con políticas de `select`, `insert`, `update` y `delete`. El panel tiene *Advisors → Security*: no debe quedar ningún "RLS disabled".
- **Funciones de ayuda** `security definer` con `set search_path = public` para no repetir lógica: `is_member(org_id)`, `has_role(org_id, roles[])`, que consultan una tabla `memberships (org_id, user_id, role)`.
- **La tabla de pertenencias solo la modifica un admin de esa empresa.** Si no, alguien cambia su propia fila y se sube de rol.
- **Datos que un rol no debe ver van en su propia tabla** con su política (por ejemplo `clinical_notes` solo para dentistas). Ocultar columnas en la interfaz o en la consulta no basta: la API las entrega igual.
- **Storage también tiene políticas:** los buckets de archivos necesitan reglas como las tablas.

## Claves y variables

- `anon` / `publishable` es pública por diseño: puede ir en `NEXT_PUBLIC_…`.
- `service_role` / `secret` **se salta la RLS**. Solo en el servidor, nunca con prefijo `NEXT_PUBLIC_`, y solo para tareas de administración (invitar, crear empresas, cron). Si las API routes la usan para todo, la RLS no protege nada.
- En las rutas de servidor, crea el cliente **con la sesión del usuario** (`createServerClient` de `@supabase/ssr`) para que cada consulta vaya como ese usuario.
- Busca en el repo: `grep -rn "service_role\|SERVICE_ROLE\|NEXT_PUBLIC_.*SECRET" .`

## Auth

- **Registro público desactivado** en producción si la app es por invitación (*Authentication → Sign In / Providers*), confirmación de email activada, invitaciones con `auth.admin.inviteUserByEmail`.
- **SMTP propio** (Resend, Brevo…): el correo integrado tiene un límite muy bajo de envíos por hora y las invitaciones dejan de llegar.
- *Site URL* y *Redirect URLs* al dominio final, **después** de que el dominio responda.
- MFA para roles con acceso a datos sensibles.

## Next.js

- **Mantén Next actualizado.** Versiones de Next.js 15 anteriores a 15.2.3 permitían saltarse el `middleware` con una cabecera (CVE-2025-29927). No confíes la autorización solo al middleware: compruébala también en cada API route o server action (con RLS bien hecha, ocurre sola).
- Todo lo que empieza por `NEXT_PUBLIC_` acaba en el bundle del navegador.
- La lógica de negocio sigue fuera de los componentes: funciones de servidor o un módulo de dominio, no dentro de páginas.

## Migraciones

- El esquema vive en archivos SQL versionados (`supabase/migrations`), no en clics en el panel.
- `supabase link --project-ref <id>` y `supabase db push` aplican esos archivos: **en Supabase es el comando correcto**. (No confundir con `prisma db push`, que en producción no se usa.)
- Proyecto de producción **separado** del de desarrollo, con contraseña nueva.

## Despliegue

- **Vercel** para la app Next.js; **Supabase Cloud** para la base de datos.
- **Región:** base de datos y funciones en la misma zona. Vercel pone las funciones en EE. UU. por defecto; si la base está en la UE, fija la región de las funciones (por ejemplo `fra1`). Con datos personales europeos, ambos en la UE.
- **Planes:** el gratuito de Vercel (Hobby) es solo para uso no comercial; el gratuito de Supabase se pausa por inactividad y no tiene copias descargables. Para clientes reales, planes de pago con backups (y valorar Point-in-Time Recovery). Consulta los precios actuales antes de dar cifras.
- Variables copiadas de un panel al otro, nunca por chat.
- Dominio: CNAME que da Vercel; después actualizar las URLs de auth de Supabase.
- Health check (`/api/health`) y un monitor externo de disponibilidad.

## Pruebas por rol (igual que en el molde)

Con usuarios de prueba en el entorno de producción o en uno idéntico: un rol limitado no ve lo que no debe ni pidiendo directamente a la API o a Supabase desde la consola del navegador; un usuario de la empresa A no ve nada de la B cambiando ids; nadie se sube de rol; sin sesión, 401.
