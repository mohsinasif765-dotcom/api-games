import { query } from '@/lib/server/db';
import { extractApiKey, extractTenantSlug, resolveApiKey } from '@/lib/server/api-keys';
import { jsonError, jsonOk } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await ctx.params;
    const tenantSlug = extractTenantSlug(req);
    const apiKey = extractApiKey(req);
    let tenantId: string | null = null;

    if (apiKey) {
      const auth = await resolveApiKey(apiKey, tenantSlug);
      if (!auth) return jsonError('Invalid or missing API key', 401);
      tenantId = auth.tenant.id;
    } else if (tenantSlug) {
      const t = await query<{ id: string }>(
        `SELECT id FROM tenants WHERE slug = $1 AND status = 'active' LIMIT 1`,
        [tenantSlug],
      );
      tenantId = t.rows[0]?.id ?? null;
    }

    const configRes = await query<{ id: string }>(
      `SELECT id FROM game_configs
       WHERE slug = $1 AND status = 'active'
         AND ($2::uuid IS NULL OR tenant_id = $2 OR tenant_id IS NULL)
       ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END
       LIMIT 1`,
      [slug, tenantId],
    );
    const gameId = configRes.rows[0]?.id;
    if (!gameId) return jsonError('Game not found', 404);

    // Prefer this tenant's live round so clocks/bets stay scoped.
    let roundRes = tenantId
      ? await query(
          `SELECT *
           FROM game_rounds
           WHERE game_id = $1 AND status <> 'finished'
             AND (tenant_id = $2 OR tenant_id IS NULL)
           ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END, created_at DESC
           LIMIT 1`,
          [gameId, tenantId],
        )
      : await query(
          `SELECT *
           FROM game_rounds
           WHERE game_id = $1 AND status <> 'finished'
           ORDER BY created_at DESC
           LIMIT 1`,
          [gameId],
        );

    if (!roundRes.rows[0] && tenantId) {
      roundRes = await query(
        `INSERT INTO game_rounds (game_id, tenant_id, status, betting_ends_at)
         VALUES ($1, $2, 'betting', now() + interval '30 seconds')
         RETURNING *`,
        [gameId, tenantId],
      );
    }

    const round = roundRes.rows[0] ?? null;
    return jsonOk({
      game_id: gameId,
      slug,
      round,
      server_now: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[api/v1/games/round]', e);
    return jsonError('Internal error', 500);
  }
}
