import {
  fetchGameConfig,
  fetchGameRound,
  fetchMe,
  getApiKeyFromUrl,
  getSsTokenFromUrl,
  getStoredApiKey,
  storeApiKey,
  storeSsToken,
} from '@/lib/game-api-client';
import { notifyReady } from '@/lib/flutter-bridge';

export type BootstrappedSession = {
  apiKey: string | null;
  playerId: string | null;
  username: string | null;
  avatarUrl: string | null;
  balance: number;
  gameId: string | null;
  round: Record<string, unknown> | null;
  serverNow: string | null;
};

/**
 * End-player API key bootstrap for Phaser / React game shells.
 * Stores key, loads /me + game config + active round from local gateway.
 */
export async function bootstrapPlayerSession(
  slug: string,
): Promise<BootstrappedSession> {
  const fromUrl = getApiKeyFromUrl();
  if (fromUrl) storeApiKey(fromUrl);
  const ssFromUrl = getSsTokenFromUrl();
  if (ssFromUrl) storeSsToken(ssFromUrl);
  const apiKey = getStoredApiKey();

  let playerId: string | null = null;
  let username: string | null = null;
  let avatarUrl: string | null = null;
  let balance = 0;
  if (apiKey) {
    const me = await fetchMe(apiKey);
    if (me.ok) {
      playerId = me.data.player.id;
      username = me.data.player.username;
      avatarUrl = me.data.player.avatar_url;
      balance = me.data.player.coins;
    }
  }

  let gameId: string | null = null;
  let round: Record<string, unknown> | null = null;
  let serverNow: string | null = null;

  if (apiKey) {
    const config = await fetchGameConfig(slug);
    if (config.ok) gameId = config.data.id;

    const roundRes = await fetchGameRound(slug);
    if (roundRes.ok) {
      gameId = gameId || roundRes.data.game_id;
      round = (roundRes.data.round as Record<string, unknown>) || null;
      serverNow = roundRes.data.server_now;
    }
  }

  try {
    notifyReady({
      slug,
      playerId,
      hasApiKey: !!apiKey,
    });
  } catch {
    // ignore bridge errors during boot
  }

  return {
    apiKey,
    playerId,
    username,
    avatarUrl,
    balance,
    gameId,
    round,
    serverNow,
  };
}

export function usingApiKeyAuth(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(getApiKeyFromUrl() || getStoredApiKey());
}
