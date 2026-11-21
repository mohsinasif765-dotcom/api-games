import { resolveAvatarUrl } from '@/lib/teenPatti/avatar';

export function gamePlayerProfile(
  username: string | null | undefined,
  avatarUrl: string | null | undefined,
  playerId?: string | null,
  fallbackName = 'Player',
) {
  const name = typeof username === 'string' ? username.trim() : '';
  const avatar = typeof avatarUrl === 'string' ? avatarUrl.trim() : '';
  const imageUrl = avatar.startsWith('//') ? `https:${avatar}` : avatar;

  return {
    name: name || fallbackName,
    avatar: imageUrl && /^https?:\/\//i.test(imageUrl)
      ? imageUrl
      : resolveAvatarUrl(imageUrl, playerId ? encodeURIComponent(playerId) : null),
  };
}
