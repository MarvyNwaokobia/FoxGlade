# web/ — dApp shell

Hosts the Godot HTML5 export and owns everything that signs or sends a
transaction. The Godot side never holds keys; it calls the `window.foxglade_*`
functions this layer exposes, through `game/scripts/ChainBridge.gd`.

## Responsibilities

- Wallet connect + onboarding via **wagmi + RainbowKit/Web3Modal**, or **Privy**
  for embedded/social-login wallets (removes the "install an extension" barrier
  for a casual audience — see [DESIGN.md §4](../DESIGN.md)).
- **Session keys / account abstraction** so in-session marketplace buys don't pop
  a wallet prompt each time ([DESIGN.md §11](../DESIGN.md)).
- The `window.foxglade_*` bridge functions the game calls:

  | Function | Contract call |
  |---|---|
  | `foxglade_mintEgg(json)` | `PetNFT.mintEgg` |
  | `foxglade_mintTreasure(json)` | `TreasureNFT.mintTreasure` (server-signed) |
  | `foxglade_evolve(json)` | `PetNFT.evolve` (server-signed) |
  | `foxglade_buyItem(json)` | `ArmoryItems.buyItem` |
  | `foxglade_claimReward(json)` | `SeasonRewards.claimReward` |

  Each takes a JSON string, returns/relays a result the bridge passes back to
  Godot. Calls marked *server-signed* are relayed by the game-server key, not the
  player wallet (the [§13.2](../DESIGN.md) trust boundary).

## Not built yet

This is a placeholder describing the seam. Stand it up during **M3–M4** when the
first real on-chain calls (treasure mint, marketplace buy) come online. Suggested
stack: Vite + React + wagmi + viem, or Next.js if you want SSR for the leaderboard.
