"use client";

import dynamic from "next/dynamic";

// Client-only (R3F touches window). Visit /preview to iterate on the dusk-village
// environment prototype. (The old model-viewer lives in VillagePreview.tsx.)
const EnvPreview = dynamic(() => import("@/components/EnvPreview"), { ssr: false });

export default function PreviewPage() {
  return <EnvPreview />;
}
