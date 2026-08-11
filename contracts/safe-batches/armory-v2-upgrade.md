# ArmoryItems v2 upgrade — Safe batch

Adds gasless relayed purchases (`buyItemFor`) and player-to-player resale to
the already-live `ArmoryItems` marketplace contract (DESIGN.md §14.9). All 10
calls target the same address — the `ArmoryItems` **proxy**, unchanged since
first deploy — and are bundled into one Safe batch so they execute atomically.

Every call was **dry-run simulated against live mainnet state** before this
file was generated (`cast call ... --from <safe>`); all 10 returned cleanly,
no reverts.

**Import:** Safe → Apps → Transaction Builder → drag `armory-v2-upgrade.json`
onto the "Drag and drop a JSON file" area. Review, Create Batch, sign, and
have your second owner approve from the Queue tab.

## What's in the batch

| # | Call | What it does |
|---|---|---|
| 1 | `upgradeToAndCall(0x5D1914F0FaDf8d113647eBB95C260109a23513b4, initializeV2(0x9283f1987793b99cdD1770678860F548CCa383a5))` | Points the proxy at the new logic contract and, in the same step, sets the `relayer` (the gameServer key on Railway) that's allowed to submit signed player purchases |
| 2 | `setPrice(hash("w_sidearm"), 110 VILLE)` | Flintlock |
| 3 | `setPrice(hash("w_smg"), 300 VILLE)` | Repeater |
| 4 | `setPrice(hash("w_marksman"), 600 VILLE)` | Long Rifle |
| 5 | `setPrice(hash("w_exotic"), 1500 VILLE)` | The Relic |
| 6 | `setPrice(hash("a_sight"), 240 VILLE)` | Brass Sight |
| 7 | `setPrice(hash("a_grip"), 260 VILLE)` | Wrapped Grip |
| 8 | `setPrice(hash("b_satchel"), 200 VILLE)` | Bomb Satchel |
| 9 | `setPrice(hash("g_satchel"), 380 VILLE)` | Satchel (bag) |
| 10 | `setPrice(hash("g_rucksack"), 900 VILLE)` | Rucksack (bag) |

Item ids are `keccak256(bytes(localId))` — deterministic, computed identically
by the frontend (`engine/chain/itemIds.ts`), so there's no id lookup table to
keep in sync anywhere. Prices are the same numbers as the local shop
(`engine/config/shop.ts`), scaled to 18 decimals.

**Not in this batch, on purpose:** the four consumables (bandages, powder
charge, chart, lockbox) and the free starter carbine stay purely local — see
`engine/chain/itemIds.ts` for why (consumables need to stay instant; a signed
on-chain purchase, even relayed, has latency that doesn't fit "buy a bomb
mid-fight").

## New implementation contract

`0x5D1914F0FaDf8d113647eBB95C260109a23513b4` — deployed from the same
deployer key used for the original set, not yet pointed to by anything until
this batch executes. Source: `contracts/src/ArmoryItems.sol` at this commit.
