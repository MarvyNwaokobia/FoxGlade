"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { pullPlayerStats, type ServerPlayerStats } from "@/engine/chain/playerStatsSync";
import { pullOnboarding } from "@/engine/chain/onboardingSync";
import { heroThumb } from "@/components/heroThumb";
import { PlayerCardView } from "@/components/PlayerCardView";
import { shareCardUrl } from "@/engine/shareCard";
import type { WeaponId } from "@/engine/config/shop";
import type { CharacterModelId } from "@/engine/character/PlayerRig";

const GOLD = "#f2c14e";

/**
 * The public player card (Marvy's request, 2026-08-16 — modeled on Valor's
 * /card/[wallet] page): whatever's been synced server-side for this wallet
 * (engine/chain/playerStatsSync.ts, pushed at a secured bank / day rollover),
 * readable by anyone with the link — no wallet or login needed to view one.
 *
 * Deliberately thinner than Valor's version: no PNG download, no challenge
 * link, no referral cookie — this game has none of the PvP/social systems
 * those exist for. Just the card, and a way back into the game.
 */
export default function PublicCardPage() {
  const params = useParams();
  const address = params?.address as string | undefined;

  const [stats, setStats] = useState<ServerPlayerStats | null>(null);
  // Distinct from "no stats" (`stats === null` with this false): the relay
  // hiccuped or this deployment's DB isn't configured, and a real player's
  // progress shouldn't be reported as "No Card Yet" just because of that.
  const [loadFailed, setLoadFailed] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      const [statsResult, onboarding] = await Promise.all([pullPlayerStats(address), pullOnboarding(address)]);
      if (cancelled) return;
      const serverStats = statsResult.ok ? statsResult.stats : null;
      setStats(serverStats);
      setLoadFailed(!statsResult.ok && statsResult.reason !== "not-found");
      setUsername(onboarding?.username ?? null);
      setLoading(false);
      if (serverStats) {
        document.title = `${onboarding?.username ?? `${address.slice(0, 6)}…${address.slice(-4)}`} | Foxglade`;
        const heroId = (onboarding?.heroId ?? "man") as CharacterModelId;
        heroThumb(heroId).then((url) => {
          if (!cancelled) setAvatar(url);
        });
      }
    })();
    return () => {
      cancelled = true;
      document.title = "Foxglade";
    };
  }, [address]);

  if (loading) {
    return (
      <div style={styles.root}>
        <div style={styles.loading}>Loading…</div>
      </div>
    );
  }

  if (!address || !stats) {
    return (
      <div style={styles.root}>
        <div style={styles.notFound}>
          <div style={styles.notFoundTitle}>{loadFailed ? "Couldn't Load This Card" : "No Card Yet"}</div>
          <div style={styles.notFoundBody}>
            {loadFailed
              ? "Something went wrong reaching the server — this doesn't mean the wallet has no progress. Try again shortly."
              : "This wallet hasn't banked anything in Foxglade yet — or hasn't connected one."}
          </div>
          <Link href="/" style={styles.cta}>
            Enter Foxglade
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <div style={styles.stack}>
        <PlayerCardView
          avatar={avatar}
          identityLabel={username}
          walletAddress={address}
          day={stats.day}
          treasuresBanked={stats.treasuresBanked}
          villeBanked={stats.villeBanked}
          villeEarned={stats.villeEarned}
          equippedWeapon={stats.equippedWeapon as WeaponId}
          owned={stats.owned}
        />
        <div style={styles.actions}>
          <Link href="/" style={styles.cta}>
            Enter Foxglade
          </Link>
          <button
            style={styles.shareBtn}
            onClick={() => {
              shareCardUrl(address).then((ok) => {
                if (ok) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              });
            }}
          >
            {copied ? "Link copied!" : "Copy link"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(160deg, #1a140f 0%, #0f0c09 100%)",
    fontFamily: "system-ui, sans-serif",
    padding: 20,
  },
  loading: { color: "rgba(232,238,242,0.5)", fontSize: 14 },
  stack: { width: "min(560px, 96vw)", display: "flex", flexDirection: "column", gap: 16, alignItems: "center" },
  actions: { display: "flex", gap: 10, width: "100%" },
  cta: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#1a140f",
    background: GOLD,
    borderRadius: 10,
    padding: "12px 20px",
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 0.5,
    textDecoration: "none",
    textAlign: "center",
  },
  shareBtn: {
    flex: 1,
    color: GOLD,
    background: "rgba(242,193,78,0.1)",
    border: "1px solid rgba(242,193,78,0.35)",
    borderRadius: 10,
    padding: "12px 20px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  notFound: {
    width: "min(420px, 96vw)",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 14,
    color: "#e8eef2",
  },
  notFoundTitle: { fontSize: 22, fontWeight: 800 },
  notFoundBody: { fontSize: 13.5, color: "rgba(232,238,242,0.55)", lineHeight: 1.5 },
};
