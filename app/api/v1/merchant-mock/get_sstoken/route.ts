import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

export const runtime = 'nodejs';

/** Local mock — issue a disposable sstoken. */
export async function POST(req: Request) {
  await req.text().catch(() => '');
  const sstoken = `ss_${randomBytes(16).toString('base64url')}`;
  return NextResponse.json({
    ok: true,
    code: 0,
    data: {
      sstoken,
      expires_in: 3600,
    },
    sstoken,
    expires_in: 3600,
  });
}
