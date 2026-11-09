import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/** Local mock — echo sstoken rotation. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { sstoken?: string };
  return NextResponse.json({
    ok: true,
    code: 0,
    data: { sstoken: body.sstoken || null },
  });
}
