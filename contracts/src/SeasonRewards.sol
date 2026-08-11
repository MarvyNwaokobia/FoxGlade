// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AuthorizedGame} from "./auth/AuthorizedGame.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/// @title SeasonRewards
/// @notice Monthly tournament scoring + real (native AVAX) prize pool.
///         Scores are relayed on-chain for auditability; after the window the
///         admin snapshots the top-N split and winners claim it THEMSELVES so
///         the payout tx is attributable to the player's wallet (DESIGN.md §7,
///         §10 Layer 2, §11). Default target: top 25, front-loaded tiering.
/// @dev    Pool is funded by direct deposits: the grant seed for season 1 plus
///         the treasury mirroring the marketplace VILLE cut into AVAX (§13.1).
///         UUPS-upgradeable (DESIGN.md §14.9). `ReentrancyGuardTransient` uses
///         EIP-1153 transient storage — stateless across calls, so no init step
///         and no proxy storage-layout risk from mixing it in.
contract SeasonRewards is AuthorizedGame, ReentrancyGuardTransient {
    struct Season {
        uint64 start;
        uint64 end;
        bool finalized;
    }

    uint256 public currentSeasonId;
    mapping(uint256 => Season) public seasons;

    // seasonId => wallet => cumulative tournament score
    mapping(uint256 => mapping(address => uint256)) public scoreOf;
    // Anti-abuse: per-wallet per-day score cap (§10). day = timestamp / 1 days.
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public scoredOnDay;
    uint256 public maxDailyScore = 1000;

    // seasonId => wallet => claimable AVAX (set at finalize)
    mapping(uint256 => mapping(address => uint256)) public claimable;

    event SeasonStarted(uint256 indexed seasonId, uint64 start, uint64 end);
    event ScoreAdded(uint256 indexed seasonId, address indexed wallet, uint256 points, uint256 total);
    event SeasonFinalized(uint256 indexed seasonId, uint256 winnerCount, uint256 totalPayout);
    event RewardClaimed(uint256 indexed seasonId, address indexed wallet, uint256 amount);
    event PoolFunded(address indexed from, uint256 amount);
    event MaxDailyScoreUpdated(uint256 cap);

    error SeasonInactive();
    error SeasonNotOver();
    error AlreadyFinalized();
    error LengthMismatch();
    error PayoutExceedsPool(uint256 requested, uint256 available);
    error NothingToClaim();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, address initialGameServer) external initializer {
        __AuthorizedGame_init(initialOwner, initialGameServer);
    }

    receive() external payable {
        emit PoolFunded(msg.sender, msg.value);
    }

    /// @notice Open a new tournament window and reset the active season score.
    function startSeason(uint64 start, uint64 end) external onlyOwner {
        currentSeasonId += 1;
        seasons[currentSeasonId] = Season({start: start, end: end, finalized: false});
        emit SeasonStarted(currentSeasonId, start, end);
    }

    /// @notice Relay a validated score delta for a wallet, respecting the daily cap.
    function addScore(address wallet, uint256 points) external onlyGameServer {
        Season memory s = seasons[currentSeasonId];
        if (block.timestamp < s.start || block.timestamp > s.end || s.finalized) {
            revert SeasonInactive();
        }
        uint256 day = block.timestamp / 1 days;
        uint256 already = scoredOnDay[currentSeasonId][day][wallet];
        uint256 room = already >= maxDailyScore ? 0 : maxDailyScore - already;
        uint256 credited = points > room ? room : points;
        if (credited == 0) return;

        scoredOnDay[currentSeasonId][day][wallet] = already + credited;
        uint256 total = scoreOf[currentSeasonId][wallet] + credited;
        scoreOf[currentSeasonId][wallet] = total;
        emit ScoreAdded(currentSeasonId, wallet, credited, total);
    }

    /// @notice Snapshot the payout split for a finished season. `winners`/`amounts`
    ///         are computed off-chain from the on-chain `scoreOf` leaderboard
    ///         (anyone can re-derive and verify). Winners claim themselves.
    function finalizeSeason(uint256 seasonId, address[] calldata winners, uint256[] calldata amounts)
        external
        onlyOwner
    {
        Season storage s = seasons[seasonId];
        if (block.timestamp <= s.end) revert SeasonNotOver();
        if (s.finalized) revert AlreadyFinalized();
        if (winners.length != amounts.length) revert LengthMismatch();

        uint256 total;
        for (uint256 i = 0; i < winners.length; i++) {
            claimable[seasonId][winners[i]] += amounts[i];
            total += amounts[i];
        }
        if (total > address(this).balance) revert PayoutExceedsPool(total, address(this).balance);

        s.finalized = true;
        emit SeasonFinalized(seasonId, winners.length, total);
    }

    /// @notice Winner-initiated claim (the attributable, unique-wallet tx).
    function claimReward(uint256 seasonId) external nonReentrant {
        uint256 amount = claimable[seasonId][msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[seasonId][msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "transfer failed");
        emit RewardClaimed(seasonId, msg.sender, amount);
    }

    function setMaxDailyScore(uint256 cap) external onlyOwner {
        maxDailyScore = cap;
        emit MaxDailyScoreUpdated(cap);
    }
}
