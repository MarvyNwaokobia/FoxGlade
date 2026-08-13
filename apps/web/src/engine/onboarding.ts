import type { CharacterModelId } from "@/engine/character/PlayerRig";

/**
 * The onboarding pick — which hero, which egg. Deliberately its OWN save file
 * (`foxglade.onboarding`, not `foxglade.save`): this is being BUILT ahead of
 * being wired into the actual game start (Marvy's call — build the screen now,
 * wire it in later on request), so it must not touch or risk anything the real
 * save schema depends on. When it's wired, whatever reads `hasOnboarded` here
 * is what gates showing the screen at all.
 */
export type EggVariant = "ember" | "moss" | "frost";

export interface OnboardingData {
  version: number;
  hasOnboarded: boolean;
  heroId: CharacterModelId;
  eggVariant: EggVariant | null;
  completedAt: number | null;
}

const KEY = "foxglade.onboarding";
const VERSION = 1;

export const NEW_ONBOARDING: OnboardingData = {
  version: VERSION,
  hasOnboarded: false,
  heroId: "man",
  eggVariant: null,
  completedAt: null,
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
