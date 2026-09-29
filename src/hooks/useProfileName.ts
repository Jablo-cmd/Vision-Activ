import { useQuery } from "@tanstack/react-query";
import { db, unwrap } from "../services/supabase";

/** The signed-in person's display name (their own profile row). */
export function useProfileName(userId: string | undefined): string | null {
  const { data } = useQuery({
    queryKey: ["profile", userId],
    enabled: Boolean(userId),
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const res = await db()
        .from("profiles")
        .select("full_name, email")
        .eq("id", userId!)
        .maybeSingle();
      const row = unwrap(res) as { full_name: string; email: string } | null;
      return row ? row.full_name.trim() || row.email : null;
    },
  });
  return data ?? null;
}
