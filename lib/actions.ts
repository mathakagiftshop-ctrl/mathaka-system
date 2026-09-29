import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AuthError, authorize, type Permission, type User } from "@/lib/auth";

export type ActionState = { ok?: boolean; error?: string; message?: string; at?: number };

/** A business-rule failure whose message is safe to show the user. */
export class UserError extends Error {}

function formToObject(formData: FormData) {
  const result: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const values = formData.getAll(key).filter((value) => typeof value === "string");
    result[key] = key.endsWith("[]") ? values : values[0];
  }
  return result;
}

/**
 * Wraps a server action used with useActionState: checks the session and
 * permission, validates the form with zod, and turns failures into messages.
 */
export function formAction<S extends z.ZodType>(
  schema: S,
  handler: (input: z.infer<S>, user: User) => Promise<string | void>,
  permission?: Permission,
) {
  return async (_previous: ActionState, formData: FormData): Promise<ActionState> => {
    try {
      const user = await authorize(permission);
      const parsed = schema.safeParse(formToObject(formData));
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const field = issue.path.map(String).join(".").replace("[]", "");
        return { error: field ? `${label(field)}: ${issue.message}` : issue.message, at: Date.now() };
      }
      const message = await handler(parsed.data, user);
      return { ok: true, message: message || "Saved.", at: Date.now() };
    } catch (error) {
      unstable_rethrow(error);
      return { error: errorMessage(error), at: Date.now() };
    }
  };
}

export function errorMessage(error: unknown) {
  if (error instanceof UserError || error instanceof AuthError) return error.message;
  console.error(error);
  return "Something went wrong. Please try again.";
}

function label(field: string) {
  const text = field.replace(/([A-Z])/g, " $1").replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Reusable field schemas for FormData input (everything arrives as strings).
export const text = (max = 500) => z.string().trim().max(max).default("");
export const requiredText = (max = 200) => z.string().trim().min(1, "is required").max(max);
export const money = z.coerce.number().min(0, "can't be negative").max(100_000_000);
export const positiveMoney = z.coerce.number().positive("must be more than zero").max(100_000_000);
export const optionalDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "is not a valid date").or(z.literal("")).default("").transform((value) => value || null);
export const requiredDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "is not a valid date");
export const uuid = z.uuid("is not valid");
export const optionalUuid = z.uuid().or(z.literal("")).default("").transform((value) => value || null);
export const checkbox = z.string().optional().transform((value) => value === "on" || value === "true");
