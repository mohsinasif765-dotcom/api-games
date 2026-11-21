import {
  fetchBoot,
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
  /** Client clock around the request that produced serverNow (for ClockSync). */
  serverNowSentAt: number | null;
  serverNowReceivedAt: number | null;
};

/**
 * End-player API key bootstrap for Phaser / React game shells.
 * Prefers single /boot call; falls back to /me+/config+/round if needed.
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
  let gameId: string | null = null;
  let round: Record<string, unknown> | null = null;
  let serverNow: string | null = null;
  let serverNowSentAt: number | null = null;
  let serverNowReceivedAt: number | null = null;

  if (apiKey) {
    const sentAt = Date.now();
    const boot = await fetchBoot(slug, apiKey);
    if (boot.ok) {
      serverNowSentAt = sentAt;
      serverNowReceivedAt = Date.now();
      playerId = boot.data.player.id;
      username = boot.data.player.username;
      avatarUrl = boot.data.player.avatar_url;
      balance = boot.data.player.coins;
      gameId = boot.data.game_id || boot.data.game?.id || null;
      round = (boot.data.round as Record<string, unknown>) || null;
      serverNow = boot.data.server_now;
    } else {
      // Back-compat if /boot missing on older deploy — fetch in parallel.
      const roundSentAt = Date.now();
      const [me, config, roundRes] = await Promise.all([
        fetchMe(apiKey),
        fetchGameConfig(slug),
        fetchGameRound(slug).then((r) => {
          if (r.ok) {
            serverNowSentAt = roundSentAt;
            serverNowReceivedAt = Date.now();
          }
          return r;
        }),
      ]);
      if (me.ok) {
        playerId = me.data.player.id;
        username = me.data.player.username;
        avatarUrl = me.data.player.avatar_url;
        balance = me.data.player.coins;
      }
      if (config.ok) gameId = config.data.id;
      if (roundRes.ok) {
        gameId = gameId || roundRes.data.game_id;
        round = (roundRes.data.round as Record<string, unknown>) || null;
        serverNow = roundRes.data.server_now;
      }
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
    serverNowSentAt,
    serverNowReceivedAt,
  };
}

export function usingApiKeyAuth(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(getApiKeyFromUrl() || getStoredApiKey());
}
