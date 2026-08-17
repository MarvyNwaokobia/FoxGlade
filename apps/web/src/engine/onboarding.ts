import type { CharacterModelId } from "@/engine/character/PlayerRig";

/**
 * The onboarding pick — which hero, which egg. Deliberately its OWN save file
 * (`foxglade.onboarding`, not `foxglade.save`): it was built ahead of being
 * wired into the actual game start (Marvy's call — build the screen now, wire
 * it in later on request), so it must not touch or risk anything the real
 * save schema depends on. Now wired: Game.tsx reads `hasOnboarded` here to
 * decide whether to show the screen at all.
 */
export type EggVariant = "ember" | "moss" | "frost";

export interface OnboardingData {
  version: number;
  hasOnboarded: boolean;
  heroId: CharacterModelId;
  eggVariant: EggVariant | null;
  completedAt: number | null;
  /** Which wallet address this pick was made under, if any was connected at
   *  the time — `null` for a guest pick (no wallet yet). Lets accountSync.ts
   *  tell "this device's save belongs to the account that's connecting now"
   *  apart from "this device has someone ELSE's stale save on it" (a
   *  different email/session tested here before), so a stale save can never
   *  get silently attributed — and chain-claimed — to the wrong account. */
  address: string | null;
  /** The player's chosen display name — part of their identity, tied to
   *  their wallet address, unique server-side (case-insensitive; see
   *  apps/server/src/db.ts). `null` until the username step completes; a
   *  player onboarded before this field existed also reads null until they
   *  go through it (see Game.tsx's `needsUsername`). */
  username: string | null;
}

/** 3-20 chars, alphanumeric + underscore. Must match apps/server/src/
 *  index.ts's USERNAME_RE — the server enforces this for real, this is only
 *  the UX-level check (disabling the Next button, live availability calls). */
export function isValidUsername(name: string): boolean {
  return /^[a-zA-Z0-9_]{3,20}$/.test(name);
}

const KEY = "foxglade.onboarding";
// Bumped 2026-08-17 to add `username` — also has the useful side effect of
// invalidating every pre-existing save, same as the `address` bump just
// before it (see git history): anyone onboarded under the old schema goes
// through the wizard once more, this time landing on the new username step
// instead of skipping straight past it with no name on file.
const VERSION = 3;

export const NEW_ONBOARDING: OnboardingData = {
  version: VERSION,
  hasOnboarded: false,
  heroId: "man",
  eggVariant: null,
  completedAt: null,
  address: null,
  username: null,
};

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

const EGG_VARIANTS: EggVariant[] = ["ember", "moss", "frost"];

export function loadOnboarding(): OnboardingData {
  try {
    const raw = backend().getItem(KEY);
    if (!raw) return { ...NEW_ONBOARDING };
    const p = JSON.parse(raw) as Partial<OnboardingData>;
    if (p.version !== VERSION) return { ...NEW_ONBOARDING };
    return {
      version: VERSION,
      hasOnboarded: p.hasOnboarded === true,
      heroId: p.heroId === "man" ? "man" : NEW_ONBOARDING.heroId,
      eggVariant: EGG_VARIANTS.includes(p.eggVariant as EggVariant) ? (p.eggVariant as EggVariant) : null,
      completedAt: typeof p.completedAt === "number" ? p.completedAt : null,
      address: typeof p.address === "string" ? p.address : null,
      username: typeof p.username === "string" ? p.username : null,
    };
  } catch {
    return { ...NEW_ONBOARDING };
  }
}

export function writeOnboarding(data: Omit<OnboardingData, "version">): void {
  try {
    backend().setItem(KEY, JSON.stringify({ version: VERSION, ...data }));
  } catch {
    /* private browsing, quota, or no storage at all */
  }
}

export function clearOnboarding(): void {
  try {
    backend().removeItem(KEY);
  } catch {
    /* ignore */
  }
}
