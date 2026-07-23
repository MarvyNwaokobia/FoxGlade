// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AuthorizedGame} from "./auth/AuthorizedGame.sol";

/// @title VilleToken
/// @notice In-game soft currency. Minted to players on treasure pickup,
///         spendable ONLY inside whitelisted spender contracts (the marketplace).
///         Not withdrawable / not swappable for AVAX in v1 — this is the
///         deliberate anti-"cash-out faucet" design (DESIGN.md §10 Layer 1).
/// @dev    Non-cash-out is enforced by restricting transfers: tokens may only
///         move to or from a whitelisted spender (e.g. ArmoryItems). Player↔player
///         and player↔EOA transfers are blocked so a secondary market can't form.
contract VilleToken is ERC20, AuthorizedGame {
    /// @notice Contracts allowed to receive/pull VilleToken (the marketplace).
    mapping(address => bool) public isSpender;

    event SpenderSet(address indexed spender, bool allowed);
    event Rewarded(address indexed player, uint256 amount, uint256 rarityTier);
    event Spent(address indexed spender, address indexed player, uint256 amount);

    error TransfersRestricted(address from, address to);
    error NotSpender(address caller);

    constructor(address initialOwner, address initialGameServer)
        ERC20("Ville Token", "VILLE")
        AuthorizedGame(initialOwner, initialGameServer)
    {}

    /// @notice Whitelist (or remove) a spender contract, e.g. ArmoryItems.
    function setSpender(address spender, bool allowed) external onlyOwner {
        isSpender[spender] = allowed;
        emit SpenderSet(spender, allowed);
    }

    /// @notice Credit a player for a completed treasure run. Amount is computed
    ///         off-chain (scaled by rarity) and relayed by the game server.
    function rewardTreasure(address player, uint256 amount, uint256 rarityTier)
        external
        onlyGameServer
    {
        _mint(player, amount);
        emit Rewarded(player, amount, rarityTier);
    }

    /// @notice Spend (burn) a player's VILLE. Callable only by whitelisted
    ///         spender contracts (the marketplace). Burning on spend makes VILLE
    ///         a true sink rather than a pile that accumulates forever — the
    ///         token-sink risk called out in DESIGN.md §13.1. The marketplace
    ///         emits its own pool-contribution event so the treasury can mirror
    ///         the cut into the real (AVAX/stablecoin) prize pool off-chain.
    function spend(address player, uint256 amount) external {
        if (!isSpender[msg.sender]) revert NotSpender(msg.sender);
        _burn(player, amount);
        emit Spent(msg.sender, player, amount);
    }

    /// @dev Restrict movement to mint (from == 0), burn (to == 0), or transfers
    ///      where one side is a whitelisted spender. Everything else reverts,
    ///      which is what keeps VILLE non-cash-out.
    function _update(address from, address to, uint256 value) internal override {
        bool isMintOrBurn = from == address(0) || to == address(0);
        bool touchesSpender = isSpender[from] || isSpender[to];
        if (!isMintOrBurn && !touchesSpender) {
            revert TransfersRestricted(from, to);
        }
        super._update(from, to, value);
    }
}
