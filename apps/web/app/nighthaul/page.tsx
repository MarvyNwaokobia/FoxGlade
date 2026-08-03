"use client";

import dynamic from "next/dynamic";
import { setGameMode } from "@/engine/config/mode";

// Nighthaul: the first-person extraction shooter. Same engine as Foxglade —
// same locomotion, collision, rig and audio — with the camera at the eye and a
// weapon viewmodel on the lens. The map is still Foxglade's village for now;
// swapping it for the sealed district is the next slice.
const Game = dynamic(() => import("@/components/Game"), { ssr: false });

export default function Page() {
  // Set during render, not at module scope: client-side navigation between the
  // two games does not re-run a module, so a module-scope call would leave you
  // in first person after routing back to Foxglade. Page renders before the
  // canvas it returns, so the mode is always set before the first frame.
  setGameMode("nighthaul");
  return <Game />;
}
