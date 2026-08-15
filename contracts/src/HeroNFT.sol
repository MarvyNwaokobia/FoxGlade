// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {AuthorizedGame} from "./auth/AuthorizedGame.sol";

/// @title HeroNFT
/// @notice The onboarding character pick, made permanent. Minted once when a
///         player confirms their hero at onboarding — same "player mints
///         their own, server may mint on their behalf" shape as PetNFT's
///         egg (§11). `heroId` is a small roster index (0 = The Outlier,
///         the only hero for now — see foxglade-onboarding-roster); more
///         slots arrive from the Marketplace later without touching this
///         contract. UUPS-upgradeable (DESIGN.md §14.9).
contract HeroNFT is ERC721Upgradeable, AuthorizedGame {
    uint256 private _nextId;
    string private _baseTokenURI;

    mapping(uint256 => uint8) public heroIdOf;

    event HeroMinted(address indexed player, uint256 indexed tokenId, uint8 heroId);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, address initialGameServer, string memory baseURI)
        external
        initializer
    {
        __ERC721_init("Foxglade Hero", "HERO");
        __AuthorizedGame_init(initialOwner, initialGameServer);
        _baseTokenURI = baseURI;
        _nextId = 1;
    }

    /// @notice Onboarding mint. `heroId` is the roster slot chosen.
    function mintHero(address player, uint8 heroId) external returns (uint256 tokenId) {
        require(msg.sender == player || msg.sender == gameServer, "unauthorized");
        tokenId = _nextId++;
        heroIdOf[tokenId] = heroId;
        _safeMint(player, tokenId);
        emit HeroMinted(player, tokenId, heroId);
    }

    function setBaseURI(string calldata baseURI) external onlyOwner {
        _baseTokenURI = baseURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }
}
