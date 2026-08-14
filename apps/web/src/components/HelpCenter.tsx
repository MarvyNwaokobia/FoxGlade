"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/engine/store";

const GOLD = "#f2c14e";
const INK = "#e8eef2";

interface QA {
  q: string;
  a: string;
}
interface Category {
  name: string;
  items: QA[];
}

/**
 * Static FAQ content (DESIGN request, 2026-08-14) — hardcoded, no CMS, same
 * approach Valor's Help Center uses. Grouped by the game's own systems rather
 * than a generic support taxonomy, so a player can find "why did I lose my
 * loot" without knowing the word for it first.
 */
const FAQ: Category[] = [
  {
    name: "Getting started",
    items: [
      {
        q: "What am I actually doing?",
        a: "Find treasure hidden around the village, carry it to the vault to bank it, then spend what you've banked at the market. Do that before the light runs out.",
      },
      {
        q: "What are the controls?",
        a: "WASD to move, mouse to look, left-click or F to shoot, right-click to aim, R to reload. Q sends your fox, E claims/banks/opens whatever you're standing near, X rests indoors, Tab opens the map, Esc releases the mouse.",
      },
      {
        q: "Do I need a wallet to play?",
        a: "No. Every core loop — finding, banking, spending — works entirely without one. Connecting a wallet only adds optional on-chain rewards and marketplace trading on top.",
      },
    ],
  },
  {
    name: "The day",
    items: [
      {
        q: "What are Morning, Afternoon, Dusk and Night?",
        a: "Chapters the day passes through. Each introduces one new thing: Morning wakes the blockers, Afternoon is when some villagers start lying to you, Dusk brings thieves racing you for loot, and Night is the last stretch before the light's gone.",
      },
      {
        q: "How does a day end?",
        a: "Once you've resolved that chapter's share of the day's treasure quota — banked it or lost it to a thief, either counts — the day moves to the next chapter. Resolve Night's share and the day is over; press E to sleep and start the next one.",
      },
      {
        q: "What happens if I run out of light?",
        a: "Nightfall is a hard backstop: if the day's quota was never resolved, the day ends anyway once the sun is fully down. Nothing you've already banked is lost.",
      },
    ],
  },
  {
    name: "Treasure & the bank",
    items: [
      {
        q: "I picked up a treasure — why don't I have the VILLE yet?",
        a: "Claiming picks it up; you're carrying it, not holding it safely. Walk it to the vault and press E to actually bank it. Get caught carrying it and you can lose it.",
      },
      {
        q: "What happens if I go down while carrying loot?",
        a: "You drop what you were carrying and it goes back on the board — findable again, by you or someone else. Anything already banked is untouched.",
      },
      {
        q: "A thief took my treasure. Is that it?",
        a: "It costs you — that treasure's gone — but it still counts as resolved toward the day's quota, and a fresh one appears. A theft is a setback, not a run-ender.",
      },
    ],
  },
  {
    name: "The fox",
    items: [
      {
        q: "How do I grow my fox?",
        a: "Buy the next growth stage at the market with banked VILLE. A grown fox has a shorter sniff cooldown and a better nose — it misreads far less often.",
      },
      {
        q: "Why is my fox rusty?",
        a: "Real time away from the game rusts it — slower, dumber, longer between commands. It's temporary: bank a few treasures back and it wears off, regardless of how long you were gone.",
      },
      {
        q: "What can I actually send my fox to do?",
        a: "Press Q to send it: it'll scout toward the real treasure if it's not already busy, or jump a threat if one's nearby. There's a cooldown between commands, shorter the more it's grown.",
      },
    ],
  },
  {
    name: "The market",
    items: [
      {
        q: "What can I spend VILLE on?",
        a: "Supplies (bandages, bombs, charts, lockboxes), weapons and attachments, bags that raise how much you can carry before banking, and fox growth.",
      },
      {
        q: "Do consumables carry over between days?",
        a: "No — supplies are a daily trip to the market, capped and re-kitted each morning. Permanents (weapons, bags, fox growth) stay bought.",
      },
    ],
  },
  {
    name: "Who do I trust?",
    items: [
      {
        q: "The guardian, villagers, and my fox all tell me things — who's honest?",
        a: "The guardian's morning briefing is trustworthy, once. Your fox can't lie — if it leads you somewhere, that's real, though a young fox can genuinely misjudge it. Villagers are a mixed bag: honest early in the day, and some of them start lying once Afternoon hits.",
      },
    ],
  },
];

function Accordion({ item }: { item: QA }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={styles.item}>
      <button style={styles.itemQ} onClick={() => setOpen((v) => !v)}>
        <span>{item.q}</span>
        <span style={styles.chevron}>{open ? "−" : "+"}</span>
      </button>
      {open && <div style={styles.itemA}>{item.a}</div>}
    </div>
  );
}

/**
 * Help Center / FAQ (DESIGN request, 2026-08-14): static content, searchable,
 * grouped by category, reached from the hamburger menu.
 */
export function HelpCenter() {
  const open = useGame((s) => s.helpOpen);
  const closeHelp = useGame((s) => s.closeHelp);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open && document.pointerLockElement) document.exitPointerLock();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.preventDefault();
        closeHelp();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeHelp]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const categories = q
    ? FAQ.map((c) => ({ ...c, items: c.items.filter((i) => i.q.toLowerCase().includes(q) || i.a.toLowerCase().includes(q)) })).filter(
        (c) => c.items.length > 0
      )
    : FAQ;

  return (
    <div style={styles.root} onClick={closeHelp}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.title}>HELP CENTER</div>
          <button style={styles.close} onClick={closeHelp} aria-label="Close">
            ✕
          </button>
        </div>
        <div style={styles.searchWrap}>
          <input
            style={styles.search}
            type="text"
            placeholder="Search the FAQ…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div style={styles.body}>
          {categories.length === 0 && <div style={styles.noResults}>No matches — try a different word.</div>}
          {categories.map((c) => (
            <div key={c.name} style={styles.category}>
              <div style={styles.categoryTitle}>{c.name}</div>
              {c.items.map((item) => (
                <Accordion key={item.q} item={item} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 60,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(6,7,9,0.6)",
    backdropFilter: "blur(4px)",
    fontFamily: "system-ui, sans-serif",
    padding: 16,
  },
  panel: {
    width: "min(640px, 96vw)",
    maxHeight: "88vh",
    display: "flex",
    flexDirection: "column",
    background: "linear-gradient(180deg, rgba(24,20,15,0.98), rgba(16,14,11,0.98))",
    border: "1px solid rgba(242,193,78,0.35)",
    borderRadius: 16,
    boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  title: { color: GOLD, fontWeight: 800, fontSize: 20, letterSpacing: 3 },
  close: {
    color: INK,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    width: 34,
    height: 34,
    fontSize: 16,
    cursor: "pointer",
  },
  searchWrap: { padding: "14px 20px 0" },
  search: {
    width: "100%",
    boxSizing: "border-box",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: "10px 12px",
    color: INK,
    fontSize: 14,
    outline: "none",
  },
  body: { padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 },
  noResults: { color: "rgba(232,238,242,0.5)", fontSize: 13.5, textAlign: "center", padding: "20px 0" },
  category: { display: "flex", flexDirection: "column", gap: 6 },
  categoryTitle: {
    color: "rgba(232,238,242,0.6)",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  item: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    overflow: "hidden",
  },
  itemQ: {
    width: "100%",
    boxSizing: "border-box",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "transparent",
    border: "none",
    color: INK,
    fontSize: 14,
    fontWeight: 600,
    padding: "12px 14px",
    cursor: "pointer",
    textAlign: "left",
  },
  chevron: { color: GOLD, fontSize: 16, fontWeight: 800, marginLeft: 10 },
  itemA: {
    color: "rgba(232,238,242,0.75)",
    fontSize: 13,
    lineHeight: 1.5,
    padding: "0 14px 14px",
  },
};
