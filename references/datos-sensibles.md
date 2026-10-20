# Datos sensibles y regulados

Léelo cuando la app guarde datos de salud, datos financieros o bancarios, menores, datos laborales (salarios, documentos de identidad) o cualquier dato personal de terceros a escala. No es asesoría legal: recomienda siempre confirmar con un asesor, pero no omitas estos puntos, porque son los que más daño hacen si fallan.

## Qué cambia

- **El orden de trabajo:** primero aislamiento entre clientes y permisos, después despliegue. Un fallo de permisos con datos de salud no es un bug, es una brecha.
- **Separar físicamente lo más sensible** (notas clínicas, datos legales o bancarios) en tablas o columnas propias con acceso explícito, y que la API no las devuelva salvo a quien las necesita.
- **Registro de accesos de lectura**, no solo de cambios: quién abrió qué ficha y cuándo. Es lo que permite responder a una reclamación.
- **Nada se borra a la ligera.** Muchas normativas obligan a conservar (por ejemplo, historias clínicas durante años): archivar por defecto y un borrado real solo como proceso manual y deliberado.
- **MFA** para roles con acceso a esos datos y contraseñas largas.
- **Copias de seguridad** verificadas (y, si se puede, recuperación a un momento concreto).

## Europa (RGPD) en corto

- Datos de salud = **categoría especial** (art. 9): requieren medidas reforzadas.
- Si alojas datos de otras empresas (clínicas, clientes), pasas a ser **encargado del tratamiento**: contrato de encargo (art. 28) con cada una.
- Acepta los **acuerdos de tratamiento (DPA)** de los proveedores (hosting, base de datos, email, IA) y usa **regiones de la UE** para base de datos y funciones.
- Cuidado con mandar datos personales a APIs de IA sin acuerdo de tratamiento y sin necesidad: anonimiza o resume antes.
- Cada cliente debe informar a sus usuarios finales del software que usa.

En otros países la lógica es la misma con otra ley (HIPAA en EE. UU. para salud, leyes locales de protección de datos en Latinoamérica): identifica cuál aplica y recomiéndale a la persona que lo confirme.

## Añadir a la checklist

- 🔴 Datos más sensibles separados y con acceso explícito por rol.
- 🔴 Región de datos y DPA de proveedores revisados.
- 🔴 Backups de pago activos (no planes gratuitos para datos críticos).
- Registro de lecturas de datos sensibles.
- MFA para roles con acceso a datos sensibles.
- Política de conservación y archivado en vez de borrado.
