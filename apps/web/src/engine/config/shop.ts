/**
 * The marketplace catalogue (DESIGN §2.3 / §7). You spend VILLE — earned by banking
 * treasure — on gear that changes gameplay: weapons swap the gun in your hand, an
 * attachment tweaks its feel, bombs raise your carry, and bags let you hold more
 * loot between bank runs. Everything here is local for now; when ArmoryItems (the
 * ERC-1155) lands it becomes the source of truth and this stays the display layer.
 */

export type ShopCategory = "weapon" | "attachment" | "bomb" | "bag";

export interface ShopItem {
  id: string;
  category: ShopCategory;
  name: string;
  desc: string;
  price: number; // VILLE (0 = owned from the start)
  icon: string; // emoji glyph for the card (procedural gun renders come later)
  gunId?: WeaponId; // weapons only — which gun model + stats to equip
}

export type WeaponId = "sidearm" | "smg" | "assault_rifle" | "marksman" | "legendary";

/** Per-weapon feel. `damage` scales the base hit; `fireInterval` is seconds/shot. */
export const WEAPON_STATS: Record<WeaponId, { damage: number; fireInterval: number }> = {
  sidearm: { damage: 0.85, fireInterval: 0.14 },
  smg: { damage: 0.7, fireInterval: 0.08 },
  assault_rifle: { damage: 1, fireInterval: 0.16 }, // the starter baseline
  marksman: { damage: 2.4, fireInterval: 0.55 },
  legendary: { damage: 1.7, fireInterval: 0.13 },
};

export const DEFAULT_WEAPON: WeaponId = "assault_rifle";

/** Carry cap per bag tier (max unbanked VILLE you can hold). More = fewer bank runs. */
export const BAG_CAP = { none: 350, g_satchel: 750, g_rucksack: 1300 } as const;

/** Bombs carried per run, before/after the satchel upgrade. */
export const BOMB_CAP = { base: 2, upgraded: 4 } as const;

export const SHOP_ITEMS: ShopItem[] = [
  // ── Weapons (equip one; the assault rifle is owned from the start) ──
  { id: "w_sidearm", category: "weapon", name: "Sidearm", desc: "Snappy, low damage — a light backup.", price: 80, icon: "🔫", gunId: "sidearm" },
  { id: "w_smg", category: "weapon", name: "SMG", desc: "Very high fire rate, low per-shot.", price: 220, icon: "🔫", gunId: "smg" },
  { id: "w_rifle", category: "weapon", name: "Assault Rifle", desc: "The balanced all-rounder.", price: 0, icon: "🔫", gunId: "assault_rifle" },
  { id: "w_marksman", category: "weapon", name: "Marksman", desc: "Heavy damage, slow cadence.", price: 400, icon: "🎯", gunId: "marksman" },
  { id: "w_exotic", category: "weapon", name: "Prototype", desc: "Exotic — high damage, fast.", price: 800, icon: "⚡", gunId: "legendary" },
  // ── Attachments (global feel upgrades, bought once) ──
  { id: "a_sight", category: "attachment", name: "Reflex Sight", desc: "Cuts recoil — steadier aim.", price: 150, icon: "🔭" },
  { id: "a_grip", category: "attachment", name: "Foregrip", desc: "Faster fire on any gun.", price: 180, icon: "✊" },
  // ── Bombs ──
  { id: "b_satchel", category: "bomb", name: "Bomb Satchel", desc: "Carry 4 bombs per run instead of 2.", price: 120, icon: "💣" },
  // ── Bags (raise how much loot you can hold before banking) ──
  { id: "g_satchel", category: "bag", name: "Satchel", desc: "Hold more treasure between bank runs.", price: 200, icon: "🎒" },
  { id: "g_rucksack", category: "bag", name: "Rucksack", desc: "Hold even more before you must bank.", price: 500, icon: "🧳" },
];

export const CATEGORY_LABEL: Record<ShopCategory, string> = {
  weapon: "Weapons",
  attachment: "Attachments",
  bomb: "Bombs",
  bag: "Bags",
};

export const CATEGORY_ORDER: ShopCategory[] = ["weapon", "attachment", "bomb", "bag"];
