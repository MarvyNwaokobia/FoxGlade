extends Node
## Autoload. The single seam between the Godot client and the web dApp / chain.
##
## On the HTML5 export the game runs inside a page that also hosts wagmi/Privy +
## the contract calls. Godot talks to that JS layer via JavaScriptBridge; the JS
## side (see web/) actually signs and sends transactions. Off-web (editor/desktop)
## these calls are stubbed so the game is still runnable for iteration.
##
## Only the meaningful economic/emotional moments cross this bridge (DESIGN.md §11):
## egg mint, treasure mint, fox evolve, marketplace buy, reward claim. Real-time
## gameplay never touches it.

signal tx_confirmed(kind: String, payload: Dictionary)
signal tx_failed(kind: String, reason: String)

var _web := false

func _ready() -> void:
	_web = OS.has_feature("web")

func mint_egg(pattern_id: int) -> void:
	_call_js("foxglade_mintEgg", {"pattern": pattern_id}, "mint_egg")

func mint_treasure(rarity_tier: int) -> void:
	_call_js("foxglade_mintTreasure", {"rarity": rarity_tier}, "mint_treasure")

func evolve_fox(token_id: int, target_stage: int) -> void:
	_call_js("foxglade_evolve", {"tokenId": token_id, "stage": target_stage}, "evolve")

func buy_item(item_id: int, qty: int) -> void:
	_call_js("foxglade_buyItem", {"itemId": item_id, "qty": qty}, "buy_item")

func claim_reward(season_id: int) -> void:
	_call_js("foxglade_claimReward", {"seasonId": season_id}, "claim_reward")

func _call_js(fn_name: String, args: Dictionary, kind: String) -> void:
	if not _web:
		# Desktop/editor stub: pretend it confirmed so the loop stays playable.
		push_warning("ChainBridge stub (%s): %s" % [kind, str(args)])
		tx_confirmed.emit(kind, args)
		return
	# The web page exposes window.foxglade_* functions that resolve to a result
	# the JS glue passes back via JavaScriptBridge callbacks (wired in web/).
	var window := JavaScriptBridge.get_interface("window")
	if window == null or not window.has_method(fn_name):
		tx_failed.emit(kind, "bridge function %s not found" % fn_name)
		return
	window.call(fn_name, JSON.stringify(args))
