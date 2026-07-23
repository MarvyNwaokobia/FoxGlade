extends NPC
## NPC racing the player to the treasure; if it arrives first, the treasure is
## gone for the round — urgency without live PvP (§2).
##
## v1 simplification (§13.6): rather than full pathfinding, drive the thief with
## a timed progress bar toward the treasure so "reached first" is a simple race,
## not an AI-navigation problem. Swap in NavigationAgent3D later.

@export var seconds_to_treasure := 90.0

var _progress := 0.0
signal treasure_stolen

func _on_spawn() -> void:
	archetype = Archetype.THIEF

func tick(delta: float) -> void:
	_progress += delta / seconds_to_treasure
	if _progress >= 1.0:
		treasure_stolen.emit()
		set_physics_process(false)
