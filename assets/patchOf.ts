import { z } from 'zod';

/* Uso:
     export const RoleCreate = z.object({ name: z.string(), permissions: z.array(Permission).default([]) });
     export const RoleUpdate = patchOf(RoleCreate);   // NO RoleCreate.partial()
   Comprobación: RoleUpdate.parse({ name: 'x' }) debe devolver { name: 'x' } y no { name: 'x', permissions: [] }. */

type Unwrap<S> = S extends z.ZodDefault<infer I> ? I : S;
export type PatchShape<T extends z.ZodRawShape> = { [K in keyof T]: z.ZodOptional<Unwrap<T[K]>> };

/** Esquema de edición a partir del de alta: todo opcional y SIN los `.default()`.
    (`.partial()` de zod los conserva, y un PATCH con solo `name` acabaría
    reseteando los demás campos a su valor por defecto.) */
export function patchOf<T extends z.ZodRawShape>(schema: z.ZodObject<T>): z.ZodObject<PatchShape<T>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, field] of Object.entries(schema.shape) as [string, z.ZodTypeAny][]) {
    const inner = field instanceof z.ZodDefault ? (field.unwrap() as z.ZodTypeAny) : field;
    shape[key] = inner.optional();
  }
  return z.object(shape) as unknown as z.ZodObject<PatchShape<T>>;
}
