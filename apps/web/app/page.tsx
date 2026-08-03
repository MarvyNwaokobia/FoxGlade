"use client";

import dynamic from "next/dynamic";
import { setGameMode } from "@/engine/config/mode";

// The R3F canvas touches window/document, so it must be client-only (ssr:false),
// which in Next 15 requires the importing component to be a client component.
const Game = dynamic(() => import("@/components/Game"), { ssr: false });

export default function Page() {
  // Explicit, even though Foxglade is the default: /nighthaul shares this engine
  // and sets the mode too, so routing back here has to set it back. See mode.ts.
  setGameMode("foxglade");
  return <Game />;
}
