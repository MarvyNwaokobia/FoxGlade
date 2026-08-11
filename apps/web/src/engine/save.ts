import { DEFAULT_WEAPON, type WeaponId } from "@/engine/config/shop";

/**
 * What survives sleeping, and what does not.
 *
 * The run used to be a single session that ended at nightfall, so nothing needed
 * to outlive it and nothing did. Now that days follow one another, the split
 * between what you keep and what you re-kit each morning IS the progression, and
 * it is Marvy's call rather than a technical detail:
 *
 *   KEPT      your wallet, your lifetime earnings, the gear you bought, and the
 *             gun in your hands. These are what make day four different from
 *             day one.
 *   RE-KITTED bombs, restores and lockboxes. Supplies are a daily decision at
 *             the market, not a stockpile, which is what stops a good run from
 *             snowballing into an unlosable one.
 *
 * `villeEarned` is the lifetime total and only ever grows, so spending at the
 * market never walks the fox backwards.
 *
 * localStorage is a placeholder for the chain (DESIGN §7). Everything here is
 * deliberately a plain, versioned, JSON-shaped record so that swapping the
 * backing store later touches this file and nothing else.
 */
const KEY = "foxglade.save";
const VERSION = 1;

/**
 * Where the save actually lives.
 *
 * localStorage when there is one, and a plain in-memory map when there isn't.
 * The fallback is not a test convenience: private browsing, a full quota and a
 * locked-down browser all present as "no storage", and losing the day's earnings
 * the moment you bank them is a far worse failure than losing them on reload.
 * The game plays identically either way, it just forgets when the tab closes.
 */
const memory = new Map<string, string>();

function backend(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  try {
    if (typeof globalThis !== "undefined" && globalThis.localStorage) return globalThis.localStorage;
  } catch {
    /* touching localStorage can itself throw when storage is blocked */
  }
  return {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
  };
}

export interface SaveData {
  version: number;
  /** Which day you are on. Days are 1-indexed, because nobody calls it day zero. */
  day: number;
  villeBanked: number;
  villeEarned: number;
  owned: string[];
  equippedWeapon: WeaponId;
}

export const NEW_SAVE: SaveData = {
  version: VERSION,
  day: 1,
  villeBanked: 0,
  villeEarned: 0,
  owned: ["w_rifle"], // the starter carbine is yours from the first morning
  equippedWeapon: DEFAULT_WEAPON,
};

/**
 * Read the save, falling back to a fresh one.
 *
 * Every field is re-validated rather than trusted. This is player-editable text
 * on their own machine, and a hand-edited `villeBanked: "lots"` should start a
 * new game, not poison arithmetic all the way through the HUD.
 */
export function loadSave(): SaveData {
  try {
    const raw = backend().getItem(KEY);
    if (!raw) return { ...NEW_SAVE };
    const p = JSON.parse(raw) as Partial<SaveData>;
    if (p.version !== VERSION) return { ...NEW_SAVE };
    const num = (v: unknown, fallback: number) =>
      typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
    return {
      version: VERSION,
      day: Math.max(1, Math.floor(num(p.day, 1))),
      villeBanked: num(p.villeBanked, 0),
      villeEarned: num(p.villeEarned, 0),
      owned: Array.isArray(p.owned) && p.owned.every((i) => typeof i === "string")
        ? [...new Set([...p.owned, "w_rifle"])]
        : [...NEW_SAVE.owned],
      equippedWeapon: (typeof p.equippedWeapon === "string" ? p.equippedWeapon : DEFAULT_WEAPON) as WeaponId,
    };
  } catch {
    return { ...NEW_SAVE };
  }
}

/** Write the save. Silently does nothing if storage is unavailable or full. */
export function writeSave(data: Omit<SaveData, "version">): void {
  try {
    backend().setItem(KEY, JSON.stringify({ version: VERSION, ...data }));
  } catch {
    /* private browsing, quota, or no storage at all. Play on unsaved. */
  }
}

/** Wipe the save. Used by a full restart. */
export function clearSave(): void {
  try {
    backend().removeItem(KEY);
  } catch {
    /* ignore */
  }
}
