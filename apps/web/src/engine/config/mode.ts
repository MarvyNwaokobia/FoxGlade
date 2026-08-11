/**
 * Game-mode registry.
 *
 * Two games share this engine now. Foxglade is the medieval third-person village
 * run; Nighthaul is the first-person extraction shooter. They differ in camera,
 * companion and framing, not in locomotion, collision, rig or audio — so rather
 * than fork 15k lines, the divergent bits read a mode flag.
 *
 * The active mode is a module singleton rather than React context on purpose:
 * PlayerController reads it inside the 60fps loop, where a context read per frame
 * buys nothing and a re-render costs everything. Routes call `setGameMode` before
 * the canvas mounts (see app/nighthaul/page.tsx).
 */

export type GameModeId = "foxglade" | "nighthaul" | "nights";

export interface GameMode {
  id: GameModeId;
  /** Shown on loading screens and titles. */
  label: string;
  /** Camera sits at the eye (no third-person boom) and the body isn't drawn. */
  firstPerson: boolean;
  /** Whether the fox companion is part of this game. */
  fox: boolean;
}

export const MODES: Record<GameModeId, GameMode> = {
  foxglade: {
    id: "foxglade",
    label: "Foxglade",
    firstPerson: false,
    fox: true,
  },
  nighthaul: {
    id: "nighthaul",
    label: "Nighthaul",
    firstPerson: true,
    fox: false,
  },
  // The survivor-like. It shares the engine and almost nothing else: its own
  // camera, its own crowd renderer, its own controller. The flag exists so the
  // shared bits (input, audio, save) can tell which game is running.
  nights: {
    id: "nights",
    label: "Foxglade Nights",
    firstPerson: false,
    fox: true,
  },
};

let active: GameMode = MODES.foxglade;

/** Select the mode. Call before the canvas mounts — it is read per frame after. */
export function setGameMode(id: GameModeId) {
  active = MODES[id];
}

/** The mode the running game is in. Defaults to Foxglade. */
export function gameMode(): GameMode {
  return active;
}
