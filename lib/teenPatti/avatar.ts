const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export function resolveAvatarUrl(
  url: string | null | undefined,
  userId?: string | null,
): string {
  if (url) {
    const trimmed = url.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    if (SUPABASE_URL) {
      const path = trimmed.replace(/^\//, "");
      if (path.startsWith("storage/v1/")) {
        return `${SUPABASE_URL}/${path}`;
      }
      return `${SUPABASE_URL}/storage/v1/object/public/${path}`;
    }
    return trimmed;
  }
  if (userId) {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`;
  }
  return "https://api.dicebear.com/7.x/avataaars/svg?seed=player";
}

export function seatDisplayName(
  username: string | null | undefined,
  fallback = "Player",
): string {
  const name = username?.trim();
  if (!name) return fallback;
  return name.length > 10 ? `${name.slice(0, 9)}…` : name;
}
