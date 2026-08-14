/**
 * Whether the first-run guide (`TutorialBrief.tsx`) has already played.
 *
 * Its own save file, same reasoning as engine/onboarding.ts: this is a
 * once-ever flag, not part of a run's economy state, so it stays out of
 * `foxglade.save` entirely.
 */
export interface TutorialData {
  version: number;
  seenBrief: boolean;
}

const KEY = "foxglade.tutorial";
const VERSION = 1;

export const NEW_TUTORIAL: TutorialData = {
  version: VERSION,
  seenBrief: false,
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

export function loadTutorial(): TutorialData {
  try {
    const raw = backend().getItem(KEY);
    if (!raw) return { ...NEW_TUTORIAL };
    const p = JSON.parse(raw) as Partial<TutorialData>;
    if (p.version !== VERSION) return { ...NEW_TUTORIAL };
    return { version: VERSION, seenBrief: p.seenBrief === true };
  } catch {
    return { ...NEW_TUTORIAL };
  }
}

export function writeTutorial(data: Omit<TutorialData, "version">): void {
  try {
    backend().setItem(KEY, JSON.stringify({ version: VERSION, ...data }));
  } catch {
    /* private browsing, quota, or no storage at all */
  }
}

export function clearTutorial(): void {
  try {
    backend().removeItem(KEY);
  } catch {
    /* ignore */
  }
}
