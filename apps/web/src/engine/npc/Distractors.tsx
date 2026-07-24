"use client";

import { Distractor } from "./Distractor";
import { HINTS } from "@/engine/world/hints";

/** One distractor per decoy hint — stands beside its beacon and lies about it. */
export function Distractors() {
  return (
    <>
      {HINTS.map((h, i) =>
        h.real ? null : (
          <Distractor key={i} position={[h.pos.x + 1.6, 0, h.pos.z]} hintIndex={i} />
        )
      )}
    </>
  );
}
