"use client";

import { useEffect, useRef, useState } from "react";
import { runtime } from "@/engine/runtime";
import { useGame } from "@/engine/store";
import { audio } from "@/engine/audio/audio";
import { HINTS } from "@/engine/world/hints";
import { VILLAGE } from "@/engine/world/village";
import { REST } from "@/engine/config/round";
import { CHAPTERS, clockLabel, DAY } from "@/engine/config/day";
import { WEAPON_STATS } from "@/engine/config/shop";
import { FEEL } from "@/engine/config/feel";
import { foxGrowthFor, foxNextThreshold } from "@/engine/config/fox";
import { gameMode } from "@/engine/config/mode";
import { thieves, MAX_THIEVES } from "@/engine/npc/thieves";
import { isTouchDevice } from "@/engine/input/touch";

const HINT_DEFAULT = "#8fd0e0"; // pale cyan ping
const HINT_REAL = "#f2c14e"; // gold
const HINT_FAKE = "#7a4a4a"; // dim decoy

/**
 * DOM overlay. Reads `runtime` on its own rAF (never re-rendering from the game
 * loop). The compass shows one arrow PER candidate hint — all identical until the
 * fox's sniff (Q) reveals which is real (DESIGN §2/§3).
 */
export function Hud() {
  const arrows = useRef<(HTMLDivElement | null)[]>([]);
  const thiefBlips = useRef<(HTMLDivElement | null)[]>([]);
  const bankBlip = useRef<HTMLDivElement>(null);
  const sniffEl = useRef<HTMLDivElement>(null);
  const foxBlip = useRef<HTMLDivElement>(null);
  const promptEl = useRef<HTMLDivElement>(null);
  const timerEl = useRef<HTMLDivElement>(null);
  const chapterEl = useRef<HTMLDivElement>(null);
  const bannerEl = useRef<HTMLDivElement>(null);
  const runEl = useRef<HTMLDivElement>(null);
  const crouchEl = useRef<HTMLDivElement>(null);
  const shelterEl = useRef<HTMLDivElement>(null);
  const eventEl = useRef<HTMLDivElement>(null);
  const foxToastEl = useRef<HTMLDivElement>(null);
  const crossEl = useRef<HTMLDivElement>(null); // centre dot
  const crossTop = useRef<HTMLDivElement>(null);
  const crossBottom = useRef<HTMLDivElement>(null);
  const crossLeft = useRef<HTMLDivElement>(null);
  const crossRight = useRef<HTMLDivElement>(null);
  const dmgEl = useRef<HTMLDivElement>(null);
  const dmgArcEl = useRef<HTMLDivElement>(null);
  const ammoEl = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const health = useGame((s) => s.playerHealth);
  const maxHealth = useGame((s) => s.maxPlayerHealth);
  const isDead = useGame((s) => s.isDead);
  const roundState = useGame((s) => s.roundState);
  const roundReason = useGame((s) => s.roundReason);
  const bombsLeft = useGame((s) => s.bombsLeft);
  const restoresLeft = useGame((s) => s.restoresLeft);
  const treasureCracked = useGame((s) => s.treasureCracked);
  const treasuresBanked = useGame((s) => s.treasuresBanked);
  const claimedRarity = useGame((s) => s.claimedRarity);
  const villeCarrying = useGame((s) => s.villeCarrying);
  const villeBanked = useGame((s) => s.villeBanked);
  const villeEarned = useGame((s) => s.villeEarned);
  const roundNonce = useGame((s) => s.roundNonce);

  // The control legend: up while you settle in, then out of the way. Bound to H
  // so it's never actually lost, and reshown at the top of each run.
  const [showControls, setShowControls] = useState(true);
  const [controlsFading, setControlsFading] = useState(false);
  useEffect(() => {
    setShowControls(true);
    setControlsFading(false);
    const fade = window.setTimeout(() => setControlsFading(true), 14000);
    const gone = window.setTimeout(() => setShowControls(false), 15200);
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyH" || e.repeat) return;
      window.clearTimeout(fade);
      window.clearTimeout(gone);
      setControlsFading(false);
      setShowControls((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(gone);
      window.removeEventListener("keydown", onKey);
    };
  }, [roundNonce]);

  // Mute toggle: reflect the persisted state, keep in sync, and bind M.
  useEffect(() => {
    setMuted(audio.muted);
    const off = audio.onMuteChange(setMuted);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyM" && !e.repeat) audio.toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      off();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    const onLockChange = () => setLocked(!!document.pointerLockElement);
    document.addEventListener("pointerlockchange", onLockChange);

    // Resolved once: prompts inside the rAF loop have to name the right control.
    const touchInput = isTouchDevice();
    let raf = 0;
    const tick = () => {
      const now = performance.now();

      // One radar blip per hint, placed AROUND the compass ring at its bearing
      // (top = ahead). Its position around the ring shows direction; color shows
      // whether the fox has revealed it.
      const C = 29; // compass centre (px)
      const R = 20; // ring radius (px)
      for (let i = 0; i < HINTS.length; i++) {
        const el = arrows.current[i];
        if (!el) continue;
        const h = HINTS[i];
        if ((h.real && (runtime.hintClaimed[i] || runtime.hintStolen[i])) || (!h.real && runtime.hintSilenced[i])) {
          el.style.opacity = "0";
          continue;
        }
        const dx = h.pos.x - runtime.playerPos.x;
        const dz = h.pos.z - runtime.playerPos.z;
        const rel = Math.atan2(dx, dz) - runtime.yaw;
        el.style.left = `${C + Math.sin(rel) * R}px`;
        el.style.top = `${C - Math.cos(rel) * R}px`;
        // All candidates look identical, always. The old "sniff" recoloured these
        // to give the answer away on the HUD; now the fox physically runs to the
        // real one and you follow it, so the compass stays honest.
        el.style.background = HINT_DEFAULT;
        el.style.opacity = "1";
      }

      // A red blip per live thief on the compass ring (they keep racing for any
      // treasure you haven't taken yet).
      const live = Array.from(thieves);
      for (let i = 0; i < MAX_THIEVES; i++) {
        const el = thiefBlips.current[i];
        if (!el) continue;
        if (i < live.length) {
          const p = live[i].getPos();
          const rel = Math.atan2(p.x - runtime.playerPos.x, p.z - runtime.playerPos.z) - runtime.yaw;
          el.style.left = `${C + Math.sin(rel) * R}px`;
          el.style.top = `${C - Math.cos(rel) * R}px`;
          el.style.opacity = "1";
        } else {
          el.style.opacity = "0";
        }
      }

      // Bank marker: points to the vault on the compass whenever you're carrying
      // unbanked loot (bank it to grow the fox). Pulses to draw the eye.
      if (bankBlip.current) {
        const carrying = useGame.getState().villeCarrying;
        if (carrying > 0 && useGame.getState().roundState === "playing") {
          const rel = Math.atan2(VILLAGE.bank.x - runtime.playerPos.x, VILLAGE.bank.z - runtime.playerPos.z) - runtime.yaw;
          bankBlip.current.style.left = `${C + Math.sin(rel) * R}px`;
          bankBlip.current.style.top = `${C - Math.cos(rel) * R}px`;
          bankBlip.current.style.opacity = String(0.55 + 0.45 * Math.sin(now / 260)); // gentle pulse
        } else {
          bankBlip.current.style.opacity = "0";
        }
      }

      // Time of day, not a countdown. The sun going down is the clock now — it
      // reads as a journey rather than a punishment, and it tells you how much
      // light you have left without a number screaming at you.
      if (timerEl.current && useGame.getState().roundState === "playing") {
        const d = runtime.dayProgress;
        timerEl.current.textContent = clockLabel(d);
        timerEl.current.style.color =
          d > 0.86 ? "#ff6b5a" : d > 0.62 ? "#ffb054" : "#e8eef2";
      }
      if (chapterEl.current) {
        chapterEl.current.textContent = runtime.chapterName;
      }

      // Chapter banner — announces the one new thing this stretch introduces.
      if (bannerEl.current) {
        const age = now - runtime.chapterAt;
        if (runtime.chapterAt > 0 && age < 5200) {
          bannerEl.current.innerHTML =
            `<div style="font-size:26px;font-weight:800;letter-spacing:1px">${runtime.chapterName}</div>` +
            `<div style="font-size:15px;opacity:0.85;margin-top:4px">${runtime.chapterBrief}</div>`;
          bannerEl.current.style.opacity = String(age < 4200 ? 1 : (5200 - age) / 1000);
        } else {
          bannerEl.current.style.opacity = "0";
        }
      }

      // Fox blip: while it's scouting or attacking, the compass tracks the FOX.
      // That's the point of the redesign — the animal is the navigation, so the
      // thing you're steering by is your companion, not a revealed answer.
      if (foxBlip.current) {
        const tracking = runtime.foxState === "scout" || runtime.foxState === "attack";
        if (tracking) {
          const rel = Math.atan2(runtime.foxPos.x - runtime.playerPos.x, runtime.foxPos.z - runtime.playerPos.z) - runtime.yaw;
          foxBlip.current.style.left = `${C + Math.sin(rel) * R}px`;
          foxBlip.current.style.top = `${C - Math.cos(rel) * R}px`;
          foxBlip.current.style.opacity = runtime.foxFoundTreasure
            ? String(0.6 + 0.4 * Math.sin(now / 180)) // urgent pulse once it's found it
            : "1";
        } else {
          foxBlip.current.style.opacity = "0";
        }
      }

      // Fox status pill.
      if (sniffEl.current) {
        const cd = runtime.foxReadyAt - now;
        const st = runtime.foxState;
        if (st === "down") {
          const left = Math.ceil((runtime.foxDownUntil - now) / 1000);
          sniffEl.current.textContent = `🦊 down — ${Math.max(0, left)}s`;
          sniffEl.current.style.color = "#ff8a7a";
          sniffEl.current.style.borderColor = "rgba(232,86,63,0.7)";
        } else if (st === "scout") {
          sniffEl.current.textContent = runtime.foxFoundTreasure ? "🦊 found it — follow!" : "🦊 scouting…";
          sniffEl.current.style.color = HINT_REAL;
          sniffEl.current.style.borderColor = HINT_REAL;
        } else if (st === "attack") {
          sniffEl.current.textContent = "🦊 going in!";
          sniffEl.current.style.color = "#ffb054";
          sniffEl.current.style.borderColor = "rgba(255,176,84,0.8)";
        } else if (cd > 0) {
          sniffEl.current.textContent = `🦊 ${Math.ceil(cd / 1000)}s`;
          sniffEl.current.style.color = "rgba(232,238,242,0.5)";
          sniffEl.current.style.borderColor = "rgba(232,238,242,0.25)";
        } else {
          // Name the control the player actually HAS. On a phone this read
          // "send — Q", pointing at a key that isn't there, while the toast two
          // lines below it correctly said "Tap FOX".
          sniffEl.current.textContent = touchInput ? "🦊 send — FOX" : "🦊 send — Q";
          sniffEl.current.style.color = HINT_DEFAULT;
          sniffEl.current.style.borderColor = HINT_DEFAULT;
        }
      }

      // Proximity prompt: real+unclaimed → claim (then carry to the bank); decoy → dud.
      if (promptEl.current) {
        const idx = runtime.nearHintIndex;
        const nearRealUnclaimed = runtime.nearHintIsReal && idx >= 0 && !runtime.hintClaimed[idx];
        if (nearRealUnclaimed) {
          promptEl.current.innerHTML = "Treasure — press <b>E</b> to grab · then bank it";
          promptEl.current.style.color = "#ffdf8f";
          promptEl.current.style.borderColor = "rgba(242,193,78,0.6)";
          promptEl.current.style.opacity = "1";
        } else if (idx >= 0 && !runtime.nearHintIsReal) {
          promptEl.current.innerHTML = "False lead — nothing here";
          promptEl.current.style.color = "rgba(232,238,242,0.7)";
          promptEl.current.style.borderColor = "rgba(232,238,242,0.3)";
          promptEl.current.style.opacity = "1";
        } else {
          promptEl.current.style.opacity = "0";
        }
      }

      // Fox grew a stage — a brief celebratory toast.
      if (foxToastEl.current) {
        const age = now - runtime.foxGrewAt;
        if (runtime.foxGrewAt > 0 && age < 3200) {
          foxToastEl.current.textContent = `🦊 Your fox grew — ${runtime.foxStageName}!`;
          foxToastEl.current.style.opacity = String(age < 2600 ? 1 : (3200 - age) / 600);
        } else {
          foxToastEl.current.style.opacity = "0";
        }
      }

      if (runEl.current) runEl.current.style.opacity = runtime.running ? "1" : "0";
      if (crouchEl.current) crouchEl.current.style.opacity = runtime.crouching ? "1" : "0";

      // Event toast: a treasure was just stolen or cracked (whichever is fresher).
      if (eventEl.current) {
        const stolenAge = now - runtime.treasureStolenAt;
        const crackedAge = now - runtime.treasureCrackedAt;
        const age = Math.min(
          runtime.treasureStolenAt < 0 ? Infinity : stolenAge,
          runtime.treasureCrackedAt < 0 ? Infinity : crackedAge
        );
        if (age < 3200) {
          const isTheft = age === stolenAge;
          eventEl.current.textContent = isTheft
            ? "A thief made off with a treasure!"
            : "The blast cracked the treasure!";
          eventEl.current.style.color = isTheft ? "#ff8a7a" : "#ffb054";
          eventEl.current.style.borderColor = isTheft ? "rgba(232,86,63,0.6)" : "rgba(255,138,60,0.6)";
          eventEl.current.style.opacity = String(age < 2600 ? 1 : (3200 - age) / 600);
        } else {
          eventEl.current.style.opacity = "0";
        }
      }

      // Shelter / rest prompt while inside a house (the world is paused here).
      if (shelterEl.current) {
        const canBank = runtime.nearBank && useGame.getState().villeCarrying > 0;
        if (canBank) {
          shelterEl.current.innerHTML = "at the vault — press <b>E</b> to bank it & grow your fox";
          shelterEl.current.style.opacity = "1";
        } else if (runtime.nearMarket && !useGame.getState().shopOpen) {
          shelterEl.current.innerHTML = "at the market — press <b>E</b> to shop";
          shelterEl.current.style.opacity = "1";
        } else if (runtime.resting) {
          shelterEl.current.innerHTML = "resting — world paused · recovering";
          shelterEl.current.style.opacity = "1";
        } else if (runtime.sheltered) {
          const left = useGame.getState().restoresLeft;
          const atCap =
            useGame.getState().playerHealth >= useGame.getState().maxPlayerHealth * REST.healCap;
          shelterEl.current.innerHTML = atCap
            ? "safe inside — world paused · you're patched up"
            : left > 0
              ? `safe inside — world paused · <b>X</b> to use a restore (${left} left)`
              : "safe inside — world paused · <b>no restores left</b> — buy more at the market";
          shelterEl.current.style.opacity = "1";
        } else {
          shelterEl.current.style.opacity = "0";
        }
      }

      // Dim the countdown while indoors to signal it's frozen.
      if (timerEl.current) {
        timerEl.current.style.opacity = runtime.sheltered ? "0.4" : "1";
      }
      // Damage flash, PLUS a sustained low-health pulse. The two share one element:
      // a hit spikes it, and below the critical threshold it never fully clears —
      // it breathes instead, harder the closer to death you are. Health bars are
      // easy to not look at mid-fight; the edge of the screen is not.
      if (dmgEl.current) {
        const g = useGame.getState();
        const since = now - runtime.damageAt;
        const hitFlash = since < 450 ? 0.6 * (1 - since / 450) : 0;
        const frac = g.playerHealth / g.maxPlayerHealth;
        let critical = 0;
        if (frac > 0 && frac < FEEL.lowHealthFraction && !g.isDead && roundState === "playing") {
          const severity = 1 - frac / FEEL.lowHealthFraction; // 0 at threshold → 1 at death
          const beat = 0.5 + 0.5 * Math.sin((now / 1000) * FEEL.lowHealthPulseHz * Math.PI * 2);
          critical = (0.16 + 0.3 * beat) * severity;
        }
        dmgEl.current.style.opacity = String(Math.min(0.85, Math.max(hitFlash, critical)));
      }

      // Ammo readout. Turns amber when the magazine is running low and shows the
      // reload explicitly, so running dry is never a silent surprise.
      if (ammoEl.current) {
        const g = useGame.getState();
        const mag = WEAPON_STATS[g.equippedWeapon].magSize;
        if (g.reloadEndsAt > 0) {
          ammoEl.current.textContent = "reloading…";
          ammoEl.current.style.color = "#8fd0e0";
        } else {
          ammoEl.current.textContent = `${g.ammoInMag} / ${mag}`;
          ammoEl.current.style.color =
            g.ammoInMag === 0 ? "#e8563f" : g.ammoInMag <= mag * 0.25 ? "#ffb054" : "#e8eef2";
        }
      }

      // Damage arc — rotate it to the bearing of whoever hit you, relative to
      // where you're facing, and fade it out over ~1.1s.
      if (dmgArcEl.current) {
        const since = now - runtime.damageAt;
        if (since < 1100) {
          const bearing =
            Math.atan2(runtime.damageFrom.x, runtime.damageFrom.z) - runtime.yaw;
          dmgArcEl.current.style.transform = `translate(-50%, -50%) rotate(${180 - (bearing * 180) / Math.PI}deg)`;
          dmgArcEl.current.style.opacity = String(1 - since / 1100);
        } else {
          dmgArcEl.current.style.opacity = "0";
        }
      }
      // Dynamic crosshair: ticks spread while running/firing, tighten when still;
      // whole reticle flashes red on a connecting hit (the hitmarker).
      {
        const firing = now - runtime.fireAt < 90;
        const hitting = now - runtime.hitAt < 160;
        const headshotting = now - runtime.headshotAt < 220;
        const fireAge = (now - runtime.fireAt) / 1000;
        const firePulse = fireAge >= 0 && fireAge < 0.12 ? (1 - fireAge / 0.12) * 6 : 0;
        const gap = 4 + (runtime.running ? 5 : 0) + firePulse; // px from centre to each tick
        const col = headshotting ? "#ffd24a" : hitting ? "#ff5a5a" : "#ffffff"; // gold on a headshot
        if (crossTop.current) {
          crossTop.current.style.transform = `translate(-50%, calc(-100% - ${gap}px))`;
          crossTop.current.style.background = col;
        }
        if (crossBottom.current) {
          crossBottom.current.style.transform = `translate(-50%, ${gap}px)`;
          crossBottom.current.style.background = col;
        }
        if (crossLeft.current) {
          crossLeft.current.style.transform = `translate(calc(-100% - ${gap}px), -50%)`;
          crossLeft.current.style.background = col;
        }
        if (crossRight.current) {
          crossRight.current.style.transform = `translate(${gap}px, -50%)`;
          crossRight.current.style.background = col;
        }
        if (crossEl.current) {
          crossEl.current.style.background = col;
          crossEl.current.style.transform = `translate(-50%, -50%) scale(${firing ? 1.4 : 1})`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
  }, []);

  return (
    <>
      {/* Red damage flash */}
      <div ref={dmgEl} style={styles.damageFlash} />

      {/* Player health bar, bottom-center */}
      <div style={styles.healthWrap}>
        <div
          style={{
            ...styles.healthFill,
            width: `${(Math.max(0, health) / maxHealth) * 100}%`,
            background: health > maxHealth * 0.3 ? "#5ad17a" : "#e8563f",
          }}
        />
        <div style={styles.healthLabel}>{Math.max(0, Math.round(health))}</div>
      </div>

      {/* Consumables row, centred just above the health bar: ammo · restores ·
          bombs. These used to be scattered to either side of the bar at fixed
          pixel offsets, which put them straight under the touch buttons on a
          phone. One centred row reads as a single resource strip and stays clear
          of the thumb zones on every screen size. */}
      <div style={styles.resourceRow}>
        <div ref={ammoEl} style={styles.ammoPill} />
        <div style={{ ...styles.restorePill, opacity: restoresLeft > 0 ? 1 : 0.35 }}>✚ ×{restoresLeft}</div>
        <div style={{ ...styles.bombPill, opacity: bombsLeft > 0 ? 1 : 0.35 }}>💣 ×{bombsLeft}</div>
      </div>

      {/* Directional damage indicator: an arc pointing at whoever just hit you.
          Screen shake and a red vignette tell you THAT you were hit; they never
          told you FROM WHERE, which is why fights read as arbitrary. */}
      <div ref={dmgArcEl} style={styles.damageArc}>
        <div style={styles.damageArcMark} />
      </div>

      {/* Loot wallet, top-left: banked total + what you're carrying (unbanked) */}
      <div style={styles.wallet}>
        <div style={styles.walletBanked}>🏦 {villeBanked} VILLE</div>
        {villeCarrying > 0 && <div style={styles.walletCarry}>◆ carrying {villeCarrying} — bank it</div>}
        {/* Growth stage is the fox's, and the fox IS the rank — so in a mode
            without one there is nothing here to report. */}
        {gameMode().fox && (
          <div style={styles.foxStage}>
            🦊 {foxGrowthFor(villeEarned).name}
            {foxNextThreshold(villeEarned) !== null && (
              <span style={styles.foxNext}> · bank {foxNextThreshold(villeEarned)! - villeEarned} to grow</span>
            )}
          </div>
        )}
      </div>

      {/* Time of day + chapter, top-right */}
      <div style={styles.timer}>
        <div ref={timerEl} style={styles.timerNum}>06:00</div>
        <div ref={chapterEl} style={styles.timerLabel}>Dawn</div>
      </div>

      {/* Chapter banner — text set from the game loop */}
      <div ref={bannerEl} style={styles.chapterBanner} />

      {/* Downed overlay (mid-round setback, not round end) */}
      {isDead && roundState === "playing" && (
        <div style={styles.deathOverlay}>
          <div style={styles.deathTitle}>You were downed</div>
          {runtime.lootLostAmount > 0 && (
            <div style={styles.deathLoss}>
              you dropped {runtime.lootLostAmount} VILLE — the treasure is back on the board
            </div>
          )}
          <div style={styles.deathHint}>
            press <b>R</b> to come back {runtime.refugeIndex >= 0 ? "at your refuge" : "at the gate"}
          </div>
        </div>
      )}

      {/* Round-over overlay (win / lose) */}
      {roundState !== "playing" && (
        <div style={styles.roundOverlay}>
          <div style={{ ...styles.roundTitle, color: treasuresBanked > 0 ? "#ffd873" : "#e8563f" }}>
            {roundReason === "thief" ? "Thieves took the last of it" : "Night falls"}
          </div>
          <div style={styles.roundLoot}>
            {treasuresBanked > 0
              ? `${treasuresBanked} treasure${treasuresBanked === 1 ? "" : "s"} banked · ${villeBanked} VILLE safe`
              : "You banked nothing today."}
          </div>
          {villeCarrying > 0 && (
            <div style={styles.roundLoot}>
              carrying {villeCarrying} VILLE — bank it at the vault next run · {villeBanked} safe
            </div>
          )}
          <div style={styles.roundHint}>
            press <b>Enter</b> to play again
          </div>
        </div>
      )}

      {/* Compass, top-center — one radar blip per candidate hint + the thief */}
      <div style={styles.compassWrap}>
        <div style={styles.compass}>
          <div style={styles.compassCenter} />
          {HINTS.map((_, i) => (
            <div
              key={i}
              ref={(el) => {
                arrows.current[i] = el;
              }}
              style={styles.hintDot}
            />
          ))}
          {Array.from({ length: MAX_THIEVES }).map((_, i) => (
            <div
              key={i}
              ref={(el) => {
                thiefBlips.current[i] = el;
              }}
              style={styles.thiefDot}
            />
          ))}
          {/* Bank marker — shows only while carrying loot (points to the vault) */}
          <div ref={bankBlip} style={styles.bankDot} />
          {/* Fox marker — shows while it's off scouting or attacking */}
          {gameMode().fox && <div ref={foxBlip} style={styles.foxDot} />}
        </div>
        {/* The send-the-fox pill and its compass blip only exist where a fox does.
            The frame loop above guards on the same refs being null. */}
        {gameMode().fox && (
          <div ref={sniffEl} style={styles.sniffPill}>
            🦊 sniff — Q
          </div>
        )}
      </div>

      {/* Dynamic crosshair — while aiming (mouse captured) OR on touch, which has
          no pointer lock but still needs a reticle to aim by. */}
      {(locked || isTouchDevice()) && (
        <div style={styles.crosshairWrap}>
          <div ref={crossTop} style={styles.crossTickV} />
          <div ref={crossBottom} style={styles.crossTickV} />
          <div ref={crossLeft} style={styles.crossTickH} />
          <div ref={crossRight} style={styles.crossTickH} />
          <div ref={crossEl} style={styles.crossDot} />
        </div>
      )}

      {/* Run indicator */}
      <div ref={runEl} style={styles.runPill}>
        running
      </div>

      {/* Crouch indicator (mutually exclusive with running) */}
      <div ref={crouchEl} style={styles.crouchPill}>
        crouched
      </div>

      {/* Shelter / rest prompt (inside a house) — text set from the game loop */}
      <div ref={shelterEl} style={styles.shelterPill} />

      {/* Event toast (treasure stolen / cracked) — text set from the game loop */}
      <div ref={eventEl} style={styles.eventToast} />

      {/* Fox grew a stage — celebratory toast, text set from the game loop */}
      {gameMode().fox && <div ref={foxToastEl} style={styles.foxToast} />}

      {/* Proximity prompt (claim / false lead) — text set from the game loop */}
      <div ref={promptEl} style={styles.prompt} />

      {/* Mute toggle, bottom-right (the one interactive HUD element) */}
      <button
        type="button"
        onClick={() => audio.toggleMute()}
        style={{ ...styles.muteBtn, opacity: muted ? 0.6 : 1 }}
        title="Mute / unmute (M)"
      >
        {muted ? "🔇" : "🔊"}
      </button>

      {/* Controls, bottom-left — DESKTOP ONLY, and no longer permanent.
          Four lines of key bindings pinned over the world for the entire run is
          a dev overlay, not a HUD: it competed with the guardian, the fox pill
          and the toasts for the same first ten seconds, and then never left. It
          shows while you're finding your feet, fades out, and comes back on H. */}
      {!isTouchDevice() && showControls && (
        <div style={{ ...styles.controls, opacity: controlsFading ? 0 : 1 }}>
          <div>
            <b>WASD</b> move &nbsp;·&nbsp; <b>Shift</b> run &nbsp;·&nbsp; <b>Space</b> jump / vault &nbsp;·&nbsp; <b>C</b> crouch
          </div>
          <div>
            <b>Mouse</b> look &nbsp;·&nbsp; <b>Left-click</b> / <b>F</b> shoot &nbsp;·&nbsp; <b>Right-click</b> aim &nbsp;·&nbsp; <b>R</b> reload
          </div>
          <div>
            <b>G</b> hold to aim bomb, release to throw
          </div>
          <div>
            <b>Q</b> send fox &nbsp;·&nbsp; <b>E</b> claim &nbsp;·&nbsp; <b>X</b> rest (indoors) &nbsp;·&nbsp; <b>Esc</b> release mouse
          </div>
          <div style={styles.controlsHint}>
            <b>H</b> hides / shows this
          </div>
        </div>
      )}

      {/* Click-to-play prompt when the mouse isn't captured (desktop only —
          touch devices use on-screen controls, no pointer lock). */}
      {!locked && !isTouchDevice() && (
        <div style={styles.lockPrompt}>
          <div style={styles.promptCard}>click to look around</div>
        </div>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  compassWrap: {
    position: "absolute",
    top: 18,
    left: "50%",
    transform: "translateX(-50%)",
    textAlign: "center",
    pointerEvents: "none",
    userSelect: "none",
  },
  compass: {
    position: "relative",
    width: 58,
    height: 58,
    borderRadius: "50%",
    border: "2px solid rgba(232,238,242,0.35)",
    background: "rgba(11,13,16,0.5)",
    margin: "0 auto",
  },
  hintDot: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 9,
    height: 9,
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
    background: HINT_DEFAULT,
    boxShadow: "0 0 0 1px rgba(0,0,0,0.55)",
    transition: "background 0.2s ease",
  },
  compassCenter: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 4,
    height: 4,
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
    background: "rgba(232,238,242,0.5)",
  },
  thiefDot: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 9,
    height: 9,
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
    background: "#e8563f",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.55), 0 0 6px rgba(232,86,63,0.8)",
    opacity: 0,
  },
  foxDot: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 10,
    height: 10,
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
    background: "#f0a860",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.55), 0 0 8px rgba(240,168,96,0.95)",
    opacity: 0,
  },
  bankDot: {
    // A gold diamond (rotated square) so it reads distinctly from the round
    // hint/thief dots. Shows only while carrying loot; the game loop pulses it.
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 9,
    height: 9,
    transform: "translate(-50%, -50%) rotate(45deg)",
    background: "#ffd873",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.55), 0 0 7px rgba(255,216,115,0.95)",
    opacity: 0,
  },
  timer: {
    // BELOW the minimap, not under it. The minimap has always occupied the
    // top-right corner, so the clock was rendering behind it and simply could not
    // be read — which mattered little for a countdown nobody looked at and
    // matters a great deal now that the time of day IS the round timer.
    position: "absolute",
    top: 176,
    right: 20,
    textAlign: "right",
    pointerEvents: "none",
    userSelect: "none",
  },
  timerNum: {
    fontSize: 30,
    fontWeight: 700,
    color: "#e8eef2",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: 1,
    lineHeight: 1,
  },
  timerLabel: { fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(232,238,242,0.5)", marginTop: 2 },
  chapterBanner: {
    position: "absolute",
    left: "50%",
    top: "20%",
    transform: "translateX(-50%)",
    textAlign: "center",
    color: "#f3e6c8",
    textShadow: "0 2px 12px rgba(0,0,0,0.85)",
    opacity: 0,
    transition: "opacity 0.4s ease",
    pointerEvents: "none",
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  roundOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    background: "rgba(11,13,16,0.7)",
    pointerEvents: "none",
    userSelect: "none",
  },
  roundTitle: { fontSize: 44, fontWeight: 800, letterSpacing: 1, textAlign: "center" },
  roundLoot: { fontSize: 15, color: "#aef2cb", letterSpacing: 0.3 },
  roundHint: { fontSize: 17, color: "rgba(232,238,242,0.85)" },
  sniffPill: {
    marginTop: 8,
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 999,
    border: `1px solid ${HINT_DEFAULT}`,
    color: HINT_DEFAULT,
    fontSize: 12,
    letterSpacing: 0.5,
    background: "rgba(11,13,16,0.5)",
  },
  damageFlash: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(ellipse at center, rgba(255,40,40,0) 45%, rgba(200,20,20,0.9) 100%)",
    opacity: 0,
    pointerEvents: "none",
  },
  healthWrap: {
    position: "absolute",
    left: "50%",
    bottom: 52,
    transform: "translateX(-50%)",
    width: 240,
    height: 16,
    borderRadius: 8,
    background: "rgba(11,13,16,0.6)",
    border: "1px solid rgba(232,238,242,0.25)",
    overflow: "hidden",
    pointerEvents: "none",
    userSelect: "none",
  },
  healthFill: { position: "absolute", left: 0, top: 0, bottom: 0, transition: "width 0.15s ease, background 0.2s ease" },
  wallet: {
    position: "absolute",
    top: 16,
    left: 20,
    pointerEvents: "none",
    userSelect: "none",
  },
  walletBanked: {
    fontSize: 16,
    fontWeight: 700,
    color: "#ffd873",
    letterSpacing: 0.5,
    fontVariantNumeric: "tabular-nums",
  },
  walletCarry: {
    marginTop: 3,
    fontSize: 12,
    color: "#aef2cb",
    letterSpacing: 0.3,
  },
  foxStage: {
    marginTop: 5,
    fontSize: 13,
    fontWeight: 600,
    color: "#f0a860",
    letterSpacing: 0.3,
  },
  foxNext: {
    fontSize: 11,
    fontWeight: 400,
    color: "rgba(232,238,242,0.5)",
  },
  foxToast: {
    position: "absolute",
    left: "50%",
    top: "33%",
    transform: "translateX(-50%)",
    padding: "8px 18px",
    borderRadius: 10,
    background: "rgba(11,13,16,0.65)",
    border: "1px solid rgba(240,168,96,0.7)",
    color: "#ffcf9a",
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: 0.5,
    whiteSpace: "nowrap",
    opacity: 0,
    transition: "opacity 0.25s ease",
    pointerEvents: "none",
    userSelect: "none",
  },
  bombPill: {
    padding: "3px 10px",
    borderRadius: 999,
    background: "rgba(11,13,16,0.6)",
    border: "1px solid rgba(232,238,242,0.25)",
    color: "#e8eef2",
    fontSize: 13,
    letterSpacing: 0.5,
    whiteSpace: "nowrap",
    transition: "opacity 0.2s ease",
    pointerEvents: "none",
    userSelect: "none",
  },
  resourceRow: {
    position: "absolute",
    left: "50%",
    bottom: 74,
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 8,
    pointerEvents: "none",
    userSelect: "none",
  },
  ammoPill: {
    padding: "3px 10px",
    borderRadius: 999,
    background: "rgba(11,13,16,0.6)",
    border: "1px solid rgba(232,238,242,0.25)",
    color: "#e8eef2",
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 0.5,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    userSelect: "none",
  },
  damageArc: {
    // A ring centred on the crosshair; the mark sits at its top edge and the whole
    // ring is rotated to the bearing of the hit, so the mark lands in that
    // direction. Rotating one element is cheaper than repositioning per frame.
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 240,
    height: 240,
    transform: "translate(-50%, -50%)",
    opacity: 0,
    pointerEvents: "none",
    userSelect: "none",
  },
  damageArcMark: {
    position: "absolute",
    left: "50%",
    top: 0,
    width: 76,
    height: 8,
    marginLeft: -38,
    borderRadius: 6,
    background: "linear-gradient(to bottom, rgba(255,70,50,0.95), rgba(255,70,50,0))",
  },
  restorePill: {
    padding: "3px 10px",
    borderRadius: 999,
    background: "rgba(11,13,16,0.6)",
    border: "1px solid rgba(90,209,122,0.45)",
    color: "#8fe0a8",
    fontSize: 13,
    letterSpacing: 0.5,
    whiteSpace: "nowrap",
    transition: "opacity 0.2s ease",
    pointerEvents: "none",
    userSelect: "none",
  },
  healthLabel: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 600,
    color: "#0b0d10",
    letterSpacing: 0.5,
  },
  deathOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    background: "rgba(11,13,16,0.55)",
    pointerEvents: "none",
    userSelect: "none",
  },
  deathTitle: { fontSize: 34, fontWeight: 700, letterSpacing: 1, color: "#e8563f" },
  deathLoss: { fontSize: 15, color: "#ffb054", letterSpacing: 0.3 },
  deathHint: { fontSize: 16, color: "rgba(232,238,242,0.85)" },
  crosshairWrap: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 0,
    height: 0,
    pointerEvents: "none",
    userSelect: "none",
  },
  crossDot: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 3,
    height: 3,
    borderRadius: "50%",
    background: "#ffffff",
    transform: "translate(-50%, -50%)",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.7)",
  },
  crossTickV: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 2,
    height: 6,
    background: "#ffffff",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
  },
  crossTickH: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 6,
    height: 2,
    background: "#ffffff",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
  },
  runPill: {
    position: "absolute",
    left: "50%",
    bottom: 26,
    transform: "translateX(-50%)",
    padding: "4px 12px",
    borderRadius: 999,
    background: "rgba(242,193,78,0.15)",
    border: "1px solid rgba(242,193,78,0.5)",
    color: "#f2c14e",
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    opacity: 0,
    transition: "opacity 0.12s ease",
    pointerEvents: "none",
    userSelect: "none",
  },
  crouchPill: {
    position: "absolute",
    left: "50%",
    bottom: 26,
    transform: "translateX(-50%)",
    padding: "4px 12px",
    borderRadius: 999,
    background: "rgba(143,208,224,0.12)",
    border: "1px solid rgba(143,208,224,0.5)",
    color: "#8fd0e0",
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    opacity: 0,
    transition: "opacity 0.12s ease",
    pointerEvents: "none",
    userSelect: "none",
  },
  eventToast: {
    position: "absolute",
    left: "50%",
    top: "27%",
    transform: "translateX(-50%)",
    padding: "8px 18px",
    borderRadius: 10,
    background: "rgba(11,13,16,0.65)",
    border: "1px solid rgba(232,86,63,0.6)",
    color: "#ff8a7a",
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: 0.5,
    whiteSpace: "nowrap",
    opacity: 0,
    transition: "opacity 0.2s ease",
    pointerEvents: "none",
    userSelect: "none",
  },
  shelterPill: {
    position: "absolute",
    left: "50%",
    bottom: 84,
    transform: "translateX(-50%)",
    padding: "5px 14px",
    borderRadius: 999,
    background: "rgba(90,209,122,0.12)",
    border: "1px solid rgba(90,209,122,0.5)",
    color: "#8fe0a8",
    fontSize: 13,
    letterSpacing: 0.5,
    whiteSpace: "nowrap",
    opacity: 0,
    transition: "opacity 0.15s ease",
    pointerEvents: "none",
    userSelect: "none",
  },
  prompt: {
    position: "absolute",
    left: "50%",
    top: "40%",
    transform: "translateX(-50%)",
    padding: "10px 20px",
    borderRadius: 10,
    background: "rgba(11,13,16,0.55)",
    border: "1px solid rgba(232,238,242,0.3)",
    color: "#ffdf8f",
    fontSize: 16,
    letterSpacing: 0.5,
    whiteSpace: "nowrap",
    opacity: 0,
    transition: "opacity 0.15s ease",
    pointerEvents: "none",
    userSelect: "none",
  },
  claimedToast: {
    position: "absolute",
    left: "50%",
    top: "34%",
    transform: "translateX(-50%)",
    padding: "10px 20px",
    borderRadius: 10,
    background: "rgba(78,242,142,0.14)",
    border: "1px solid rgba(120,242,170,0.6)",
    color: "#aef2cb",
    fontSize: 15,
    letterSpacing: 0.5,
    whiteSpace: "nowrap",
    pointerEvents: "none",
    userSelect: "none",
  },
  controls: {
    position: "absolute",
    left: 18,
    bottom: 18,
    // A card, not raw text floating on the world — it was unreadable against
    // pale cobblestone and read as debug output rather than part of the game.
    padding: "10px 14px",
    borderRadius: 8,
    background: "rgba(14,11,8,0.55)",
    border: "1px solid rgba(233,214,174,0.14)",
    backdropFilter: "blur(3px)",
    fontSize: 13,
    color: "rgba(232,238,242,0.78)",
    lineHeight: 1.7,
    pointerEvents: "none",
    userSelect: "none",
    transition: "opacity 1.1s ease-out",
  },
  controlsHint: {
    marginTop: 4,
    paddingTop: 5,
    borderTop: "1px solid rgba(233,214,174,0.12)",
    fontSize: 11.5,
    color: "rgba(232,238,242,0.45)",
  },
  muteBtn: {
    position: "absolute",
    right: 18,
    bottom: 18,
    width: 40,
    height: 40,
    borderRadius: 999,
    background: "rgba(11,13,16,0.6)",
    border: "1px solid rgba(232,238,242,0.25)",
    color: "#e8eef2",
    fontSize: 18,
    lineHeight: 1,
    cursor: "pointer",
    pointerEvents: "auto",
    userSelect: "none",
  },
  lockPrompt: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" },
  promptCard: {
    padding: "10px 18px",
    borderRadius: 10,
    background: "rgba(11,13,16,0.6)",
    border: "1px solid rgba(232,238,242,0.2)",
    fontSize: 14,
    letterSpacing: 0.4,
  },
};
