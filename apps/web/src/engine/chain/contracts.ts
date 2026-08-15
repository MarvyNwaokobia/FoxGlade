/**
 * Live Avalanche C-Chain mainnet addresses (DESIGN.md §14.9), mirrored from
 * apps/server/src/contracts.ts. Only the ABI fragments this app actually
 * calls/reads are declared.
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
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export const ARMORY_ITEMS_ABI = [
  {
    type: "function",
    name: "priceOf",
    stateMutability: "view",
    inputs: [{ name: "itemId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "nonceOf",
    stateMutability: "view",
    inputs: [{ name: "buyer", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "listForResale",
    stateMutability: "nonpayable",
    inputs: [
      { name: "itemId", type: "uint256" },
      { name: "qty", type: "uint256" },
      { name: "price", type: "uint256" },
    ],
    outputs: [{ name: "resaleId", type: "uint256" }],
  },
  {
    type: "function",
    name: "cancelResale",
    stateMutability: "nonpayable",
    inputs: [{ name: "resaleId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "buyResale",
    stateMutability: "nonpayable",
    inputs: [{ name: "resaleId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "resaleListings",
    stateMutability: "view",
    inputs: [{ name: "resaleId", type: "uint256" }],
    outputs: [
      { name: "seller", type: "address" },
      { name: "itemId", type: "uint256" },
      { name: "qty", type: "uint256" },
      { name: "price", type: "uint256" },
      { name: "active", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "nextResaleId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;
