import { query } from '@/lib/server/db';
import { jsonError, jsonOk, requirePlayerAuth } from '@/lib/server/http';
import {
  loadTenantBilling,
  merchantGetUserInfo,
} from '@/lib/server/merchant-callbacks';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const authResult = await requirePlayerAuth(req);
    if (!authResult.ok) return authResult.response;

    const { auth } = authResult;
    const [tenant, playerResult] = await Promise.all([
      loadTenantBilling(auth.tenant.id),
      query<{
        coins: string | number;
        username: string | null;
        avatar_url: string | null;
        sstoken: string | null;
      }>(
        `SELECT coins, username, avatar_url, sstoken FROM players WHERE id = $1`,
        [auth.player.id],
      ),
    ]);
    const player = playerResult.rows[0];
    let coins = Number(player?.coins ?? auth.player.coins);
    let username = player?.username ?? auth.player.username;
    let avatarUrl = player?.avatar_url ?? auth.player.avatar_url;
    if (
      tenant?.wallet_mode === 'merchant_callback' &&
      auth.player.external_id
    ) {
      const info = await merchantGetUserInfo(
        tenant,
        auth.player.external_id,
        player?.sstoken,
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
          [coins, info.user.nickname, info.user.avatar, auth.player.id],
        );
      }
    }

    return jsonOk({
      player: {
        id: auth.player.id,
        username,
        avatar_url: avatarUrl,
        external_id: auth.player.external_id,
        coins,
      },
      tenant: {
        id: auth.tenant.id,
        slug: auth.tenant.slug,
        name: auth.tenant.name,
        wallet_mode: tenant?.wallet_mode ?? 'local',
      },
      scopes: auth.scopes,
    });
  } catch (e) {
    console.error('[api/v1/me]', e);
    return jsonError('Internal error', 500);
  }
}
