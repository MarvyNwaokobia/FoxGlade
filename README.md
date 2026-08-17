# Foxglade

A walled-village survival game, one day at a time: fight through NPC blockers,
sift real hints from planted decoys, use an in-game marketplace, and bank your
day's quota of treasure before the timer or rival NPCs beat you to it. Progress
carries forward day to day rather than resetting per session — VILLE, gear, and
a fox companion you raise, whose growth and decay *is* your rank
([DESIGN.md §14.10](DESIGN.md)).

**Live:** [foxglade.app](https://foxglade.app). Built on Avalanche. Full
design + technical spec: **[DESIGN.md](DESIGN.md)**.

Foxglade is a **browser-native web game**: the game runs in the page (Three.js /
React Three Fiber) alongside the wallet, marketplace, and leaderboard, so the
real-time play and the on-chain layer live in one app. (Engine was pivoted from
Godot to web/R3F — rationale in [DESIGN.md §4](DESIGN.md).)

## Repo layout

```
FoxGlade/
├── DESIGN.md          Game design + technical spec (start here)
├── package.json       npm workspace root (apps/web only — apps/server is standalone)
├── apps/
│   ├── web/           Next.js + React Three Fiber game + dApp (deployed on Vercel)
│   │   ├── app/       Next App Router (layout, page, api/chain/* relay proxy)
│   │   └── src/
│   │       ├── engine/    config/feel, input, player, fox, scene, runtime, chain/
│   │       └── components/ Game (canvas) + Hud/MobileControls (DOM overlay) +
│   │                        onboarding/ (hero pick) + ConnectGate
│   └── server/        gameServer backend (deployed on Railway) — see below
└── contracts/         Foundry / Solidity — the on-chain layer
    ├── src/           TreasureNFT, VilleToken, ArmoryItems, PetNFT,
    │                  SeasonRewards, HeroNFT, GameEvents
    ├── script/        Deploy.s.sol (original 5) + DeployEvents.s.sol (+2, later)
    └── test/          Foundry tests
```

## Run the game

From the repo root:

```bash
npm install
npm run dev        # → http://localhost:3000
```

Click the canvas to capture the mouse. **WASD** move · **Shift** run · **Space**
jump · **Mouse** look · **Esc** release. On a touch device the same session gets
an on-screen pad instead (`apps/web/src/components/MobileControls.tsx`) — fixed
joystick + look-drag zone, contextual action button, FOX, and combat verbs, laid
out to keep the primary FIRE thumb-reachable. All game-feel numbers live in one
place — [`apps/web/src/engine/config/feel.ts`](apps/web/src/engine/config/feel.ts)
— so movement, camera, and the fox-follow can be retuned without touching scene
code.

Every visit opens on a mandatory connect screen (`ConnectGate.tsx` — Magic
email-OTP or an injected wallet, no guest play) followed by a one-time hero pick
(`components/onboarding/`); returning players skip straight to their saved
progress. This superseded the earlier optional-wallet framing — every player has
an address from minute one now, gating onboarding itself rather than sitting
alongside it.

Current slice: full gray-box loop (movement, NPCs, shooting, hints, marketplace,
day/night), Magic-or-injected wallet login, and a real on-chain moment — banking
a secured treasure mints a `TreasureNFT` and rewards real `VilleToken`, live on
Avalanche mainnet ([DESIGN.md §8](DESIGN.md), [§14.9](DESIGN.md)).

## gameServer backend (`apps/server`, on Railway)

`VilleToken.rewardTreasure` / `TreasureNFT.mintTreasure` are `onlyGameServer` —
only the `gameServer` hot key can call them (DESIGN.md §13.2). That key can't
live in the browser, so `apps/server` is a small standalone Express + viem
service that holds it and does the actual signing:

```
apps/web (browser)
  → store.ts depositLoot() [secured treasure banked]
  → engine/chain/relay.ts  claimOnChain()          fire-and-forget, wallet-gated
  → app/api/chain/claim/route.ts                    Next.js server route — holds
                                                      CHAIN_RELAY_SECRET, never sent
                                                      to the browser
  → apps/server  POST /treasure/claim               validates + rate-limits, then
                                                      signs & submits with the
                                                      gameServer key
  → Avalanche C-Chain mainnet
```

`apps/server` also relays gasless marketplace purchases: `POST
/marketplace/buy` takes a player's off-chain-signed EIP-712 `Purchase`
message (signed via a viem wallet client wrapping Magic's provider —
`engine/chain/client.ts`) and submits `ArmoryItems.buyItemFor` on the
player's behalf, paying gas from the same key. The player never sends a
transaction or needs AVAX for a primary purchase. Player-to-player resale
(`listForResale` / `buyResale`) is the opposite by design — real,
player-paid transactions on both sides, since VILLE's non-cash-out transfer
restriction (see `VilleToken.sol`) makes a gasless resale payout require
either inflating supply or custody-holding VILLE, and a direct transaction
keeps the sink property intact without either.

The same `gameServer` key also relays the onboarding and fox-lifecycle mints —
`POST /hero`, `/pet` (egg mint), `/pet/record-run`, `/pet/evolve`, and
`/pet/revive` — and `POST /event` for the `GameEvents` stamps, each proxied
through its own `apps/web/app/api/chain/*` route the same way the treasure
claim is.

`apps/server` is intentionally **not** an npm workspace — it has its own
`package.json`/lockfile so Railway can build it standalone with its Root
Directory set to `apps/server`, independent of the web app's workspace. Gameplay
itself is fully client-simulated (no authoritative server), so the treasure-claim
relay trusts the client's report of what happened — that's the accepted v1 trust
boundary (§13.2): the `gameServer` key's integrity IS the security boundary. The
amount cap (1300, matching the game's own max carry cap) and per-player rate
limit are a light abuse deterrent, not real anti-cheat. The marketplace relay is
different: the player's own EIP-712 signature is what authorizes spending their
VILLE, verified on-chain — not the relay's say-so.

```bash
cd apps/server
cp .env.example .env      # fill in GAME_SERVER_PRIVATE_KEY + RELAY_SECRET
npm install
npm run dev                # → http://localhost:8080
```

## Contracts

Seven intentionally-simple contracts (see [DESIGN.md §7](DESIGN.md)), all
**UUPS-upgradeable** ([DESIGN.md §14.9](DESIGN.md)) and **live on Avalanche
C-Chain mainnet**. `HeroNFT` and `GameEvents` shipped later than the original
five, via a separate additive deploy — see
[`contracts/script/DeployEvents.s.sol`](contracts/script/DeployEvents.s.sol),
run *after* `Deploy.s.sol`, not in place of it:

| Contract | Standard | Role | Mainnet proxy |
|---|---|---|---|
| `TreasureNFT` | ERC-721 | Minted per successful treasure pickup; carries rarity tier | `0x9962CDE2ab47C835926AD20885c4100Ea974c209` |
| `VilleToken` | ERC-20 | Soft currency; **non-cash-out** (transfers restricted to the marketplace; burned on spend) | `0x1c9021462B8F62e1bF384407C093651135d9e346` |
| `ArmoryItems` | ERC-1155 | Marketplace — consumables + cosmetics priced in VILLE; routes a pool cut | `0x3d95a695baFc865cC17366B7f2f35b19fD741987` |
| `PetNFT` | ERC-721 | The fox — growth stage + **derived** health (decay computed as a view) | `0x217F88139a85E2DD6338732abEc109f55dDe5c01` |
| `SeasonRewards` | — | Monthly tournament scoring + native-AVAX prize pool; winner-initiated claims | `0x3C462908c5F1e3a45009f4Ac82dB67Bb95f812DB` |
| `HeroNFT` | ERC-721 | Minted once at onboarding for the chosen hero (roster index; more slots arrive via the Marketplace) | `0xd3A15075053FF36875C6daFE4d439D1Cb1b05d09` |
| `GameEvents` | — | Cheap on-chain stamp for death / day-complete / day-advanced — no reward, just a permanent record | `0x4459734087282b0F171c6417B19131bFB00cC687` |

A shared `AuthorizedGame` base defines the `gameServer` key — the single off-chain
signer trusted to relay validated gameplay outcomes on-chain. **This key is the v1
trust boundary** ([DESIGN.md §13.2](DESIGN.md)). `owner` (upgrade/admin authority
on every contract) is a Safe multisig, deliberately separate from `gameServer`
(§14.9) — a multisig can't auto-sign per-gameplay-event, so `gameServer` stays a
dedicated hot key instead.

### Build & test

Requires [Foundry](https://book.getfoundry.sh/). From `contracts/`:

```bash
forge install OpenZeppelin/openzeppelin-contracts OpenZeppelin/openzeppelin-contracts-upgradeable foundry-rs/forge-std
forge build
forge test
```

### Deploy (Avalanche C-Chain mainnet — no testnet stop, §14.9)

```bash
cp .env.example .env      # fill in PRIVATE_KEY, GAME_SERVER_ADDRESS, SAFE_ADDRESS
forge script script/Deploy.s.sol --rpc-url avalanche --broadcast --verify
```

Each contract deploys as an `ERC1967Proxy` in front of a logic contract,
`initialize()`d with `SAFE_ADDRESS` as `owner`. Deployment is real, irreversible
AVAX spend — double-check the deployer balance and `SAFE_ADDRESS` first.

The deploy script auto-whitelists `ArmoryItems` as VilleToken's sole spender
**only if `SAFE_ADDRESS` is unset** (deployer == owner). With a real
`SAFE_ADDRESS`, that whitelist call has to be made from the Safe after deploy:
`VilleToken.setSpender(ArmoryItems, true)`.

## Status

Design settled ([DESIGN.md §12 locked decisions](DESIGN.md), [§13 known risks](DESIGN.md));
contracts build, pass tests, and are **deployed live on Avalanche mainnet**;
the web game has the full gray-box loop, mandatory Magic/injected wallet login
with a hero-and-egg onboarding, and multiple real on-chain paths — treasure
claims, the marketplace (gasless relayed purchases plus genuine
player-to-player resale), and the fox: onboarding mints both `HeroNFT` and a
`PetNFT` egg, and `PetNFT` stays live through play (decay-clock reset on every
banked treasure, growth-stage `evolve` on a shop purchase, `revive` on buying
the Revival Charm) — all verified end-to-end against live mainnet.
`GameEvents` stamps death/day-complete/day-advanced the same way. Not fully
wired: `SeasonRewards` — the *claim* side is live (a real "Claim tournament
prize" button in the on-chain marketplace, reading `currentSeasonId`/
`claimableReward`), but nothing yet calls `addScore` during gameplay, so no
season currently accrues a real balance to claim. Remaining work follows the
M0–M9 milestones.

