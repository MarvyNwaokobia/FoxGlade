// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AuthorizedGame} from "./auth/AuthorizedGame.sol";

/// @title TreasureNFT
/// @notice Minted once per successful treasure pickup. Rarity tier is set by
///         how deep in the village the treasure spawned and feeds tournament
///         score weighting (DESIGN.md §7, §10 Layer 2).
contract TreasureNFT is ERC721, AuthorizedGame {
    enum Rarity {
        Common,
        Rare,
        Legendary
    }

    uint256 private _nextId = 1;
    string private _baseTokenURI;

    mapping(uint256 => Rarity) public rarityOf;

    event TreasureMinted(address indexed player, uint256 indexed tokenId, Rarity rarity);

    error InvalidRarity(uint256 tier);

    constructor(address initialOwner, address initialGameServer, string memory baseURI)
        ERC721("Foxglade Treasure", "TREASURE")
        AuthorizedGame(initialOwner, initialGameServer)
    {
        _baseTokenURI = baseURI;
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
