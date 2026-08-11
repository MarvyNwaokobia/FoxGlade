// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {AuthorizedGame} from "./auth/AuthorizedGame.sol";

/// @title TreasureNFT
/// @notice Minted once per successful treasure pickup. Rarity tier is set by
///         how deep in the village the treasure spawned and feeds tournament
///         score weighting (DESIGN.md §7, §10 Layer 2).
/// @dev    UUPS-upgradeable (DESIGN.md §14.9).
contract TreasureNFT is ERC721Upgradeable, AuthorizedGame {
    enum Rarity {
        Common,
        Rare,
        Legendary
    }

    uint256 private _nextId;
    string private _baseTokenURI;

    mapping(uint256 => Rarity) public rarityOf;

    event TreasureMinted(address indexed player, uint256 indexed tokenId, Rarity rarity);

    error InvalidRarity(uint256 tier);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, address initialGameServer, string memory baseURI)
        external
        initializer
    {
        __ERC721_init("Foxglade Treasure", "TREASURE");
        __AuthorizedGame_init(initialOwner, initialGameServer);
        _baseTokenURI = baseURI;
        _nextId = 1;
    }

    /// @notice Mint a treasure to `player`. `rarityTier` is 0/1/2 (see Rarity).
    function mintTreasure(address player, uint256 rarityTier)
        external
        onlyGameServer
        returns (uint256 tokenId)
    {
        if (rarityTier > uint256(Rarity.Legendary)) revert InvalidRarity(rarityTier);
        tokenId = _nextId++;
        rarityOf[tokenId] = Rarity(rarityTier);
        _safeMint(player, tokenId);
        emit TreasureMinted(player, tokenId, Rarity(rarityTier));
    }

    function setBaseURI(string calldata baseURI) external onlyOwner {
        _baseTokenURI = baseURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }
}
