// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AuthorizedGame} from "./auth/AuthorizedGame.sol";

/// @title GameEvents
/// @notice A permanent, on-chain stamp for gameplay moments that don't carry
///         a reward of their own — dying, finishing a day's quota, and
///         turning in for the night. No storage beyond the moment it's
///         written: the event log itself IS the record, kept deliberately
///         cheap so a high-frequency moment like a death doesn't cost more
///         than it has to. Relayed by the game server, same trust boundary
///         as every other write (DESIGN.md §13.2). UUPS-upgradeable
///         (DESIGN.md §14.9).
contract GameEvents is AuthorizedGame {
    enum EventType {
        Death,
        DayComplete,
        DayAdvanced
    }

    event Stamped(address indexed player, EventType indexed eventType, uint256 timestamp);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, address initialGameServer) external initializer {
        __AuthorizedGame_init(initialOwner, initialGameServer);
    }

    /// @notice Record that `eventType` happened to `player` right now. Pure
    ///         event emission, no storage write, so this stays cheap even at
    ///         death-level frequency.
    function stamp(address player, EventType eventType) external onlyGameServer {
        emit Stamped(player, eventType, block.timestamp);
    }
}
