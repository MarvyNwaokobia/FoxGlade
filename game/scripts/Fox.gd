extends Node3D
## The fox companion. Follows the player, swaps model per growth stage, and grants
## the hint-sniffing ability whose cooldown improves as it matures (§2, §6, §10).
## Growth stage and health are authoritative ON-CHAIN (PetNFT); this node mirrors
## them for presentation and gates the sniff cooldown locally.

enum Stage { EGG, BABY, JUVENILE, ADULT }

# Sniff cooldown (seconds) per stage — shorter as the fox matures. Egg can't sniff.
const SNIFF_COOLDOWN := [-1.0, 45.0, 30.0, 18.0]

@export var token_id := -1

var stage: Stage = Stage.EGG
var _sniff_ready_at := 0.0

func set_stage(new_stage: Stage) -> void:
	stage = new_stage
	# TODO M6: swap model/animation set to match the stage.

func can_sniff() -> bool:
	var cd: float = SNIFF_COOLDOWN[stage]
	if cd < 0.0:
		return false
	return Time.get_ticks_msec() / 1000.0 >= _sniff_ready_at

## Returns whether the given hint is the real one, then starts the cooldown.
func sniff(hints: Node, hint_index: int) -> bool:
	if not can_sniff():
		return false
	_sniff_ready_at = Time.get_ticks_msec() / 1000.0 + SNIFF_COOLDOWN[stage]
	return hints.is_real(hint_index)
