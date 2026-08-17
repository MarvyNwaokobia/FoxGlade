"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { runtime } from "@/engine/runtime";
import { useGame } from "@/engine/store";
import { audio } from "@/engine/audio/audio";
import {
  bearingTo,
  compassAngle,
  leads,
  leadView,
  type LeadSource,
  type LeadView,
} from "@/engine/world/leads";
import { HOME_INDEX, VILLAGE } from "@/engine/world/village";
import { REST } from "@/engine/config/round";
import { CHAPTERS, clockLabel, DAY } from "@/engine/config/day";
import { WEAPON_STATS } from "@/engine/config/shop";
import { FEEL } from "@/engine/config/feel";
import { foxGrowthFor, foxNextGrow, foxRustNow, foxStageOf } from "@/engine/config/fox";
import { gameMode } from "@/engine/config/mode";
import { thieves, MAX_THIEVES } from "@/engine/npc/thieves";
import { isTouchDevice } from "@/engine/input/touch";

/** Every loose HUD text sits directly over the live 3D scene — a bright sky
 *  through a doorway, a pale wall, anything — with no background pill behind
 *  it. Without a shadow, light-coloured text (the clock, the wallet, the fox
 *  line) disappears against a light patch of the world; found in playtest.
 *  A tight dark shadow plus a soft wider one holds legible against any
 *  background without needing a scrim box behind every line. Matches the
 *  chapterBanner's own shadow below, just given a name so it stops getting
 *  reinvented per-element. */
const TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.95), 0 1px 8px rgba(0,0,0,0.6)";

const HINT_DEFAULT = "#8fd0e0"; // pale cyan ping (the fox pill, at rest)
const HINT_REAL = "#f2c14e"; // gold (the fox pill, once it's digging)
// HINT_FAKE went with the candidate dots: nothing on the HUD is allowed to know
// which pings are decoys any more, so there is nothing left to colour "decoy".

/** Wedge colour per source. A villager's rumour is deliberately NOT red or
 *  otherwise marked as suspect — a liar on the compass has to look exactly like
 *  an honest one, or the deduction is done for you. It's simply a different,
 *  less authoritative voice: hearsay green against the guardian's gold. */
const LEAD_COLOR: Record<LeadSource, string> = {
  guardian: "#f2c14e",
  fox: "#f0a860",
  chart: "#8fd0e0",
  villager: "#9fd6a4",
};

/** Plain-language read on how much the fox's nose can be trusted. */
export function noseLabel(misread: number): string {
  if (misread <= 0) return "never wrong";
  if (misread < 0.2) return "good nose";
  if (misread < 0.35) return "learning";
  return "still a pup, check its work";
}

/** Annular-sector path for a compass wedge, in the 58×58 compass box. */
const WEDGE_INNER = 13;
const WEDGE_OUTER = 27;

function wedgePath(rel: number, spread: number, c: number): string {
  const a0 = rel - spread;
  const a1 = rel + spread;
  // Screen space: x = c + sin(a)·r, y = c − cos(a)·r, so increasing `a` sweeps
  // clockwise (SVG sweep-flag 1). Spread is capped below 90° in leads.ts, so the
  // arc can never exceed a half-turn and large-arc-flag stays 0.
  const p = (a: number, r: number) =>
    `${(c + Math.sin(a) * r).toFixed(2)} ${(c - Math.cos(a) * r).toFixed(2)}`;
  return (
    `M ${p(a0, WEDGE_OUTER)} A ${WEDGE_OUTER} ${WEDGE_OUTER} 0 0 1 ${p(a1, WEDGE_OUTER)} ` +
    `L ${p(a1, WEDGE_INNER)} A ${WEDGE_INNER} ${WEDGE_INNER} 0 0 0 ${p(a0, WEDGE_INNER)} Z`
  );
}

/** Place a blip on the compass ring at a world position. */
function placeBlip(
  el: HTMLDivElement | null,
  x: number,
  z: number,
  c: number,
  r: number
): void {
  if (!el) return;
  const a = compassAngle(bearingTo(runtime.playerPos.x, runtime.playerPos.z, x, z), runtime.yaw);
  el.style.left = `${c + Math.sin(a) * r}px`;
  el.style.top = `${c - Math.cos(a) * r}px`;
}

/** Point a wedge at a lead, or hide it if that lead has been forgotten. */
function drawWedge(el: SVGPathElement | null, view: LeadView | null, yaw: number, c: number): void {
  if (!el) return;
  if (!view) {
    el.style.opacity = "0";
    return;
  }
  el.setAttribute("d", wedgePath(compassAngle(view.bearing, yaw), view.spread, c));
  el.setAttribute("fill", LEAD_COLOR[view.source]);
  el.style.opacity = String(0.12 + view.alpha * 0.5);
}

/**
 * DOM overlay. Reads `runtime` on its own rAF (never re-rendering from the game
 * loop). The compass shows one arrow PER candidate hint — all identical until the
 * fox's sniff (Q) reveals which is real (DESIGN §2/§3).
 */
export function Hud() {
  const leadArc = useRef<SVGPathElement>(null);
  const rumourArc = useRef<SVGPathElement>(null);
  const thiefBlips = useRef<(HTMLDivElement | null)[]>([]);
  const bankBlip = useRef<HTMLDivElement>(null);
  const northTick = useRef<HTMLDivElement>(null);
  const sniffEl = useRef<HTMLDivElement>(null);
  const foxBlip = useRef<HTMLDivElement>(null);
  const promptEl = useRef<HTMLDivElement>(null);
  const timerEl = useRef<HTMLDivElement>(null);
  const chapterEl = useRef<HTMLDivElement>(null);
  const bannerEl = useRef<HTMLDivElement>(null);
  const dayStartEl = useRef<HTMLDivElement>(null);
  const guardianGateEl = useRef<HTMLDivElement>(null);
  const guardianGateDotsEl = useRef<HTMLDivElement>(null);
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
  // Resolved once. The touch layout is a different arrangement, not just a
  // smaller one: the right-hand third of a landscape phone belongs to the
  // thumb cluster, so nothing informational may live there.
  const touchLayout = useMemo(() => isTouchDevice(), []);
  // Portrait phones only — the bottom-center info stack (health/ammo/shelter
  // pills) is wide enough that on anything narrower than this its right edge
  // lands inside the bottom-right thumb cluster (FIRE/action/AIM/BOMB/CROUCH
  // in MobileControls.tsx). Same measure-on-mount-and-resize pattern as
  // Minimap.tsx's `narrow`. Landscape/tablet/desktop don't need it — the
  // thumb cluster is a much smaller fraction of a wide screen there.
  const [cramped, setCramped] = useState(false);
  useEffect(() => {
    const measure = () => setCramped(window.innerWidth < 640);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);
  // Shift the bottom-center info stack up by a flat amount, clear of the
  // tallest touch button (CROUCH's top edge sits ~232px above the bottom) —
  // see the note by `cramped` above.
  const raiseHud = touchLayout && cramped;
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
  const owned = useGame((s) => s.owned);
  const foxHoursAway = useGame((s) => s.foxHoursAway);
  const foxRustBanksLeft = useGame((s) => s.foxRustBanksLeft);
  const lockboxes = useGame((s) => s.lockboxes);
  const extraLives = useGame((s) => s.extraLives);
  const newGameNonce = useGame((s) => s.newGameNonce);
  const day = useGame((s) => s.day);
  const treasuresRequired = useGame((s) => s.treasuresRequired);
  const treasuresResolved = useGame((s) => s.treasuresResolved);
  const treasuresStolen = useGame((s) => s.treasuresStolen);
  const dayOver = useGame((s) => s.dayOver);

  // The control legend: up while you settle in, then out of the way. Bound to H
  // so it's never actually lost, and reshown when a new GAME starts. Not each
  // morning — the controls do not change overnight, and a legend that reappears
  // every day is one you stop reading.
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
  }, [newGameNonce]);

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

      const C = 29; // compass centre (px)
      const R = 20; // ring radius (px)

      // The compass knows NOTHING about where the treasure is. It only draws what
      // you've been TOLD — see engine/world/leads.ts for why the four
      // always-on candidate dots that used to live here had to go.
      //
      // Two sectors: the lead you trust (guardian / fox) and the last rumour a
      // villager pushed on you. Both fade as you forget them.
      drawWedge(leadArc.current, leadView(leads.lead, now), runtime.yaw, C);
      drawWedge(rumourArc.current, leadView(leads.rumour, now), runtime.yaw, C);

      // The N tick rides the rim, so the dial turns as you do. Without it an
      // empty compass is a featureless black disc that reads as broken UI rather
      // than as "nobody has told you anything yet".
      if (northTick.current) {
        const a = compassAngle(0, runtime.yaw); // world north, screen-relative
        northTick.current.style.left = `${C + Math.sin(a) * 26}px`;
        northTick.current.style.top = `${C - Math.cos(a) * 26}px`;
        northTick.current.style.transform = `translate(-50%, -50%) rotate(${a}rad)`;
      }

      // A red blip per live thief on the compass ring (they keep racing for any
      // treasure you haven't taken yet).
      const live = Array.from(thieves);
      for (let i = 0; i < MAX_THIEVES; i++) {
        const el = thiefBlips.current[i];
        if (!el) continue;
        if (i < live.length) {
          const p = live[i].getPos();
          placeBlip(el, p.x, p.z, C, R);
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
          placeBlip(bankBlip.current, VILLAGE.bank.x, VILLAGE.bank.z, C, R);
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
        // Once the light has gone the chapter word stops being the useful thing
        // and the instruction does, so the line under the clock says so.
        chapterEl.current.textContent = useGame.getState().dayOver
          ? "GO HOME AND SLEEP"
          : runtime.chapterName;
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

      // Day-start toast: "DAY N — find X treasures before night falls."
      // One-shot, fired from store.ts (sleep / restart / a death-restart) via
      // runtime.dayAnnounceAt (DESIGN §14.10).
      if (dayStartEl.current) {
        const age = now - runtime.dayAnnounceAt;
        if (runtime.dayAnnounceAt > 0 && age < 5200) {
          const req = useGame.getState().treasuresRequired;
          dayStartEl.current.innerHTML =
            `<div style="font-size:26px;font-weight:800;letter-spacing:1px">DAY ${useGame.getState().day}</div>` +
            `<div style="font-size:15px;opacity:0.85;margin-top:4px">Find ${req} treasure${req === 1 ? "" : "s"} before night falls.</div>`;
          dayStartEl.current.style.opacity = String(age < 4200 ? 1 : (5200 - age) / 1000);
        } else {
          dayStartEl.current.style.opacity = "0";
        }
      }

      // Guardian gate (Marvy's call): while the briefing is up, PlayerController
      // has paused and frozen the world, and the only way out is this prompt —
      // no timer counts it down. pointerEvents only turns on while the gate is
      // actually up, so this invisible-until-needed layer never eats a normal
      // click/tap the rest of the run.
      if (guardianGateEl.current) {
        const gate = runtime.guardianGate;
        guardianGateEl.current.style.opacity = gate ? "1" : "0";
        guardianGateEl.current.style.pointerEvents = gate ? "auto" : "none";
      }
      // Page dots for a multi-part briefing — see the note by the ref decl for
      // why this is a manual innerHTML rebuild rather than JSX bound to
      // `runtime.guardianPage`. Cheap (a handful of small divs) and only runs
      // while the gate is actually up, same budget as the banner/day-start
      // toasts a few lines above.
      if (guardianGateDotsEl.current) {
        const count = runtime.guardianPageCount;
        if (runtime.guardianGate && count > 1) {
          guardianGateDotsEl.current.innerHTML = Array.from({ length: count }, (_, i) => {
            const on = i === runtime.guardianPage;
            return `<span style="display:inline-block;width:6px;height:6px;border-radius:999px;margin:0 3px;background:#ffe6b0;opacity:${on ? 1 : 0.35};transform:scale(${on ? 1.25 : 1})"></span>`;
          }).join("");
        } else {
          guardianGateDotsEl.current.innerHTML = "";
        }
      }

      // Fox blip: while it's scouting or attacking, the compass tracks the FOX.
      // That's the point of the redesign — the animal is the navigation, so the
      // thing you're steering by is your companion, not a revealed answer.
      if (foxBlip.current) {
        const tracking = runtime.foxState === "scout" || runtime.foxState === "attack";
        if (tracking) {
          placeBlip(foxBlip.current, runtime.foxPos.x, runtime.foxPos.z, C, R);
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
          sniffEl.current.textContent = `🦊 down for ${Math.max(0, left)}s`;
          sniffEl.current.style.color = "#ff8a7a";
          sniffEl.current.style.borderColor = "rgba(232,86,63,0.7)";
        } else if (st === "scout") {
          // "found IT" was a promise the fox can no longer keep — a kit digs at
          // decoys with total conviction. The HUD reports what it's doing, not
          // whether it's right; finding that out is the player's job.
          sniffEl.current.textContent = runtime.foxFoundTreasure
            ? "🦊 it's digging, follow!"
            : "🦊 scouting…";
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
          sniffEl.current.textContent = touchInput ? "🦊 send with FOX" : "🦊 send with Q";
          sniffEl.current.style.color = HINT_DEFAULT;
          sniffEl.current.style.borderColor = HINT_DEFAULT;
        }
      }

      // Proximity prompt: real+unclaimed → claim (then carry to the bank); decoy → dud.
      if (promptEl.current) {
        const idx = runtime.nearHintIndex;
        const nearRealUnclaimed = runtime.nearHintIsReal && idx >= 0 && !runtime.hintClaimed[idx];
        if (nearRealUnclaimed) {
          promptEl.current.innerHTML = touchInput
            ? "Treasure. Tap <b>GRAB</b> to claim, then bank it."
            : "Treasure. Press <b>E</b> to grab, then bank it.";
          promptEl.current.style.color = "#ffdf8f";
          promptEl.current.style.borderColor = "rgba(242,193,78,0.6)";
          promptEl.current.style.opacity = "1";
        } else if (idx >= 0 && !runtime.nearHintIsReal) {
          promptEl.current.innerHTML = "False lead, nothing here.";
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
          foxToastEl.current.textContent = `🦊 Your fox grew into ${runtime.foxStageName}!`;
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

      // Shelter / rest prompt while inside a house. The copy no longer promises
      // safety: the room breaks line of sight and nothing more, the day keeps
      // moving, and anyone who watched you come in is on their way.
      if (shelterEl.current) {
        const canBank = runtime.nearBank && useGame.getState().villeCarrying > 0;
        // Day's end is a hard stop now (the full-screen overlay below), not a
        // "go find your own bed" prompt, so there's no canSleep branch here
        // any more — E/R work anywhere once dayOver, not just at home.
        if (canBank) {
          shelterEl.current.innerHTML = touchInput
            ? "at the vault. Tap <b>BANK</b> to bank it and grow your fox."
            : "at the vault. Press <b>E</b> to bank it and grow your fox.";
          shelterEl.current.style.opacity = "1";
        } else if (runtime.nearMarket && !useGame.getState().shopOpen) {
          shelterEl.current.innerHTML = touchInput ? "at the market. Tap <b>SHOP</b> to browse." : "at the market. Press <b>E</b> to shop.";
          shelterEl.current.style.opacity = "1";
        } else if (runtime.resting) {
          shelterEl.current.innerHTML = "patching up, <b>stay still</b>";
          shelterEl.current.style.opacity = "1";
        } else if (
          runtime.shelterIndex === HOME_INDEX &&
          useGame.getState().playerHealth >= useGame.getState().maxPlayerHealth
        ) {
          // Your own room, unhurt. "Out of sight, they'll come looking" is a
          // line about hiding, and it was greeting the player every single
          // morning in the bed they had just woken up in. Nobody is looking for
          // you yet. It comes back the moment you have been hit, because then
          // you really did come in here to get away from something.
          shelterEl.current.style.opacity = "0";
        } else if (runtime.sheltered) {
          const left = useGame.getState().restoresLeft;
          const atCap =
            useGame.getState().playerHealth >= useGame.getState().maxPlayerHealth * REST.healCap;
          shelterEl.current.innerHTML = atCap
            ? "out of sight, they'll come looking"
            : left > 0
              ? touchInput
                ? `out of sight. Tap <b>REST</b> to patch up, ${left} left`
                : `out of sight. <b>X</b> to patch up, ${left} left`
              : "out of sight, <b>no restores left</b>. Buy more at the market";
          shelterEl.current.style.opacity = "1";
        } else {
          shelterEl.current.style.opacity = "0";
        }
      }

      // The clock used to dim indoors to signal it had stopped. It hasn't
      // stopped any more — the whole point of the safe-room rewrite is that the
      // light keeps going while you hide — so it must read at full strength in
      // there. Dimming it now would be the HUD telling you a lie.
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

  // Growth stage is the fox's, and the fox IS the rank — so in a mode without
  // one there is nothing here to report. Shared between the desktop and touch
  // wallet layouts below (only the surrounding container differs), so it's
  // computed once rather than duplicated inline in both branches.
  const foxGrowthLine = gameMode().fox && (() => {
    const foxStage = foxStageOf(owned);
    const growth = foxGrowthFor(foxStage);
    const nextGrow = foxNextGrow(owned);
    const rust = foxRustNow(foxHoursAway, foxRustBanksLeft);
    const misread = Math.min(0.95, growth.misreadChance + rust.misreadAdd);
    return (
      <div style={touchLayout ? styles.foxStageTouch : styles.foxStage}>
        🦊 {growth.name}
        {/* Name the thing growth actually buys. "Grow it for 200 VILLE" says
            nothing about WHY you'd want to; its nose is the why.
            On a phone this whole line ran nearly half the screen width, so
            the price — the least urgent part — is dropped there. */}
        <span style={styles.foxNext}>, {noseLabel(misread)}</span>
        {/* Rust is a real, felt penalty (config/fox.ts FOX_RUST) — it must
            say so, or a slower, dumber fox just reads as the game being
            broken. Naming the cause AND the fix in one line is what makes
            a punishment feel like a mechanic. */}
        {rust.speedMult < 1 && (
          <span style={styles.foxNext}>
            {" "}
            · rusty from time away — bank {foxRustBanksLeft} more to shake it off
          </span>
        )}
        {!touchLayout && nextGrow && (
          <span style={styles.foxNext}>. Grow it in the Market for {nextGrow.price} VILLE</span>
        )}
      </div>
    );
  })();

  return (
    <>
      {/* Red damage flash */}
      <div ref={dmgEl} style={styles.damageFlash} />

      {/* Player health bar, bottom-center */}
      <div style={{ ...styles.healthWrap, bottom: raiseHud ? 152 : 52 }}>
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
      <div style={{ ...styles.resourceRow, bottom: raiseHud ? 174 : 74 }}>
        <div ref={ammoEl} style={styles.ammoPill} />
        <div style={{ ...styles.restorePill, opacity: restoresLeft > 0 ? 1 : 0.35 }}>✚ ×{restoresLeft}</div>
        <div style={{ ...styles.bombPill, opacity: bombsLeft > 0 ? 1 : 0.35 }}>💣 ×{bombsLeft}</div>
        {/* Only shown when you've actually bought insurance — an always-on "×0"
            is a permanent reminder of a thing you didn't do. */}
        {lockboxes > 0 && <div style={styles.lockPill}>🔒 ×{lockboxes}</div>}
      </div>

      {/* Directional damage indicator: an arc pointing at whoever just hit you.
          Screen shake and a red vignette tell you THAT you were hit; they never
          told you FROM WHERE, which is why fights read as arbitrary. */}
      <div ref={dmgArcEl} style={styles.damageArc}>
        <div style={styles.damageArcMark} />
      </div>

      {/* Loot wallet: a left-aligned vertical stack on desktop (unchanged —
          plenty of room up there); on touch it's one compact badge — day/quota
          and the clock stacked, sized to match the pause button beside it
          (Marvy's call, 2026-08-17) — next to the hamburger/pause row, same
          top edge as the minimap. */}
      {touchLayout ? (
        <>
          {/* VILLE only lives in the Bank/Marketplace now (Marvy's call) — the
              gamescreen badge is day/quota + the clock, sized down to sit
              level with the pause button beside it. */}
          <div style={styles.walletTouchLeft}>
            {/* Which day this is. The run is a life now rather than a session,
                and the number that has been climbing since you first played is
                the only thing on screen that says so. */}
            <div style={styles.dayCountCompact}>
              DAY {day} <span style={styles.dayQuota}>· {treasuresResolved}/{treasuresRequired} found</span>
            </div>
            <div style={styles.touchClockRow}>
              <span ref={timerEl} style={styles.timerNumCompact}>06:00</span>
              <span ref={chapterEl} style={styles.timerLabelCompact}>Dawn</span>
            </div>
            {villeCarrying > 0 && <div style={styles.walletCarry}>◆ carrying {villeCarrying}, bank it</div>}
          </div>
          <div style={styles.foxGrowthTouchWrap}>{foxGrowthLine}</div>
        </>
      ) : (
        <div style={styles.wallet}>
          <div style={styles.dayCount}>
            DAY {day} <span style={styles.dayQuota}>· {treasuresResolved}/{treasuresRequired} found</span>
          </div>
          <div style={styles.walletBanked}>🏦 {villeBanked} VILLE</div>
          {villeCarrying > 0 && <div style={styles.walletCarry}>◆ carrying {villeCarrying}, bank it</div>}
          {foxGrowthLine}
        </div>
      )}

      {/* Time of day + chapter. DESKTOP only — top-right under the minimap.
          On touch it's folded into walletTouchLeft instead (same refs, set
          from the same rAF loop below). */}
      {!touchLayout && (
        <div style={styles.timer}>
          <div ref={timerEl} style={styles.timerNum}>06:00</div>
          <div ref={chapterEl} style={styles.timerLabel}>Dawn</div>
        </div>
      )}

      {/* Chapter banner — text set from the game loop */}
      <div ref={bannerEl} style={styles.chapterBanner} />

      {/* Day-start toast — text set from the game loop */}
      <div ref={dayStartEl} style={styles.chapterBanner} />

      {/* Downed overlay (mid-round setback, not round end) */}
      {isDead && roundState === "playing" && (
        <div style={styles.deathOverlay}>
          <div style={styles.deathTitle}>{extraLives > 0 ? "You were downed" : "You didn't make it"}</div>
          {runtime.lootLostAmount > 0 && (
            <div style={styles.deathLoss}>
              you dropped {runtime.lootLostAmount} VILLE — the treasure is back on the board
            </div>
          )}
          {runtime.lootSalvaged > 0 && (
            <div style={styles.deathSalvage}>
              🔒 the lockbox held — {runtime.lootSalvaged} VILLE still on you
            </div>
          )}
          {extraLives === 0 && (
            <div style={styles.deathLoss}>no Warding Charm — today starts over from dawn</div>
          )}
          <div style={styles.deathHint}>
            {touchLayout
              ? extraLives > 0
                ? <>tap <b>RESPAWN</b> to come back {runtime.refugeIndex >= 0 ? "at your refuge" : "at the gate"}</>
                : <>tap <b>RESPAWN</b> to wake at dawn and start the day again</>
              : extraLives > 0
                ? <>press <b>R</b> to come back {runtime.refugeIndex >= 0 ? "at your refuge" : "at the gate"}</>
                : <>press <b>R</b> to wake at dawn and start the day again</>}
          </div>
        </div>
      )}

      {/* Day-over overlay (DESIGN §14.10): a hard stop, not a "go find your own
          bed" prompt — the instant dayOver flips true (quota resolved, or
          nightfall), PlayerController pauses the world and this takes over,
          same visual weight as the death screen it deliberately echoes. Two
          ways out: sleep on to the next day, or retry this one. */}
      {dayOver && roundState === "playing" && !isDead && (
        <div style={styles.deathOverlay}>
          <div style={styles.deathTitle}>Day {day} is over</div>
          <div style={styles.deathLoss}>
            {treasuresStolen > 0
              ? `${treasuresBanked} banked, ${treasuresStolen} lost to thieves`
              : `${treasuresBanked} of ${treasuresRequired} banked, nothing lost`}
          </div>
          <div style={styles.deathHint}>
            {touchLayout ? <>tap <b>SLEEP</b> to wake on Day {day + 1}</> : <>press <b>E</b> to sleep and wake on Day {day + 1}</>}
          </div>
          <div style={styles.deathHint}>
            {touchLayout ? <>tap <b>RETRY DAY</b> to try Day {day} again</> : <>press <b>R</b> to try Day {day} again</>}
          </div>
        </div>
      )}

      {/* Guardian gate (Marvy's call): the briefing has to be READ, not raced
          past. PlayerController pauses and freezes the world the instant it
          goes up; this is the only way out. Deliberately translucent (not a
          blackout like the death/day-over overlays) — the guardian and its
          speech bubble stay visible, this only adds the "you must act" prompt
          and catches the dismiss tap/click. */}
      <div
        ref={guardianGateEl}
        style={styles.guardianGateOverlay}
        onPointerDown={() => {
          if (runtime.guardianGate) runtime.guardianAdvance++;
        }}
      >
        <div style={styles.guardianGateHint}>
          {touchLayout ? "tap to continue" : <>press <b>E</b> to continue</>}
          {/* Page dots — a multi-part briefing with no sense of how much is
              left reads as an unbounded chore. Built imperatively in the rAF
              loop below (like the compass/banner elsewhere in this file),
              not from JSX bound to `runtime.*` directly — `runtime` is a
              plain mutable object the DOM HUD polls every frame precisely so
              writing to it never triggers a React re-render, which means JSX
              reading it inline would just render whatever it was on MOUNT. */}
          <div ref={guardianGateDotsEl} style={styles.guardianGateDots} />
        </div>
      </div>

      {/* Round-over overlay (win / lose) */}
      {roundState !== "playing" && (
        <div style={styles.roundOverlay}>
          <div style={{ ...styles.roundTitle, color: treasuresBanked > 0 ? "#ffd873" : "#e8563f" }}>
            {roundReason === "thief" ? "Thieves took the last of it" : "Night falls"}
          </div>
          <div style={styles.roundLoot}>
            {treasuresBanked > 0
              ? `${treasuresBanked} treasure${treasuresBanked === 1 ? "" : "s"} banked, ${villeBanked} VILLE safe`
              : "You banked nothing today."}
          </div>
          {villeCarrying > 0 && (
            <div style={styles.roundLoot}>
              carrying {villeCarrying} VILLE. Bank it at the vault next run, {villeBanked} safe
            </div>
          )}
          <div style={styles.roundHint}>
            {touchLayout ? <>tap <b>PLAY AGAIN</b></> : <>press <b>Enter</b> to play again</>}
          </div>
        </div>
      )}

      {/* Compass — shows what you've been TOLD (two fading sectors), the
          thieves, the vault while you're carrying, and the fox's direction
          while it's out — but never where the treasure is. Centered top on
          desktop; on touch it sits beside the minimap instead of parked in
          the middle of the screen (Marvy's call, 2026-08-17). */}
      <div style={{ ...styles.compassWrap, ...(touchLayout ? styles.compassWrapTouch : null) }}>
        <div style={styles.compass}>
          <svg width={58} height={58} style={styles.compassSvg}>
            {/* Rumour under the lead, so a fresh lie can't paint over the
                guardian's bearing — it can only sit next to it. */}
            <path ref={rumourArc} d="" fill="none" style={{ opacity: 0, transition: "opacity 0.25s ease" }} />
            <path ref={leadArc} d="" fill="none" style={{ opacity: 0, transition: "opacity 0.25s ease" }} />
          </svg>
          <div ref={northTick} style={styles.compassNorth} />
          <div style={styles.compassCenter} />
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
        {/* DESKTOP only — the touch build's version sits under the hamburger/
            pause row instead (see foxStatusTouchLeft), out of the sightline. */}
        {gameMode().fox && !touchLayout && (
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
      <div ref={runEl} style={{ ...styles.runPill, bottom: raiseHud ? 126 : 26 }}>
        running
      </div>

      {/* Crouch indicator (mutually exclusive with running) */}
      <div ref={crouchEl} style={{ ...styles.crouchPill, bottom: raiseHud ? 126 : 26 }}>
        crouched
      </div>

      {/* Shelter / rest prompt (inside a house) — text set from the game loop */}
      <div ref={shelterEl} style={{ ...styles.shelterPill, bottom: raiseHud ? 212 : 112 }} />

      {/* Event toast (treasure stolen / cracked) — text set from the game loop */}
      <div ref={eventEl} style={styles.eventToast} />

      {/* Fox grew a stage — celebratory toast, text set from the game loop */}
      {gameMode().fox && <div ref={foxToastEl} style={styles.foxToast} />}

      {/* Proximity prompt (claim / false lead) — text set from the game loop */}
      <div ref={promptEl} style={styles.prompt} />

      {/* Fox sniff status. On touch it sits under the hamburger/pause row on
          the left (Marvy's call, 2026-08-17) — it used to live under the
          minimap, but that corner reads better with just the map now. */}
      {touchLayout && gameMode().fox && (
        <div ref={sniffEl} style={{ ...styles.foxStatusTouch, ...styles.foxStatusTouchLeft }} />
      )}

      {/* Mute toggle — DESKTOP ONLY (bottom-right, the one interactive HUD
          element down there). On touch, sound is toggled from the pause
          panel instead (Marvy's call, 2026-08-17) — a floating speaker icon
          on the gamescreen was one more button competing with the pad; it
          only needs to be reachable at all, and pause is already the natural
          place to reach for it. */}
      {!touchLayout && (
        <button
          type="button"
          onPointerDown={() => {
            audio.unlock();
            audio.toggleMute();
          }}
          style={{
            ...styles.muteBtn,
            opacity: muted ? 0.75 : 1,
            color: muted ? "rgba(232,238,242,0.5)" : "#f2c14e",
            borderColor: muted ? "rgba(232,238,242,0.25)" : "rgba(242,193,78,0.75)",
          }}
          title="Mute / unmute (M)"
        >
          {muted ? "🔇" : "🔊"}
        </button>
      )}

      {/* Controls, bottom-left — DESKTOP ONLY, and no longer permanent.
          Four lines of key bindings pinned over the world for the entire run is
          a dev overlay, not a HUD: it competed with the guardian, the fox pill
          and the toasts for the same first ten seconds, and then never left. It
          shows while you're finding your feet, fades out, and comes back on H. */}
      {!isTouchDevice() && showControls && (
        <div style={{ ...styles.controls, opacity: controlsFading ? 0 : 1 }}>
          <div>
            <b>WASD</b> move &nbsp;·&nbsp; <b>Shift</b> run &nbsp;·&nbsp; <b>Space</b> roll / vault / jump &nbsp;·&nbsp; <b>C</b> crouch
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
          touch devices use on-screen controls, no pointer lock). Suppressed
          during the guardian gate: PlayerController releases the lock so the
          "continue" prompt above is actually clickable, and this would just
          be a second, contradictory prompt sitting on top of it. */}
      {!locked && !isTouchDevice() && !runtime.guardianGate && (
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
    top: 10,
    left: "50%",
    transform: "translateX(-50%)",
    textAlign: "center",
    pointerEvents: "none",
    userSelect: "none",
  },
  // Beside the minimap instead of centre-top. `right` is measured against the
  // minimap's own full-size footprint (top:14/right:14/158px wide) plus a
  // clear gap — the minimap only ever shrinks TOWARD its top-right corner
  // (transformOrigin) on a short/narrow screen, so this gap can only grow,
  // never close, as the map scales down.
  compassWrapTouch: {
    top: "calc(env(safe-area-inset-top, 0px) + 14px)",
    left: "auto",
    right: "calc(env(safe-area-inset-right, 0px) + 190px)",
    transform: "none",
  },
  compass: {
    position: "relative",
    width: 58,
    height: 58,
    borderRadius: "50%",
    border: "2px solid rgba(232,238,242,0.45)",
    // Nearly opaque. At 0.5 the village showed straight through the dial — walk
    // past a building and a chunk of timber frame appeared inside the ring,
    // which reads as a rendering fault rather than an instrument. A compass with
    // nothing on it should look like an empty compass, not a hole in the HUD.
    background: "rgba(11,13,16,0.86)",
    boxShadow: "0 2px 10px rgba(0,0,0,0.45)",
    margin: "0 auto",
  },
  /** Fixed N tick on the rim: gives the dial an orientation even with no lead on
   *  it, so an empty compass reads as "nobody has told you anything yet". */
  compassNorth: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 2,
    height: 7,
    borderRadius: 1,
    transform: "translate(-50%, -50%)",
    background: "rgba(232,238,242,0.8)",
  },
  compassSvg: { position: "absolute", left: 0, top: 0, pointerEvents: "none" },
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
    fontSize: 26,
    fontWeight: 700,
    color: "#e8eef2",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: 1,
    lineHeight: 1,
    textShadow: TEXT_SHADOW,
  },
  timerLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "rgba(232,238,242,0.75)",
    marginTop: 2,
    whiteSpace: "nowrap",
    textShadow: TEXT_SHADOW,
  },
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
  // top:16/left:20 used to sit directly under the hamburger + pause triggers
  // (HamburgerMenu.tsx/Pause.tsx: top:14, left:14/62, 40×40 each) — the DAY/
  // VILLE readout rendered right behind them, unreadable on every screen size,
  // not just touch.
  //
  // Pushing it straight DOWN instead (the first fix tried) just traded one
  // collision for another: on touch this stack is up to ~152px tall (day/
  // VILLE/fox-growth/fox-status/the touch clock all stack here), and the gap
  // between the button row (ends 54) and the FOX button (MobileControls.tsx,
  // starts 176) is only 122px — not enough room at any top offset. Cleared
  // the buttons HORIZONTALLY instead (pause's own right edge is 102, +8px
  // gap): the row of icons and the first line of the wallet now share the
  // same top strip side by side, and the full stack still has the whole
  // 54–176 gap available underneath it, uncontested.
  wallet: {
    position: "absolute",
    top: 16,
    left: 110,
    pointerEvents: "none",
    userSelect: "none",
  },
  // Touch's counterpart to `wallet` above: day/quota + the clock, one compact
  // badge sized to sit level with the pause button beside it (Marvy's call,
  // 2026-08-17 — VILLE moved out entirely, now Bank/Marketplace-only, so
  // there was no reason for this to stay wallet-sized). Same top edge as the
  // hamburger/pause row and the minimap. Dark backing (not just TEXT_SHADOW)
  // because a bare shadow washed out over a bright sky or pale wall (Marvy's
  // playtest, 2026-08-16).
  walletTouchLeft: {
    position: "absolute",
    top: 14,
    left: "calc(env(safe-area-inset-left, 0px) + 110px)",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    padding: "5px 10px",
    borderRadius: 10,
    background: "rgba(11,13,16,0.6)",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    pointerEvents: "none",
    userSelect: "none",
  },
  touchClockRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 5,
    marginTop: 2,
  },
  timerNumCompact: {
    fontSize: 15,
    fontWeight: 700,
    color: "#e8eef2",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: 0.5,
    lineHeight: 1,
    textShadow: TEXT_SHADOW,
  },
  timerLabelCompact: {
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "rgba(232,238,242,0.7)",
    whiteSpace: "nowrap",
    textShadow: TEXT_SHADOW,
  },
  // The fox's longer growth line, centred under the compass on its own —
  // its length varies too much (rust warning, misread-chance text) to flank
  // the compass alongside day/VILLE without risking an overlap on a narrow
  // phone.
  foxGrowthTouchWrap: {
    position: "absolute",
    top: 76,
    left: "50%",
    transform: "translateX(-50%)",
    pointerEvents: "none",
    userSelect: "none",
  },
  dayCount: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: 700,
    color: "rgba(232,238,242,0.8)",
    marginBottom: 6,
    textShadow: TEXT_SHADOW,
  },
  // Touch's counterpart to `dayCount` — smaller and with no bottom margin,
  // since the clock stacks directly under it in the same compact badge.
  dayCountCompact: {
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: 700,
    color: "rgba(232,238,242,0.8)",
    whiteSpace: "nowrap",
    textShadow: TEXT_SHADOW,
  },
  dayQuota: {
    letterSpacing: 0.5,
    color: "rgba(232,238,242,0.65)",
    textShadow: TEXT_SHADOW,
  },
  walletBanked: {
    fontSize: 14,
    fontWeight: 700,
    color: "#ffd873",
    letterSpacing: 0.5,
    fontVariantNumeric: "tabular-nums",
    textShadow: TEXT_SHADOW,
  },
  walletCarry: {
    marginTop: 6,
    fontSize: 12,
    color: "#aef2cb",
    letterSpacing: 0.3,
    textShadow: TEXT_SHADOW,
  },
  foxStage: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: 600,
    color: "#f0a860",
    letterSpacing: 0.3,
    textShadow: TEXT_SHADOW,
  },
  // Touch's counterpart to `foxStage` — a centred caption under the wallet
  // row instead of an inline continuation of the day/VILLE stack, since its
  // length varies too much (rust warning, misread-chance text) to hold a
  // fixed column width in the row above.
  foxStageTouch: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: 600,
    color: "#f0a860",
    letterSpacing: 0.3,
    textAlign: "center",
    maxWidth: 280,
    textShadow: TEXT_SHADOW,
  },
  foxStatusTouch: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    border: `1px solid ${HINT_DEFAULT}`,
    // Was a bare outline with no fill — legible over the game's own dark
    // panels but not over a bright sky or pale wall. A faint dark backing
    // (not the border colour, which stays the outline's own job) fixes it
    // without turning a pill into a solid HUD chip.
    background: "rgba(11,13,16,0.55)",
    color: HINT_DEFAULT,
    fontSize: 12,
    letterSpacing: 0.3,
    whiteSpace: "nowrap",
    textShadow: TEXT_SHADOW,
    pointerEvents: "none",
    userSelect: "none",
  },
  // Positions foxStatusTouch under the hamburger/pause row on the left
  // (Marvy's call, 2026-08-17), same left edge as HamburgerMenu's own
  // trigger, same zIndex as that row so it isn't caught under
  // MobileControls' full-screen touch zones.
  foxStatusTouchLeft: {
    position: "absolute",
    top: "calc(env(safe-area-inset-top, 0px) + 62px)",
    left: "calc(env(safe-area-inset-left, 0px) + 14px)",
    zIndex: 45,
  },
  foxNext: {
    fontSize: 11,
    fontWeight: 400,
    color: "rgba(232,238,242,0.75)",
    textShadow: TEXT_SHADOW,
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
  lockPill: {
    padding: "3px 10px",
    borderRadius: 999,
    background: "rgba(11,13,16,0.6)",
    border: "1px solid rgba(242,193,78,0.45)",
    color: "#f2c14e",
    fontSize: 13,
    letterSpacing: 0.5,
    whiteSpace: "nowrap",
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
  deathSalvage: { fontSize: 15, color: "#f2c14e", letterSpacing: 0.3 },
  deathHint: { fontSize: 16, color: "rgba(232,238,242,0.85)" },
  guardianGateOverlay: {
    position: "absolute",
    inset: 0,
    // ABOVE the touch controls. MobileControls is a fixed overlay at zIndex 40
    // whose two thumb zones tile the whole screen with pointerEvents:auto — the
    // same class of bug fixed on muteBtn below, and this overlay never got it:
    // every tap aimed at "tap to continue" was being swallowed by the look-zone
    // underneath before it ever reached this div's own onPointerDown.
    zIndex: 60,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    paddingBottom: 130,
    opacity: 0,
    transition: "opacity 0.2s ease",
    pointerEvents: "none",
    userSelect: "none",
  },
  guardianGateHint: {
    padding: "8px 18px",
    borderRadius: 999,
    background: "rgba(28,24,16,0.9)",
    border: "1px solid rgba(242,193,78,0.85)",
    boxShadow: "0 0 18px rgba(242,193,78,0.25)",
    color: "#ffe6b0",
    fontSize: 14,
    letterSpacing: 0.4,
    whiteSpace: "nowrap",
  },
  guardianGateDots: {
    display: "flex",
    justifyContent: "center",
    marginTop: 6,
  },
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
    // Must clear `resourceRow`, which sits at bottom 74 and stands 29px tall.
    // At 84 this pill ran straight through it — 19px of overlap, dead centre —
    // so "at the vault — press E to bank it" was drawn over the ammo count at
    // exactly the moment you're indoors deciding whether to spend a restore.
    // Anything that grows the resource row has to push this up with it.
    bottom: 112,
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
    // ABOVE the touch controls. MobileControls is a fixed overlay at zIndex 40
    // whose two thumb zones tile the whole screen with pointerEvents:auto, so
    // every tap aimed at this button was being swallowed by the look-zone before
    // it ever arrived — the button had pointerEvents:auto and was simply
    // underneath. It is not enough for a control to be visible.
    zIndex: 60,
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
