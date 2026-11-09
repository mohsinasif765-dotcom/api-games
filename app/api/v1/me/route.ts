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
    let coins = Number(auth.player.coins);
    let username = auth.player.username;
    let avatarUrl = auth.player.avatar_url;

    const tenant = await loadTenantBilling(auth.tenant.id);
    if (
      tenant?.wallet_mode === 'merchant_callback' &&
      auth.player.external_id
    ) {
      const tok = await query<{ sstoken: string | null }>(
        `SELECT sstoken FROM players WHERE id = $1`,
        [auth.player.id],
      );
      const info = await merchantGetUserInfo(
        tenant,
        auth.player.external_id,
        tok.rows[0]?.sstoken,
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
