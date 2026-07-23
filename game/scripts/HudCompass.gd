extends Control
## HUD compass: shows a rough treasure-zone bearing (not an exact pin, §2 step 1).
## Real and decoy hints share the compass; only a fox sniff disambiguates them.

@export var player_path: NodePath
@export var hint_system_path: NodePath

func _process(_delta: float) -> void:
	# TODO M3: draw a bearing wedge toward the current best-known hint direction,
	# widening the wedge to convey "rough zone" rather than a precise pin.
	queue_redraw()

func _draw() -> void:
	pass
