// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {AuthorizedGame} from "./auth/AuthorizedGame.sol";

/// @title PetNFT
/// @notice The fox companion. Minted once at onboarding (Egg stage). Grows as
///         Renown crosses thresholds; health decays from inactivity and the fox
///         goes dormant (never burned) at zero. See DESIGN.md §7, §10 Layer 3.
/// @dev    Health is DERIVED, never stored-and-ticked (§13.3): `currentHealth`
///         is a pure view over `lastSuccessfulRunTimestamp`, so no gas is spent
///         ticking a clock. Evolution is triggered by the game server (§13.4),
///         consistent with the off-chain Renown trust boundary (§13.2).
///         UUPS-upgradeable (DESIGN.md §14.9).
contract PetNFT is ERC721Upgradeable, AuthorizedGame {
    enum Stage {
        Egg,
        Baby,
        Juvenile,
        Adult
    }
    // Elder form intentionally omitted from v1 (§13.9).

    // Decay curve (§12): full health for GRACE, then ease-in to zero at DECAY_END.
    // health = 1 - ((t - GRACE) / WINDOW)^2  for t in [GRACE, DECAY_END], in bps.
    uint256 public constant GRACE = 24 hours;
    uint256 public constant DECAY_END = 48 hours;
    uint256 private constant WINDOW = DECAY_END - GRACE;
    uint256 public constant MAX_HEALTH = 10_000; // basis points

    uint256 private _nextId;
    string private _baseTokenURI;

    mapping(uint256 => Stage) public stageOf;
    mapping(uint256 => uint256) public lastSuccessfulRunTimestamp;

    event PetMinted(address indexed player, uint256 indexed tokenId);
    event Evolved(uint256 indexed tokenId, Stage from, Stage to);
    event RunRecorded(uint256 indexed tokenId, uint256 timestamp);
    event Revived(uint256 indexed tokenId, uint256 timestamp);

    error NotOwnerOfPet(uint256 tokenId, address caller);
    error NotForward(Stage current, Stage target);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, address initialGameServer, string memory baseURI)
        external
        initializer
    {
        __ERC721_init("Foxglade Fox", "FOX");
        __AuthorizedGame_init(initialOwner, initialGameServer);
        _baseTokenURI = baseURI;
        _nextId = 1;
    }

    /// @notice Onboarding mint. Fox starts as an Egg with the decay clock running.
    function mintEgg(address player) external returns (uint256 tokenId) {
        // Players mint their own egg (a real player-initiated tx, §11); the
        // server may also mint on their behalf during sponsored onboarding.
        require(msg.sender == player || msg.sender == gameServer, "unauthorized");
        tokenId = _nextId++;
        stageOf[tokenId] = Stage.Egg;
        lastSuccessfulRunTimestamp[tokenId] = block.timestamp;
        _safeMint(player, tokenId);
        emit PetMinted(player, tokenId);
    }

    /// @notice Derived health in basis points (0..MAX_HEALTH). 0 == dormant.
    function currentHealth(uint256 tokenId) public view returns (uint256) {
        uint256 last = lastSuccessfulRunTimestamp[tokenId];
        if (last == 0) return 0; // nonexistent / never initialised
        uint256 elapsed = block.timestamp - last;
        if (elapsed <= GRACE) return MAX_HEALTH;
        if (elapsed >= DECAY_END) return 0;
        uint256 x = elapsed - GRACE; // 0..WINDOW
        return MAX_HEALTH - (MAX_HEALTH * x * x) / (WINDOW * WINDOW);
    }

    /// @notice A fox with zero derived health earns no Renown until revived.
    function isDormant(uint256 tokenId) external view returns (bool) {
        return currentHealth(tokenId) == 0;
    }

    /// @notice Reset the decay clock on a completed treasure run (server-relayed).
    function recordRun(uint256 tokenId) external onlyGameServer {
        _requireOwned(tokenId);
        lastSuccessfulRunTimestamp[tokenId] = block.timestamp;
        emit RunRecorded(tokenId, block.timestamp);
    }

    /// @notice Advance the fox one or more stages when Renown crosses a threshold.
    ///         `target` must be strictly forward of the current stage.
    function evolve(uint256 tokenId, Stage target) external onlyGameServer {
        _requireOwned(tokenId);
        Stage current = stageOf[tokenId];
        if (uint8(target) <= uint8(current)) revert NotForward(current, target);
        stageOf[tokenId] = target;
        emit Evolved(tokenId, current, target);
    }

    /// @notice Wake a dormant fox instantly (server relays REVIVAL item burn).
    function revive(uint256 tokenId) external onlyGameServer {
        _requireOwned(tokenId);
        lastSuccessfulRunTimestamp[tokenId] = block.timestamp;
        emit Revived(tokenId, block.timestamp);
    }

    function setBaseURI(string calldata baseURI) external onlyOwner {
        _baseTokenURI = baseURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }
}
