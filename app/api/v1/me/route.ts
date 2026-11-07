import { jsonError, jsonOk, requirePlayerAuth } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const authResult = await requirePlayerAuth(req);
    if (!authResult.ok) return authResult.response;

    const { auth } = authResult;
    return jsonOk({
      player: {
        id: auth.player.id,
        username: auth.player.username,
        avatar_url: auth.player.avatar_url,
        external_id: auth.player.external_id,
        coins: Number(auth.player.coins),
      },
      tenant: {
        id: auth.tenant.id,
        slug: auth.tenant.slug,
        name: auth.tenant.name,
      },
      scopes: auth.scopes,
    });
  } catch (e) {
    console.error('[api/v1/me]', e);
    return jsonError('Internal error', 500);
  }
}
