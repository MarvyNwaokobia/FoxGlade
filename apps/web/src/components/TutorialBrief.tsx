"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/engine/store";

const GOLD = "#f2c14e";
const INK = "#e8eef2";

/**
 * The first-run guide: a few pages shown once, ever, right at the very start
 * of a brand-new game — BEFORE the map (see MapScreen.tsx's `newGameNonce`
 * effect, which opens this instead of the map the first time, then this
 * screen's own `finish` opens the map once it's done).
 *
 * This is deliberately NOT where "here's the bank, here's the market" lives —
 * Tutorial.tsx already teaches those verbs in context, the moment they become
 * relevant, which is a better teacher than a page read before you've even
 * moved. This covers only what nothing else says at all: that a "day" is a
 * quota passing through stages, that blockers and liars are coming, and that
 * a menu exists. Everything else — where the treasure is, what the guardian
 * meant — is deliberately the guardian's job, not this screen's (MapScreen.tsx
 * and villagerLines.ts already own that ground; duplicating it here would just
 * be the same instruction said twice in two different voices).
 */
interface Page {
  title: string;
  body: string;
}

const PAGES: Page[] = [
  {
    title: "The Day",
    body:
      "Each day has a quota of treasure to find and bank before the light runs out — dawn, morning, afternoon, dusk, night, one stage at a time. Bank what you carry, spend it at the market, and start again tomorrow.",
  },
  {
    title: "Not Everyone's Kin",
    body:
      "Armed blockers wake as the day goes on and will fight you for the route. Once afternoon hits, some villagers start lying about where the treasure lies. Trust the guardian's word — given once, each morning — over any stranger's.",
  },
  {
    title: "The Menu",
    body:
      "Tap ☰ in the top-left corner any time. It's your map, your profile, the vault's ledger, and the market — all in one place, whenever you need them.",
  },
];

export function TutorialBrief() {
  const open = useGame((s) => s.tutorialOpen);
  const closeTutorial = useGame((s) => s.closeTutorial);
  const openMapScreen = useGame((s) => s.openMapScreen);
  const [page, setPage] = useState(0);

  // However it's dismissed — GOT IT, the ✕, backdrop click, or Escape — the
  // map is the next screen in a brand-new game's onboarding, not just a
  // closed panel. See MapScreen.tsx's `newGameNonce` effect, which is what
  // opened this in the first place.
  const finish = () => {
    closeTutorial();
    openMapScreen();
  };

  useEffect(() => {
    if (open && document.pointerLockElement) document.exitPointerLock();
    if (open) setPage(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const last = page === PAGES.length - 1;
  const current = PAGES[page];

  return (
    <div style={styles.root} onClick={finish}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.title}>{current.title}</div>
          <button style={styles.close} onClick={finish} aria-label="Close">
            ✕
          </button>
        </div>
        <div style={styles.body}>{current.body}</div>
        <div style={styles.footer}>
          <div style={styles.dots}>
            {PAGES.map((_, i) => (
              <div key={i} style={{ ...styles.dot, ...(i === page ? styles.dotActive : null) }} />
            ))}
          </div>
          <div style={styles.navRow}>
            <button
              style={{ ...styles.backBtn, ...(page === 0 ? styles.navHidden : null) }}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              BACK
            </button>
            <button style={styles.cta} onClick={() => (last ? finish() : setPage((p) => p + 1))}>
              {last ? "GOT IT" : "NEXT"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 70,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(6,7,9,0.68)",
    backdropFilter: "blur(4px)",
    fontFamily: "system-ui, sans-serif",
    padding: 16,
  },
  panel: {
    width: "min(480px, 94vw)",
    background: "linear-gradient(180deg, rgba(24,20,15,0.98), rgba(16,14,11,0.98))",
    border: "1px solid rgba(242,193,78,0.35)",
    borderRadius: 16,
    boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
    padding: "22px 24px",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  title: { color: GOLD, fontWeight: 800, fontSize: 19, letterSpacing: 1 },
  close: {
    color: INK,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    width: 30,
    height: 30,
    fontSize: 14,
    cursor: "pointer",
    flexShrink: 0,
  },
  body: { color: "rgba(232,238,242,0.8)", fontSize: 14.5, lineHeight: 1.65, minHeight: 88 },
  footer: { marginTop: 18, display: "flex", flexDirection: "column", gap: 14, alignItems: "center" },
  dots: { display: "flex", gap: 8 },
  dot: { width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.15)" },
  dotActive: { background: GOLD, width: 18, borderRadius: 4 },
  navRow: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" },
  backBtn: {
    color: "rgba(232,238,242,0.6)",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 10,
    padding: "10px 18px",
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: 1,
    cursor: "pointer",
  },
  navHidden: { visibility: "hidden" },
  cta: {
    color: "#1a140f",
    background: GOLD,
    border: "none",
    borderRadius: 10,
    padding: "10px 26px",
    fontSize: 12.5,
    fontWeight: 800,
    letterSpacing: 1,
    cursor: "pointer",
    marginLeft: "auto",
  },
};
