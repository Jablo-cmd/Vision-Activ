import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** null when the deployment is missing its public configuration. */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

export const isConfigured = supabase !== null;

/** Use inside services: fails with a clear message instead of a null dereference. */
export function db(): SupabaseClient {
  if (!supabase)
    throw new AppError("The application is not configured. Contact your administrator.");
  return supabase;
}

export class AppError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

type Result<T> = { data: T | null; error: { message: string; code?: string } | null };

/** Unwraps a Supabase result, converting errors into AppError with a user-safe message. */
export function unwrap<T>(res: Result<T>): T {
  if (res.error) throw new AppError(friendlyMessage(res.error), res.error.code);
  return res.data as T;
}

/** Postgres errors raised by our own functions are already written for people; map the generic ones. */
export function friendlyMessage(error: { message: string; code?: string }): string {
  switch (error.code) {
    case "42501":
      return error.message.includes("row-level security") ||
        error.message.includes("permission denied")
        ? "You do not have permission to do that."
        : error.message;
    case "23505":
      return error.message.includes("duplicate key") ? "That already exists." : error.message;
    case "23503":
      return error.message.includes("violates foreign key")
        ? "A related record was not found."
        : error.message;
    case "23514":
      return error.message.includes("violates check constraint")
        ? "Those values are not allowed. Please review the form."
        : error.message;
    case "PGRST301":
    case "PGRST303":
      return "Your session has expired. Please sign in again.";
    default:
      return error.message || "Something went wrong. Please try again.";
  }
}

export function errorText(
  e: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
