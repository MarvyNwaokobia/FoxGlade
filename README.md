# Foxglade

A single-session arena game set in a walled village: fight through NPC blockers,
sift real hints from planted decoys, use an in-game marketplace, and mint a
treasure before the timer or rival NPCs beat you to it — all with a fox companion
you raise, whose growth and decay *is* your rank.

Built for an Avalanche grant submission. Full design + technical spec:
**[DESIGN.md](DESIGN.md)**.

Foxglade is a **browser-native web game**: the game runs in the page (Three.js /
React Three Fiber) alongside the wallet, marketplace, and leaderboard, so the
real-time play and the on-chain layer live in one app. (Engine was pivoted from
Godot to web/R3F — rationale in [DESIGN.md §4](DESIGN.md).)

## Repo layout

```
FoxGlade/
├── DESIGN.md          Game design + technical spec (start here)
├── package.json       npm workspace root
├── apps/
│   └── web/           Next.js + React Three Fiber game + dApp
│       ├── app/       Next App Router (layout, page)
│       └── src/
│           ├── engine/    config/feel, input, player, fox, scene, runtime
│           └── components/ Game (canvas) + Hud (DOM overlay)
└── contracts/         Foundry / Solidity — the on-chain layer
    ├── src/           TreasureNFT, VilleToken, ArmoryItems, PetNFT, SeasonRewards
    ├── script/        Deploy.s.sol
    └── test/          Foundry tests
```

## Run the game

From the repo root:

```bash
npm install
npm run dev        # → http://localhost:3000
```

Click the canvas to capture the mouse. **WASD** move · **Shift** run · **Space**
jump · **Mouse** look · **Esc** release. All game-feel numbers live in one place —
[`apps/web/src/engine/config/feel.ts`](apps/web/src/engine/config/feel.ts) — so
movement, camera, and the fox-follow can be retuned without touching scene code.

Current slice: gray-box third-person movement with the fox companion trailing at
heel and a rough treasure-zone compass. NPCs, shooting, and on-chain calls land in
later milestones ([DESIGN.md §8](DESIGN.md)).

## Contracts

Five intentionally-simple contracts (see [DESIGN.md §7](DESIGN.md)):

| Contract | Standard | Role |
|---|---|---|
| `TreasureNFT` | ERC-721 | Minted per successful treasure pickup; carries rarity tier |
| `VilleToken` | ERC-20 | Soft currency; **non-cash-out** (transfers restricted to the marketplace; burned on spend) |
| `ArmoryItems` | ERC-1155 | Marketplace — consumables + cosmetics priced in VILLE; routes a pool cut |
| `PetNFT` | ERC-721 | The fox — growth stage + **derived** health (decay computed as a view) |
| `SeasonRewards` | — | Monthly tournament scoring + native-AVAX prize pool; winner-initiated claims |

A shared `AuthorizedGame` base defines the `gameServer` key — the single off-chain
signer trusted to relay validated gameplay outcomes on-chain. **This key is the v1
trust boundary** ([DESIGN.md §13.2](DESIGN.md)).

### Build & test

Requires [Foundry](https://book.getfoundry.sh/). From `contracts/`:

```bash
forge install OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std
forge build
forge test
```

### Deploy (Fuji testnet)

```bash
cp .env.example .env      # fill in PRIVATE_KEY + GAME_SERVER_ADDRESS
forge script script/Deploy.s.sol --rpc-url fuji --broadcast --verify
```

The deploy script wires `ArmoryItems` as the sole authorized VILLE spender.

## Status

Design settled ([DESIGN.md §12 locked decisions](DESIGN.md), [§13 known risks](DESIGN.md));
contracts build and pass tests; the web game is at its first playable slice
(gray-box movement + fox follow). Remaining work follows the M0–M9 milestones.

## Known design risks worth re-reading before building

The load-bearing ones, in full in [DESIGN.md §13](DESIGN.md): VILLE needs a real
sink (not just a faucet); off-chain Renown is a trust boundary; fox health must be
*derived* not ticked; decide who pays for `evolve`; a mis-thrown bomb shouldn't
zero a run; and **scope is the biggest grant threat** — protect the fox
mint/evolve loop and cut NPC ambition before you cut that.
