import { query } from '@/lib/server/db';
import { extractTenantSlug, resolveApiKey, extractApiKey } from '@/lib/server/api-keys';
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

    const { rows } = await query<{
      id: string;
      slug: string;
      name: string | null;
      status: string;
      meta: unknown;
    }>(
      `SELECT id, slug, name, status, meta
       FROM game_configs
       WHERE slug = $1
         AND status = 'active'
         AND ($2::uuid IS NULL OR tenant_id = $2 OR tenant_id IS NULL)
       ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END
       LIMIT 1`,
      [slug, tenantId],
    );

    const config = rows[0];
    if (!config) return jsonError('Game not found', 404);
    return jsonOk(config);
  } catch (e) {
    console.error('[api/v1/games/config]', e);
    return jsonError('Internal error', 500);
  }
}
