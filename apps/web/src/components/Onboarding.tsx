"use client";

import { useEffect, useState } from "react";
import { HeroShowcase } from "./onboarding/HeroShowcase";
import { EggArt, EGG_INFO } from "./onboarding/EggArt";
import { loadOnboarding, writeOnboarding, isValidUsername, type EggVariant } from "@/engine/onboarding";
import { useWallet } from "@/engine/chain/wallet";
import { pushOnboarding, checkUsernameAvailable } from "@/engine/chain/onboardingSync";
import { claimHeroOnChain, claimPetOnChain } from "@/engine/chain/relay";

/**
 * The onboarding wizard: pick your hero (one, for now — see
 * foxglade-onboarding-roster), pick your egg, begin.
 *
 * Built standalone first (Marvy's call, 2026-08-13: build the screen now,
 * wire it in on request later), and now gated in front of Game.tsx — see
 * `onboarded` there. It writes its own pick to engine/onboarding.ts's
 * dedicated save file and calls `onComplete` if given one; /onboarding-preview
 * mounts it with neither, to iterate on the screen in isolation.
 */
type Step = "welcome" | "username" | "hero" | "egg" | "ready";

/**
 * Same threshold/pattern as WalletButton.tsx's `compact` check. Every
 * side-by-side row in this wizard (hero + its two locked previews, the
 * three egg cards, the ready-step pair) was laid out with fixed pixel
 * widths and no breakpoint, so on a real phone the content simply
 * overflowed the panel sideways instead of shrinking — this drives the
 * narrow-viewport variants added below.
 */
function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const measure = () => setNarrow(window.innerWidth < 520);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);
  return narrow;
}

const EGG_ORDER: EggVariant[] = ["ember", "moss", "frost"];

export interface OnboardingSelection {
  heroId: "man";
  eggVariant: EggVariant;
}

export interface OnboardingProps {
  /** Fires once the player confirms on the "ready" step (or, for a
   *  `retrofitUsernameOnly` mount, once the name alone is saved). */
  onComplete?: (selection: OnboardingSelection) => void;
  /** Skip the title/tagline/BEGIN step and open straight on the username
   *  step — for Game.tsx's mandatory flow, where ConnectGate's own BEGIN
   *  click already covered it (see Game.tsx). /onboarding-preview mounts
   *  with this unset, so the welcome step is still there to iterate on in
   *  isolation. */
  skipWelcome?: boolean;
  /** This account already has a hero and egg (hasOnboarded is true) but no
   *  username on file — an account onboarded before the username step
   *  existed (see Game.tsx's `needsUsername`). Opens straight on the
   *  username step same as `skipWelcome` does, but completing it saves the
   *  name alone and finishes immediately: no reason to walk someone who
   *  already has a hero and a fox back through picking either again, and
   *  doing so would re-fire the (non-idempotent, real-mainnet) hero/pet
   *  mint calls for an account that already holds both. */
  retrofitUsernameOnly?: boolean;
}

export function Onboarding({ onComplete, skipWelcome, retrofitUsernameOnly }: OnboardingProps) {
  const address = useWallet((s) => s.address);
  const logout = useWallet((s) => s.logout);

  // A draft only counts as resumable if it belongs to THIS address (or is a
  // guest pick, address null) — same rule accountSync.ts's reconcileAccount
  // uses, so a different account signing in on the same device never sees
  // someone else's in-progress egg/username picks (reconcileAccount also
  // clears such a foreign draft outright once it runs, this is just the
  // read-side half of that same guard). Resolved once, at mount — Onboarding
  // fully unmounts/remounts whenever Game.tsx swaps it for ConnectGate (a
  // sign-out) or back, so a fresh mount is exactly when a new draft should be
  // read.
  const [step, setStep] = useState<Step>(() => {
    if (retrofitUsernameOnly) return "username";
    const local = loadOnboarding();
    const ownDraft = !local.address || !address || local.address === address;
    if (ownDraft && local.step) return local.step;
    return skipWelcome ? "username" : "welcome";
  });
  const [egg, setEgg] = useState<EggVariant | null>(() => {
    const local = loadOnboarding();
    const ownDraft = !local.address || !address || local.address === address;
    return ownDraft ? local.eggVariant : null;
  });
  const [username, setUsername] = useState(() => {
    const local = loadOnboarding();
    const ownDraft = !local.address || !address || local.address === address;
    return ownDraft ? local.username ?? "" : "";
  });
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mid-wizard resume: every step/egg/username change gets written back as a
  // draft (hasOnboarded still false) so a player who signs out here (see the
  // sign-out button below) and logs back in — same address, whichever method
  // — picks up right where they left off instead of restarting the wizard.
  // Skipped for retrofitUsernameOnly: that mount already has a completed
  // hero/egg on file and only ever touches the username field, which
  // confirmUsernameOnly() writes for real on submit.
  useEffect(() => {
    if (retrofitUsernameOnly) return;
    const existing = loadOnboarding();
    if (existing.hasOnboarded) return;
    writeOnboarding({
      hasOnboarded: false,
      heroId: "man",
      eggVariant: egg,
      completedAt: null,
      address: address ?? existing.address,
      username: username || null,
      step,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, egg, username, address, retrofitUsernameOnly]);

  const confirm = async () => {
    if (!egg || !username || confirming) return;
    setConfirming(true);
    setError(null);
    const completedAt = Date.now();
    // Best-effort — a wallet already restored by the time this screen shows
    // (see Game.tsx) means this device's pick is now recoverable on another
    // one too. No wallet yet is a silent no-op, same as every other chain call.
    const address = useWallet.getState().address;
    if (address) {
      const result = await pushOnboarding(address, {
        heroId: "man",
        eggVariant: egg,
        hasOnboarded: true,
        completedAt,
        username,
      });
      // Only a genuine 409 (someone else took the name between the live
      // check and this submit) blocks finishing — a relay/DB outage is
      // additive-only, same as every other chain call in this app, and
      // must never strand a player mid-onboarding over it.
      if (!result.ok && result.reason === "taken") {
        setConfirming(false);
        setError("That username was just taken — go back and pick another.");
        setStep("username");
        return;
      }
      // Real, permanent claims — heroId 0 is "The Outlier", the only roster
      // slot right now (see foxglade-onboarding-roster). Gasless, additive.
      claimHeroOnChain(0);
      claimPetOnChain();
    }
    writeOnboarding({ hasOnboarded: true, heroId: "man", eggVariant: egg, completedAt, address, username, step: null });
    setConfirming(false);
    setSaved(true);
    onComplete?.({ heroId: "man", eggVariant: egg });
  };

  const confirmUsernameOnly = async () => {
    const existing = loadOnboarding();
    if (!username || !existing.eggVariant || confirming) return;
    setConfirming(true);
    setError(null);
    const address = useWallet.getState().address;
    if (address) {
      const result = await pushOnboarding(address, {
        heroId: "man",
        eggVariant: existing.eggVariant,
        hasOnboarded: true,
        completedAt: existing.completedAt,
        username,
      });
      if (!result.ok && result.reason === "taken") {
        setConfirming(false);
        setError("That username was just taken — try another.");
        return;
      }
    }
    writeOnboarding({
      hasOnboarded: true,
      heroId: "man",
      eggVariant: existing.eggVariant,
      completedAt: existing.completedAt,
      address: address ?? existing.address,
      username,
      step: null,
    });
    setConfirming(false);
    onComplete?.({ heroId: "man", eggVariant: existing.eggVariant });
  };

  return (
    <div style={styles.root}>
      <div style={styles.vignette} />
      {address && (
        // Signing out mid-onboarding drops `address` to null, which sends
        // Game.tsx straight back to ConnectGate (it watches useWallet's
        // address reactively) — the draft persisted above is what lets
        // logging back in land here again instead of at square one.
        <button style={styles.signOut} onClick={() => logout()}>
          Sign out
        </button>
      )}
      <div style={styles.panel}>
        {step === "welcome" && <WelcomeStep onNext={() => setStep("username")} />}
        {step === "username" && (
          <UsernameStep
            username={username}
            onChange={setUsername}
            onBack={() => setStep("welcome")}
            onNext={retrofitUsernameOnly ? confirmUsernameOnly : () => setStep("hero")}
            nextLabel={retrofitUsernameOnly ? "ENTER" : "CONTINUE"}
            busy={confirming}
            error={error}
          />
        )}
        {step === "hero" && <HeroStep onBack={() => setStep("username")} onNext={() => setStep("egg")} />}
        {step === "egg" && (
          <EggStep egg={egg} onPick={setEgg} onBack={() => setStep("hero")} onNext={() => setStep("ready")} />
        )}
        {step === "ready" && egg && (
          <ReadyStep egg={egg} saved={saved} busy={confirming} error={error} onBack={() => setStep("egg")} onConfirm={confirm} />
        )}
      </div>
      {!retrofitUsernameOnly && <StepDots step={step} />}
    </div>
  );
}

function StepDots({ step }: { step: Step }) {
  const steps: Step[] = ["welcome", "username", "hero", "egg", "ready"];
  const i = steps.indexOf(step);
  return (
    <div style={styles.dots}>
      {steps.map((s, idx) => (
        <div key={s} style={{ ...styles.dot, ...(idx === i ? styles.dotActive : idx < i ? styles.dotDone : null) }} />
      ))}
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div style={styles.center}>
      <div style={styles.brand}>FOXGLADE</div>
      <div style={styles.tagline}>
        One family holds this village. Every face you meet is kin — except yours.
        <br />
        You're the outlier who came to hunt its treasure, with only a fox that
        hatched for no one else to watch your back.
      </div>
      <button style={styles.cta} onClick={onNext}>
        BEGIN
      </button>
    </div>
  );
}

/**
 * Every dot the player leaves on the village depends on this: it's the
 * label the marketplace, the leaderboard-shaped bits of a player card, and
 * (later) chat show instead of a bare truncated address. Debounced live
 * availability check against the server (checkUsernameAvailable) — the
 * unique index in apps/server/src/db.ts is what actually enforces it, this
 * is just fast feedback so a taken name doesn't surface as a submit-time
 * surprise on the LAST step.
 */
function UsernameStep({
  username,
  onChange,
  onBack,
  onNext,
  nextLabel,
  busy,
  error,
}: {
  username: string;
  onChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  busy: boolean;
  error: string | null;
}) {
  const address = useWallet((s) => s.address);
  const formatValid = isValidUsername(username);
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!formatValid) {
      setAvailable(null);
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const t = setTimeout(() => {
      checkUsernameAvailable(username, address ?? undefined).then((result) => {
        if (cancelled) return;
        setAvailable(result);
        setChecking(false);
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [username, formatValid, address]);

  const canSubmit = formatValid && available !== false && !busy;

  return (
    <div style={styles.stepBody}>
      <div style={styles.stepTitle}>Your Name</div>
      <div style={styles.stepSub}>
        Tied to this wallet — it&apos;s how the village, the marketplace and your card know you instead of a bare
        address.
      </div>
      <input
        style={styles.usernameInput}
        value={username}
        onChange={(e) => onChange(e.target.value.replace(/\s/g, ""))}
        placeholder="username"
        maxLength={20}
        autoFocus
      />
      <div style={styles.usernameStatus}>
        {username && !formatValid ? (
          <span style={styles.usernameBad}>3-20 characters — letters, numbers, underscore only.</span>
        ) : checking ? (
          <span style={styles.usernameChecking}>Checking…</span>
        ) : available === false ? (
          <span style={styles.usernameBad}>That name&apos;s taken.</span>
        ) : available === true ? (
          <span style={styles.usernameGood}>Available.</span>
        ) : null}
      </div>
      {error && <div style={styles.error}>{error}</div>}
      <StepNav onBack={onBack} onNext={onNext} nextLabel={busy ? "…" : nextLabel} nextDisabled={!canSubmit} />
    </div>
  );
}

function HeroStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const narrow = useNarrowViewport();
  return (
    <div style={styles.stepBody}>
      <div style={styles.stepTitle}>Your Hero</div>
      <div style={styles.stepSub}>One outlier, for now. More arrive from the Marketplace later.</div>
      <div style={{ ...styles.heroRow, ...(narrow ? styles.heroRowNarrow : null) }}>
        <div style={styles.heroCard}>
          <div style={styles.heroCanvasWrap}>
            <HeroShowcase />
          </div>
          <div style={styles.heroName}>The Outlier</div>
          <div style={styles.heroDesc}>Last one in, first one blamed. Knows the walls better than the family does.</div>
        </div>
        <div style={{ ...styles.lockedCol, ...(narrow ? styles.lockedColNarrow : null) }}>
          {/* Real previews, not "?" — you can see what's coming, you just
              can't pick it yet. Converted from design/Mixamo/Ninja.fbx and
              Female2.fbx ("Kachujin") (2026-08-16), the least-jarring of the
              unconverted Mixamo candidates checked against the medieval
              setting.
              Static portraits, not a second/third live HeroShowcase: two
              simultaneous WebGL canvases reliably crashed with "Context
              Lost" in testing, even after fixing each model's own texture
              size — a real risk on the lower-end phones this game targets,
              not worth taking for what's just a locked preview. */}
          <LockedHeroSlot portrait="/characters/portraits/ninja.webp" />
          <LockedHeroSlot portrait="/characters/portraits/female.webp" />
        </div>
      </div>
      <StepNav onBack={onBack} onNext={onNext} nextLabel="CONTINUE" />
    </div>
  );
}

function LockedHeroSlot({ portrait }: { portrait?: string }) {
  return (
    <div style={styles.lockedCard}>
      {portrait && (
        // eslint-disable-next-line @next/next/no-img-element -- a static,
        // pre-rendered portrait doesn't need next/image's runtime resizing.
        <img src={portrait} alt="" style={styles.lockedPortrait} />
      )}
      {/* A real padlock now, not the 🔒 emoji — flat and small, it read as a
          placeholder glyph rather than a locked item worth wanting (Marvy's
          call, 2026-08-16). Sat directly over the portrait, centred, with
          its own backing plate for contrast against whatever part of the
          character happens to be behind it. */}
      {portrait ? <PadlockIcon size={40} /> : <div style={styles.lockedGlyph}>🔒</div>}
    </div>
  );
}

/** A gradient-shaded padlock — steel shackle, brass body, keyhole cutout —
 *  instead of the flat emoji glyph. Sized and coloured to read as a real
 *  locked item (gold body echoes the CTA/VILLE gold used everywhere else in
 *  this wizard) rather than a generic "TBD" marker. */
function PadlockIcon({ size }: { size: number }) {
  const uid = "lock"; // single instance per slot, no id collisions on this screen
  return (
    <div style={styles.padlockPlate}>
      <svg width={size} height={size * 1.15} viewBox="0 0 48 56" style={styles.padlockSvg}>
        <defs>
          <linearGradient id={`${uid}-shackle`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#eef2f5" />
            <stop offset="55%" stopColor="#aab2ba" />
            <stop offset="100%" stopColor="#6f767d" />
          </linearGradient>
          <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffdf8f" />
            <stop offset="45%" stopColor="#f2c14e" />
            <stop offset="100%" stopColor="#a9711f" />
          </linearGradient>
        </defs>
        <path
          d="M14 24V17a10 10 0 0 1 20 0v7"
          fill="none"
          stroke={`url(#${uid}-shackle)`}
          strokeWidth={5.5}
          strokeLinecap="round"
        />
        <rect x="8" y="22" width="32" height="28" rx="5" fill={`url(#${uid}-body)`} />
        {/* Gloss highlight, the thing that sells "metal" over "flat icon". */}
        <rect x="11" y="25" width="7" height="22" rx="3.5" fill="#fff" opacity={0.22} />
        <circle cx="24" cy="33" r="4" fill="#3a2a12" />
        <path d="M22 36h4l1.6 8h-7.2z" fill="#3a2a12" />
      </svg>
    </div>
  );
}

function EggStep({
  egg,
  onPick,
  onBack,
  onNext,
}: {
  egg: EggVariant | null;
  onPick: (e: EggVariant) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const narrow = useNarrowViewport();
  return (
    <div style={styles.stepBody}>
      <div style={styles.stepTitle}>Choose Your Egg</div>
      <div style={styles.stepSub}>
        It won't hatch on its own — feed it VILLE at the Market once you're banking treasure. What's inside is the
        same fox either way; the shell is just the part you pick.
      </div>
      <div style={{ ...styles.eggGrid, ...(narrow ? styles.eggGridNarrow : null) }}>
        {EGG_ORDER.map((v) => {
          const info = EGG_INFO[v];
          const selected = egg === v;
          return (
            <button
              key={v}
              onClick={() => onPick(v)}
              style={{
                ...styles.eggCard,
                ...(narrow ? styles.eggCardNarrow : null),
                borderColor: selected ? info.accent : "rgba(255,255,255,0.1)",
                background: `radial-gradient(120% 90% at 50% 0%, ${info.accent}18, rgba(255,255,255,0.03) 65%)`,
                ...(selected ? { boxShadow: `0 0 0 1.5px ${info.accent}aa inset` } : null),
              }}
            >
              <EggArt variant={v} size={narrow ? 60 : 96} />
              <div style={{ ...styles.eggName, color: selected ? info.accent : INK }}>{info.name}</div>
              <div style={styles.eggBlurb}>{info.blurb}</div>
            </button>
          );
        })}
      </div>
      <StepNav onBack={onBack} onNext={onNext} nextLabel="CONTINUE" nextDisabled={!egg} />
    </div>
  );
}

function ReadyStep({
  egg,
  saved,
  busy,
  error,
  onBack,
  onConfirm,
}: {
  egg: EggVariant;
  saved: boolean;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const info = EGG_INFO[egg];
  const narrow = useNarrowViewport();
  return (
    <div style={styles.stepBody}>
      <div style={styles.stepTitle}>Ready</div>
      <div style={styles.stepSub}>The Outlier, and an egg that's chosen its person before it's chosen anything else.</div>
      <div style={{ ...styles.readyRow, ...(narrow ? styles.readyRowNarrow : null) }}>
        <div style={{ ...styles.readyCard, ...(narrow ? styles.readyCardNarrow : null) }}>
          <div style={styles.heroCanvasWrap}>
            <HeroShowcase />
          </div>
          <div style={styles.heroName}>The Outlier</div>
        </div>
        <div style={styles.readyPlus}>+</div>
        <div style={{ ...styles.readyCard, ...(narrow ? styles.readyCardNarrow : null) }}>
          <EggArt variant={egg} size={narrow ? 76 : 110} />
          <div style={{ ...styles.heroName, color: info.accent }}>{info.name}</div>
        </div>
      </div>
      {error && <div style={styles.error}>{error}</div>}
      {!saved ? (
        <StepNav onBack={onBack} onNext={onConfirm} nextLabel={busy ? "…" : "CONFIRM"} nextDisabled={busy} />
      ) : (
        <div style={styles.savedRow}>
          <div style={styles.savedNote}>✓ Saved. Tell me when to wire this in.</div>
        </div>
      )}
    </div>
  );
}

function StepNav({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
}) {
  return (
    <div style={styles.navRow}>
      <button style={styles.backBtn} onClick={onBack}>
        BACK
      </button>
      <button
        style={{ ...styles.cta, ...(nextDisabled ? styles.ctaDisabled : null) }}
        onClick={onNext}
        disabled={nextDisabled}
      >
        {nextLabel}
      </button>
    </div>
  );
}

const GOLD = "#f2c14e";
const INK = "#e8eef2";

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 100,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "radial-gradient(120% 100% at 50% 20%, #241c14 0%, #0a0806 70%)",
    fontFamily: "system-ui, sans-serif",
    overflow: "hidden",
  },
  vignette: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(80% 60% at 50% 0%, rgba(242,193,78,0.08), transparent 60%)",
    pointerEvents: "none",
  },
  signOut: {
    position: "absolute",
    top: 20,
    right: 24,
    zIndex: 1,
    color: "rgba(232,238,242,0.55)",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: 0.5,
    cursor: "pointer",
  },
  panel: {
    position: "relative",
    width: "min(760px, 94vw)",
    maxHeight: "88vh",
    overflowY: "auto",
    overflowX: "hidden",
    background: "linear-gradient(180deg, rgba(24,20,15,0.96), rgba(14,12,10,0.98))",
    border: "1px solid rgba(242,193,78,0.3)",
    borderRadius: 18,
    boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
    padding: "36px 40px",
  },
  center: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 18, padding: "20px 0" },
  brand: { color: GOLD, fontSize: 34, fontWeight: 800, letterSpacing: 8 },
  tagline: { color: "rgba(232,238,242,0.7)", fontSize: 14.5, lineHeight: 1.7, maxWidth: 480 },
  stepBody: { display: "flex", flexDirection: "column", gap: 16 },
  stepTitle: { color: GOLD, fontSize: 20, fontWeight: 800, letterSpacing: 1 },
  stepSub: { color: "rgba(232,238,242,0.55)", fontSize: 12.5, lineHeight: 1.6, marginTop: -8 },
  usernameInput: {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid rgba(242,193,78,0.3)",
    background: "rgba(255,255,255,0.05)",
    color: INK,
    fontSize: 15,
    outline: "none",
  },
  usernameStatus: { fontSize: 12, minHeight: 16, marginTop: -8 },
  usernameGood: { color: "#8fd99a" },
  usernameBad: { color: "#f28a5c" },
  usernameChecking: { color: "rgba(232,238,242,0.45)" },
  error: { color: "#f28a5c", fontSize: 12.5, lineHeight: 1.5 },
  heroRow: { display: "flex", gap: 16, alignItems: "stretch" },
  // Below ~520px there's no room for a 108px locked column beside the hero
  // card without forcing a shrink the card can't actually do — it was
  // overflowing the panel sideways instead. Stack them instead.
  heroRowNarrow: { flexDirection: "column" },
  heroCard: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "18px 16px",
    borderRadius: 14,
    border: "1px solid rgba(242,193,78,0.35)",
    background: "radial-gradient(120% 90% at 50% 0%, rgba(242,193,78,0.1), rgba(255,255,255,0.02) 65%)",
  },
  heroCanvasWrap: { width: "100%", height: 220, borderRadius: 10, overflow: "hidden" },
  heroName: { color: INK, fontWeight: 700, fontSize: 15, marginTop: 4 },
  heroDesc: { color: "rgba(232,238,242,0.5)", fontSize: 11.5, textAlign: "center", lineHeight: 1.5 },
  lockedCol: { display: "flex", flexDirection: "column", gap: 12, width: 108 },
  // Two locked previews side by side, full width, under the hero card —
  // reads as "here's what's coming" instead of disappearing entirely.
  lockedColNarrow: { flexDirection: "row", width: "100%" },
  lockedCard: {
    position: "relative",
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    overflow: "hidden",
    border: "1px dashed rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.02)",
    opacity: 0.5,
    minHeight: 100,
  },
  // The static portrait, full-bleed behind the lock glyph, dimmed as a group
  // by lockedCard's own opacity (CSS opacity on the parent already does
  // this). object-position skews toward the top: the render's own
  // rotated-3/4 framing (render_portrait.py) puts the face near the top of
  // a 640x900 image, and this card is much shorter/wider than that.
  lockedPortrait: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "50% 15%",
  },
  lockedGlyph: { fontSize: 22, color: "rgba(232,238,242,0.4)" },
  // A soft dark radial plate behind the padlock — guarantees contrast
  // against whatever part of the portrait happens to sit behind it, the
  // same problem the old text chip solved for "COMING SOON".
  padlockPlate: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: 68,
    height: 68,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "radial-gradient(circle, rgba(11,13,16,0.72) 0%, rgba(11,13,16,0.4) 65%, transparent 100%)",
  },
  padlockSvg: { filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.6))" },
  // minmax(0, 1fr), not bare 1fr: a plain 1fr track still respects each
  // item's min-content size, which here was the 96px-wide egg SVG — three
  // of those don't fit a phone's content width, so the third card was
  // getting pushed off the edge of the panel.
  eggGrid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 },
  eggGridNarrow: { gap: 8 },
  eggCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    padding: "18px 12px",
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "solid",
    cursor: "pointer",
    color: INK,
  },
  eggCardNarrow: { padding: "12px 6px", gap: 5 },
  eggName: { fontWeight: 700, fontSize: 13.5 },
  eggBlurb: { fontSize: 10.5, color: "rgba(232,238,242,0.55)", textAlign: "center", lineHeight: 1.5 },
  readyRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 22 },
  // Two fixed-200px cards plus the plus-sign needed ~450px — same overflow
  // as the hero row. Stack them on narrow screens instead.
  readyRowNarrow: { flexDirection: "column", gap: 10 },
  readyCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 200 },
  readyCardNarrow: { width: "min(70vw, 220px)" },
  readyPlus: { color: "rgba(242,193,78,0.5)", fontSize: 26, fontWeight: 300 },
  navRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  backBtn: {
    color: "rgba(232,238,242,0.6)",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 10,
    padding: "12px 20px",
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: 1,
    cursor: "pointer",
  },
  cta: {
    color: "#1a140f",
    background: GOLD,
    border: "none",
    borderRadius: 10,
    padding: "14px 30px",
    fontSize: 13.5,
    fontWeight: 800,
    letterSpacing: 1,
    cursor: "pointer",
  },
  ctaDisabled: { opacity: 0.4, cursor: "default" },
  savedRow: { display: "flex", justifyContent: "center", marginTop: 8 },
  savedNote: { color: "#aef2cb", fontSize: 13, fontWeight: 700 },
  dots: { position: "relative", display: "flex", gap: 8, marginTop: 22 },
  dot: { width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.15)" },
  dotActive: { background: GOLD, width: 18, borderRadius: 4 },
  dotDone: { background: "rgba(242,193,78,0.5)" },
};
