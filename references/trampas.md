# Trampas reales: síntoma, causa y arreglo

Fallos que nos encontramos construyendo y desplegando la app de referencia. Casi ninguno sale en los tests. Al auditar un proyecto, busca cada uno en su código.

## Datos y API

**1. Editar algo resetea otros campos.**
- *Síntoma:* renombrar un rol le borra todos los permisos; editar el teléfono de una persona le cambia el tipo de contrato; renombrar una plantilla le borra los pasos.
- *Causa:* el esquema de edición se hizo con `CreateSchema.partial()`. En zod, `.partial()` **conserva los `.default()`**: un PATCH con solo `{ name }` llega con `permissions: []`, `mode: 'MANUAL'`… y el servicio los guarda.
- *Arreglo:* un helper `patchOf(schema)` que hace cada campo opcional y quita el default (`assets/patchOf.ts`). Compruébalo con `UpdateSchema.parse({ name: 'x' })`: debe devolver solo `{ name: 'x' }`.
- *Cómo buscarlo:* `grep -rn "\.partial()" packages/contracts`.

**2. Un miembro puede darse el rol de admin.**
- *Causa:* el permiso "editar mi ficha" no limita campos y el alta o edición acepta `roleSlugs`.
- *Arreglo:* reglas con `fields`, rechazo con 403 de campos no permitidos y exigir permiso sobre `Role` para asignar roles (ver arquitectura §6).

**3. Los listados enseñan lo que la ficha no deja abrir.**
- *Causa:* el permiso se comprueba al abrir una fila, pero el listado solo filtra por `orgId`. La búsqueda, el MCP y las vistas SQL igual.
- *Arreglo:* traducir las reglas a un `where` (`assets/accessible.ts`) en cada listado y en cada puerta lateral.

**4. Varias reglas por acción y sujeto revientan la semilla.**
- *Síntoma:* `Unique constraint failed on role_permission_roleId_action_subject_key`.
- *Arreglo:* índice normal en vez de unique. Hacen falta varias reglas por par.

**5. La pantalla de roles convierte "leer lo básico" en "leer todo".**
- *Causa:* la matriz acción × sujeto solo sabe de reglas simples; al guardar, una regla con `fields` se vuelve una regla sin campos.
- *Arreglo:* la matriz pinta solo reglas sin condiciones, campos ni inversión; las demás se conservan tal cual al guardar.

**6. Enlazar cuentas por email sin verificar.**
- *Riesgo:* alguien se registra con el email de un empleado y se queda su ficha.
- *Arreglo:* enlazar automáticamente solo con email verificado (Google) o con invitación aceptada.

## Base de datos y migraciones

**7. `migrate dev` quiere resetear la base de datos (drift).**
- *Causa:* algo se creó fuera de las migraciones (un índice HNSW de pgvector desde un script, la extensión ya instalada por la imagen).
- *Arreglo:* meterlo en una migración SQL propia y marcarla aplicada con `prisma migrate resolve --applied <nombre>`. No resetees una base con datos.

**8. Prisma propone `DROP INDEX` del índice vectorial en cada migración nueva.**
- *Causa:* Prisma no sabe declarar índices HNSW.
- *Arreglo:* crear la migración con `--create-only`, quitar el `DROP INDEX` y aplicarla. Déjalo anotado en el README.

**9. La extensión `vector` no existe en producción.**
- *Causa:* la plantilla de Postgres del proveedor no trae pgvector.
- *Arreglo:* imagen `pgvector/pgvector:pgNN` con volumen y `PGDATA` en una subcarpeta.

## Build y despliegue

**10. El build de producción falla aunque en local todo va.**
- *Causa típica:* una dependencia que solo se resuelve en el build (por ejemplo `workbox-window` con `vite-plugin-pwa`).
- *Arreglo:* hacer `pnpm build --force` en local antes de desplegar, siempre.

**11. El build en el servidor no encuentra TypeScript, Vite o Turbo.**
- *Causa:* `NODE_ENV=production` como variable del servicio, así que pnpm se salta las `devDependencies` al instalar.
- *Arreglo:* `NODE_ENV=production` solo en el comando de arranque.

**12. Las migraciones no corren en el servidor.**
- *Causa:* el CLI de Prisma o `tsx` están en `devDependencies`.
- *Arreglo:* pasarlos a `dependencies` del paquete de base de datos.

**13. `railway up` falla con `prefix not found` o corta la subida.**
- *Causa:* rutas con espacios, o subir carpetas pesadas.
- *Arreglo:* desplegar desde `git archive` en `/tmp` y usar `.railwayignore`.

**14. Railway ignora `railway.json`.**
- *Causa:* "config as code" está obsoleto.
- *Arreglo:* configurar build, arranque, pre-deploy, healthcheck y watch paths en el propio servicio.

**15. pnpm de corepack roto o TypeScript inesperado.**
- *Arreglo:* `corepack disable` e instalar pnpm con npm; fijar TypeScript a una versión concreta (`~5.9`): la "latest" puede ser una versión mayor incompatible con el tooling.

## Frontend

**16. Los paneles de cristal se ven transparentes en producción (no en local).**
- *Síntoma:* menús, flyouts y cabeceras dejan leer el contenido de debajo.
- *Causa:* el CSS declaraba `backdrop-filter` y `-webkit-backdrop-filter`; al minificar, Lightning CSS se quedó solo con la prefijada, que Chrome ignora.
- *Arreglo:* escribir solo `backdrop-filter`; el build añade el prefijo. Verifica en el CSS compilado (`grep backdrop-filter dist/assets/*.css`) y con `getComputedStyle(el).backdropFilter` en producción.

**17. Login en bucle infinito.**
- *Causa:* el layout protegido cachea la sesión (null antes de entrar) y redirige al login otra vez.
- *Arreglo:* tras iniciar sesión, invalidar o resetear la query de sesión; al cerrar sesión, limpiar toda la caché.

**18. Página en blanco al navegar.**
- *Causa:* View Transitions del router abortadas por el navegador; React no llega a pintar.
- *Arreglo:* desactivarlas por defecto y activarlas solo donde se prueben.

**19. Un diálogo pierde lo que acaba de mostrar (o entra en bucle).**
- *Causa:* un `useEffect` que resetea el estado "al abrir" depende de un objeto que se recrea en cada render (`person={{…}}`).
- *Arreglo:* depender de un id estable (`person?.id`), no del objeto.

**20. Al crear algo y navegar, se pierde información que había que enseñar (un enlace, una clave).**
- *Causa:* `onSaved` navega y desmonta el diálogo.
- *Arreglo:* si hay que enseñar un resultado, retrasa `onSaved` hasta que la persona cierre ese paso.

**21. Tras desplegar, se sigue viendo lo viejo.**
- *Causa:* el service worker de la PWA sirve la versión cacheada hasta actualizarse.
- *Arreglo:* `registerType: 'autoUpdate'` y avisar de "nueva versión, recarga"; al verificar un despliegue, recarga dos veces o mide en una pestaña nueva.

**22. Autorización solo en el middleware de Next.js.**
- *Riesgo:* versiones de Next.js 15 anteriores a 15.2.3 permitían saltarse el middleware con una cabecera (CVE-2025-29927).
- *Arreglo:* Next actualizado y comprobación de sesión y permisos también en cada API route o server action.

**23. Los tooltips o menús quedan debajo de otros paneles.**
- *Arreglo:* renderizarlos en un portal sobre `body` con su `z-index`, no dentro del contenedor con `overflow`.

## Idiomas

**26. La app sale en inglés a alguien que la usa en español (o al revés).**
- *Causa:* el idioma se toma solo del navegador, y mucha gente tiene el navegador en otro idioma.
- *Arreglo:* guardar el idioma en el perfil del usuario, que manda sobre el del navegador, y un selector visible.

**27. La interfaz está traducida pero los errores y la actividad no.**
- *Causa:* el servidor escribe frases fijas, y el registro de actividad guarda la frase ya redactada.
- *Arreglo:* la web envía el idioma activo en cada petición; el servidor traduce errores con un catálogo y guarda en la actividad clave + parámetros, no la frase.

**28. Un componente rompe al traducir: `m.algo is not a function`.**
- *Causa:* una variable local llamada `m` (un Map, un miembro) tapa el import de mensajes.
- *Arreglo:* renombrar la variable local.

**29. "1 eventos", "1 personas".**
- *Causa:* plurales concatenados a mano.
- *Arreglo:* mensajes con variantes de plural del formato de la librería.

**30. Justo después de desplegar, los errores de la API salen en el idioma del navegador.**
- *Causa:* la PWA sigue sirviendo el código anterior, que aún no enviaba el idioma en cada petición; el servidor cae al `Accept-Language` del navegador.
- *Arreglo:* se corrige solo al recargar. Al verificar un despliegue, recarga antes de dar por buena una prueba.

## Proceso

**24. "Funciona" sin haberlo probado como un usuario sin permisos.**
- *Arreglo:* una batería de pruebas de punta a punta contra la API que cree un miembro, un manager, una API key y otra empresa, y compruebe lo que cada uno puede y no puede hacer. Detectó bugs que la typecheck y los tests unitarios no veían.

**25. Datos de prueba que se quedan en la base de datos.**
- *Arreglo:* emails `@example.com` y slugs con marca de tiempo en las pruebas; al terminar, listar lo creado y borrarlo de forma explícita.
