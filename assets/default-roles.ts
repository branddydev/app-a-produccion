/* EJEMPLO adaptado de un proyecto real (intranet de personas y accesos). Cambia sujetos y campos por los de tu dominio.
   Roles por defecto de una organización. Los usan la semilla y la creación de
   organizaciones nuevas, para que todas empiecen con el mismo molde.

   Campos de Person: son las claves que devuelve la API (position, manager,
   teams, roles, accesses…) y las que acepta al editar. Una regla con `fields`
   solo deja ver o tocar esos campos; sin `fields` deja todos. */

export interface DefaultPermission {
  action: string;
  subject: string;
  conditions?: Record<string, unknown>;
  fields?: string[];
  inverted?: boolean;
}

export interface DefaultRole {
  slug: string;
  name: string;
  description: string;
  isDefault?: boolean;
  permissions: DefaultPermission[];
}

/// Lo que cualquiera de la empresa puede ver de cualquier compañero
export const PERSON_BASIC_FIELDS = ['id', 'slug', 'firstName', 'lastName', 'displayName', 'email', 'avatarUrl', 'status', 'position', 'teams'];

/// Lo que un manager ve de la gente de sus equipos (todo menos compensación y notas)
export const PERSON_TEAM_FIELDS = [
  ...PERSON_BASIC_FIELDS, 'employment', 'startDate', 'endDate', 'manager', 'roles', 'accesses',
  'phone', 'whatsapp', 'personalEmail', 'country', 'city', 'timezone', 'userId', 'createdAt', 'updatedAt', 'archivedAt',
];

/// Lo que cada persona puede editar de su propia ficha
export const PERSON_SELF_EDITABLE = ['firstName', 'lastName', 'displayName', 'avatarUrl', 'personalEmail', 'phone', 'whatsapp', 'country', 'city', 'timezone'];

/// Lo que un manager puede editar de la gente de sus equipos
export const PERSON_TEAM_EDITABLE = [...PERSON_SELF_EDITABLE, 'position', 'manager', 'teams', 'employment', 'startDate', 'endDate', 'status'];

const MEMBER: DefaultPermission[] = [
  { action: 'read', subject: 'Person', fields: PERSON_BASIC_FIELDS },
  { action: 'read', subject: 'Person', conditions: { id: '${user.personId}' } },
  { action: 'update', subject: 'Person', conditions: { id: '${user.personId}' }, fields: PERSON_SELF_EDITABLE },
  { action: 'read', subject: 'Team' },
  { action: 'read', subject: 'BusinessUnit' },
  { action: 'read', subject: 'Position' },
  { action: 'read', subject: 'Organization' },
  { action: 'read', subject: 'Integration' },
  { action: 'read', subject: 'AccessGrant', conditions: { personId: '${user.personId}' } },
  { action: 'read', subject: 'OnboardingRun', conditions: { personId: '${user.personId}' } },
  { action: 'update', subject: 'OnboardingRun', conditions: { assigneeId: '${user.personId}' } },
  { action: 'read', subject: 'Document', conditions: { personId: '${user.personId}' } },
];

export const DEFAULT_ROLES: DefaultRole[] = [
  {
    slug: 'owner', name: 'Owner', description: 'Control total de la empresa.',
    permissions: [{ action: 'manage', subject: 'all' }],
  },
  {
    slug: 'admin', name: 'Admin', description: 'Gestiona personas, organigrama, roles, herramientas y accesos.',
    permissions: [
      { action: 'manage', subject: 'Person' },
      { action: 'manage', subject: 'Team' },
      { action: 'manage', subject: 'BusinessUnit' },
      { action: 'manage', subject: 'Position' },
      { action: 'manage', subject: 'Role' },
      { action: 'manage', subject: 'Integration' },
      { action: 'manage', subject: 'AccessGrant' },
      { action: 'manage', subject: 'OnboardingTemplate' },
      { action: 'manage', subject: 'OnboardingRun' },
      { action: 'manage', subject: 'Document' },
      { action: 'manage', subject: 'Invitation' },
      { action: 'read', subject: 'ActivityLog' },
      { action: 'read', subject: 'Organization' },
      { action: 'update', subject: 'Organization' },
    ],
  },
  {
    slug: 'manager', name: 'Manager', description: 'Ve a todos y gestiona a la gente de sus equipos.',
    permissions: [
      ...MEMBER,
      { action: 'read', subject: 'Person', conditions: { teamIds: '${user.teamIds}' }, fields: PERSON_TEAM_FIELDS },
      { action: 'update', subject: 'Person', conditions: { teamIds: '${user.teamIds}' }, fields: PERSON_TEAM_EDITABLE },
      { action: 'read', subject: 'AccessGrant', conditions: { teamIds: '${user.teamIds}' } },
      { action: 'provision', subject: 'AccessGrant', conditions: { teamIds: '${user.teamIds}' } },
      { action: 'manage', subject: 'OnboardingRun', conditions: { teamIds: '${user.teamIds}' } },
      { action: 'read', subject: 'OnboardingTemplate' },
      { action: 'read', subject: 'Document', conditions: { teamIds: '${user.teamIds}' } },
    ],
  },
  {
    slug: 'member', name: 'Miembro', description: 'Ve el directorio básico y gestiona su propia ficha.', isDefault: true,
    permissions: MEMBER,
  },
];
