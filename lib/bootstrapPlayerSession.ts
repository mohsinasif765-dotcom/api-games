import {
  fetchGameConfig,
  fetchGameRound,
  fetchMe,
  getApiKeyFromUrl,
  getStoredApiKey,
  storeApiKey,
} from '@/lib/game-api-client';

export type BootstrappedSession = {
  apiKey: string | null;
  playerId: string | null;
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
  const apiKey = getStoredApiKey();

  let playerId: string | null = null;
  let balance = 0;
  if (apiKey) {
    const me = await fetchMe(apiKey);
    if (me.ok) {
      playerId = me.data.player.id;
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

  return { apiKey, playerId, balance, gameId, round, serverNow };
}

export function usingApiKeyAuth(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(getApiKeyFromUrl() || getStoredApiKey());
}
