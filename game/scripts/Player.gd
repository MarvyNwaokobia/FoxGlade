extends CharacterBody3D
## Player controller scaffold. Movement + shooting are ported from the existing
## GoodDollar shooter (M0). Kept deliberately thin here — the on-chain seam lives
## in ChainBridge, not in the controller.

@export var move_speed := 6.0
@export var max_ammo := 30

var ammo := 30
var has_gun := true

func _physics_process(_delta: float) -> void:
	var input := Vector3(
		Input.get_axis("move_left", "move_right"),
		0.0,
		Input.get_axis("move_forward", "move_back")
	)
	velocity = input.normalized() * move_speed
	move_and_slide()

	if Input.is_action_just_pressed("fire"):
		_fire()
	if Input.is_action_just_pressed("throw_bomb"):
		_throw_bomb()

func _fire() -> void:
	if not has_gun or ammo <= 0:
		return
	ammo -= 1
	# TODO M0: raycast hit detection against blockers (off-chain, §11).

func _throw_bomb() -> void:
	# TODO M4: telegraph blast radius; clearing blockers is free, but hitting the
	# treasure should CRACK it to reduced rarity rather than destroy it (§13.5)
	# so a mis-throw never zeroes the whole run.
	pass
