/**
 * Live Avalanche C-Chain mainnet addresses (DESIGN.md §14.9). Only the ABI
 * fragments this service actually calls are declared — expand as more
 * gameServer-only actions (PetNFT evolve/recordRun, SeasonRewards.addScore)
 * get wired to real gameplay hooks.
 */
export const ADDRESSES = {
  villeToken: "0x1c9021462B8F62e1bF384407C093651135d9e346",
  treasureNFT: "0x9962CDE2ab47C835926AD20885c4100Ea974c209",
  petNFT: "0x217F88139a85E2DD6338732abEc109f55dDe5c01",
  armoryItems: "0x3d95a695baFc865cC17366B7f2f35b19fD741987",
  seasonRewards: "0x3C462908c5F1e3a45009f4Ac82dB67Bb95f812DB",
  gameEvents: "0x4459734087282b0F171c6417B19131bFB00cC687",
  heroNFT: "0xd3A15075053FF36875C6daFE4d439D1Cb1b05d09",
} as const;

export const VILLE_TOKEN_ABI = [
  {
    type: "function",
    name: "rewardTreasure",
    stateMutability: "nonpayable",
    inputs: [
      { name: "player", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "rarityTier", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const ARMORY_ITEMS_ABI = [
  {
    type: "function",
    name: "buyItemFor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "buyer", type: "address" },
      { name: "itemId", type: "uint256" },
      { name: "qty", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

export const TREASURE_NFT_ABI = [
  {
    type: "function",
    name: "mintTreasure",
    stateMutability: "nonpayable",
    inputs: [
      { name: "player", type: "address" },
      { name: "rarityTier", type: "uint256" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
] as const;

export const GAME_EVENTS_ABI = [
  {
    type: "function",
    name: "stamp",
    stateMutability: "nonpayable",
    inputs: [
      { name: "player", type: "address" },
      { name: "eventType", type: "uint8" },
    ],
    outputs: [],
  },
] as const;

export const HERO_NFT_ABI = [
  {
    type: "function",
    name: "mintHero",
    stateMutability: "nonpayable",
    inputs: [
      { name: "player", type: "address" },
      { name: "heroId", type: "uint8" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
] as const;

export const PET_NFT_ABI = [
  {
    type: "function",
    name: "mintEgg",
    stateMutability: "nonpayable",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
] as const;
