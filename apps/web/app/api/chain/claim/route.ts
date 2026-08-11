import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side proxy to the Railway gameServer relay (apps/server). Exists so
 * CHAIN_RELAY_SECRET never reaches the browser — a plain (non-NEXT_PUBLIC_)
 * env var here is only readable server-side, unlike anything shipped in the
 * client bundle. This route does no game-logic validation of its own beyond
 * shape; apps/server owns amount/rarity/rate-limit checks (DESIGN.md §13.2).
 */
export async function POST(req: NextRequest) {
  const relayUrl = process.env.CHAIN_RELAY_URL;
  const relaySecret = process.env.CHAIN_RELAY_SECRET;
  if (!relayUrl || !relaySecret) {
    return NextResponse.json({ error: "chain relay not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.player !== "string" ||
    typeof body.amount !== "number" ||
    (body.rarityTier !== 0 && body.rarityTier !== 1)
  ) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${relayUrl}/treasure/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-relay-secret": relaySecret },
      body: JSON.stringify({ player: body.player, amount: body.amount, rarityTier: body.rarityTier }),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: "relay unreachable" }, { status: 502 });
  }
}
