"use client";

import dynamic from "next/dynamic";

// Client-only (R3F touches window). Visit /onboarding-preview to iterate on
// the onboarding wizard in isolation, without an onComplete to fall through to
// — it's also mounted for real in Game.tsx, gated on hasOnboarded (see
// src/engine/onboarding.ts and src/components/Onboarding.tsx).
const Onboarding = dynamic(() => import("@/components/Onboarding").then((m) => m.Onboarding), { ssr: false });

export default function OnboardingPreviewPage() {
  return <Onboarding />;
}
