# Foxglade

A single-session arena game set in a walled village: fight through NPC blockers,
sift real hints from planted decoys, use an in-game marketplace, and mint a
treasure before the timer or rival NPCs beat you to it — all with a fox companion
you raise, whose growth and decay *is* your rank.

Built for an Avalanche grant submission. Full design + technical spec:
**[DESIGN.md](DESIGN.md)**.

## Repo layout

```
FoxGlade/
├── DESIGN.md          Game design + technical spec (start here)
├── contracts/         Foundry / Solidity — the on-chain layer
│   ├── src/           TreasureNFT, VilleToken, ArmoryItems, PetNFT, SeasonRewards
│   ├── script/        Deploy.s.sol
│   ├── test/          Foundry tests
│   └── foundry.toml
├── game/              Godot 4 project (export target: HTML5)
│   ├── scenes/        Main.tscn
│   ├── scripts/       Player, Fox, HUD, HintSystem, ChainBridge, npc/*
│   └── project.godot
└── web/               dApp shell that hosts the exported game + wallet/chain glue
```

## The three layers and how they connect

- **`game/` (Godot 4)** runs all real-time play — movement, shooting, NPC AI,
  hints. None of it touches the chain.
- **`web/` (dApp)** hosts the HTML5 export plus wagmi/Privy and the contract
  calls. It exposes `window.foxglade_*` functions.
- **`game/scripts/ChainBridge.gd`** is the single seam: on web it calls those JS
  functions via `JavaScriptBridge`; on desktop/editor it stubs them so the loop
  stays playable. Only the meaningful moments cross it — egg mint, treasure mint,
  fox evolve, marketplace buy, reward claim (see [DESIGN.md §11](DESIGN.md)).

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

## Game

Open the `game/` folder in **Godot 4.2+**. The current scripts are an
architecture scaffold (movement, NPC archetypes, hint system, fox, chain seam)
with `TODO Mx` markers tied to the milestone plan in [DESIGN.md §8](DESIGN.md).
Run in the editor: `ChainBridge` stubs confirm transactions so the loop is
playable before the web layer exists.

## Status

Scaffold. The design is settled (see [DESIGN.md §12 locked decisions](DESIGN.md)
and [§13 known risks](DESIGN.md)); implementation follows the M0–M9 milestones.

## Known design risks worth re-reading before building

The load-bearing ones, in full in [DESIGN.md §13](DESIGN.md): VILLE needs a real
sink (not just a faucet); off-chain Renown is a trust boundary; fox health must be
*derived* not ticked; decide who pays for `evolve`; a mis-thrown bomb shouldn't
zero a run; and **scope is the biggest grant threat** — protect the fox
mint/evolve loop and cut NPC ambition before you cut that.
