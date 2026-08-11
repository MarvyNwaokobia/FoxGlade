// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title AuthorizedGame
/// @notice Shared access control for Foxglade contracts.
///         The `gameServer` is the single off-chain key trusted to relay
///         validated gameplay outcomes (kills, pickups, Renown) on-chain.
///         This is a deliberate v1 trust boundary — see DESIGN.md §13.2.
/// @dev    `owner` is the admin (Safe multisig — can rotate the server key,
///         tune config, and authorize upgrades). `gameServer` is the hot key
///         a backend service signs with, deliberately NOT the multisig: it
///         must auto-sign on every gameplay event, which a multisig can't do
///         without a relayer. UUPS-upgradeable (DESIGN.md §14.9); each
///         concrete contract's constructor calls `_disableInitializers()` so
///         only the proxy's storage is ever initialized.
abstract contract AuthorizedGame is OwnableUpgradeable, UUPSUpgradeable {
    address public gameServer;

    event GameServerUpdated(address indexed previous, address indexed current);

    error NotGameServer(address caller);

    // solhint-disable-next-line func-name-mixedcase
    function __AuthorizedGame_init(address initialOwner, address initialGameServer) internal onlyInitializing {
        __Ownable_init(initialOwner);
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

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
