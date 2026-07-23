extends NPC
## Armed NPC that engages the player and must be shot to pass (§2).
## v1 priority archetype — build this one well before the others (§13.6).

@export var health := 3
@export var fire_range := 12.0

func _on_spawn() -> void:
	archetype = Archetype.BLOCKER

func tick(_delta: float) -> void:
	# TODO M2: acquire player in range, strafe, fire on cadence.
	pass

func take_hit(damage: int) -> void:
	health -= damage
	if health <= 0:
		# Clearing a blocker feeds Renown (relayed, not client-trusted, §13.2).
		queue_free()
