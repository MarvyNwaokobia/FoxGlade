extends Node3D
## Orchestrates a single session: spawn player + fox, place NPCs, run the hint
## loop, resolve the treasure pickup, and relay the on-chain moments.
## This is a scaffold skeleton — wire real scenes/nodes as milestones land (§8).

@onready var npcs: Node3D = $NPCs

const SESSION_HARD_TIMER := 240.0 # seconds (§12: ~4 min hard cap)

var _elapsed := 0.0

func _ready() -> void:
	ChainBridge.tx_confirmed.connect(_on_tx_confirmed)
	GameState.begin_run()
	_spawn_npcs()
	# TODO M1: build village, place spawn/treasure/marketplace zones.
	# TODO M2: instance Blocker/Distractor/Thief scenes under $NPCs.
	# TODO M3: start HintSystem and connect treasure pickup.

func _process(delta: float) -> void:
	_elapsed += delta
	if _elapsed >= SESSION_HARD_TIMER:
		_end_run_timeout()

func _spawn_npcs() -> void:
	# Placeholder: real spawn tables come with M1/M2.
	pass

## Called by the treasure node when the player reaches it first.
func on_treasure_reached(rarity_tier: int) -> void:
	GameState.complete_run(rarity_tier)
	ChainBridge.mint_treasure(rarity_tier) # §11 on-chain moment

func _end_run_timeout() -> void:
	set_process(false)
	# No treasure => no on-chain mint, no decay-clock reset (§7 applyDecay note).

func _on_tx_confirmed(kind: String, payload: Dictionary) -> void:
	print("[chain] confirmed: %s %s" % [kind, str(payload)])
