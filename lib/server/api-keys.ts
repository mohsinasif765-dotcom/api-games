import { createHash, randomBytes } from 'node:crypto';
import { query } from './db';

export type TenantRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
};

export type PlayerRow = {
  id: string;
  tenant_id: string;
  external_id: string | null;
  username: string | null;
  avatar_url: string | null;
  coins: string | number;
};

export type AuthContext = {
  tenant: TenantRow;
  player: PlayerRow;
  apiKeyId: string;
  scopes: string[];
};

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = `pk_live_${randomBytes(24).toString('base64url')}`;
  const prefix = raw.slice(0, 16);
  return { raw, prefix, hash: hashApiKey(raw) };
}

export async function resolveApiKey(
  rawKey: string | null | undefined,
  tenantSlug?: string | null,
): Promise<AuthContext | null> {
  const key = rawKey?.trim();
  if (!key) return null;

  const prefix = key.slice(0, 16);
  const keyHash = hashApiKey(key);

  const { rows } = await query<{
    api_key_id: string;
    scopes: string[] | null;
    revoked_at: string | null;
    tenant_id: string;
    tenant_slug: string;
    tenant_name: string;
    tenant_status: string;
    player_id: string;
    external_id: string | null;
    username: string | null;
    avatar_url: string | null;
    coins: string | number;
  }>(
    `SELECT
       k.id AS api_key_id,
       k.scopes,
       k.revoked_at,
       t.id AS tenant_id,
       t.slug AS tenant_slug,
       t.name AS tenant_name,
       t.status AS tenant_status,
       p.id AS player_id,
       p.external_id,
       p.username,
       p.avatar_url,
       p.coins
     FROM player_api_keys k
     JOIN tenants t ON t.id = k.tenant_id
     JOIN players p ON p.id = k.player_id
     WHERE k.key_prefix = $1 AND k.key_hash = $2
     LIMIT 1`,
    [prefix, keyHash],
  );

  const row = rows[0];
  if (!row || row.revoked_at) return null;
  if (row.tenant_status !== 'active') return null;
  if (tenantSlug && tenantSlug !== row.tenant_slug) return null;

  await query(`UPDATE player_api_keys SET last_used_at = now() WHERE id = $1`, [
    row.api_key_id,
  ]);

  return {
    apiKeyId: row.api_key_id,
    scopes: row.scopes ?? ['game:play'],
    tenant: {
      id: row.tenant_id,
      slug: row.tenant_slug,
      name: row.tenant_name,
      status: row.tenant_status,
    },
    player: {
      id: row.player_id,
      tenant_id: row.tenant_id,
      external_id: row.external_id,
      username: row.username,
      avatar_url: row.avatar_url,
      coins: row.coins,
    },
  };
}

export function extractApiKey(req: Request): string | null {
  const headerKey = req.headers.get('x-api-key')?.trim();
  if (headerKey) return headerKey;

  const auth = req.headers.get('authorization')?.trim();
  if (auth?.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim() || null;
  }

  try {
    const url = new URL(req.url);
    return url.searchParams.get('apiKey')?.trim() || null;
  } catch {
    return null;
  }
}

export function extractTenantSlug(req: Request): string | null {
  const header = req.headers.get('x-tenant-id')?.trim();
  if (header) return header;
  try {
    return new URL(req.url).searchParams.get('tenant')?.trim() || null;
  } catch {
    return null;
  }
}
