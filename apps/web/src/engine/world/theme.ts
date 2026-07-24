/**
 * Village visual theme — the "art dressing" over the gray-box (all procedural,
 * no downloaded assets). Swapping this palette re-skins the same geometry into a
 * different biome (§14.3: snowy / forest / desert / coastal), so one layout gives
 * every world. Values chosen to echo the dusk concept render (warm sky, stone +
 * timber houses, dirt streets, lantern glow).
 */
export interface VillageTheme {
  name: string;
  // Sky gradient (dome) + fog
  skyTop: string;
  skyHorizon: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  // Lighting
  sunColor: string;
  sunIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  // Ground
  groundBase: string;
  groundDirt: string; // road / worn earth
  groundSpeck: string; // subtle noise fleck
  // Buildings
  wallStone: string[]; // picked per building for variation
  wallTimber: string;
  roof: string[];
  trim: string;
  // Perimeter wall + accents
  rampart: string;
  lantern: string;
}

export const DUSK: VillageTheme = {
  name: "dusk",
  skyTop: "#2b2f45",
  skyHorizon: "#c8895a",
  fog: "#7a5942",
  fogNear: 22,
  fogFar: 95,
  sunColor: "#ffb26b",
  sunIntensity: 1.7,
  ambientColor: "#6b6180",
  ambientIntensity: 0.5,
  hemiSky: "#c9a06a",
  hemiGround: "#2a2320",
  hemiIntensity: 0.6,
  groundBase: "#5a4a3a",
  groundDirt: "#7a6449",
  groundSpeck: "#4a3c2e",
  wallStone: ["#9c8f7a", "#8a7d68", "#a89a83", "#847765"],
  wallTimber: "#6a4f38",
  roof: ["#4a3728", "#3f2f22", "#523c2a"],
  trim: "#33261b",
  rampart: "#5f5346",
  lantern: "#ffcf87",
};

/** Active theme (later: chosen per village/level). */
export const THEME = DUSK;
