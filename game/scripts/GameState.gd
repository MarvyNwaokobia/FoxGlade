extends Node
## Autoload. Session-scoped state shared across the game.
## Keeps gameplay authority local for v1; anything that must be trusted on-chain
## (Renown, tournament score) is relayed through the game server, not the client.
## See DESIGN.md §10 (anti-abuse) and §13.2 (trust boundary).

signal renown_changed(total: int)
signal run_finished(rarity_tier: int, seconds: float)

# Rank titles unlocked by Renown thresholds, mirrored to fox growth stage (§10).
const RANK_TITLES := ["Wanderer", "Scavenger", "Raider", "Marauder", "Warlord", "Legend"]
# Placeholder thresholds — instrument real playtime data before locking (§12).
const RENOWN_THRESHOLDS := [0, 250, 750, 2000, 5000, 12000]

var player_wallet := ""
var fox_token_id := -1
var renown := 0
var run_start_msec := 0

func begin_run() -> void:
	run_start_msec = Time.get_ticks_msec()

## Called only on a completed treasure pickup (not on login / failed run) so it
## can drive the decay-clock reset and Renown award consistently.
func complete_run(rarity_tier: int) -> void:
	var seconds := (Time.get_ticks_msec() - run_start_msec) / 1000.0
	add_renown(_renown_for(rarity_tier))
	run_finished.emit(rarity_tier, seconds)

func add_renown(amount: int) -> void:
	renown += amount
	renown_changed.emit(renown)

func rank_title() -> String:
	var title := RANK_TITLES[0]
	for i in RENOWN_THRESHOLDS.size():
		if renown >= RENOWN_THRESHOLDS[i]:
			title = RANK_TITLES[i]
	return title

func _renown_for(rarity_tier: int) -> int:
	# Common / Rare / Legendary weighting (§10 Layer 2).
	return [50, 120, 300][clampi(rarity_tier, 0, 2)]
