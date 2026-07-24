"use client";

import dynamic from "next/dynamic";

// Client-only (R3F touches window). Visit /preview to inspect the village model.
const VillagePreview = dynamic(() => import("@/components/VillagePreview"), { ssr: false });

export default function PreviewPage() {
  return <VillagePreview />;
}
