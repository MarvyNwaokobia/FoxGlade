import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side proxy to the Railway relay's /marketplace/buy — same shape and
 * reasoning as app/api/chain/claim/route.ts: CHAIN_RELAY_SECRET stays out of
 * the browser bundle. apps/server owns the real validation; this route only
 * checks the request has the right shape before forwarding.
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
    typeof body.buyer !== "string" ||
    typeof body.itemId !== "string" ||
    typeof body.qty !== "number" ||
    typeof body.deadline !== "string" ||
    typeof body.v !== "number" ||
    typeof body.r !== "string" ||
    typeof body.s !== "string"
  ) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${relayUrl}/marketplace/buy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-relay-secret": relaySecret },
      body: JSON.stringify(body),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: "relay unreachable" }, { status: 502 });
  }
}
