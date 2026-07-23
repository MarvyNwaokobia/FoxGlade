// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IVilleToken {
    function spend(address player, uint256 amount) external;
}

/// @title ArmoryItems
/// @notice The marketplace. Sells consumables and cosmetics priced in VilleToken.
///         A configurable cut of every purchase is signalled as revenue for the
///         monthly prize pool (DESIGN.md §7, §10 Layer 2).
/// @dev    Purchases burn VILLE via `VilleToken.spend` (the sink). VILLE is soft
///         currency and NOT convertible on-chain; the `poolCutBps` portion is
///         emitted as `PoolContribution` so the treasury can mirror the observed
///         revenue into the real AVAX/stablecoin pool. See §13.1 for why the
///         soft-currency-cut vs. real-payout gap is bridged off-chain in v1.
///         Cosmetics modelled as fungible 1155 ids is a known v1 simplification
///         (§13.8) — split into a dedicated contract if per-item uniqueness matters.
contract ArmoryItems is ERC1155, Ownable {
    // Consumables
    uint256 public constant GUN = 1;
    uint256 public constant AMMO = 2;
    uint256 public constant BOMB = 3;
    uint256 public constant REVIVAL = 4; // instantly wakes a dormant fox
    uint256 public constant STREAK_SHIELD = 5; // protects a daily streak from one missed day
    // Cosmetics start at 1000 (armor/weapon skins, egg patterns)
    uint256 public constant COSMETIC_BASE = 1000;

    IVilleToken public immutable ville;
    address public treasury;

    /// @notice Price in VILLE per item id (0 = not for sale).
    mapping(uint256 => uint256) public priceOf;

    /// @notice Basis points of each purchase counted toward the prize pool.
    uint16 public poolCutBps = 500; // 5%

    event PriceSet(uint256 indexed itemId, uint256 price);
    event ItemPurchased(address indexed buyer, uint256 indexed itemId, uint256 qty, uint256 paid);
    event PoolContribution(uint256 indexed itemId, uint256 cutAmount);
    event PoolCutUpdated(uint16 bps);
    event TreasuryUpdated(address indexed treasury);

    error NotForSale(uint256 itemId);
    error ZeroQuantity();
    error CutTooHigh(uint16 bps);

    constructor(address initialOwner, address villeToken, address treasury_, string memory uri_)
        ERC1155(uri_)
        Ownable(initialOwner)
    {
        ville = IVilleToken(villeToken);
        treasury = treasury_;
    }

    /// @notice Buy `qty` of `itemId`, paying in VilleToken (burned on spend).
    function buyItem(uint256 itemId, uint256 qty) external {
        if (qty == 0) revert ZeroQuantity();
        uint256 unit = priceOf[itemId];
        if (unit == 0) revert NotForSale(itemId);

        uint256 total = unit * qty;
        ville.spend(msg.sender, total);
        _mint(msg.sender, itemId, qty, "");

        uint256 cut = (total * poolCutBps) / 10_000;
        emit ItemPurchased(msg.sender, itemId, qty, total);
        emit PoolContribution(itemId, cut);
    }

    // --- Admin ---

    function setPrice(uint256 itemId, uint256 price) external onlyOwner {
        priceOf[itemId] = price;
        emit PriceSet(itemId, price);
    }

    function setPoolCutBps(uint16 bps) external onlyOwner {
        if (bps > 10_000) revert CutTooHigh(bps);
        poolCutBps = bps;
        emit PoolCutUpdated(bps);
    }

    function setTreasury(address treasury_) external onlyOwner {
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setURI(string calldata uri_) external onlyOwner {
        _setURI(uri_);
    }
}
