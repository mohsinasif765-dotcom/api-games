import { generateApiKey } from '@/lib/server/api-keys';
import { query } from '@/lib/server/db';
import { ApiErrorCode } from '@/lib/server/error-codes';
import { jsonError, jsonOk, requireAdmin } from '@/lib/server/http';

export const runtime = 'nodejs';

type IssueKeyBody = {
  tenant_slug?: string;
  external_id?: string;
  username?: string;
  avatar_url?: string;
  coins?: number;
  scopes?: string[];
};

export async function POST(req: Request) {
  const adminErr = requireAdmin(req);
  if (adminErr) return adminErr;

  try {
    const body = (await req.json()) as IssueKeyBody;
    const tenantSlug = (body.tenant_slug || 'demo').trim();
    const externalId =
      body.external_id?.trim() || `player_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const username = body.username?.trim() || externalId;
    const coins = Math.max(0, Math.floor(Number(body.coins ?? 100000)));
    const scopes = body.scopes?.length ? body.scopes : ['game:play'];

    const tenantRes = await query<{
      id: string;
      slug: string;
      name: string;
      wallet_mode: string;
    }>(
      `SELECT id, slug, name, COALESCE(wallet_mode, 'local') AS wallet_mode
       FROM tenants WHERE slug = $1 AND status = 'active' LIMIT 1`,
      [tenantSlug],
    );
    const tenant = tenantRes.rows[0];
    if (!tenant) {
      return jsonError('Tenant not found', 404, {
        code: ApiErrorCode.TENANT_NOT_FOUND,
      });
    }

    const playerRes = await query<{ id: string }>(
      `INSERT INTO players (tenant_id, external_id, username, avatar_url, coins)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, external_id)
       DO UPDATE SET
         username = EXCLUDED.username,
         avatar_url = COALESCE(EXCLUDED.avatar_url, players.avatar_url),
         coins = GREATEST(players.coins, EXCLUDED.coins)
       RETURNING id`,
      [tenant.id, externalId, username, body.avatar_url ?? null, coins],
    );
    const playerId = playerRes.rows[0].id;

    const key = generateApiKey();
    await query(
      `INSERT INTO player_api_keys (tenant_id, player_id, key_prefix, key_hash, scopes)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenant.id, playerId, key.prefix, key.hash, scopes],
    );

    return jsonOk(
      {
        api_key: key.raw,
        key_prefix: key.prefix,
        player_id: playerId,
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          wallet_mode: tenant.wallet_mode,
        },
        scopes,
        coins,
        hint:
          tenant.wallet_mode === 'merchant_callback'
            ? 'Use POST /api/v1/session with issue_sstoken for merchant launch'
            : undefined,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error('[api/v1/keys]', e);
    return jsonError('Internal error', 500, {
      code: ApiErrorCode.INTERNAL_ERROR,
    });
  }
}
