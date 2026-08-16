/**
 * The marketplace catalogue (DESIGN §2.3 / §7). You spend VILLE — earned by banking
 * treasure — on gear that changes gameplay: weapons swap the gun in your hand, an
 * attachment tweaks its feel, bombs raise your carry, and bags let you hold more
 * loot between bank runs. Everything here is local for now; when ArmoryItems (the
 * ERC-1155) lands it becomes the source of truth and this stays the display layer.
 */

import { FOX_GROW_STAGES } from "@/engine/config/fox";

export type ShopCategory = "supply" | "weapon" | "attachment" | "bomb" | "bag" | "fox";

/**
 * How special an item reads on the card — a worn-stone common through to the
 * game's own gold reserved for the one truly rare weapon in the catalogue.
 * Tuned off price, roughly: what several runs' surplus buys is rare, not common.
 */
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

/** Same warm, worn palette the village itself is built from (theme.ts) — not
 *  a bolted-on sci-fi rarity scale. Legendary reuses the game's own gold. */
export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#9c8f7a",
  uncommon: "#7fae62",
  rare: "#5c93c9",
  epic: "#a672c9",
  legendary: "#f2c14e",
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

export interface ShopItem {
  id: string;
  category: ShopCategory;
  name: string;
  desc: string;
  price: number; // VILLE (0 = owned from the start)
  icon: string; // emoji glyph — used only by the compact on-chain trade list now
  rarity: Rarity;
  gunId?: WeaponId; // weapons only — which gun model + stats to equip
  /** Consumables can be bought over and over; permanents once. This flag is the
   *  difference between a shop that empties and an economy that runs. */
  consumable?: boolean;
  /** Another item's id that must already be owned before this one is buyable —
   *  the fox's growth stages chain this way (Young before Adult before Prime). */
  requires?: string;
}

export type WeaponId = "sidearm" | "smg" | "assault_rifle" | "marksman" | "legendary";

/**
 * Per-weapon feel. `damage` scales the base hit; `fireInterval` is seconds/shot;
 * `magSize` / `reloadTime` give each gun its own rhythm.
 *
 * The magazine is what gives a firefight cadence — the beat where you break
 * contact, the window where you're vulnerable, the reason to take cover rather
 * than hold the trigger. Without it every gun is an infinite hose and the only
 * variable is DPS. Reserve ammo is deliberately unlimited for now: the tension we
 * want is the mid-fight reload, not inventory management.
 */
export const WEAPON_STATS: Record<
  WeaponId,
  { damage: number; fireInterval: number; magSize: number; reloadTime: number }
> = {
  sidearm: { damage: 0.85, fireInterval: 0.14, magSize: 14, reloadTime: 1.3 },
  smg: { damage: 0.7, fireInterval: 0.08, magSize: 34, reloadTime: 1.7 },
  assault_rifle: { damage: 1, fireInterval: 0.16, magSize: 30, reloadTime: 1.9 }, // the starter baseline
  marksman: { damage: 2.4, fireInterval: 0.55, magSize: 7, reloadTime: 2.4 },
  legendary: { damage: 1.7, fireInterval: 0.13, magSize: 24, reloadTime: 1.6 },
};

export const DEFAULT_WEAPON: WeaponId = "assault_rifle";

/** Carry cap per bag tier (max unbanked VILLE you can hold). More = fewer bank runs. */
export const BAG_CAP = { none: 350, g_satchel: 750, g_rucksack: 1300 } as const;

/** Bombs carried per run, before/after the satchel upgrade. */
export const BOMB_CAP = { base: 2, upgraded: 4 } as const;

/**
 * Consumable caps. A run can't stockpile past these, so the answer to "what do
 * I do with 900 VILLE" is never "buy fourteen bandages".
 */
export const SUPPLY_CAP = { restores: 4, lockboxes: 2, extraLives: 1 } as const;

export const SHOP_ITEMS: ShopItem[] = [
  // ── Supplies (the SINK) ─────────────────────────────────────────────────────
  //
  // The shop used to be eleven permanent unlocks and nothing else: ~2,650 VILLE
  // of one-time purchases against a rare treasure paying 300. Ten or fifteen good
  // runs bought the entire catalogue, and after that VILLE was a number that went
  // up in the corner of the screen for no reason — which is exactly the dead
  // currency DESIGN §13.1 warned about, arriving on schedule.
  //
  // These four are bought EVERY run and spent WITHIN it, so the market is
  // somewhere you come back to rather than somewhere you finish. Permanents are
  // still here; they're now the rare spike rather than the whole economy.
  {
    id: "s_restore",
    category: "supply",
    name: "Bandages",
    desc: "One more patch-up this run.",
    price: 60,
    icon: "✚",
    rarity: "common",
    consumable: true,
  },
  {
    id: "s_bomb",
    category: "supply",
    name: "Powder Charge",
    desc: "One more bomb this run.",
    price: 45,
    icon: "💣",
    rarity: "common",
    consumable: true,
  },
  {
    // Buying it IS using it — no inventory, no extra keybind. You pay at the
    // stall and walk out with a fresh bearing on your compass, which makes the
    // market a place you visit for INFORMATION and not just for guns.
    id: "s_chart",
    category: "supply",
    name: "Surveyor's Chart",
    desc: "Read it here for a fresh, narrow bearing on the treasure.",
    price: 75,
    icon: "🗺️",
    rarity: "common",
    consumable: true,
  },
  {
    id: "s_lockbox",
    category: "supply",
    name: "Lockbox",
    desc: "Go down and you keep half your carried loot instead of losing it all.",
    price: 90,
    icon: "🔒",
    rarity: "uncommon",
    consumable: true,
  },
  {
    // Capped at one (SUPPLY_CAP.extraLives) — a real decision on the way in,
    // not a stockpile. Without it, going down for good sends you back to dawn.
    id: "s_extralife",
    category: "supply",
    name: "Warding Charm",
    desc: "If this day would end in your death, it brings you back where you fell instead.",
    price: 150,
    icon: "🧿",
    rarity: "rare",
    consumable: true,
  },
  // ── Weapons (equip one; the Carbine is owned from the start) ──
  //
  // Named for the world, not for a modern shooter's tier list. "SMG",
  // "Assault Rifle" and "Prototype" are 20th- and 21st-century words, and
  // reading them in a walled medieval market — from a trader standing under a
  // canvas awning — pulled you straight out of the fiction. The stats and the
  // ladder are untouched; only the fiction changed.
  //
  // REPRICED alongside the supplies above. The principle: a permanent should
  // cost several runs' SURPLUS — what's left after you've kept yourself in
  // bandages and charges — so unlocking one is a stretch you saved toward, not
  // something you trip over on run three. These are a first pass off the loot
  // table (common 100 / rare 300) and want a playtest before they're trusted.
  { id: "w_sidearm", category: "weapon", name: "Flintlock", desc: "Snappy and light, a backup piece.", price: 110, icon: "🔫", rarity: "common", gunId: "sidearm" },
  { id: "w_smg", category: "weapon", name: "Repeater", desc: "Spits lead. Little weight behind it.", price: 300, icon: "🔫", rarity: "uncommon", gunId: "smg" },
  { id: "w_rifle", category: "weapon", name: "Carbine", desc: "The balanced all-rounder.", price: 0, icon: "🔫", rarity: "common", gunId: "assault_rifle" },
  { id: "w_marksman", category: "weapon", name: "Long Rifle", desc: "Heavy hit, slow cadence. One shot, one thief.", price: 600, icon: "🎯", rarity: "rare", gunId: "marksman" },
  { id: "w_exotic", category: "weapon", name: "The Relic", desc: "Nobody will say where it came from.", price: 1500, icon: "⚡", rarity: "legendary", gunId: "legendary" },
  // ── Attachments (global feel upgrades, bought once) ──
  { id: "a_sight", category: "attachment", name: "Brass Sight", desc: "Cuts recoil for steadier aim.", price: 240, icon: "🔭", rarity: "uncommon" },
  { id: "a_grip", category: "attachment", name: "Wrapped Grip", desc: "Faster fire on any gun.", price: 260, icon: "✊", rarity: "uncommon" },
  // ── Bombs ──
  { id: "b_satchel", category: "bomb", name: "Bomb Satchel", desc: "Carry 4 bombs per run instead of 2.", price: 200, icon: "💣", rarity: "uncommon" },
  // ── Bags (raise how much loot you can hold before banking) ──
  { id: "g_satchel", category: "bag", name: "Satchel", desc: "Hold more treasure between bank runs.", price: 380, icon: "🎒", rarity: "rare" },
  { id: "g_rucksack", category: "bag", name: "Rucksack", desc: "Hold even more before you must bank.", price: 900, icon: "🧳", rarity: "epic" },
  // ── Fox growth (DESIGN §2.5 / §11) ──
  //
  // Used to happen on its own as lifetime VILLE banked crossed thresholds — no
  // choice in it, just a number climbing in the background. Growing the fox is
  // now something you deliberately spend on, chained in order (buying Adult
  // needs Young first — see `requires`, enforced in store.ts buyItem). The
  // numbers themselves (FOX_GROW_STAGES, engine/config/fox.ts) are unchanged
  // from the old thresholds, just spent instead of accrued.
  ...FOX_GROW_STAGES.map(
    (g): ShopItem => ({
      id: g.id,
      category: "fox" as const,
      name: `Grow: ${g.name}`,
      desc:
        g.name === "Prime"
          ? "Full grown. Its nose is never wrong."
          : `Raise your fox to ${g.name} — bigger, and quicker to send out again.`,
      price: g.price,
      icon: "🦊",
      rarity: g.name === "Prime" ? "epic" : g.name === "Adult" ? "rare" : "uncommon",
      requires: g.requires ?? undefined,
    })
  ),
  {
    // Rust already wears off on its own after a few bank runs (FOX_RUST) — this
    // is the impatient version: pay to clear it instantly instead of waiting it
    // out. Always buyable (no `requires`) since rust can hit a fox at any
    // growth stage.
    id: "fox_revive",
    category: "fox",
    name: "Revival Charm",
    desc: "Instantly wears off any rust from time away — no waiting it out.",
    price: 150,
    icon: "✨",
    rarity: "rare",
    consumable: true,
  },
];

export const CATEGORY_LABEL: Record<ShopCategory, string> = {
  supply: "Supplies",
  weapon: "Weapons",
  attachment: "Attachments",
  bomb: "Bombs",
  bag: "Bags",
  fox: "Fox",
};

/** Supplies first: they're what you're here for on most visits. */
export const CATEGORY_ORDER: ShopCategory[] = ["supply", "fox", "weapon", "attachment", "bomb", "bag"];
