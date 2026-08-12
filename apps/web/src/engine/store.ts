import { create } from "zustand";
import { runtime } from "@/engine/runtime";
import { LOOT, REST } from "@/engine/config/round";
import { HINTS, reseedHints, clearHintHistory, type Rarity } from "@/engine/world/hints";
import { bearingTo, clearLeads, setLead } from "@/engine/world/leads";
import { rememberDanger } from "@/engine/fox/foxMemory";
import { DAY, CHAPTERS, chapterAt, treasuresForDay } from "@/engine/config/day";
import {
  SHOP_ITEMS,
  DEFAULT_WEAPON,
  WEAPON_STATS,
  BAG_CAP,
  BOMB_CAP,
  SUPPLY_CAP,
  type WeaponId,
} from "@/engine/config/shop";
import { clearSave, loadSave, writeSave, NEW_SAVE } from "@/engine/save";
import { claimOnChain } from "@/engine/chain/relay";

/** Read once at module load — the state below is seeded from it. */
const SAVE = loadSave();

/**
 * Reactive game state (as opposed to per-frame `runtime` data). Kept small — only
 * things the React UI needs to re-render on.
 */
const MAX_PLAYER_HEALTH = 100;

/** Bombs you carry per run — 4 with the Bomb Satchel, else 2. */
export function bombCapacity(owned: string[]): number {
  return owned.includes("b_satchel") ? BOMB_CAP.upgraded : BOMB_CAP.base;
}
/** Max unbanked VILLE you can hold — rises with the bag you own. */
export function carryCap(owned: string[]): number {
  if (owned.includes("g_rucksack")) return BAG_CAP.g_rucksack;
  if (owned.includes("g_satchel")) return BAG_CAP.g_satchel;
  return BAG_CAP.none;
}

export type RoundState = "playing" | "won" | "lost";
export type RoundReason = "claimed" | "timeout" | "thief" | null;

interface GameState {
  treasureClaimed: boolean;
  /** Rarity of the treasure that won the round (null until claimed). */
  claimedRarity: Rarity | null;
  /** The claimed treasure had been cracked by a bomb: reduced rarity (§13.5). */
  treasureCracked: boolean;
  claimTreasure: (hintIndex: number) => void;

  bombsLeft: number;
  throwBomb: () => void;

  /** Loot on you (from claims, not yet banked) and your spendable bank balance.
      Placeholder for VilleToken until the chain is wired. Survives restarts.
      `villeEarned` is the lifetime total banked — it only ever grows and drives the
      fox — so spending in the market never shrinks your companion. */
  villeCarrying: number;
  villeBanked: number;
  villeEarned: number;
  depositLoot: () => void;

  /** Marketplace: items you own, the gun you have equipped, and the shop overlay. */
  owned: string[];
  equippedWeapon: WeaponId;
  /** Rounds left in the magazine, and when the current reload finishes (-1 = not
   *  reloading). Reserve ammo is unlimited in v1 — the beat we want is the
   *  mid-fight reload, not counting bullets in a bag. */
  ammoInMag: number;
  reloadEndsAt: number; // performance.now timestamp, or -1
  /** Start a reload. No-op if already reloading, or the mag is already full. */
  startReload: () => void;
  /** Called when a reload's timer elapses — refills the magazine. */
  finishReload: () => void;
  /** Spend one round. Returns false when the mag is empty (caller shouldn't fire). */
  spendAmmo: () => boolean;
  shopOpen: boolean;
  openShop: () => void;
  closeShop: () => void;
  buyItem: (id: string) => void;
  equipWeapon: (gunId: WeaponId) => void;

  /** Lockboxes carried. One is spent automatically when you go down, and it buys
   *  back half the loot you were carrying. Insurance you bought BEFORE the risk,
   *  which is the only kind worth selling. */
  lockboxes: number;

  /** Warding Charms carried (SUPPLY_CAP.extraLives caps it at 1 — see shop.ts).
   *  Spent automatically the next time you'd go down for good; while you have
   *  one, dying resumes today's hunt in place instead of restarting the day. */
  extraLives: number;

  playerHealth: number;
  maxPlayerHealth: number;
  /** Restores left this run (see REST.charges). Spent to heal in a safe room;
   *  the marketplace will sell refills. This limit is what stops the paused
   *  safe room from being a free "duck in and top up" every fight. */
  restoresLeft: number;
  /** Spend one restore. Returns false (and spends nothing) when you have none
   *  left or you're already at the cap — so a wasted keypress never costs one. */
  useRestore: () => boolean;
  isDead: boolean;
  /** Bumped on respawn so the controller can reset the player's position. */
  respawnNonce: number;
  damagePlayer: (amount: number) => void;
  healPlayer: (amount: number) => void;
  /**
   * Coming back from going down (DESIGN §14.10). With a Warding Charm in hand it
   * spends the charm and resumes TODAY exactly where you fell — the old
   * behaviour. With none, the day restarts from dawn: quota progress, the
   * board, and time of day all roll back to the start, same as waking up on a
   * fresh morning, except it's still the same day number and nothing banked or
   * owned is touched. Zero free retries by default is the point — see the
   * Warding Charm in shop.ts.
   */
  respawn: () => void;

  /** Which day you are on, 1-indexed. Survives sleeping (see engine/save.ts). */
  day: number;
  /**
   * The day is spent and you may go home and sleep.
   *
   * Nightfall used to end the run outright, which meant the better you played
   * the less game you saw: four good bank runs took a day from dawn to over in
   * about two minutes, and the reward for that was a results screen. Night is a
   * state you can still act in now, and going to bed is YOUR call. You can push
   * on in the dark for whatever is still out there, or turn in and bank the day.
   */
  dayOver: boolean;
  /** How far through the day the run is (0 = dawn, 1 = nightfall). Advanced by
   *  banking treasure and, slowly, by time passing. This IS the clock now. */
  dayProgress: number;
  /** Index into CHAPTERS, derived from dayProgress. Gates which systems are live. */
  chapter: number;
  /** Treasures banked this run — the score. */
  treasuresBanked: number;
  /** How many treasures today's quota asks for (DESIGN §14.10, `treasuresForDay`).
   *  Climbs with `day` — the difficulty curve now runs through the quota, not
   *  just through more blockers. */
  treasuresRequired: number;
  /** How many of today's treasures are settled one way or another — banked by
   *  you, or gotten away with by a thief. The day ends (see `dayOver`) once this
   *  reaches `treasuresRequired`, same as it does at nightfall. */
  treasuresResolved: number;
  /** Of `treasuresResolved`, how many a thief got away with — the day-end tally
   *  reports this alongside `treasuresBanked` so "3 of 5, thieves took 2" reads
   *  as a story, not just a missed number. */
  treasuresStolen: number;
  /** Push the day forward (drift each frame, or a jump on a bank). */
  advanceDay: (amount: number) => void;
  /** A thief got away with the chapter's treasure. Costs you time and puts a new
   *  one somewhere else — it does NOT end the run. */
  loseTreasureToThief: () => void;
  /** Turn in for the night. Only legal once `dayOver` and you're home. Rolls the
   *  day over, re-kits your supplies, and reseeds the board for the morning. */
  sleep: () => void;

  /** Round lifecycle. `timeLeft` lives in `runtime` (per-frame); this is the state. */
  roundState: RoundState;
  roundReason: RoundReason;
  /** Bumped on restart AND on sleep so the scene remounts (revives) all NPCs. */
  roundNonce: number;
  /**
   * Bumped only when a brand new GAME begins, never when a day rolls over.
   *
   * The opening map and the control legend are an introduction to the village.
   * Hanging them off `roundNonce` meant they fired every single morning, so
   * waking in your own bed put a full-screen map of a village you live in
   * between you and your own front door. Once is an opening; every day is a
   * thing you learn to dismiss without reading.
   */
  newGameNonce: number;
  endRound: (reason: Exclude<RoundReason, null>) => void;
  restart: () => void;
}

export const useGame = create<GameState>((set, get) => ({
  treasureClaimed: false,
  claimedRarity: null,
  treasureCracked: false,
  claimTreasure: (hintIndex) => {
    if (get().roundState !== "playing") return;
    const hint = HINTS[hintIndex];
    if (!hint?.real || runtime.hintStolen[hintIndex] || runtime.hintClaimed[hintIndex]) return;
    const rarity = hint.rarity ?? "common";
    const cracked = runtime.hintCracked[hintIndex];
    // A cracked treasure pays one tier down (§13.5).
    const value = cracked ? (rarity === "rare" ? LOOT.common : LOOT.scrap) : LOOT[rarity];
    // Claiming does NOT end the round: you pick the treasure UP (carry it) and must
    // get it to the bank vault to SECURE the win. The extraction is the tension.
    runtime.hintClaimed[hintIndex] = true;
    // Your bag caps how much loot you can hold before a bank run (§ bags).
    const cap = carryCap(get().owned);
    set((s) => ({
      treasureClaimed: true,
      claimedRarity: rarity,
      treasureCracked: cracked,
      villeCarrying: Math.min(cap, s.villeCarrying + value),
    }));
  },

  bombsLeft: BOMB_CAP.base,
  throwBomb: () => set((s) => ({ bombsLeft: Math.max(0, s.bombsLeft - 1) })),

  villeCarrying: 0,
  villeBanked: SAVE.villeBanked,
  villeEarned: SAVE.villeEarned,
  depositLoot: () => {
    const before = get();
    if (before.villeCarrying <= 0) return;
    // Banking makes every claim you're carrying permanent — from here on, going
    // down can't put these back on the board.
    for (let i = 0; i < runtime.hintClaimed.length; i++) {
      if (runtime.hintClaimed[i]) runtime.hintBanked[i] = true;
    }
    // Banking a CLAIMED treasure no longer ENDS the run — it advances the day.
    // That's the core of the long-form structure: the sun is the clock, and you
    // are the one pushing it. Bank often and night comes fast but nothing is at
    // risk; push for one more treasure and you keep the light but carry the loss.
    const secured = before.treasureClaimed && before.roundState === "playing";
    // Captured before the reducer clears them below — the on-chain relay (fired
    // after, as a side effect) needs the amount/rarity this specific bank secured.
    const amount = before.villeCarrying;
    const rarity = before.claimedRarity;
    const resolved = before.treasuresResolved + (secured ? 1 : 0);
    const quotaLeft = secured && resolved < before.treasuresRequired;
    set((s) => ({
      villeBanked: s.villeBanked + s.villeCarrying, // spendable wallet
      villeEarned: s.villeEarned + s.villeCarrying, // lifetime — drives the fox
      villeCarrying: 0,
      ...(secured
        ? { treasuresBanked: s.treasuresBanked + 1, treasuresResolved: resolved, treasureClaimed: false, claimedRarity: null }
        : {}),
    }));
    // Today's quota isn't full yet — put the next treasure on the board right
    // away, same as a theft does, so the hunt doesn't stall until the next
    // chapter happens to roll over on its own.
    if (quotaLeft) {
      runtime.hintSilenced.fill(false);
      runtime.hintStolen.fill(false);
      runtime.hintClaimed.fill(false);
      runtime.hintBanked.fill(false);
      runtime.hintCracked.fill(false);
      reseedHints(get().chapter >= 2);
      clearLeads();
    }
    // Real on-chain mint/reward, only for an actually-secured treasure (not a
    // salvaged partial carry) and only if a wallet is connected — see relay.ts.
    if (secured && rarity) {
      claimOnChain(amount, rarity === "rare" ? 1 : 0);
    }
  },

  // Carried over from the last night's sleep. A brand-new save owns only the
  // starter carbine (engine/save.ts NEW_SAVE).
  owned: SAVE.owned,
  equippedWeapon: SAVE.equippedWeapon,
  ammoInMag: WEAPON_STATS[SAVE.equippedWeapon].magSize,
  reloadEndsAt: -1,
  startReload: () => {
    const s = get();
    const w = WEAPON_STATS[s.equippedWeapon];
    if (s.reloadEndsAt > 0 || s.ammoInMag >= w.magSize || s.isDead) return;
    set({ reloadEndsAt: performance.now() + w.reloadTime * 1000 });
  },
  finishReload: () =>
    set((s) => ({ ammoInMag: WEAPON_STATS[s.equippedWeapon].magSize, reloadEndsAt: -1 })),
  spendAmmo: () => {
    const s = get();
    if (s.ammoInMag <= 0 || s.reloadEndsAt > 0) return false;
    set({ ammoInMag: s.ammoInMag - 1 });
    return true;
  },
  shopOpen: false,
  openShop: () => set((s) => (s.roundState === "playing" && !s.isDead ? { shopOpen: true } : s)),
  closeShop: () => set({ shopOpen: false }),
  buyItem: (id) =>
    set((s) => {
      const item = SHOP_ITEMS.find((i) => i.id === id);
      if (!item || s.villeBanked < item.price) return s;

      // Consumables: buy as often as you can afford, up to a per-run cap. These
      // are the sink — see the note at the top of SHOP_ITEMS.
      if (item.consumable) {
        switch (id) {
          case "s_restore":
            if (s.restoresLeft >= SUPPLY_CAP.restores) return s;
            return { villeBanked: s.villeBanked - item.price, restoresLeft: s.restoresLeft + 1 };
          case "s_bomb":
            if (s.bombsLeft >= bombCapacity(s.owned)) return s;
            return { villeBanked: s.villeBanked - item.price, bombsLeft: s.bombsLeft + 1 };
          case "s_lockbox":
            if (s.lockboxes >= SUPPLY_CAP.lockboxes) return s;
            return { villeBanked: s.villeBanked - item.price, lockboxes: s.lockboxes + 1 };
          case "s_extralife":
            if (s.extraLives >= SUPPLY_CAP.extraLives) return s;
            return { villeBanked: s.villeBanked - item.price, extraLives: s.extraLives + 1 };
          case "s_chart": {
            // Reading it at the stall IS the purchase. Nothing to carry, and the
            // bearing is drawn from where you're standing.
            const real = HINTS.findIndex((h, i) => h.real && !runtime.hintStolen[i] && !runtime.hintClaimed[i]);
            if (real < 0) return s; // nothing left on the board to chart
            setLead(
              "chart",
              bearingTo(runtime.playerPos.x, runtime.playerPos.z, HINTS[real].pos.x, HINTS[real].pos.z),
              performance.now()
            );
            return { villeBanked: s.villeBanked - item.price };
          }
          default:
            return s;
        }
      }

      if (s.owned.includes(id)) return s;
      const owned = [...s.owned, id];
      return {
        villeBanked: s.villeBanked - item.price,
        owned,
        // Buying a weapon equips it (with a fresh magazine); the satchel tops your
        // bombs to the new cap now.
        ...(item.category === "weapon" && item.gunId
          ? {
              equippedWeapon: item.gunId,
              ammoInMag: WEAPON_STATS[item.gunId].magSize,
              reloadEndsAt: -1,
            }
          : {}),
        ...(id === "b_satchel" ? { bombsLeft: bombCapacity(owned) } : {}),
      };
    }),
  equipWeapon: (gunId) =>
    set((s) => {
      const item = SHOP_ITEMS.find((i) => i.gunId === gunId);
      // Swapping guns cancels any reload and hands you a full magazine.
      return item && s.owned.includes(item.id)
        ? { equippedWeapon: gunId, ammoInMag: WEAPON_STATS[gunId].magSize, reloadEndsAt: -1 }
        : s;
    }),

  lockboxes: 0,
  extraLives: 0,
  playerHealth: MAX_PLAYER_HEALTH,
  maxPlayerHealth: MAX_PLAYER_HEALTH,
  restoresLeft: REST.charges,
  useRestore: () => {
    const s = get();
    if (s.restoresLeft <= 0) return false;
    if (s.playerHealth >= s.maxPlayerHealth * REST.healCap) return false;
    set({ restoresLeft: s.restoresLeft - 1 });
    return true;
  },
  isDead: false,
  respawnNonce: 0,
  damagePlayer: (amount) =>
    set((s) => {
      if (s.isDead || s.roundState !== "playing") return s;
      // Indoors used to be a total SAFE ROOM: through the doorway and nothing
      // could touch you, the clock stopped, the thieves froze. Anything that is
      // free gets used constantly, and this was free — so the optimal line was
      // sprint out, grab, sprint to the nearest doorway, wait, repeat. A pause
      // button dressed as a building.
      //
      // Interiors now do what a building should do and no more: they break line
      // of sight (walls + roof are already in BOXES3D, so this needs no special
      // case) and they muffle you. They do not stop bullets that have an angle
      // through the door, they do not stop the sun, and a blocker that watched
      // you go in will come in after you (BLOCKER.breachDelay).
      //
      // A hiding place you can be found in is tense. One that you can't be is
      // furniture.
      const next = Math.max(0, s.playerHealth - amount);
      if (next > 0) return { playerHealth: next, isDead: false };
      // Going down DROPS the treasure you were carrying but hadn't banked.
      //
      // This is what makes the bank run mean anything. Carried loot used to
      // survive death (and even the round ending), so "push for one more treasure
      // or go bank what I've got?" — the decision the whole carry/bank split
      // exists to create — had no downside and was never really a decision. It's
      // also the cost that keeps the refuge checkpoint honest: you come back
      // close to where you fell, but you come back empty-handed.
      // The fox watched this happen, and it will remember the place. Recorded
      // here rather than in the fox component so it survives the fox being
      // downed, unmounted, or absent in a mode that has none.
      rememberDanger(runtime.playerPos.x, runtime.playerPos.z);
      // A lockbox buys back half of what you were carrying. It's spent whether
      // or not you had much on you — insurance you don't claim is still bought.
      const insured = s.lockboxes > 0 && s.villeCarrying > 0;
      const salvaged = insured ? Math.floor(s.villeCarrying / 2) : 0;
      if (s.villeCarrying > 0) {
        runtime.lootLostAt = performance.now();
        runtime.lootLostAmount = s.villeCarrying - salvaged;
        runtime.lootSalvaged = salvaged;
      }
      // Any treasure claimed but not yet banked goes back on the board, where it
      // can be found again — or taken by a thief while you're picking yourself up.
      for (let i = 0; i < runtime.hintClaimed.length; i++) {
        if (runtime.hintClaimed[i] && !runtime.hintBanked[i]) runtime.hintClaimed[i] = false;
      }
      return {
        playerHealth: 0,
        isDead: true,
        villeCarrying: salvaged,
        lockboxes: insured ? s.lockboxes - 1 : s.lockboxes,
        ...(s.treasureClaimed ? { treasureClaimed: false, claimedRarity: null } : {}),
      };
    }),
  healPlayer: (amount) =>
    set((s) => {
      if (s.isDead || s.roundState !== "playing") return s;
      return { playerHealth: Math.min(s.maxPlayerHealth, s.playerHealth + amount) };
    }),
  respawn: () => {
    const s = get();
    if (s.extraLives > 0) {
      // Spend the charm, come back at your refuge, today's hunt untouched.
      set({ playerHealth: MAX_PLAYER_HEALTH, isDead: false, respawnNonce: s.respawnNonce + 1, extraLives: s.extraLives - 1 });
      return;
    }
    // No charm left: the day restarts from dawn. Wallet, lifetime earnings and
    // gear go through untouched — exactly like sleeping — but everything about
    // TODAY specifically (quota progress, time of day, the board) rolls back,
    // and you wake at home rather than at whatever refuge you were using.
    runtime.hintSilenced.fill(false);
    runtime.hintStolen.fill(false);
    runtime.hintClaimed.fill(false);
    runtime.hintBanked.fill(false);
    runtime.hintCracked.fill(false);
    runtime.refugeIndex = -1;
    runtime.lootLostAt = -1;
    runtime.lootSalvaged = 0;
    runtime.treasureStolenAt = -1;
    runtime.treasureCrackedAt = -1;
    runtime.revealRealUntil = -1;
    runtime.sniffReadyAt = 0;
    runtime.chapterAt = -1;
    runtime.chapterName = CHAPTERS[0].name;
    runtime.chapterBrief = CHAPTERS[0].brief;
    runtime.guardianBriefed = false;
    runtime.roundStartAt = performance.now();
    runtime.dayAnnounceAt = performance.now();
    clearHintHistory();
    reseedHints(false);
    clearLeads();
    set({
      dayOver: false,
      dayProgress: 0,
      chapter: 0,
      treasuresBanked: 0,
      treasuresResolved: 0,
      treasuresStolen: 0,
      bombsLeft: bombCapacity(s.owned),
      restoresLeft: REST.charges,
      lockboxes: 0,
      playerHealth: MAX_PLAYER_HEALTH,
      isDead: false,
      ammoInMag: WEAPON_STATS[s.equippedWeapon].magSize,
      reloadEndsAt: -1,
      treasureClaimed: false,
      claimedRarity: null,
      treasureCracked: false,
      villeCarrying: 0,
      respawnNonce: s.respawnNonce + 1,
      roundNonce: s.roundNonce + 1, // remounts/revives the NPCs, same as sleep
    });
  },

  day: SAVE.day,
  dayOver: false,
  dayProgress: 0,
  chapter: 0,
  treasuresBanked: 0,
  treasuresRequired: treasuresForDay(SAVE.day),
  treasuresResolved: 0,
  treasuresStolen: 0,
  advanceDay: (amount) =>
    set((s) => {
      if (s.roundState !== "playing") return s;
      const day = Math.min(DAY.nightfall, s.dayProgress + amount);
      const chapter = chapterAt(day);
      const next: Partial<GameState> = { dayProgress: day, chapter };
      // A new chapter moves the treasures — that's what keeps the hunt going
      // instead of the board being solved once and then static.
      if (chapter !== s.chapter) {
        reseedHints(chapter >= 2);
        // Everything you were told was about the LAST board. Keeping those
        // wedges up would be worse than showing nothing — it would be lying to
        // you with the game's own voice.
        clearLeads();
        runtime.hintSilenced.fill(false);
        runtime.hintStolen.fill(false);
        runtime.hintClaimed.fill(false);
        runtime.hintBanked.fill(false);
        runtime.hintCracked.fill(false);
        runtime.chapterAt = performance.now();
        runtime.chapterName = CHAPTERS[chapter].name;
        runtime.chapterBrief = CHAPTERS[chapter].brief;
      }
      // The day is spent either at nightfall, or the moment today's quota is
      // fully resolved (banked or lost to a thief) — whichever comes first. Both
      // unlock going to bed; neither ends the game. See `dayOver` and `sleep`.
      if (!s.dayOver && (day >= DAY.nightfall || s.treasuresResolved >= s.treasuresRequired)) {
        next.dayOver = true;
        runtime.dayEndAt = performance.now(); // one-shot: fires the day-end summary toast
      }
      return next as GameState;
    }),

  loseTreasureToThief: () => {
    // Losing the treasure used to END THE RUN. That check ("every real treasure
    // stolen") was written when the board held TWO reals; Phase 5 reseeds it to
    // one, so a single theft became an instant, unrecoverable loss — with no
    // warning and nothing you could do after the fact.
    //
    // A theft should cost you, not delete the session. So: the treasure is gone,
    // the day jumps forward (you burned the light chasing something you didn't
    // get), and a fresh one is hidden somewhere else. The run still ends where it
    // always did — at nightfall.
    const s = get();
    if (s.roundState !== "playing") return;
    const resolved = s.treasuresResolved + 1;
    set({ treasuresResolved: resolved, treasuresStolen: s.treasuresStolen + 1 });
    runtime.hintSilenced.fill(false);
    runtime.hintStolen.fill(false);
    runtime.hintClaimed.fill(false);
    runtime.hintBanked.fill(false);
    runtime.hintCracked.fill(false);
    // Only put a fresh one on the board if today's quota still needs it — once
    // the last of them is resolved, there's nothing left to hunt and the day is
    // over regardless of which way it went.
    if (resolved < s.treasuresRequired) reseedHints(s.chapter >= 2);
    clearLeads();
    get().advanceDay(DAY.theftPenalty);
  },

  sleep: () => {
    const s = get();
    // Guarded here rather than only at the keypress, because this is the one
    // action that rolls the world over and it must not be reachable at noon.
    if (!s.dayOver || s.roundState !== "playing" || s.isDead) return;

    const day = s.day + 1;
    // Your wallet, your lifetime earnings and your gear go through the night.
    // Everything else is a fresh morning.
    writeSave({
      day,
      villeBanked: s.villeBanked,
      villeEarned: s.villeEarned,
      owned: s.owned,
      equippedWeapon: s.equippedWeapon,
    });

    // The board is new in the morning, and so is everything the village told you
    // about the old one.
    runtime.hintSilenced.fill(false);
    runtime.hintStolen.fill(false);
    runtime.hintClaimed.fill(false);
    runtime.hintBanked.fill(false);
    runtime.hintCracked.fill(false);
    clearHintHistory();
    reseedHints(false);
    clearLeads();
    runtime.guardianBriefed = false; // the guardian is back at the post at dawn
    runtime.chapterAt = -1;
    runtime.chapterName = CHAPTERS[0].name;
    runtime.chapterBrief = CHAPTERS[0].brief;
    runtime.treasureStolenAt = -1;
    runtime.treasureCrackedAt = -1;
    runtime.lootLostAt = -1;
    runtime.lootSalvaged = 0;
    runtime.revealRealUntil = -1;
    runtime.sniffReadyAt = 0;
    runtime.roundStartAt = performance.now();
    runtime.dayAnnounceAt = performance.now();
    // A new day starts in your own bed, not at whatever house you last ducked into.
    runtime.refugeIndex = -1;

    set((st) => ({
      day,
      dayOver: false,
      dayProgress: 0,
      chapter: 0,
      treasuresBanked: 0,
      treasuresRequired: treasuresForDay(day),
      treasuresResolved: 0,
      treasuresStolen: 0,
      // Supplies are a daily trip to the market, not a stockpile.
      bombsLeft: bombCapacity(st.owned),
      restoresLeft: REST.charges,
      lockboxes: 0,
      extraLives: 0,
      // You slept. Of course you are patched up.
      playerHealth: MAX_PLAYER_HEALTH,
      isDead: false,
      ammoInMag: WEAPON_STATS[st.equippedWeapon].magSize,
      reloadEndsAt: -1,
      treasureClaimed: false,
      claimedRarity: null,
      treasureCracked: false,
      // Anything still in your hands at bedtime was never banked, and the bank
      // is the only thing that makes loot yours.
      villeCarrying: 0,
      // Puts you back in bed and remounts the NPCs for the new day.
      respawnNonce: st.respawnNonce + 1,
      roundNonce: st.roundNonce + 1,
    }));
  },

  roundState: "playing",
  roundReason: null,
  roundNonce: 0,
  newGameNonce: 0,
  endRound: (reason) =>
    set((s) => {
      if (s.roundState !== "playing") return s;
      return { roundState: reason === "claimed" ? "won" : "lost", roundReason: reason };
    }),
  restart: () => {
    // A genuine NEW GAME, not a new day. Sleeping is how you roll the day over
    // and keep what you earned; this throws the save away and starts again at
    // day one with nothing but the starter carbine.
    clearSave();
    // Reset per-frame world state.
    runtime.guardianBriefed = false;
    runtime.roundStartAt = performance.now();
    runtime.dayAnnounceAt = performance.now();
    runtime.hintSilenced.fill(false);
    runtime.hintStolen.fill(false);
    runtime.hintClaimed.fill(false);
    runtime.hintBanked.fill(false);
    runtime.hintCracked.fill(false);
    runtime.refugeIndex = -1; // a new run starts with no claimed refuge
    runtime.lootLostAt = -1;
    runtime.lootSalvaged = 0;
    runtime.treasureStolenAt = -1;
    runtime.chapterAt = -1;
    clearHintHistory();
    reseedHints(false);
    clearLeads();
    runtime.treasureCrackedAt = -1;
    runtime.revealRealUntil = -1;
    runtime.sniffReadyAt = 0;
    set((s) => ({
      treasureClaimed: false,
      claimedRarity: null,
      treasureCracked: false,
      bombsLeft: bombCapacity(s.owned),
      playerHealth: MAX_PLAYER_HEALTH,
      restoresLeft: REST.charges,
      lockboxes: 0, // supplies are per-run: you re-kit at the market every day
      extraLives: 0,
      ammoInMag: WEAPON_STATS[s.equippedWeapon].magSize,
      reloadEndsAt: -1,
      isDead: false,
      day: 1,
      dayOver: false,
      dayProgress: 0,
      chapter: 0,
      treasuresBanked: 0,
      treasuresRequired: treasuresForDay(1),
      treasuresResolved: 0,
      treasuresStolen: 0,
      villeCarrying: 0,
      villeBanked: NEW_SAVE.villeBanked,
      villeEarned: NEW_SAVE.villeEarned,
      owned: [...NEW_SAVE.owned],
      equippedWeapon: NEW_SAVE.equippedWeapon,
      roundState: "playing",
      roundReason: null,
      roundNonce: s.roundNonce + 1,
      newGameNonce: s.newGameNonce + 1,
      respawnNonce: s.respawnNonce + 1,
    }));
  },
}));

/**
 * Write the save whenever anything durable moves.
 *
 * Doing this only at bedtime would have been simpler and wrong: banking is the
 * act that makes loot yours, and a player who banks four treasures and then
 * reloads the tab must not come back poorer than when they left. Persisting on
 * change means the save is never more than one action behind the game.
 *
 * Everything transient — health, ammo, the day's progress, supplies — is
 * deliberately absent. Reloading mid-afternoon puts you back at dawn with your
 * money and your gear, not mid-firefight with 12 health.
 */
useGame.subscribe((s, prev) => {
  if (
    s.day === prev.day &&
    s.villeBanked === prev.villeBanked &&
    s.villeEarned === prev.villeEarned &&
    s.owned === prev.owned &&
    s.equippedWeapon === prev.equippedWeapon
  ) {
    return;
  }
  writeSave({
    day: s.day,
    villeBanked: s.villeBanked,
    villeEarned: s.villeEarned,
    owned: s.owned,
    equippedWeapon: s.equippedWeapon,
  });
});
