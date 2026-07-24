import { create } from "zustand";

/**
 * Reactive game state (as opposed to per-frame `runtime` data). Kept small — only
 * things the React UI needs to re-render on. The treasure claim is a placeholder
 * until the M3 on-chain mint replaces it.
 */
const MAX_PLAYER_HEALTH = 100;

interface GameState {
  treasureClaimed: boolean;
  claimTreasure: () => void;

  playerHealth: number;
  maxPlayerHealth: number;
  isDead: boolean;
  /** Bumped on respawn so the controller can reset the player's position. */
  respawnNonce: number;
  damagePlayer: (amount: number) => void;
  respawn: () => void;
}

export const useGame = create<GameState>((set) => ({
  treasureClaimed: false,
  claimTreasure: () => set({ treasureClaimed: true }),

  playerHealth: MAX_PLAYER_HEALTH,
  maxPlayerHealth: MAX_PLAYER_HEALTH,
  isDead: false,
  respawnNonce: 0,
  damagePlayer: (amount) =>
    set((s) => {
      if (s.isDead) return s;
      const next = Math.max(0, s.playerHealth - amount);
      return { playerHealth: next, isDead: next <= 0 };
    }),
  respawn: () =>
    set((s) => ({
      playerHealth: MAX_PLAYER_HEALTH,
      isDead: false,
      respawnNonce: s.respawnNonce + 1,
    })),
}));
