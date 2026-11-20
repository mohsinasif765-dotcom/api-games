import { createHash, randomBytes } from 'node:crypto';
import { query } from './db';
import {
  CacheTTL,
  apiKeyCacheKey,
  cacheGetJson,
  cacheSetJson,
  cacheSetNx,
  lastUsedDebounceKey,
} from './cache';

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

type CachedAuth = {
  apiKeyId: string;
  scopes: string[];
  tenant: TenantRow;
  player: Omit<PlayerRow, 'coins'> & { coins?: string | number };
};

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = `pk_live_${randomBytes(24).toString('base64url')}`;
  const prefix = raw.slice(0, 16);
  return { raw, prefix, hash: hashApiKey(raw) };
}

async function touchLastUsed(apiKeyId: string) {
  const shouldWrite = await cacheSetNx(
    lastUsedDebounceKey(apiKeyId),
    CacheTTL.LAST_USED_DEBOUNCE,
  );
  if (!shouldWrite) return;
  void query(`UPDATE player_api_keys SET last_used_at = now() WHERE id = $1`, [
    apiKeyId,
  ]).catch((e) => console.error('[api-keys] last_used_at', e));
}

export async function resolveApiKey(
  rawKey: string | null | undefined,
  tenantSlug?: string | null,
): Promise<AuthContext | null> {
  const key = rawKey?.trim();
  if (!key) return null;

  const prefix = key.slice(0, 16);
  const keyHash = hashApiKey(key);
  const cacheKey = apiKeyCacheKey(keyHash);

  const cached = await cacheGetJson<CachedAuth>(cacheKey);
  if (cached?.apiKeyId) {
    if (cached.tenant.status !== 'active') return null;
    if (tenantSlug && tenantSlug !== cached.tenant.slug) return null;
    void touchLastUsed(cached.apiKeyId);
    return {
      apiKeyId: cached.apiKeyId,
      scopes: cached.scopes ?? ['game:play'],
      tenant: cached.tenant,
      player: {
        id: cached.player.id,
        tenant_id: cached.player.tenant_id,
        external_id: cached.player.external_id,
        username: cached.player.username,
        avatar_url: cached.player.avatar_url,
        // Hint only — boot / bets must refresh coins from DB or merchant.
        coins: cached.player.coins ?? 0,
      },
    };
  }

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

  void touchLastUsed(row.api_key_id);

  const auth: AuthContext = {
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

  const toCache: CachedAuth = {
    apiKeyId: auth.apiKeyId,
    scopes: auth.scopes,
    tenant: auth.tenant,
    player: {
      id: auth.player.id,
      tenant_id: auth.player.tenant_id,
      external_id: auth.player.external_id,
      username: auth.player.username,
      avatar_url: auth.player.avatar_url,
      // Do not treat as spendable; omit storing coins long-term preference:
      // still store snapshot for HUD hint only.
      coins: auth.player.coins,
    },
  };
  void cacheSetJson(cacheKey, toCache, CacheTTL.API_KEY);

  return auth;
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
