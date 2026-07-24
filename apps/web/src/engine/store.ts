import { create } from "zustand";
import { runtime } from "@/engine/runtime";
import { BOMB, LOOT } from "@/engine/config/round";
import { HINTS, type Rarity } from "@/engine/world/hints";

/**
 * Reactive game state (as opposed to per-frame `runtime` data). Kept small — only
 * things the React UI needs to re-render on.
 */
const MAX_PLAYER_HEALTH = 100;

export type RoundState = "playing" | "won" | "lost";
export type RoundReason = "claimed" | "timeout" | "thief" | null;

interface GameState {
  treasureClaimed: boolean;
  /** Rarity of the treasure that won the round (null until claimed). */
  claimedRarity: Rarity | null;
  /** The claimed treasure had been cracked by a bomb: reduced rarity (§13.5). */
  treasureCracked: boolean;
  claimTreasure: (hintIndex: number) => void;

  bombsLeft: number;
  throwBomb: () => void;

  /** Loot on you (from claims, not yet banked) and safely in the vault.
      Placeholder for VilleToken until the chain is wired. Survives restarts. */
  villeCarrying: number;
  villeBanked: number;
  depositLoot: () => void;

  playerHealth: number;
  maxPlayerHealth: number;
  isDead: boolean;
  /** Bumped on respawn so the controller can reset the player's position. */
  respawnNonce: number;
  damagePlayer: (amount: number) => void;
  healPlayer: (amount: number) => void;
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
  claimedRarity: null,
  treasureCracked: false,
  claimTreasure: (hintIndex) => {
    if (get().roundState !== "playing") return;
    const hint = HINTS[hintIndex];
    if (!hint?.real || runtime.hintStolen[hintIndex]) return;
    const rarity = hint.rarity ?? "common";
    const cracked = runtime.hintCracked[hintIndex];
    // A cracked treasure pays one tier down (§13.5).
    const value = cracked ? (rarity === "rare" ? LOOT.common : LOOT.scrap) : LOOT[rarity];
    set((s) => ({
      treasureClaimed: true,
      claimedRarity: rarity,
      treasureCracked: cracked,
      villeCarrying: s.villeCarrying + value,
      roundState: "won",
      roundReason: "claimed",
    }));
  },

  bombsLeft: BOMB.perRound,
  throwBomb: () => set((s) => ({ bombsLeft: Math.max(0, s.bombsLeft - 1) })),

  villeCarrying: 0,
  villeBanked: 0,
  depositLoot: () => set((s) => ({ villeBanked: s.villeBanked + s.villeCarrying, villeCarrying: 0 })),

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
  healPlayer: (amount) =>
    set((s) => {
      if (s.isDead || s.roundState !== "playing") return s;
      return { playerHealth: Math.min(s.maxPlayerHealth, s.playerHealth + amount) };
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
    runtime.hintStolen.fill(false);
    runtime.hintCracked.fill(false);
    runtime.treasureStolenAt = -1;
    runtime.treasureCrackedAt = -1;
    runtime.revealRealUntil = -1;
    runtime.sniffReadyAt = 0;
    set((s) => ({
      treasureClaimed: false,
      claimedRarity: null,
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
