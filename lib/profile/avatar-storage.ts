import { getSupabaseProjectUrl } from "@/lib/supabase/public-env";

const BUCKET = "avatars";

export function avatarObjectPath(userId: string, ext: string): string {
  const safeExt = ext.replace(/^\./, "").toLowerCase();
  return `${userId}/profile.${safeExt}`;
}

export function publicAvatarUrl(userId: string, ext: string): string | null {
  const base = getSupabaseProjectUrl();
  if (!base) return null;
  const safeExt = ext.replace(/^\./, "").toLowerCase();
  return `${base}/storage/v1/object/public/${BUCKET}/${userId}/profile.${safeExt}`;
}

export { BUCKET };
