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

---

## 14. Direction changes (playtest-driven, Marvy)

Decisions made while playing the gray-box build. These evolve the core loop — captured here with their implications rather than silently rewriting §2/§12.

**14.1 — Multiple treasures, scattered organically.** Not one treasure. Each village hides **several treasure spots tucked in different corners**, at varying depths/rarities. The layout should feel like a real place, not a grid — a road exists, but **houses are scattered at irregular angles and distances**, with alleys, nooks, and dead-ends, not neat rows.
- *Open question:* does reaching **one** treasure end the stage, or do you **collect several** before advancing? (Affects run length + transaction count — see 14.4.)

**14.2 — Enterable houses, hide, crouch.** Buildings aren't solid blocks — key ones are **enterable interiors** you can duck into to break line of sight, wait out a blocker, or find a hidden treasure. Adds a **crouch** and a light **stealth** layer (blockers already fire on line-of-sight, so cover + interiors slot in naturally). Treasures in interiors reward exploration over the main street.

**14.3 — Village-per-level progression.** Claiming a village's treasure **advances you to the next village** — a new, different environment for the next level. Villages change per level (layout, mood, difficulty), giving a sense of a journey rather than one repeated arena.

**14.4 — Scope flag: this reintroduces the short-session tension (§12).** Multiple treasures + multiple villages pushes toward a longer, roguelike-style progression, which pulls against the *locked* "2–3 min single-session, many quick runs" decision that the grant's transaction-density story leans on. **Recommended reconciliation:** keep **each village a self-contained ~2–3 min stage** (one village = one "level"/session), and make "next village" the **next level you load into**, not a marathon chained in one sitting. That preserves short, dense, replayable runs (and the many-small-transactions argument) while delivering the journey/level-progression feel. Treasure count per village stays low (1–3) so a stage still resolves quickly. Revisit if the grant rubric shifts.

**14.5 — Art direction: toward semi-realistic.** The visual target is moving from stylized low-poly toward **semi-realistic (human-realistic, not hyper-real)** characters, foxes, and environments. This raises the art cost and argues even harder for **bought/commissioned assets over hand-built**, and for **realistic-capable generators** for concept + hero assets. The low-poly concept set is kept as a reference alternative, not discarded.

**14.6 — A roster of playable characters + outfit/weapon customization.** Onboarding offers **multiple characters**, not one: men, women, and youths (young man / young woman), across ages, looks, and outfits (the rugged male scavenger is just one option). Characters are **cosmetic-only in v1** (no stat differences), and modeled **modularly** so the player can **customize the full outfit** — armor, clothing, weapon skins — bought with `VilleToken` or rank-gated (extends §6 and the `ArmoryItems` cosmetics in §7). **Weapons are their own asset line** (multiple guns), also skinnable. This multiplies the modular-art need, reinforcing the buy/commission-a-pack call in 14.5.

**14.7 — Fox breeds, chosen via the egg.** Not one fox — **multiple breeds** (red, arctic, fennec, silver, …). At onboarding the player picks an **egg whose color/type determines the breed** it hatches into; you **carry the egg from the start**, it hatches and grows through the same four stages (Egg → Baby → Juvenile → Adult) within its breed. Breed is **cosmetic identity** (v1, no stat differences), riding on the existing growth/decay/rank system — so it adds art, not new systems. Ties the emotional companion choice to the on-chain `PetNFT` mint at onboarding (§7, §11).

**14.8 — Wallet is Magic (magic.link); on-chain deferred until gameplay is complete.** Onboarding uses **Magic** email/social login → a deterministic embedded wallet (no extension, no seed phrase — the low-friction path for a casual audience, and the same integration Valor already uses). The on-chain layer (treasure mint, egg mint, marketplace, reward claims) is **wired only after the core gameplay loop is proven in gray-box** — hints, combat, thieves, session timer, bomb, marketplace UI first, then chain.

**14.9 — Deploy target is Avalanche C-Chain mainnet directly; no Fuji testnet stop (2026-08-11, Marvy).** Supersedes the Fuji line in §14.8. Contracts deploy straight to mainnet with real AVAX gas — the `PRIVATE_KEY` in `contracts/.env` must be a dedicated, minimally-funded deployer wallet, never one holding other funds, since deployment is irreversible. The frontend's Magic wallet is configured for chainId 43114. Railway is available for any backend/database needs (e.g. hosting the `gameServer` signer service that relays validated gameplay events, §13.2).

**14.10 — Day-N quota progression (2026-08-12, Marvy). Supersedes 14.3/14.4's "village-per-level" framing and the deferred BIG VISION endless-mode note.** Progression is **DAY NUMBER**, not a village-to-village hop — deliberately not called "level" in any player-facing text, to keep it inside the world's own vocabulary (a life you're living, one day at a time, per §14 direction). The loop:

- Each day (1-indexed, persists across sleeps — `store.ts`'s existing `day` counter) has a **quota**: `treasuresForDay(day)` treasures to find, escalating (`Math.min(day, 6)` — day 1 asks for one, day 6+ asks for six). This is now the primary difficulty curve, ahead of blocker count.
- You don't know WHERE they are, only HOW MANY. Treasures reveal one at a time — claim/bank one (or lose one to a thief) and the next is immediately placed somewhere else in the village, so the hunt runs continuously rather than being gated to once per CHAPTERS transition (§2/§3's existing hint-board system, reused as-is).
- Existing chapters (Dawn → Morning → Afternoon → Dusk → Night, `config/day.ts`) still drive time-of-day, blocker/liar/thief unlocks — unchanged. What changes is the END-of-day condition.
- **A day ends when its quota is fully RESOLVED (banked by you, or gotten away with by a thief) OR nightfall hits — whichever comes first.** This reconciles an apparent contradiction in Marvy's original framing ("must find them all" vs. "thieves can take some") — a strict must-find-all-yourself quota is unwinnable the moment a thief wins a race, so a treasure's fate resolving at all (not specifically resolving in the player's favor) is what closes the day. The day-end summary reports the split ("3 of 5 banked, thieves got 2") rather than a pass/fail.
- Thieves are **not otherwise punished further** — losing one to a thief costs you that treasure and a little time (`DAY.theftPenalty`, existing), nothing more. The quota structure IS the pressure; no separate penalty layer needed.
- **Dying restarts the CURRENT day, not day 1 and not a fresh calendar day.** Zero free retries by default. The marketplace sells a small number of extra lives (recommend capping at 1 purchasable — a real decision, not a stockpile) that resume the day in place instead of restarting it when spent.
- Reaching the day's end used to unlock a walk-home-and-press-E flow; **§14.11 supersedes this bullet** — it's now an automatic hard stop, not a walk-there prompt.
- Per-day environment variance is cosmetic, not a new map: ground tint, wall material, house silhouette mix, and bank position shift off a seed keyed to the day number, layered onto the existing hand-placed `village.ts` layout rather than hand-authoring N separate villages (§14.4's transaction-density/short-session argument no longer needs "next village" to justify the journey feeling — the day number carries it instead, so 14.3's village-hop is retired, not extended).
- Treasures should eventually get a better in-world tell (something visible as you close in, beyond the compass/hint system) — flagged as follow-on work, not part of the core loop above.

Build sequence agreed for this (small playable slices, feel-reviewed one at a time — see workflow doc): (1) quota + resolve tracking, day ends on resolved-or-timeout — **DONE 2026-08-12**, `treasuresForDay` in `config/day.ts`, `treasuresRequired/treasuresResolved/treasuresStolen` in `store.ts`, tests in `store.test.ts`; (2) death restarts the current day + purchasable extra life — **DONE 2026-08-12**, `respawn()` in `store.ts` branches on `extraLives`: none left rolls TODAY back to dawn (quota progress/board/time-of-day reset, wallet/gear untouched, exactly like sleeping but same day number) and wakes you at home; a Warding Charm (`s_extralife`, `SUPPLY_CAP.extraLives = 1`, `config/shop.ts`) spends itself and resumes in place at your refuge, unchanged from the old respawn behaviour; `Hud.tsx` death overlay and `Shop.tsx` stock counter wired to it; (3) instruction beats — **DONE 2026-08-12**, two new one-shot toasts (`runtime.dayAnnounceAt`/`dayEndAt`, same pattern as the existing chapter banner): "DAY N — find X treasures before night falls" fires from `sleep()`/`restart()`/a death day-restart, and "DAY N DONE — X banked, Y lost to thieves. Head home and rest." fires the instant `advanceDay` flips `dayOver` true (reports the split, not a pass/fail); the existing "GO HOME AND SLEEP" persistent label and "the day is done, press E to sleep" shelter prompt were already adequate and untouched; (4) per-day environment seed — **DONE (partial) 2026-08-12**: ground/wall/roof/timber materials and every building's individual weathering tint now shift together off `dayTintIndex(day)` (`engine/world/dayTint.ts`), layered onto the existing hand-placed `village.ts` layout exactly as scoped — day 1 resolves to the neutral tint so the established baseline look is untouched, day 2 onward visibly drifts. Threaded through `useVillageMaterials()` and `Buildings3D`/`EnterableHouse` in `VillageMesh.tsx`. **Bank position shift was scoped out on inspection**, not shipped: `VILLAGE.bank` and the rest of `village.ts` (`BUILDINGS`, `COLLIDERS`, `BOXES3D`, `INTERIORS`, `ENTERABLE_WALLS`) are module-level constants computed once at import time and consumed as static data by collision, the compass/leads system, `Interiors.tsx`, `PlayerController`'s proximity checks, and more — actually relocating the bank means converting that whole module from static layout data to a function of `day` and updating every consumer to re-derive from the current day, which is an architecture change, not a slice. The bank's *appearance* (weathering tint, rotation/scale variant) does still vary day to day along with every other building; only its coordinates are fixed. Revisit as its own slice if Marvy wants the literal relocation; (5) better in-world treasure tells — **DONE 2026-08-13**: replaced the old waist-high glowing cyan pad-and-pillar `HintBeacon` (a sci-fi UI marker left over from early gray-box, at odds with the realistic art direction) with a ground-level patch of disturbed earth (5 scattered "clods," CC0 `dirt_floor` texture already in the repo) plus a faint gold glint, identical for the real treasure and every decoy — it gives away that *something* is there, never *which kind*, so the deduction layer is untouched. Fully transparent past 11m, legible within 3m (`TELL_NEAR`/`TELL_FAR`, `engine/world/treasureTell.ts`) — found by approaching, not spotted from across the village. The point-blank gold gem reveal for the confirmed real treasure is kept, just re-grounded to sit low (0.55m) instead of floating at 1.6m. Proximity/opacity math and the deterministic per-slot clod scatter pulled into their own pure module (same reasoning as `dayTint.ts` in slice 4 — untestable from inside a `"use client"` R3F component).

**14.11 — Day-end is a hard stop, not a walk-home-and-press-E prompt (2026-08-13, Marvy). Supersedes the "funnels you to the bank... then home to sleep" bullet in §14.10.** Playtesting slices 1–5 surfaced a real gap: `dayOver` unlocked going to bed but forced nothing, so a player could keep wandering after the day was actually over without any signal that something had changed — easy to miss entirely. Fix, matching the existing death-screen pattern exactly: the instant `dayOver` flips true (quota resolved or nightfall, no exception for either cause), `PlayerController` sets `runtime.paused` (which blockers/thieves/projectiles already respect) and freezes player movement, and `Hud.tsx` puts up a full-screen overlay — same visual language as the death screen — reporting the split ("X banked, Y lost to thieves") with two explicit choices: **E** sleeps through to Day N+1 (`sleep()`, now callable from anywhere, the `HOME_INDEX` location gate is gone), **R** retries the same day (`store.ts`'s new `retryDay()`, sharing the exact reset a no-charm death already used — both now call a private `resetToDawn()` helper so the two paths can't drift apart). The old shelter prompt's `canSleep` branch and the slice-3 day-end toast are both removed as redundant — the overlay says the same thing, more prominently, and persists until you choose. Retry is offered unconditionally, not gated on having failed the quota; there's no requirement to have missed it to want another attempt at today.

All five contracts (`VilleToken`, `TreasureNFT`, `PetNFT`, `ArmoryItems`, `SeasonRewards`) are **UUPS-upgradeable** (OpenZeppelin `contracts-upgradeable`, each deployed as an `ERC1967Proxy` in front of a logic contract, `initialize()` instead of a constructor). `owner` (the upgrade/admin authority — can rotate `gameServer`, whitelist spenders, and call `upgradeToAndCall`) is Marvy's **Safe multisig**, set via `SAFE_ADDRESS` in `contracts/.env` and passed as `initialOwner` at deploy time — the deploy key itself never holds owner power once `SAFE_ADDRESS` is set. `gameServer` stays a separate, non-multisig hot key (a Railway-hosted backend signer) since it must auto-sign every gameplay event with no manual approval step, which a Safe can't do without a relayer.

The Railway backend (`apps/server`) is live and wired to real gameplay
(2026-08-11): banking a secured treasure, with a wallet connected, mints a
`TreasureNFT` and rewards `VilleToken` for real, relayed through a Next.js
server route (`apps/web/app/api/chain/claim`) that keeps the relay's shared
secret server-side. Verified end-to-end against live mainnet. See the README's
"gameServer backend" section for the full request path. Not yet wired:
`PetNFT` (needs onboarding UI), `SeasonRewards` (needs a tournament UI) —
deferred until their gameplay UI exists.

**Marketplace, real on-chain ownership + player-to-player trading
(2026-08-11).** `ArmoryItems` upgraded to v2 via the Safe (new storage
appended after all v1 slots — layout-safe): gasless relayed purchases
(`buyItemFor`, EIP-712-signed by the player, submitted and gas-paid by the
`gameServer`/relay key) for the 9 sellable permanents (weapons, attachments,
the bomb satchel, bags — consumables stay local, latency doesn't fit
"quickly buy a bomb mid-fight"), plus real resale (`listForResale` /
`buyResale`, custody-based so VILLE moves as a genuine transfer rather than
a burn-and-remint, needing no change to `VilleToken`'s non-cash-out design).
Marvy's call on gas: primary purchases sponsored/gasless; resale, both
listing and buying, is a direct player-paid transaction on both sides — the
"hybrid" pattern from Valor (a sibling project), adapted because VILLE's
restricted transfers make a gasless resale *payout* specifically harder
than G$'s free transferability allows there. Verified end-to-end against
live mainnet (a real relayed `buyItemFor` purchase, confirmed on-chain).

**14.12 — Mandatory connect gate, hero-pick onboarding, and a dedicated
touch pad (2026-08-16 to 2026-08-17, Marvy).** Every visit now opens on
`ConnectGate.tsx` (Magic email-OTP or an injected wallet) before anything
else — supersedes 14.8's "wired only after gameplay is proven" framing for
the *login step* specifically (the on-chain gameplay wiring itself is
unchanged); guest play is gone, every player has an address from minute
one. Behind that gate, a one-time hero-pick screen (`components/onboarding/`,
`engine/onboarding.ts`) offers "The Outlier" now, with roster slots reserved
(locked cards) for characters bought later in the Marketplace — extends
14.6's roster direction, still cosmetic-only in v1. Touch devices get a
dedicated on-screen pad (`MobileControls.tsx`) rather than a scaled-down
desktop HUD: a fixed joystick plus a separate look-drag zone (two
independent pointers, not one shared thumb), a contextual action button
(GRAB/BANK/SHOP/VAULT/REST/ROLL/JUMP, whichever applies), and
FIRE/AIM/CROUCH/BOMB/FOX wrapped around FIRE's reachable top-left arc
instead of spread across the screen. The compact top-left HUD badge
(day/quota + clock) and moving VILLE balance out of the gamescreen entirely
(now Bank/Marketplace-only) followed the same small-playable-slice,
feel-reviewed workflow as §14.10 — several passes against Marvy's own
screenshots (not simulated ones) to fix real overlaps (the fox growth
caption sitting behind the hamburger/pause buttons; the compass overlapping
the minimap) and reachability (dropping the whole control cluster to the
bottom edge, aligning the joystick to FIRE's own baseline).

Separately: the hero-pick preview (and any `PlayerRig` instance) could
render in a broken, horizontal "flying" pose if it revealed itself before
its animation clips finished loading — `PlayerRig.tsx`'s reveal used a
blind 2.5s timer that could fire before Mixamo's 25-file animation set
loaded on a cold cache, showing the raw bind pose, and `HIPS_PITCH_FIX` (a
hardcoded rig-orientation correction) then unconditionally rotated that
undriven T-pose into the reported pose. Fixed by gating the reveal on
`AnimationStateMachine.currentClipName` actually being set (an 8s timer
remains as a last-resort fallback for a genuinely failed load) and skipping
the pitch fix entirely on an undriven skeleton, so a failed load now falls
back to a plain T-pose instead of a distorted one.

---

## 15. Animation & movement plan

How the characters and the fox actually *move* once the concept art becomes rigged 3D models. Nothing here blocks proving the game is fun — the gray-box capsules already move, shoot, and dodge in code. Animation is a **defined later pass** applied when real models swap in. The build reuses Valor's existing animation plumbing (`AnimationStateMachine`, `MixamoLoader`, `verbAnimations`).

**15.1 — Core principle: rig once, reuse everywhere.** Every human (player, all NPC types, every outfit) shares **one skeleton**, so we build **one animation library** and it drives all of them. We animate a rig, not 8 characters.

**15.2 — Humanoids: the Mixamo pipeline (free, standard, low-risk).** Upload a T-posed humanoid → Mixamo auto-rigs it and provides hundreds of free clips (walk, run, sprint, jump, crouch, crouch-walk, shoot, throw, dodge/roll, climb, sit, grab, idle, turn, hit-reaction, death). In-engine, Three.js `AnimationMixer` (drei `useAnimations`) plays/blends them; a **state machine** picks the clip from game state (moving → walk/run, jump → jump, firing → shoot). Almost every move the player needs is an off-the-shelf clip wired to the state machine.

**15.3 — Layered animation, so combos don't explode.** No separate run+shoot / crouch+shoot / walk+throw clips. **Lower body** plays locomotion; **upper body** plays an override (aim/shoot/throw) via bone masking / additive animation. One "shoot" upper-body clip works over any leg movement.

**15.4 — The fox is the cost center (flagged).** Mixamo is humanoid-only; it cannot rig the **quadruped** fox, and quadruped animation is genuinely harder. Plan: **buy a rigged+animated quadruped** (fox/wolf/dog packs exist) and re-skin to our breeds, or **commission** a rig + small clip set. The fox's needs are small — roughly **idle, walk, run, sit, sleep/curl (decay), happy-trill (evolve)**, ~6 clips, not 30. This is where the animation budget goes; humans are effectively free.

**15.5 — Animation (art) vs. behavior (code) — two different things.** Some listed moves are **clips**; some are **logic** with a simple clip on top:
- *Clips (art):* walk, run, jump, shoot, throw, dodge, crouch, sit, grab, climb, curl-up.
- *Logic (code we write):* **when** to play each; **hiding** = break line-of-sight (LOS already built for blockers, §M2) + crouch clip; **entering a house** = trigger + door + load interior (little animation); **climbing** = detect climbable surface + traverse it while the climb clip plays.

**15.6 — Concept art → animatable model caveat.** The realistic images we generated are **art direction / reference**, not automatically riggable. A rig needs clean topology in a T-pose. Animatable humans therefore come from a **clean modular base model** (Synty/commissioned to match the concept art) that Mixamo rigs — not directly from AI image→3D. AI image→3D is best for the **fox's look and static hero props**, not animated humanoids.

**15.7 — v1 vs v2 move scope.**

| Move | v1 | Notes |
|---|---|---|
| Walk / run / turn / idle | **Yes** | Core locomotion, Mixamo. |
| Jump | **Yes** | Mixamo. |
| Shoot / aim (layered) | **Yes** | Upper-body override (15.3). |
| Dodge / roll | **Yes** | Mixamo; pairs with combat feel. |
| Crouch + crouch-walk | **Yes** | Enables hiding/cover. |
| Hide (break line-of-sight) | **Yes** | Logic + crouch clip; LOS already built. |
| Enter house / interior | **Yes** | Trigger + door + interior load. |
| Throw (bomb) | **Yes** | Mixamo throw clip; matches the bomb mechanic (§2). |
| Sit / idle-with-fox flavor | **Stretch** | Nice-to-have companion polish. |
| Climb | **v2** | Needs climb clip **and** traversal logic; cut for v1 scope. |
| Grab specific objects | **v2** | Most custom (per-object logic); defer. |
| Fox: idle/walk/run/sit/sleep/trill | **Yes** | The ~6-clip quadruped set (15.4). |

**15.8 — Sequencing.** Fox rig + animations land around **M6** (fox growth models); the character rig + Mixamo set + state machine is a dedicated model/animation pass paired with **M5** onboarding or the **M9** art pass. Until then, gray-box code movement stands in — mechanics are proven without any animation dependency.
