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

const GENERIC = "Something went wrong. Please try again.";
const OFFLINE = "We could not reach the server. Check your connection and try again.";

/**
 * Our database functions raise errors written for people, with these codes. Everything else
 * (missing columns, syntax, PostgREST internals) is an implementation detail and never shown.
 */
const AUTHORED_CODES = new Set(["42501", "22023", "55000", "23503", "23505", "23514", "P0001"]);

export function friendlyMessage(error: { message: string; code?: string }): string {
  const { code, message } = error;
  if (code === "PGRST301" || code === "PGRST303" || /jwt expired/i.test(message))
    return "Your session has expired. Please sign in again.";
  if (!code && /failed to fetch|networkerror|load failed|network request failed/i.test(message))
    return OFFLINE;
  if (!code || !AUTHORED_CODES.has(code)) return GENERIC;
  if (code === "42501" && /row-level security|permission denied/i.test(message))
    return "You do not have permission to do that.";
  if (code === "23505" && /duplicate key/i.test(message)) return "That already exists.";
  if (code === "23503" && /violates foreign key/i.test(message))
    return "A related record was not found.";
  if (code === "23514" && /violates check constraint/i.test(message))
    return "Those values are not allowed. Please review the form.";
  if (/violates|constraint|relation|column|function/i.test(message) && code !== "P0001")
    return GENERIC;
  return message || GENERIC;
}

export function errorText(e: unknown, fallback = GENERIC): string {
  if (e instanceof AppError) return e.message || fallback;
  // Anything else (network failures, SDK errors) is mapped, never echoed raw.
  if (e instanceof Error) return friendlyMessage({ message: e.message }) || fallback;
  return fallback;
}
