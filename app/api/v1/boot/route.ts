import { query } from '@/lib/server/db';
import { jsonError, jsonOk, requirePlayerAuth } from '@/lib/server/http';
import { loadGameConfigCached } from '@/lib/server/game-config-cache';
import { loadActiveRoundCached } from '@/lib/server/round-cache';
import {
  loadTenantBilling,
  merchantGetUserInfo,
} from '@/lib/server/merchant-callbacks';

export const runtime = 'nodejs';

/**
 * Single splash bootstrap: auth once + player balance + game config + active round.
 * Replaces separate /me + /config + /round round-trips on warm paths.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get('slug')?.trim();
    if (!slug) return jsonError('slug required', 400);

    const authResult = await requirePlayerAuth(req);
    if (!authResult.ok) return authResult.response;
    const { auth } = authResult;

    const [tenant, config, playerRow] = await Promise.all([
      loadTenantBilling(auth.tenant.id),
      loadGameConfigCached(slug, auth.tenant.id),
      query<{
        coins: string | number;
        username: string | null;
        avatar_url: string | null;
        sstoken: string | null;
        external_id: string | null;
      }>(
        `SELECT coins, username, avatar_url, sstoken, external_id
         FROM players WHERE id = $1 LIMIT 1`,
        [auth.player.id],
      ),
    ]);

    if (!config) return jsonError('Game not found', 404);

    let coins = Number(playerRow.rows[0]?.coins ?? auth.player.coins);
    let username = playerRow.rows[0]?.username ?? auth.player.username;
    let avatarUrl = playerRow.rows[0]?.avatar_url ?? auth.player.avatar_url;
    const externalId =
      playerRow.rows[0]?.external_id ?? auth.player.external_id;

    if (tenant?.wallet_mode === 'merchant_callback' && externalId) {
      const info = await merchantGetUserInfo(
        tenant,
        externalId,
        playerRow.rows[0]?.sstoken,
      );
      if (info.ok && info.user) {
        coins = info.user.coins;
        username = info.user.nickname || username;
        avatarUrl = info.user.avatar || avatarUrl;
        await query(
          `UPDATE players
           SET coins = $1,
               username = COALESCE($2, username),
               avatar_url = COALESCE($3, avatar_url)
           WHERE id = $4`,
          [coins, username, avatarUrl, auth.player.id],
        );
      }
    }

    const round = await loadActiveRoundCached(config.id, auth.tenant.id);

    return jsonOk({
      player: {
        id: auth.player.id,
        username,
        avatar_url: avatarUrl,
        external_id: externalId,
        coins,
      },
      tenant: {
        id: auth.tenant.id,
        slug: auth.tenant.slug,
        name: auth.tenant.name,
        wallet_mode: tenant?.wallet_mode ?? 'local',
      },
      scopes: auth.scopes,
      game: {
        id: config.id,
        slug: config.slug,
        name: config.name,
        status: config.status,
        meta: config.meta,
      },
      game_id: config.id,
      round,
      server_now: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[api/v1/boot]', e);
    return jsonError('Internal error', 500);
  }
}
