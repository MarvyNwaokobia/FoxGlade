"use client";

import dynamic from "next/dynamic";
import { setGameMode } from "@/engine/config/mode";

// Foxglade Nights: the survivor-like. Same engine, third mode.
const NightsGame = dynamic(() => import("@/components/NightsGame"), { ssr: false });

export default function Page() {
  setGameMode("nights");
  return <NightsGame />;
}
