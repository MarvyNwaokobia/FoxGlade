// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AuthorizedGame
/// @notice Shared access control for Foxglade contracts.
///         The `gameServer` is the single off-chain key trusted to relay
///         validated gameplay outcomes (kills, pickups, Renown) on-chain.
///         This is a deliberate v1 trust boundary — see DESIGN.md §13.2.
/// @dev    `owner` is the deployer/admin (can rotate the server key and tune
///         config). `gameServer` is the hot key the backend signs with.
abstract contract AuthorizedGame is Ownable {
    address public gameServer;

    event GameServerUpdated(address indexed previous, address indexed current);

    error NotGameServer(address caller);

    constructor(address initialOwner, address initialGameServer) Ownable(initialOwner) {
        gameServer = initialGameServer;
        emit GameServerUpdated(address(0), initialGameServer);
    }

    modifier onlyGameServer() {
        if (msg.sender != gameServer) revert NotGameServer(msg.sender);
        _;
    }

    /// @notice Rotate the trusted game-server key (admin only).
    function setGameServer(address newServer) external onlyOwner {
        emit GameServerUpdated(gameServer, newServer);
        gameServer = newServer;
    }
}
