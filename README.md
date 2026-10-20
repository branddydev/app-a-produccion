# App de Claude a producción · skill para Claude

Una skill de Claude que **audita** una app hecha con Claude (o **planifica** una nueva) para llevarla a producción con buenas prácticas: stack, multi-empresa, roles y permisos granulares, seguridad, idiomas (i18n) y despliegue con dominio propio.

Sale de un proyecto real en producción (una intranet multi-empresa con permisos granulares, IA y servidor MCP) construido con Claude. Cada recomendación viene de algo que funcionó o de un fallo que costó tiempo encontrar.

## Qué hace

- **Auditar:** compara tu proyecto con el molde y te da un informe priorizado: veredicto, riesgos con un ejemplo de qué saldría mal y su arreglo, patrones que te conviene adoptar, lo que no cambiaría y el siguiente paso.
- **Planificar:** stack, estructura de monorepo, orden de construcción y despliegue para una app nueva.
- **Respeta tu stack:** el molde es NestJS + Prisma + Postgres con Vite (apps privadas) o Next.js (públicas) en Railway, pero si ya tienes, por ejemplo, Next.js + Supabase en Vercel funcionando, aplica los mismos principios ahí en vez de empujarte a migrar.

## Qué incluye

| Archivo | Contenido |
|---|---|
| `SKILL.md` | Flujo de trabajo, stack por defecto y cuándo cambiarlo, formato del informe |
| `references/arquitectura.md` | Monorepo, registro de operaciones, multi-tenant, usuario/miembro/ficha, permisos CASL por fila y por campo, invitaciones, API keys, MCP, datos para IA |
| `references/checklist-produccion.md` | La lista para dar el visto bueno antes de producción, con los puntos bloqueantes marcados |
| `references/despliegue-railway.md` | Despliegue paso a paso: un solo dominio, variables y secretos, DNS, Google OAuth, GitHub |
| `references/supabase-vercel.md` | Los mismos principios aplicados a Next.js + Supabase en Vercel (RLS, claves, regiones) |
| `references/datos-sensibles.md` | Salud, finanzas y datos personales: qué cambia y qué exige el RGPD |
| `references/i18n.md` | Idiomas en interfaz y servidor: librería, mensajes, idioma por usuario, formatos, migración |
| `references/frontend.md` | Next.js frente a Vite, cliente tipado, permisos en la UI, design system, PWA |
| `references/trampas.md` | 30 fallos reales con síntoma, causa y arreglo |
| `assets/` | Código de referencia para adaptar: servidor web con proxy, traductor de permisos CASL a Prisma, helper de esquemas de edición, roles por defecto |
| `examples/` | Una auditoría real hecha con la skill |

## Instalación

**Claude Code** (terminal o app de escritorio):

```bash
git clone https://github.com/branddydev/app-a-produccion ~/.claude/skills/app-a-produccion
```

Para actualizarla: `git -C ~/.claude/skills/app-a-produccion pull`.

**Claude.ai o Claude Desktop:** descarga el repo como ZIP (botón *Code → Download ZIP*), y súbelo en *Settings → Capabilities → Skills*.

## Cómo se usa

No hace falta nombrarla. Basta con pedir cosas como:

- "Revisa mi proyecto, ¿está listo para producción?"
- "¿Next o Vite para esta app?"
- "Quiero que la usen varias empresas, cada una con sus roles."
- "Cómo despliego esto con mi dominio."
- "Quiero la app en español e inglés."

Abre Claude dentro de la carpeta de tu proyecto para que pueda leer el código. Si no, describe tu app y trabajará con suposiciones explícitas.

No necesita claves ni MCPs. Para desplegar con ella conviene tener la CLI de tu proveedor (Railway o Vercel/Supabase) y `gh` con sesión iniciada. Las acciones que cambian cosas fuera de tu repo (crear proyectos, DNS, OAuth) siempre te las pide antes de hacerlas.

---

Versión 1.2.0
