extends CharacterBody3D
class_name NPC
## Base for the three NPC archetypes (§2). All NPC behaviour is off-chain (§11).

enum Archetype { BLOCKER, DISTRACTOR, THIEF }

@export var archetype: Archetype = Archetype.BLOCKER
@export var move_speed := 4.0

func _ready() -> void:
	_on_spawn()

func _on_spawn() -> void:
	pass

## Overridden by each archetype.
func tick(_delta: float) -> void:
	pass

func _physics_process(delta: float) -> void:
	tick(delta)
