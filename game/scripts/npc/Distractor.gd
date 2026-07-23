extends NPC
## Unarmed NPC that broadcasts false hints to pull the player off-path (§2).
## Stretch archetype for v1 (§13.6) — ship after Blocker + Thief if time allows.

@export var fake_hint_interval := 6.0

var _timer := 0.0

func _on_spawn() -> void:
	archetype = Archetype.DISTRACTOR

func tick(delta: float) -> void:
	_timer += delta
	if _timer >= fake_hint_interval:
		_timer = 0.0
		_broadcast_fake_hint()

func _broadcast_fake_hint() -> void:
	# TODO M3: push a decoy ping into HintSystem tagged is_real = false; a mature
	# fox's sniff ability can flag it (§2 step 5).
	pass
