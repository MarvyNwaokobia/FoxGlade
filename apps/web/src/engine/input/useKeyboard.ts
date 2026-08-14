import { useEffect, useRef } from "react";

export interface Keys {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
  jump: boolean;
}

const CODE_MAP: Record<string, keyof Keys> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "run",
  ShiftRight: "run",
  Space: "jump",
};

/** True while a keydown's target is somewhere a player is typing text — an
 *  input, a textarea, or anything contentEditable. Without this check, WASD
 *  (and Space/Shift) never reached a focused field at all: `preventDefault()`
 *  below suppresses the browser's own "insert this character" behavior
 *  regardless of what has focus, so typing "s" or "a" into the wallet email
 *  field — or this game's own Help Center search — silently dropped the
 *  letter. Movement is separately gated on `frozen` elsewhere, but that
 *  happens after the character would already have been eaten. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

/** Tracks held movement keys in a ref (no re-renders). */
export function useKeyboard() {
  const keys = useRef<Keys>({
    forward: false,
    back: false,
    left: false,
    right: false,
    run: false,
    jump: false,
  });

  useEffect(() => {
    const set = (code: string, value: boolean) => {
      const action = CODE_MAP[code];
      if (action) keys.current[action] = value;
    };
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (CODE_MAP[e.code]) e.preventDefault();
      set(e.code, true);
    };
    const up = (e: KeyboardEvent) => set(e.code, false);
    const blur = () => {
      // Dropped focus (e.g. alt-tab) can strand a key "held" — clear on blur.
      (Object.keys(keys.current) as (keyof Keys)[]).forEach((k) => (keys.current[k] = false));
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  return keys;
}
