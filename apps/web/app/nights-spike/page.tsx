"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

// Crowd-size spike. ?n=300 sets the walker count. Dev harness, not a game route.
const NightsSpike = dynamic(() => import("@/engine/nights/Spike").then((m) => m.NightsSpike), {
  ssr: false,
});

function Inner() {
  const n = Number(useSearchParams().get("n") ?? 300);
  return <NightsSpike count={Number.isFinite(n) ? n : 300} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
