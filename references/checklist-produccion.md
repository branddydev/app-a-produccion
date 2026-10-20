# Checklist de producción

Úsala para auditar o para dar el visto bueno. Marca cada punto: ✅ lo tiene · ⚠️ a medias · ❌ falta · ➖ no aplica (di por qué). Los marcados con 🔴 son bloqueantes: no se sale a producción sin ellos.

## Seguridad y datos

- 🔴 Ningún secreto en el repo: `.env*` ignorados (salvo `.env.example`), sin claves en el código ni en el historial de Git.
- 🔴 Secretos de producción distintos de los de desarrollo y generados aleatoriamente.
- 🔴 Toda consulta de negocio filtra por empresa (`orgId`) si es multi-tenant. Prueba: un usuario de la empresa A pide un recurso de la B y recibe 403 o 404.
- 🔴 Permisos comprobados en el servidor, no solo escondiendo botones.
- 🔴 Permisos aplicados por fila y en listados, búsquedas, exportaciones, MCP y vistas, no solo por tipo de operación.
- 🔴 Los campos sensibles no viajan a quien no puede verlos, y la edición rechaza campos no permitidos (que nadie pueda darse roles).
- 🔴 Enlace de cuentas solo con email verificado o invitación.
- Datos muy sensibles (legales, bancarios) en columnas que la API nunca devuelve; secretos de terceros cifrados.
- API keys guardadas como hash, con scopes, revocables, que no puedan crear otras keys.
- Cookies de sesión `Secure` y `HttpOnly`; un solo dominio o CORS restringido al origen de la web.
- Validación de toda entrada con esquemas (zod) en el servidor.
- Registro de actividad para acciones importantes, sin guardar contraseñas ni secretos.
- Nada se borra en duro desde la app: se archiva.

## Base de datos

- Si la app guarda datos de salud, financieros o de menores, añade los puntos de `datos-sensibles.md`.
- Si usa Supabase: RLS activada en todas las tablas y en Storage, `service_role` solo en el servidor (ver `supabase-vercel.md`).
- 🔴 Migraciones versionadas y aplicadas automáticamente antes de arrancar. Con Prisma, `migrate deploy` y nunca `prisma db push` en producción. Con Supabase, archivos en `supabase/migrations` aplicados con `supabase db push` (ahí sí es el comando correcto), nunca cambios a mano en el panel.
- 🔴 Volumen persistente y backups activados.
- Semilla idempotente (se puede relanzar sin duplicar).
- Índices por `orgId` y por los campos de búsqueda frecuentes.
- Sin drift entre migraciones y base de datos.

## Backend

- 🔴 Endpoint de salud que compruebe sus dependencias (base de datos, Redis).
- Errores con código correcto (400/401/403/404/409) y mensaje legible, sin trazas internas hacia el cliente.
- Lo lento va por cola (emails, integraciones, IA, embeddings), con reintentos.
- Funciona sin servicios opcionales: sin proveedor de email, la invitación devuelve el enlace; sin clave de IA, la búsqueda cae a texto.
- Logs útiles en producción (qué operación, qué empresa, qué error).

## Frontend

- 🔴 `pnpm build` de producción pasa en limpio en local.
- Cliente de la API tipado desde los contratos; respuestas validadas en desarrollo.
- La interfaz esconde lo que el usuario no puede hacer (reglas de permisos en el front), y muestra "Privado" en lugar de datos vacíos engañosos.
- Estados de carga, vacío y error en cada pantalla.
- Mensajes de validación en el idioma del usuario.
- Móvil: viewport correcto, objetivos táctiles grandes, sin zoom al escribir.
- PWA (si aplica) con aviso de nueva versión.

## Idiomas (si la app es internacional)

- Ningún texto visible fijo en el código: todo en archivos de mensajes con las mismas claves en cada idioma.
- Idioma por usuario guardado en su perfil, con selector visible (también antes del login).
- Fechas, números y validación en el idioma activo.
- La API responde (errores, actividad, emails) en el idioma de la interfaz, que la web envía en cada petición.
- Ver `i18n.md`.

## Despliegue

- 🔴 Despliegue reproducible desde Git (push a `main` o CLI desde un export limpio).
- 🔴 HTTPS en el dominio final y URLs de auth apuntando a él.
- Healthchecks configurados en cada servicio.
- Watch paths para no redesplegar lo que no cambió.
- Variables documentadas en `.env.example` y copia local de producción fuera de Git.
- Un camino para tareas puntuales en producción (semilla, scripts) sin exponer la base de datos.

## Calidad

- Typecheck limpio en todo el monorepo.
- Tests unitarios de la lógica de permisos (traducción de reglas, campos).
- Pruebas de punta a punta de permisos con usuarios reales de cada rol, incluida otra empresa y una API key.
- Probado en el navegador en desktop y móvil, mirando la consola.
- README que explique cómo arrancar en local, cómo se despliega y dónde está cada cosa.
