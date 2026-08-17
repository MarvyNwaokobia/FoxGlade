import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side proxy to the Railway relay's /username/available — same shape
 * and reasoning as app/api/chain/onboarding/route.ts. A 503 here (relay not
 * configured, or the relay itself has no DATABASE_URL) is expected and fine —
 * onboardingSync.ts's checkUsernameAvailable() treats it as "can't tell yet,"
 * not as taken; the actual submit still enforces uniqueness for real.
 */
export async function GET(req: NextRequest) {
  const relayUrl = process.env.CHAIN_RELAY_URL;
  const relaySecret = process.env.CHAIN_RELAY_SECRET;
  if (!relayUrl || !relaySecret) {
    return NextResponse.json({ error: "chain relay not configured" }, { status: 503 });
  }

  const name = req.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const exclude = req.nextUrl.searchParams.get("exclude");

  const qs = new URLSearchParams({ name });
  if (exclude) qs.set("exclude", exclude);

  try {
    const upstream = await fetch(`${relayUrl}/username/available?${qs.toString()}`, {
      headers: { "x-relay-secret": relaySecret },
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: "relay unreachable" }, { status: 502 });
  }
}
