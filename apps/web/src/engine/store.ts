import { create } from "zustand";
import { runtime } from "@/engine/runtime";
import { BOMB } from "@/engine/config/round";

/**
 * Reactive game state (as opposed to per-frame `runtime` data). Kept small — only
 * things the React UI needs to re-render on.
 */
const MAX_PLAYER_HEALTH = 100;

export type RoundState = "playing" | "won" | "lost";
export type RoundReason = "claimed" | "timeout" | "thief" | null;

interface GameState {
  treasureClaimed: boolean;
  claimTreasure: () => void;

  /** A bomb blast reached the treasure: it still claims, at reduced rarity (§13.5). */
  treasureCracked: boolean;
  crackTreasure: () => void;

  bombsLeft: number;
  throwBomb: () => void;

  playerHealth: number;
  maxPlayerHealth: number;
  isDead: boolean;
  /** Bumped on respawn so the controller can reset the player's position. */
  respawnNonce: number;
  damagePlayer: (amount: number) => void;
  respawn: () => void;

  /** Round lifecycle. `timeLeft` lives in `runtime` (per-frame); this is the state. */
  roundState: RoundState;
  roundReason: RoundReason;
  /** Bumped on restart so the scene remounts (revives) all NPCs. */
  roundNonce: number;
  endRound: (reason: Exclude<RoundReason, null>) => void;
  restart: () => void;
}

export const useGame = create<GameState>((set, get) => ({
  treasureClaimed: false,
  claimTreasure: () => {
    if (get().roundState !== "playing") return;
    set({ treasureClaimed: true, roundState: "won", roundReason: "claimed" });
  },

  treasureCracked: false,
  crackTreasure: () => {
    if (get().roundState !== "playing" || get().treasureClaimed) return;
    set({ treasureCracked: true });
  },

  bombsLeft: BOMB.perRound,
  throwBomb: () => set((s) => ({ bombsLeft: Math.max(0, s.bombsLeft - 1) })),

  playerHealth: MAX_PLAYER_HEALTH,
  maxPlayerHealth: MAX_PLAYER_HEALTH,
  isDead: false,
  respawnNonce: 0,
  damagePlayer: (amount) =>
    set((s) => {
      if (s.isDead || s.roundState !== "playing") return s;
      const next = Math.max(0, s.playerHealth - amount);
      return { playerHealth: next, isDead: next <= 0 };
    }),
  respawn: () => set((s) => ({ playerHealth: MAX_PLAYER_HEALTH, isDead: false, respawnNonce: s.respawnNonce + 1 })),

  roundState: "playing",
  roundReason: null,
  roundNonce: 0,
  endRound: (reason) =>
    set((s) => {
      if (s.roundState !== "playing") return s;
      return { roundState: reason === "claimed" ? "won" : "lost", roundReason: reason };
    }),
  restart: () => {
    // Reset per-frame world state.
    runtime.roundStartAt = performance.now();
    runtime.hintSilenced.fill(false);
    runtime.revealRealUntil = -1;
    runtime.sniffReadyAt = 0;
    set((s) => ({
      treasureClaimed: false,
      treasureCracked: false,
      bombsLeft: BOMB.perRound,
      playerHealth: MAX_PLAYER_HEALTH,
      isDead: false,
      roundState: "playing",
      roundReason: null,
      roundNonce: s.roundNonce + 1,
      respawnNonce: s.respawnNonce + 1,
    }));
  },
}));
