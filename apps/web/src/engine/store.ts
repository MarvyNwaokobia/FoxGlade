import { create } from "zustand";

/**
 * Reactive game state (as opposed to per-frame `runtime` data). Kept small — only
 * things the React UI needs to re-render on. The treasure claim is a placeholder
 * until the M3 on-chain mint replaces it.
 */
interface GameState {
  treasureClaimed: boolean;
  claimTreasure: () => void;
}

export const useGame = create<GameState>((set) => ({
  treasureClaimed: false,
  claimTreasure: () => set({ treasureClaimed: true }),
}));
