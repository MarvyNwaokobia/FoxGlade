extends Node
## Manages the pool of hints — one real treasure-zone hint plus decoys planted by
## Distractors (§2). Feeds the HUD compass and the fox's sniff ability.

class Hint:
	var direction: Vector3
	var is_real: bool
	func _init(dir: Vector3, real: bool) -> void:
		direction = dir
		is_real = real

var hints: Array[Hint] = []

func add_hint(direction: Vector3, is_real: bool) -> void:
	hints.append(Hint.new(direction, is_real))

func real_hint() -> Hint:
	for h in hints:
		if h.is_real:
			return h
	return null

## Fox sniff ability: reveals whether a chosen hint is real (§2 step 5).
## Cooldown improves as the fox matures — enforced by Fox.gd, not here.
func is_real(hint_index: int) -> bool:
	if hint_index < 0 or hint_index >= hints.size():
		return false
	return hints[hint_index].is_real
