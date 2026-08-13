"use client";

import dynamic from "next/dynamic";

// Client-only (R3F touches window). Visit /onboarding-preview to iterate on
// the onboarding wizard in isolation — it is NOT mounted in the real game
// flow yet (see src/engine/onboarding.ts and src/components/Onboarding.tsx).
const Onboarding = dynamic(() => import("@/components/Onboarding").then((m) => m.Onboarding), { ssr: false });

export default function OnboardingPreviewPage() {
  return <Onboarding />;
}
