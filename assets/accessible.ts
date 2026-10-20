/* Requiere una "ability" con can(action, subject, field?) y rulesFor(action, subjectType),
   por ejemplo un wrapper de createMongoAbility de @casl/ability. Ajusta FIELD_MAPS a tu
   esquema: cada campo que uses en las condiciones de tus reglas necesita su traducción.
   Uso en un servicio:
     const allowed = accessibleWhere(ctx.ability, 'read', 'Person');
     if (!allowed) return [];
     prisma.person.findMany({ where: { AND: [allowed], orgId: ctx.org.id, ... } });
     items.map((p) => redactFields(ctx.ability, 'read', subject('Person', {...}), toDto(p)));  */
import type { AppAbility } from './ability.factory.js';

/* Traduce las reglas CASL (condiciones estilo Mongo sobre campos "virtuales"
   como teamIds o personId) a un `where` de Prisma, para que los listados solo
   devuelvan las filas que el usuario puede ver. Y oculta los campos que una
   regla con `fields` no deja leer. */

type Where = Record<string, unknown>;
type FieldMapper = (value: unknown) => Where;

/// Valor de condición → filtro Prisma (`x`, `{ $in: [...] }`, `{ $eq }`, `{ $ne }`)
function scalar(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    if ('$in' in v) return { in: (v.$in as unknown[]) ?? [] };
    if ('$eq' in v) return v.$eq;
    if ('$ne' in v) return { not: v.$ne };
    throw new Error(`Operador de condición no soportado: ${Object.keys(v).join(', ')}`);
  }
  return value;
}

const direct = (column: string): FieldMapper => (v) => ({ [column]: scalar(v) });
const viaPersonTeams = (prefix?: string): FieldMapper => (v) => {
  const teams = { teams: { some: { teamId: scalar(v) } } };
  return prefix ? { [prefix]: teams } : teams;
};

/// Cómo se traduce cada campo de condición en cada tipo de dato
const FIELD_MAPS: Record<string, Record<string, FieldMapper>> = {
  Person: { id: direct('id'), personId: direct('id'), teamIds: viaPersonTeams(), managerId: direct('managerId'), status: direct('status'), userId: direct('userId') },
  AccessGrant: { id: direct('id'), personId: direct('personId'), integrationId: direct('integrationId'), status: direct('status'), teamIds: viaPersonTeams('person') },
  OnboardingRun: { id: direct('id'), personId: direct('personId'), teamIds: viaPersonTeams('person'), assigneeId: (v) => ({ tasks: { some: { assigneeId: scalar(v) } } }) },
  Document: { id: direct('id'), personId: direct('personId'), teamIds: viaPersonTeams('person'), kind: direct('kind') },
};

function convert(subjectType: string, conditions: Record<string, unknown>): Where {
  const map = FIELD_MAPS[subjectType] ?? {};
  const parts = Object.entries(conditions).map(([key, value]) => {
    const mapper = map[key] ?? direct(key);
    return mapper(value);
  });
  return parts.length === 1 ? parts[0]! : { AND: parts };
}

/** `where` de Prisma con las filas que `action` permite sobre `subjectType`.
    Devuelve `null` si no puede ver ninguna (el llamante debe devolver vacío). */
export function accessibleWhere(ability: AppAbility, action: string, subjectType: string): Where | null {
  if (!ability.can(action, subjectType)) return null;
  const ors: Where[] = [];
  const nots: Where[] = [];
  let unrestricted = false;
  for (const rule of ability.rulesFor(action, subjectType)) {
    const cond = rule.conditions as Record<string, unknown> | undefined;
    if (rule.inverted) {
      // Una prohibición sin condición y sin campos tapa todo lo que viene detrás
      if (!cond) { if (!rule.fields) break; continue; }
      nots.push(convert(subjectType, cond));
      continue;
    }
    if (!cond) { unrestricted = true; break; }
    ors.push(convert(subjectType, cond));
  }
  if (!unrestricted && !ors.length) return null;
  const and: Where[] = [];
  if (!unrestricted) and.push({ OR: ors });
  for (const n of nots) and.push({ NOT: n });
  return and.length ? { AND: and } : {};
}

/// Campo de salida → nombre del campo en los permisos
const OUTPUT_FIELD_ALIASES: Record<string, string> = { positionId: 'position', managerId: 'manager' };
/// Siempre visibles: sin ellos no se puede ni enlazar a la ficha
const ALWAYS_VISIBLE = new Set(['id', 'slug', 'orgId', 'createdAt', 'updatedAt', 'archivedAt', 'restricted', 'invitation']);

/** Pone a null (o [] si es una lista) los campos que `action` no deja ver de
    esta instancia. `inst` es el objeto marcado con `subject()`. */
export function redactFields<T extends Record<string, unknown>>(ability: AppAbility, action: string, inst: Record<string, unknown>, output: T): T {
  const out: Record<string, unknown> = { ...output };
  let hidden = 0;
  for (const key of Object.keys(out)) {
    if (ALWAYS_VISIBLE.has(key)) continue;
    const field = OUTPUT_FIELD_ALIASES[key] ?? key;
    if (!ability.can(action, inst, field)) {
      out[key] = Array.isArray(out[key]) ? [] : null;
      hidden++;
    }
  }
  if (hidden) out.restricted = true;
  return out as T;
}

/** Campos del input que `action` no permite tocar en esta instancia. */
export function forbiddenFields(ability: AppAbility, action: string, inst: Record<string, unknown>, inputKeys: string[], aliases: Record<string, string> = {}): string[] {
  return inputKeys.filter((key) => !ability.can(action, inst, aliases[key] ?? key));
}
