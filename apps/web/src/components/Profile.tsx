"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/engine/store";
import { useWallet } from "@/engine/chain/wallet";
import { gameMode } from "@/engine/config/mode";
import { loadOnboarding } from "@/engine/onboarding";
import { heroThumb } from "./heroThumb";
import { PlayerCardView, cardGlowColor, GOLD, INK } from "./PlayerCardView";
import { shareCardUrl } from "@/engine/shareCard";

/**
 * The profile screen (DESIGN request, 2026-08-14): stats, loadout and the
 * fox's condition in one place, reached from the hamburger menu. Read-only —
 * growing the fox or buying gear still happens at the Market.
 *
 * Restyled as a player card (2026-08-16, Marvy's request — modeled on
 * Valor's PlayerCard): the actual card content now lives in
 * PlayerCardView.tsx, shared with the public /card/[address] page — this
 * component owns only the modal chrome (overlay, header, Escape/close) and
 * the wallet-owner-specific bits (live state, the hero portrait fetch, the
 * Share button).
 */
export function Profile() {
  const open = useGame((s) => s.profileOpen);
  const closeProfile = useGame((s) => s.closeProfile);
  const day = useGame((s) => s.day);
  const treasuresBanked = useGame((s) => s.treasuresBanked);
  const villeBanked = useGame((s) => s.villeBanked);
  const villeEarned = useGame((s) => s.villeEarned);
  const owned = useGame((s) => s.owned);
  const equippedWeapon = useGame((s) => s.equippedWeapon);
  const foxHoursAway = useGame((s) => s.foxHoursAway);
  const foxRustBanksLeft = useGame((s) => s.foxRustBanksLeft);
  const address = useWallet((s) => s.address);

  const [avatar, setAvatar] = useState<string | null>(null);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    if (open && document.pointerLockElement) document.exitPointerLock();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.preventDefault();
        closeProfile();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeProfile]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const heroId = loadOnboarding().heroId;
    heroThumb(heroId).then((url) => {
      if (!cancelled) setAvatar(url);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const glow = cardGlowColor(foxHoursAway, foxRustBanksLeft);

  return (
    <div style={styles.root} onClick={closeProfile}>
      <div style={styles.stack} onClick={(e) => e.stopPropagation()}>
        <div style={{ ...styles.header, borderColor: `${glow}45` }}>
          <div style={styles.title}>PLAYER CARD</div>
          <div style={styles.headerRight}>
            {address && (
              <button
                style={styles.share}
                onClick={() => {
                  shareCardUrl(address).then((ok) => {
                    if (ok) {
                      setShared(true);
                      setTimeout(() => setShared(false), 2000);
                    }
                  });
                }}
              >
                {shared ? "Link copied!" : "Share ↗"}
              </button>
            )}
            <button style={styles.close} onClick={closeProfile} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <PlayerCardView
          avatar={avatar}
          identityLabel={address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Guest — no wallet connected"}
          day={day}
          treasuresBanked={treasuresBanked}
          villeBanked={villeBanked}
          villeEarned={villeEarned}
          equippedWeapon={equippedWeapon}
          owned={owned}
          foxHoursAway={foxHoursAway}
          foxRustBanksLeft={foxRustBanksLeft}
          showFox={gameMode().fox}
        />
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
  stack: { width: "min(560px, 96vw)", maxHeight: "90vh", display: "flex", flexDirection: "column", gap: 10 },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 18px",
    background: "linear-gradient(180deg, rgba(24,20,15,0.98), rgba(16,14,11,0.98))",
    border: "1px solid",
    borderRadius: 12,
  },
  title: { color: GOLD, fontWeight: 800, fontSize: 18, letterSpacing: 3 },
  headerRight: { display: "flex", alignItems: "center", gap: 8 },
  share: {
    color: GOLD,
    background: "rgba(242,193,78,0.1)",
    border: "1px solid rgba(242,193,78,0.35)",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
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
};
