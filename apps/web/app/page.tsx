"use client";

import dynamic from "next/dynamic";

// The R3F canvas touches window/document, so it must be client-only (ssr:false),
// which in Next 15 requires the importing component to be a client component.
const Game = dynamic(() => import("@/components/Game"), { ssr: false });

export default function Page() {
  return <Game />;
}
