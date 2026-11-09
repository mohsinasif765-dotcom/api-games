import { generateApiKey } from '@/lib/server/api-keys';
import { query } from '@/lib/server/db';
import { jsonError, jsonOk, requireAdmin } from '@/lib/server/http';
import {
  loadTenantBilling,
  merchantGetSsToken,
  merchantGetUserInfo,
  merchantUpdateSsToken,
} from '@/lib/server/merchant-callbacks';

export const runtime = 'nodejs';

type SessionBody = {
  tenant_slug?: string;
  external_id?: string;
  username?: string;
  avatar_url?: string;
  sstoken?: string;
  /** If true, call merchant get_sstoken when wallet_mode=merchant_callback */
  issue_sstoken?: boolean;
  coins?: number;
};

/**
 * Host-app session bootstrap (admin).
 * Returns api_key (+ optional sstoken) for launching H5:
 *   /greedylion?apiKey=pk_live_…&tenant=demo
 *   /greedylion?apiKey=…&sstoken=…&tenant=demo
 */
export async function POST(req: Request) {
  const adminErr = requireAdmin(req);
  if (adminErr) return adminErr;

  try {
    const body = (await req.json()) as SessionBody;
    const tenantSlug = (body.tenant_slug || 'demo').trim();
    const externalId =
      body.external_id?.trim() ||
      `player_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const tenantRes = await query<{ id: string }>(
      `SELECT id FROM tenants WHERE slug = $1 LIMIT 1`,
      [tenantSlug],
    );
    const tenantId = tenantRes.rows[0]?.id;
    if (!tenantId) return jsonError('Tenant not found', 404);

    const tenant = await loadTenantBilling(tenantId);
    if (!tenant || tenant.status !== 'active') {
      return jsonError('Tenant suspended or missing', 403);
    }

    let username = body.username?.trim() || externalId;
    let avatarUrl = body.avatar_url ?? null;
    let coins = Math.max(0, Math.floor(Number(body.coins ?? 0)));
    let sstoken = body.sstoken?.trim() || null;
    let sstokenExpires: string | null = null;

    if (tenant.wallet_mode === 'merchant_callback') {
      if (body.issue_sstoken || !sstoken) {
        const tok = await merchantGetSsToken(tenant, externalId);
        if (tok.ok && tok.sstoken) {
          sstoken = tok.sstoken;
          sstokenExpires = tok.expiresAt ?? null;
        }
      } else if (sstoken && tenant.cb_update_sstoken_url) {
        const upd = await merchantUpdateSsToken(tenant, externalId, sstoken);
        if (upd.ok && upd.sstoken) {
          sstoken = upd.sstoken;
          sstokenExpires = upd.expiresAt ?? null;
        }
      }

      const info = await merchantGetUserInfo(tenant, externalId, sstoken);
      if (info.ok && info.user) {
        username = info.user.nickname?.trim() || username;
        avatarUrl = info.user.avatar || avatarUrl;
        coins = info.user.coins;
      }
    } else if (!body.coins && body.coins !== 0) {
      coins = 100000;
    }

    const playerRes = await query<{ id: string; coins: string }>(
      `INSERT INTO players (
         tenant_id, external_id, username, avatar_url, coins, sstoken, sstoken_expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, external_id)
       DO UPDATE SET
         username = EXCLUDED.username,
         avatar_url = COALESCE(EXCLUDED.avatar_url, players.avatar_url),
         coins = CASE
           WHEN $8 = 'merchant_callback' THEN EXCLUDED.coins
           ELSE GREATEST(players.coins, EXCLUDED.coins)
         END,
         sstoken = COALESCE(EXCLUDED.sstoken, players.sstoken),
         sstoken_expires_at = COALESCE(EXCLUDED.sstoken_expires_at, players.sstoken_expires_at)
       RETURNING id, coins`,
      [
        tenantId,
        externalId,
        username,
        avatarUrl,
        coins,
        sstoken,
        sstokenExpires,
        tenant.wallet_mode,
      ],
    );

    const playerId = playerRes.rows[0].id;
    const key = generateApiKey();
    await query(
      `INSERT INTO player_api_keys (tenant_id, player_id, key_prefix, key_hash, scopes)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, playerId, key.prefix, key.hash, ['game:play']],
    );

    return jsonOk(
      {
        api_key: key.raw,
        sstoken,
        sstoken_expires_at: sstokenExpires,
        player_id: playerId,
        external_id: externalId,
        username,
        avatar_url: avatarUrl,
        coins: Number(playerRes.rows[0].coins),
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          wallet_mode: tenant.wallet_mode,
        },
        launch_query: `apiKey=${encodeURIComponent(key.raw)}&tenant=${encodeURIComponent(tenant.slug)}${
          sstoken ? `&sstoken=${encodeURIComponent(sstoken)}` : ''
        }`,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error('[api/v1/session]', e);
    return jsonError('Session failed', 500);
  }
}
