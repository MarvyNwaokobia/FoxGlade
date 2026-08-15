import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side proxy to the Railway relay's /hero/claim — same shape and
 * reasoning as app/api/chain/claim/route.ts.
 */
export async function POST(req: NextRequest) {
  const relayUrl = process.env.CHAIN_RELAY_URL;
  const relaySecret = process.env.CHAIN_RELAY_SECRET;
  if (!relayUrl || !relaySecret) {
    return NextResponse.json({ error: "chain relay not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.player !== "string" || typeof body.heroId !== "number") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${relayUrl}/hero/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-relay-secret": relaySecret },
      body: JSON.stringify({ player: body.player, heroId: body.heroId }),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: "relay unreachable" }, { status: 502 });
  }
}
