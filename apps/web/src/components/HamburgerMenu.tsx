"use client";

import { useEffect } from "react";
import { useGame } from "@/engine/store";

/**
 * The hamburger menu — a plain destination list, not a persistent nav bar
 * (Marvy's call, 2026-08-14: a corner button players tap, not chrome always
 * on screen). Profile, Marketplace, and Bank each own their own overlay/state
 * (Profile.tsx, Shop.tsx, Bank.tsx); Map and Help get their own screens and
 * an entry here as each is built.
 */
export function HamburgerMenu() {
  const roundState = useGame((s) => s.roundState);
  const menuOpen = useGame((s) => s.menuOpen);
  const openMenu = useGame((s) => s.openMenu);
  const closeMenu = useGame((s) => s.closeMenu);
  const openShop = useGame((s) => s.openShop);
  const openProfile = useGame((s) => s.openProfile);
  const openBank = useGame((s) => s.openBank);

  // Release the mouse from pointer-lock so it can click the overlay — same
  // fix Shop.tsx uses for itself; PlayerController re-acquires the lock once
  // this (or the shop) closes.
  useEffect(() => {
    if (menuOpen && document.pointerLockElement) document.exitPointerLock();
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.preventDefault();
        closeMenu();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, closeMenu]);

  if (roundState !== "playing") return null;

  return (
    <>
      <button style={styles.trigger} onClick={openMenu} aria-label="Menu">
        ☰
      </button>
      {menuOpen && (
        <div style={styles.root} onClick={closeMenu}>
          <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
            <div style={styles.header}>
              <span style={styles.title}>MENU</span>
              <button style={styles.close} onClick={closeMenu} aria-label="Close">
                ✕
              </button>
            </div>
            <div style={styles.list}>
              <button
                style={styles.item}
                onClick={() => {
                  closeMenu();
                  openProfile();
                }}
              >
                Profile
              </button>
              <button
                style={styles.item}
                onClick={() => {
                  closeMenu();
                  openShop();
                }}
              >
                Marketplace
              </button>
              <button
                style={styles.item}
                onClick={() => {
                  closeMenu();
                  openBank();
                }}
              >
                Bank
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const GOLD = "#f2c14e";
const INK = "#e8eef2";

const styles: Record<string, React.CSSProperties> = {
  trigger: {
    position: "fixed",
    top: "calc(env(safe-area-inset-top, 0px) + 14px)",
    left: "calc(env(safe-area-inset-left, 0px) + 14px)",
    zIndex: 30,
    width: 40,
    height: 40,
    borderRadius: 10,
    background: "rgba(20,16,12,0.72)",
    border: "1px solid rgba(242,193,78,0.35)",
    color: GOLD,
    fontSize: 18,
    fontFamily: "system-ui, sans-serif",
    cursor: "pointer",
  },
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
    width: "min(340px, 92vw)",
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
  title: { color: GOLD, fontWeight: 800, fontSize: 18, letterSpacing: 3 },
  close: {
    color: INK,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    width: 30,
    height: 30,
    fontSize: 14,
    cursor: "pointer",
  },
  list: { display: "flex", flexDirection: "column", padding: 12, gap: 8 },
  item: {
    color: INK,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    padding: "14px 16px",
    fontSize: 15,
    fontWeight: 600,
    textAlign: "left",
    cursor: "pointer",
  },
};
