---
name: app-a-produccion
description: Guía de arquitectura y despliegue para apps web hechas con Claude, sacada de un proyecto real en producción (NestJS + Prisma + Postgres, Vite o Next.js, Railway), que también sabe aplicar sus principios a apps en Next.js + Supabase/Vercel. Úsala para AUDITAR una app existente (qué le falta para producción, qué patrones adoptar, qué riesgos tiene) o para PLANIFICAR una nueva (stack, estructura de monorepo, permisos, despliegue). Actívala siempre que alguien quiera subir, desplegar o "poner en producción" una app que ha construido con Claude, revisar su arquitectura, elegir stack o framework, montar multi-empresa, roles y permisos, auth con Google, API keys o MCP, proteger datos sensibles (salud, RGPD), revisar la RLS de Supabase, hacer la app multi-idioma (i18n), o desplegar en Railway o Vercel con dominio propio, aunque no diga "skill" ni "arquitectura". También con frases como "revisa mi proyecto", "¿está listo para producción?", "¿Next o Vite?", "cómo despliego esto", "qué puedo mejorar de mi stack", "quiero que la app esté en inglés".
---

# App de Claude a producción

Esta skill condensa las decisiones de un proyecto real: una intranet multi-empresa con personas, roles, permisos granulares, accesos a herramientas, IA y servidor MCP, construida con Claude y desplegada en Railway. Cada recomendación viene de algo que funcionó o de un fallo que costó tiempo encontrar.

Sirve para dos cosas:

- **Auditar** una app existente: compararla con este molde y devolver un informe priorizado de qué adoptar, qué arreglar y qué riesgos tiene antes de producción.
- **Planificar** una app nueva: proponer stack, estructura y plan de despliegue adaptados a lo que la persona quiere construir.

El molde es una base, no un dogma. Recomienda lo que encaje con el proyecto de la persona y explica por qué. Si algo de su sistema es mejor o más simple para su caso, díselo y respétalo.

## Antes de empezar: entiende el proyecto

Averigua, mirando el repo primero y preguntando solo lo que no se pueda deducir:

1. **Qué es la app y para quién.** ¿Pública con SEO (landing, marketplace, blog) o privada tras login (intranet, panel, herramienta interna)? Esto decide el frontend.
2. **Quién la usa.** ¿Una sola empresa o varias (multi-tenant)? ¿Hay roles distintos que deben ver cosas distintas?
3. **Qué hay ya.** Lenguaje, framework, base de datos, ORM, auth, dónde está desplegada, si hay tests y CI.
4. **Qué le preocupa a la persona.** Seguridad, coste, velocidad de desarrollo, que "se sienta app", vender el producto a terceros…
5. **En qué idiomas.** Si tendrá usuarios o clientes de otros países, conviene preparar los idiomas desde el principio.

Para auditar, recorre el repo: `package.json` (y los de cada app), esquema de base de datos, carpeta de auth, guards o middleware, cómo se llaman las rutas de la API, `.env.example`, config de despliegue y `.gitignore`.

Si no hay repo que mirar (la persona solo lo cuenta), no te quedes bloqueado: escribe al principio las suposiciones que haces, numeradas, da la recomendación completa sobre ellas y termina con las dos o tres preguntas que cambiarían el diseño. Ofrécete a revisar el código cuando lo comparta.

**Elige qué leer según su stack:**
- Next.js + Supabase/Firebase en Vercel → `references/supabase-vercel.md` (RLS, claves, despliegue). No le empujes al molde NestJS si no lo necesita.
- NestJS/Express + Prisma/Drizzle, o una app nueva → `references/arquitectura.md` y `references/despliegue-railway.md`.
- Datos de salud, financieros, de menores o personales de terceros → además, `references/datos-sensibles.md`. Va antes que el despliegue.
- Más de un idioma, o clientes de otros países → `references/i18n.md` (interfaz y servidor).
- Siempre: `references/checklist-produccion.md` y `references/trampas.md`.

## El stack por defecto y cuándo cambiarlo

| Capa | Por defecto | Por qué | Cuándo otra cosa |
|---|---|---|---|
| Backend | **NestJS** (TypeScript) | Estructura clara para guards por tenant, módulos, colas y workers. Escala de un proceso a varios sin reescribir. | Una API mínima o un MVP de un fin de semana puede vivir en las rutas de Next.js; avisa de que crecerá mal. |
| Base de datos | **Postgres** | Una sola base para datos, JSON, búsqueda full-text y vectores (`pgvector`). | Casi nunca. |
| ORM | **Prisma** | Esquema legible, migraciones versionadas, tipos en todo el monorepo. | Si ya usa Drizzle y le va bien, no lo cambies. |
| Frontend privado | **Vite + React (SPA)** + TanStack Router y Query | Tras login no hace falta SEO ni SSR. Una SPA navega al instante, pesa poco y es la base ideal para PWA y Capacitor. | — |
| Frontend público | **Next.js** | SEO, SSR/SSG, páginas que se comparten y se indexan. | Si la parte pública es pequeña (una landing), sepárala: landing en Next o en un builder, app en Vite. |
| Idiomas | **Paraglide JS 2** con Vite; **next-intl** con Next.js | Mensajes compilados a funciones tipadas: una clave mal escrita no compila. Ver `references/i18n.md`. | react-i18next si el equipo ya la conoce. |
| Validación | **zod** en un paquete compartido | Un único esquema valida la entrada en la API, tipa el cliente y define las tools de IA. | — |
| Auth | **better-auth** (email + Google), sesión por cookie | Organizaciones propias en tus tablas, enlace de cuentas, sin vendor lock-in. | Clerk o Auth0 si no quieren gestionar auth y aceptan el coste. |
| Permisos | **CASL** con reglas en base de datos | Acción × sujeto × condición × campos: cubre "solo mi equipo" y "no ver salarios". | Una app de un solo rol no lo necesita todavía. |
| Colas | **Redis + BullMQ** | Todo lo lento (emails, integraciones, IA, embeddings) va por cola, nunca dentro de la petición. | Si no hay trabajo en segundo plano, Redis puede esperar. |
| Monorepo | **pnpm workspaces + Turborepo** | Apps y paquetes compartidos en un repo, despliegue independiente por servicio. | Un repo simple si solo hay una app y nada que compartir. |
| Despliegue | **Railway** desde GitHub | Push a `main` y despliega; Postgres, Redis y volúmenes en el mismo proyecto. | Vercel encaja si todo es Next.js sin workers; el backend Nest sigue mejor en Railway. |

La regla que protege el proyecto a largo plazo: **la lógica de negocio vive en la API y en los contratos compartidos, nunca en los componentes**. El framework de UI se puede cambiar; la lógica repartida por pantallas, no.

## Los patrones que más valor dieron

Léelos en detalle en `references/arquitectura.md`. En resumen:

1. **Registro de operaciones.** Cada acción de negocio se define una vez (nombre, entrada zod, salida, permiso requerido). De ahí salen la ruta REST, el cliente tipado del front, las tools del agente de IA y las del servidor MCP. Un permiso, un comportamiento, entre por donde entre.
2. **Multi-tenant desde el día uno.** Toda tabla de negocio lleva `orgId`; las rutas son `/api/orgs/:org/...`; un guard resuelve la empresa, comprueba que el usuario pertenece y construye el contexto. Vender a otra empresa es crear una fila.
3. **Usuario, miembro y ficha son cosas distintas.** El login es global; la pertenencia a una empresa es otra tabla con un rol base; los datos de la persona en esa empresa son otra. Permite dar de alta a alguien antes de que tenga cuenta.
4. **Permisos en dos capas y aplicados en tres sitios.** Rol base del miembro (Owner/Admin/Miembro) más roles con reglas CASL. Se aplican al comprobar la operación, al filtrar listados (traducir reglas a `where` del ORM) y al ocultar o rechazar campos concretos.
5. **Nada se borra, se archiva** (`archivedAt`), y cada cambio importante se apunta en un `activity_log` con antes y después. Es auditoría y es la memoria que lee la IA.
6. **IA y MCP sobre la misma capa.** Vistas SQL legibles para la IA, API keys por empresa con scopes que recortan los permisos de quien las crea, y un servidor MCP que expone las mismas operaciones.

## Flujo de una auditoría

1. **Mapa del sistema.** Dibuja en pocas líneas qué apps, servicios y datos hay, y cómo viaja una petición.
2. **Compara con el molde** usando `references/checklist-produccion.md`. Marca cada punto: ✅ lo tiene, ⚠️ a medias, ❌ falta, ➖ no aplica (y por qué).
3. **Busca las trampas conocidas** de `references/trampas.md` en su código: son fallos silenciosos que no salen en los tests (por ejemplo, esquemas de edición que resetean campos o el desenfoque CSS que desaparece al minificar).
4. **Prioriza.** Primero lo que expone datos o rompe producción (seguridad, permisos, secretos, migraciones), luego lo que bloquea el despliegue, luego mejoras de arquitectura, y al final lo cosmético.
5. **Propón el siguiente paso concreto** y ofrécete a hacerlo.

### Formato del informe

```markdown
# Auditoría de <proyecto>

**Veredicto:** <una frase: listo / casi listo / no listo para producción, y por qué>

## Lo que ya está bien
- <punto> — <por qué importa>

## Riesgos antes de producción (arreglar ya)
1. **<problema>.** <qué pasa, con un ejemplo concreto> → <arreglo>

## Patrones que te conviene adoptar
1. **<patrón>.** <qué gana su proyecto> · Esfuerzo: bajo / medio / alto

## Lo que no cambiaría
- <decisión suya que es razonable para su caso>

## Siguiente paso
<una acción concreta que puedes hacer ahora>
```

Habla claro y sin jerga innecesaria. Si la persona no es técnica, explica cada término la primera vez. Cada riesgo debe tener un ejemplo de qué saldría mal ("un miembro podría darse el rol de admin editando su propia ficha"), no solo el nombre del problema.

## Flujo para una app nueva

1. Decide frontend (público → Next.js, privado → Vite) y si es multi-empresa.
2. Propón la estructura de `references/arquitectura.md` recortada a lo que necesita. No metas colas, MCP o pgvector si no hay caso de uso todavía, pero deja el hueco preparado (paquete de contratos, `orgId`, registro de operaciones).
3. Orden de construcción recomendado: cimientos (monorepo, base de datos, auth, despliegue de un "hola mundo" real) → núcleo de datos → permisos → integraciones e IA → pulido. Desplegar en la primera semana evita sorpresas al final.
4. Antes del primer usuario real, pasa la checklist de producción.

## Despliegue

Para Railway con dominio propio, Google OAuth y GitHub, sigue `references/despliegue-railway.md`. Incluye la arquitectura de un solo dominio (la web hace de proxy de `/api` y `/mcp`), las variables, los secretos y los errores de despliegue que ya nos costaron horas.

Algunas acciones del despliegue cambian cosas fuera del repo: crear proyectos y servicios, tocar DNS, crear clientes OAuth o aceptar condiciones de un proveedor. Pide confirmación a la persona antes de cada una, y no escribas secretos en el chat: genéralos o cópialos con la CLI directamente a las variables del servicio.

## Frontend

Para decisiones de UI (design system por tokens, cliente tipado, permisos en la interfaz, PWA, sentirse como app nativa) lee `references/frontend.md`.

## Archivos de esta skill

- `references/arquitectura.md`: monorepo, registro de operaciones, multi-tenant, auth, permisos, API keys, MCP, datos para IA.
- `references/checklist-produccion.md`: la lista para auditar o para dar el visto bueno antes de producción.
- `references/despliegue-railway.md`: despliegue paso a paso, dominio, OAuth, GitHub y secretos.
- `references/frontend.md`: Next.js frente a Vite, estructura del front y patrones de UI.
- `references/trampas.md`: fallos reales con síntoma, causa y arreglo.
- `references/supabase-vercel.md`: el mismo criterio aplicado a Next.js + Supabase en Vercel (RLS, claves, migraciones, regiones, planes).
- `references/datos-sensibles.md`: salud, finanzas y datos personales: qué cambia y qué exige el RGPD.
- `references/i18n.md`: idiomas: librería, mensajes, idioma por usuario, formatos, servidor y cómo migrar una app existente.
- `assets/`: código de referencia listo para adaptar (servidor de la web con proxy, traductor de permisos CASL a Prisma, helper de esquemas de edición, roles por defecto).
