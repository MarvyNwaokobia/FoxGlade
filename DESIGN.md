# Foxglade
### Game Design + Technical Spec for Avalanche Grant Build

---

## 1. One-line pitch

A single-session arena game set in a walled village: players, accompanied by a growing fox companion, fight through NPC blockers, sift real hints from planted distractions, and use an in-game marketplace to reach and mint a treasure before the timer or rival NPCs beat them to it.

---

## 2. Core loop

1. Player enters the village (spawn point) with their fox companion, and sees a rough treasure zone hint on a HUD compass, not an exact pin.
2. Player moves toward it, encountering three NPC archetypes along the way:
   - **Blockers**: armed NPCs who engage in combat, must be shot to pass.
   - **Distractors**: unarmed NPCs who broadcast false hints (fake compass pings, fake dialogue) meant to pull the player off-path.
   - **Thieves**: NPCs racing toward the same treasure; if one reaches it first, it's gone for that round (creates urgency without needing live PvP).
3. Player can visit a **marketplace** (pre-round or at fixed safe-zones mid-map) to buy guns, ammo, bombs, and pet/character cosmetics.
4. Bombs let the player clear a radius of blockers at once, but a telegraphed blast-radius overlay makes it possible to accidentally destroy the treasure if thrown carelessly, real risk/reward, not randomness.
5. A grown fox can occasionally sniff out which of several hints is the real one, on a cooldown that improves as the fox matures, giving a concrete gameplay reason to invest in raising it.
6. On reaching the treasure, the player triggers an on-chain mint (the treasure becomes an NFT with rarity attributes) and the round ends.

**Design note:** keep "thieves who want your treasure" as NPCs, not other live players, for v1. Live PvP over a single objective invites camping/griefing and is a much harder balance problem than a hackathon timeline supports. It's an easy v2 mode once the core loop is proven fun.

---

## 3. Why this fits Avalanche's current grant scoring

Avalanche's Retro9000 rounds and Build Games competition weight **verifiable on-chain activity** (gas burned, real transactions, unique wallets) heavily, not just pitch quality. This design produces frequent, meaningful transactions per session, and the fox companion adds emotionally-driven transactions (egg mint, hatch, evolution) on top of the routine marketplace/treasure ones. See Section 11 for the full mapping.

---

## 4. Suggested tech stack

| Layer | Recommendation | Why |
|---|---|---|
| Game engine | **Godot 4** (export to web/HTML5) or reuse whatever engine powered your GoodDollar shooter if it's portable | Godot is free/open-source (no license cost), exports to web so judges can play instantly with no download |
| Alternative | Three.js/Babylon.js if you want a fully browser-native, no-plugin build | Better if you want the game embedded directly in a web dApp frontend alongside wallet connect |
| Chain | Avalanche C-Chain | Cheapest, most compatible with standard EVM tooling you already use |
| Contracts | Solidity + Foundry (you already use this) | Treasure NFT (ERC-721), token (ERC-20), marketplace (ERC-1155), pet NFT (ERC-721), season rewards contract |
| Wallet/connect | RainbowKit or Web3Modal + wagmi, or **Privy** for embedded/social-login wallets | Standard, fast to integrate; Privy specifically removes the "install a wallet extension" barrier at onboarding, which matters more for a casual game audience than a DeFi audience |
| Backend (if any) | **Supabase** for leaderboard/session sync, or lightweight Node/Express | Supabase is a proven lightweight choice for exactly this (used by the FocusPet reference project for leaderboard + session sync); skip entirely if v1 stays fully client-authoritative |

> **Engine decision (locked): web-native Three.js / React Three Fiber, not Godot.**
> The build reuses systems from the Valor codebase (a shipped R3F web FPS) to
> fast-track movement, NPC AI, game-feel, and UI, and keeps game + wallet +
> marketplace in one app. This is the stronger fit for Avalanche's grant scoring
> (judges play instantly in-browser; the whole Avalanche/EVM tooling stack —
> wagmi, viem, Core wallet, session keys, subnet gas sponsoring — is web-first),
> and it's why the "Alternative" row above became the primary choice. The game
> ships as `apps/web` (Next.js + R3F); the fox is rendered in-scene rather than
> as a separate avatar SDK.

---

## 5. Visual style: 2D vs 3D, and where to get assets

**Recommendation: stylized low-poly 3D (a "2.5D" middle ground), not flat 2D pixel art and not realistic 3D.**

Reasoning:
- Flat 2D would be cheapest, but character *and pet* customization (swapping armor, growth stages, cosmetic tiers) is much harder to do well in 2D, you'd need separate sprite layers redrawn for every combination, facing direction, and fox growth stage.
- Full realistic 3D (rigged, animated, high-poly) is the expensive end, animation and rigging cost dominates.
- **Low-poly/voxel-adjacent stylized 3D** is the sweet spot: it looks intentional and polished, it's the dominant visual language in web3 gaming already (Sandbox, Aavegotchi), and modular customization plus swapping in different fox growth-stage models is much easier here than redrawing 2D sprite layers.

**Where to get assets:**
- **Synty Studios (POLYGON series)** — industry-standard low-poly asset packs, sells modular character packs built for mix-and-match customization. Worth checking whether they (or a similar pack) have a fox/creature line for the pet's base models across growth stages.
- **Kenney.nl** — free, huge library of low-poly and pixel assets, good for environment props, UI icons, audio.
- **Ready Player Me** — worth a look for the "pick and customize a character during onboarding" flow specifically, though the fox pet itself will likely need its own dedicated model/animation set outside of an avatar SDK.
- **Mixamo** (free, Adobe) — animation/rigging for purchased static models.
- **itch.io asset marketplace** — cheap, often high-quality low-poly and 2D packs, worth browsing for a fox/creature model specifically before commissioning custom art.

Practical starting point: one modular low-poly character pack for the player, plus a small set of fox models (egg, baby, juvenile, adult) either bought as-is or commissioned cheaply, since this is a small, contained asset need (four fox states) rather than a huge art budget.

---

## 6. Character & pet onboarding

- On first launch, before entering the village, the player connects their wallet and goes through onboarding: **pick a base character** (cosmetic archetype, no stat differences in v1) and **pick an egg** (color/pattern, possibly rarity-gated as a marketplace cosmetic).
- The egg is minted as a `PetNFT` at this point (see Section 7), starting in its Egg stage.
- Further character customization (armor pieces, weapon skins) is unlocked by purchase with `VilleToken` or gated behind rank tier, tying money and status together without letting money alone buy the top-tier look.
- The fox grows through the same progression that drives the player's rank (see Section 10), so raising your fox and climbing the leaderboard are literally the same activity, not two separate systems to manage.

---

## 7. Smart contract architecture (minimal viable set)

**TreasureNFT.sol** (ERC-721)
- `mintTreasure(address player, uint256 rarityTier)` — called when a player reaches a treasure
- Rarity tiers (common/rare/legendary) tied to how deep in the village the treasure spawned, gives replay incentive to hunt harder spots
- Rarity also feeds the tournament-score weighting (see Section 10)

**VilleToken.sol** (ERC-20, in-game soft currency)
- Minted to a player's balance when a treasure is picked up (amount scaled by rarity)
- Never directly withdrawable/swappable for AVAX in v1, this is intentional: it removes the "kill enemies, cash out real money instantly" pressure that broke economies like Axie's
- Only spendable inside `ArmoryItems.sol` (consumables/cosmetics)

**ArmoryItems.sol** (ERC-1155)
- Fungible-ish consumables: `GUN`, `AMMO`, `BOMB`, plus cosmetic items (armor skins, weapon skins, egg patterns)
- **`REVIVAL`**: instantly wakes a dormant fox (see Section 10), for players who've been away and don't want to wait out natural recovery
- **`STREAK_SHIELD`**: protects a daily play streak from one missed day without resetting it
- `buyItem(uint256 itemId, uint256 qty)` payable in `VilleToken`
- A small percentage of every purchase routes into the monthly tournament prize pool (see Section 10), the same pattern the FocusPet reference project uses to route a shop-fee cut into its UBI pool

**PetNFT.sol** (ERC-721, new)
- Minted once at onboarding when the player picks their egg
- Tracks a `growthStage` enum: Egg → Baby → Juvenile → Adult (→ possibly a rare Elder form), plus a `health` value
- `evolve(uint256 tokenId)` — called when accumulated Renown (Section 10) crosses a stage threshold, updates growth stage and emits an event the client uses to swap the pet's model/animation
- `applyDecay(uint256 tokenId)` — keyed to `lastSuccessfulRunTimestamp` (updated only on a completed treasure pickup, not on login or a failed run). Health stays full for the first 24 hours of inactivity, then decays linearly from hour 24 to hour 48, reaching zero at the 48-hour mark if no successful run occurs in that window. At zero health the fox goes **dormant** and stops earning Renown, but is never burned or destroyed
- A dormant fox recovers either by the player returning to active play, or by buying the `REVIVAL` item from the marketplace for an instant wake-up, giving players agency instead of only a forced wait

**SeasonRewards.sol**
- Tracks a `tournamentScore` per wallet during the active monthly window (treasures found, weighted by rarity, plus a tiebreaker like fastest average pickup time)
- `claimReward()` is called by the player themselves after `finalizeTournament()` snapshots the top N wallets, rather than an admin batch-paying everyone, this keeps the transaction attributable to the player's own wallet
- Pool is funded by: marketplace revenue cut + optional small entry stake per tournament pass + an initial treasury seed from grant funds if needed to bootstrap tournament 1

Keep all five contracts intentionally simple. Judges and graders can read straightforward contracts fast; over-engineering here costs time without adding to the pitch.

---

## 8. Milestone plan (solo dev, AI-assisted)

| Milestone | Scope | Est. time |
|---|---|---|
| M0 | Port/adapt movement, shooting, hit detection from your existing GoodDollar shooter into the new project shell | 3-5 days |
| M1 | Build the village map (bounded, not open-world), place spawn/treasure/marketplace zones | 4-6 days |
| M2 | NPC AI: blockers (combat), distractors (fake hint broadcasts), thieves (pathing race to treasure) | 5-7 days |
| M3 | Hint system + treasure pickup + NFT mint integration | 3-4 days |
| M4 | Marketplace UI + on-chain purchase flow + bomb mechanic with blast-radius telegraph | 4-6 days |
| M5 | Character onboarding + egg selection + `PetNFT.sol` mint/evolve integration | 5-7 days |
| M6 | Fox growth-stage models/animations swap in-game, plus the fox's hint-sniffing utility ability | 3-5 days |
| M7 | Leaderboard UI + monthly tournament tracking + `SeasonRewards.sol` integration | 4-5 days |
| M8 | Renown/rank tiers wired to pet growth stages, decay logic, regression states | 3-5 days |
| M9 | Polish pass, balance tuning, demo recording, grant submission materials | 4-5 days |

**Total: roughly 8-9 weeks solo**, faster if fox models/animations are bought or commissioned rather than built from scratch.

---

## 9. Cost considerations

- **Engine/tools:** $0 if using Godot; standard hosting costs only if you add a backend.
- **Art assets:** biggest variable cost. A modular low-poly character pack typically runs in the low hundreds of dollars; the fox needs only four growth-stage models plus a few animations, a contained, commissionable scope rather than an open-ended art budget. Kenney's environment packs are free.
- **Contracts:** near-zero marginal cost, you already have the Foundry/Solidity skillset from Shielded Protocol and your FHE builds.
- **Audio (SFX/music):** freesound.org or a small licensed pack, low cost.

Compared to the football idea, this is meaningfully cheaper: no full character animation rigs from scratch, no ball physics tuning, no AI opponent behavior tree for 22 players on a pitch.

---

## 10. Economy, monthly tournaments, and pet-linked rank

**Layer 1: In-game token (no cash-out pressure)**
- Treasures pay out `VilleToken`, not AVAX, not a stablecoin.
- Token is spent in the marketplace on consumables and cosmetics. It is not withdrawable in v1.
- This removes the single biggest failure mode of play-to-earn games: a direct, per-kill cash faucet that outpaces demand and collapses the token's value (this is what happened to Axie Infinity's SLP).

**Layer 2: Monthly tournament weekend + real prize pool (the actual "earn")**
- Tournaments run once a month, over a single weekend (for example, Friday 00:00 UTC to Sunday 23:59 UTC). Outside that window, players can still play casually for `VilleToken`, cosmetics, and fox growth, but nothing feeds the prize leaderboard.
- `tournamentScore` resets at the start of each tournament window and is weighted by treasure rarity plus a speed/efficiency tiebreaker.
- At the end of the weekend, the top-ranked wallets call `claimReward()` themselves to receive a real prize pool (AVAX or a stablecoin), tiered by rank (1st place gets meaningfully more than 50th).
- The pool is funded by a small cut of marketplace revenue plus, optionally, a small entry stake per tournament pass. Grant funds can seed the pool for tournament 1 to guarantee an attractive payout before organic marketplace revenue builds up.

**Layer 3: Renown and fox growth, merged into one system**

Rather than running a separate rank-decay system alongside a separate pet-vitality system, both are the same track:

- Players earn **Renown** from ordinary play (not just tournament weekends): treasures found, blockers cleared, successful runs.
- Renown crossing set thresholds both **evolves the fox** (Egg → Baby → Juvenile → Adult) and **updates the player's public rank title** (Wanderer → Scavenger → Raider → Marauder → Warlord → Legend, or names in that spirit), the two are one visible signal, not two things to check separately.
- **Decay, represented through the fox rather than gear:** the decay clock resets on the player's last *successful treasure run*, not just logging in. For the first 24 hours after that, the fox stays at full health with no visible change, a grace period so a busy day or two doesn't feel punishing. From hour 24 to hour 48, health decays visibly, the coat dulls, animations slow, it curls up and sleeps more, giving a clear early warning. If health reaches zero at the 48-hour mark, the fox goes **dormant**, stops earning Renown, and stays that way until the player either completes a successful run or buys a `REVIVAL` item from the marketplace, never destroyed or lost.
- **Daily streak bonus:** completing at least one successful run per day builds a streak that adds a percentage bonus to Renown earned, a proven retention lever (same pattern as the FocusPet reference project). A `STREAK_SHIELD` marketplace item protects the streak from one missed day without resetting it, useful for players who know they'll be traveling or busy.
- This gives you the visible, emotionally resonant decay/growth signal you wanted, on a companion that's much more sympathetic to watch decline (and much more satisfying to nurse back) than an armor color fading.

**Anti-abuse basics to build in from the start**
- Per-wallet daily cap on tournament-score-earning actions (prevents 24/7 botting from dominating the leaderboard)
- Light server-side validation of kill/pickup events rather than trusting the client entirely for anything that affects tournament score or Renown. **Note:** because combat and pickups are computed off-chain and then trusted on-chain to drive Renown, evolution, and tournament score, this validation is a *load-bearing trust assumption*, not a nice-to-have. For v1 it is acceptable to accept signed events from a single game-server key; treat that key's integrity as the security boundary and document it as such.
- Decay curve should be gentle enough not to punish casual players unfairly, but real enough that top ranks and mature foxes feel earned and maintained, this is a balance number to playtest, not something to lock in on paper

---

## 11. On-chain activity mapping

The core principle: **real-time gameplay stays off-chain, meaningful economic and emotional moments go on-chain.**

**What generates on-chain transactions**
- **Marketplace purchases** — buying ammo, bombs, guns, or cosmetics with `VilleToken`. Most frequent, most controllable source of volume.
- **Treasure mint** — one transaction per successful treasure pickup (`TreasureNFT.mintTreasure`).
- **Egg mint** — one transaction at onboarding when the player picks their egg (`PetNFT` minted).
- **Fox evolution** — one transaction each time the fox crosses a growth-stage threshold (`PetNFT.evolve`), a genuinely exciting, shareable on-chain moment tied to something the player has been nurturing.
- **Tournament entry** — if an entry stake is used, one transaction per player per monthly tournament window.
- **Reward claims** — top-ranked players call `claimReward()` themselves at tournament close, so the transaction is initiated by the player's own wallet rather than an admin batch payout, which counts better toward unique active wallets and real transaction volume.

**What stays off-chain**
- Movement, shooting, hit detection, NPC AI, hints/distractors, the fox's hint-sniffing ability, all client-side or lightweight server-authoritative state for anti-cheat. None of this touches the chain.

**Reducing friction without reducing real activity**
- **Session keys / account abstraction**: player signs once per session; in-session marketplace purchases don't require a fresh wallet popup each time.
- **Longer-term option**: deploy the game on its own Avalanche L1 (subnet), sponsoring gas so players never need AVAX in their wallet just to play, paying in `VilleToken` while the underlying gas is covered from marketplace revenue.
- **Framing caveat for the grant pitch:** because session keys and sponsored gas deliberately hide per-purchase signing, raw marketplace-transaction counts can read as manufactured volume to a skeptical reviewer. Lead the pitch with the 1:1 player-action transactions — egg mint, evolution, treasure mint, self-initiated reward claims — as evidence of *genuine* unique-wallet activity, and present marketplace volume as supporting texture rather than the headline metric.

---

## 12. Locked design decisions (formerly open questions)

These were the open questions from earlier drafts. Each is now resolved to a concrete v1 default with a one-line rationale. Every decision leans the same direction on purpose: **maximize unique wallets and short-session transaction density, minimize barriers and long time-commitments** — that is what the grant rubric rewards and what a solo timeline can actually ship. If the grant's exact scoring weights change, revisit the ones marked *(metric-sensitive)*.

| Question | v1 Decision | Rationale |
|---|---|---|
| Single-player vs. shared instance | **Single-player-per-session** | Shared human instances reintroduce every problem NPC thieves were chosen to avoid (griefing, camping, sync, low-population matchmaking) and add nothing the demo needs. A shared "race" mode is a clean v2. |
| Session length target | **2–3 min core loop, hard timer ~4 min** | Short sessions give judges multiple playthroughs per sitting, raise transactions-per-minute, and keep the tournament grind feeling like "many quick runs." Anything past ~5 min hurts the transaction-density story. *(metric-sensitive)* |
| Tournament window | **Last full weekend of each month, Fri 00:00 → Sun 23:59 UTC**, shown in-game as a live countdown | A fixed UTC window with a visible countdown is honest and buildable; "last full weekend" avoids ambiguity in months that start on a weekend. Rolling per-timezone windows are unbuildable for v1. |
| Wallets paid per tournament | **Top 25** | Paying top 25 (not top 10) widens the "I could realistically place" band, driving more competitive play and more unique claiming wallets — directly good for grant metrics — while keeping 1st aspirational. *(metric-sensitive)* |
| Payout tiering steepness | **Front-loaded, not winner-take-all** — roughly 1st ≈ 20%, 2nd ≈ 12%, 3rd ≈ 8%, 4th–10th split ≈ 40%, 11th–25th split ≈ 20% | Steeper and only whales bother; flatter and there's no reason to push for #1. This shape keeps the top aspirational while rewarding the whole competitive band. |
| Entry stake in v1 | **No stake.** Pool = marketplace-revenue cut + grant seed for tournament 1 | A stake is a barrier at exactly the moment you're proving the game is fun and growing wallet count. Adding an optional stake later (for a bonus tier) is easy; removing a resented one is not. |
| Renown decay curve | **24h full-health grace, then ease-in decay to dormancy at 48h.** Model: `health = 1 − ((t − 24) / 24)²` for `t` in `[24, 48]` hours since last successful run | An ease-in (slow at first, steep near hour 48) forgives the busy-two-days case that the grace period exists to protect, while still biting hard on genuine abandonment. This supersedes the earlier *linear* 24→48 drop. |

**Still genuinely a playtest question (not lockable on paper):**
- The exact decay coefficient and whether the quadratic ease-in feels right in practice, or wants a gentler/steeper exponent. The quadratic above is the committed *baseline* to tune from, chosen over linear because linear's steepest cost lands in the grace-adjacent hours where you least want it.
- The precise Renown thresholds for each Egg→Baby→Juvenile→Adult evolution and each rank-title step — set these against real playtime data once the core loop is instrumented.
- Marketplace prices and the tournament-pool cut percentage, tuned so a typical player trends toward break-even on `VilleToken` (see the token-sink risk in the README's design-risk notes) rather than accumulating idle balance.

---

## 13. Known design risks (carry into build)

These are the load-bearing risks flagged during design review. They are not blockers, but each is a place where a wrong number or a skipped decision sinks the project rather than just denting it.

1. **`VilleToken` needs a real sink, not just a faucet.** With no cash-out, the token's only value is the marketplace. Size consumable costs and cosmetic churn so a typical player trends toward break-even, not endless accumulation, or the currency feels pointless.
2. **Off-chain Renown is a trust boundary.** Renown is earned from client/server events but trusted on-chain to drive evolution, rank, and tournament score. The signing game-server key is the security boundary — treat it as such.
3. **Health must be *derived*, not stored-and-ticked.** A contract only knows state when called; compute `currentHealth()` as a `view` from `lastSuccessfulRunTimestamp` and only *write* on events that already cost gas. Do not pay gas to tick a clock.
4. **Who pays for `evolve`?** If the player pays gas to level up their own pet it feels like a tax; if a keeper pays it you reintroduce trusted admin transactions. v1 choice: the authorized game server triggers `evolve`, consistent with the Renown trust boundary above.
5. **Bomb-destroys-treasure can be a rage-quit mechanic.** If a mis-thrown bomb nukes the only on-chain payoff of a session, consider a "cracked, reduced-rarity" treasure state instead of total destruction — real punishment without zeroing the run.
6. **Scope is the biggest grant threat.** The milestone table assumes everything goes right, solo. If the demo is what's scored, cut to one NPC archetype done well (blockers), thieves as a simple timed despawn rather than pathing AI, distractors as a stretch — and protect the fox mint/evolve loop, which is both the differentiator and the best on-chain story.
7. **Streak vs. tournament cadence.** A daily-streak retention lever ("play every day") competes with a monthly-weekend prize cadence ("the real prize is one weekend a month"). Pick the primary retention driver so the two don't dilute each other.
8. **Cosmetics as ERC-1155 is awkward.** Fungible skin tokens model "quantity of an interchangeable skin," which is odd for cosmetics. Either accept that framing for v1 simplicity or split cosmetics into their own contract later.
9. **Cut the Elder fox form from v1.** It implies more art and threshold-balancing than a parenthetical is worth; ship four stages and add Elder as a post-grant flourish.
