// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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
///         UUPS-upgradeable (DESIGN.md §14.9). `ReentrancyGuardTransient` is
///         stateless (EIP-1153 transient storage) so it was safe to add to the
///         inheritance list in the v2 upgrade below — it inserts no storage slot.
contract ArmoryItems is ERC1155Upgradeable, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardTransient {
    // Consumables
    uint256 public constant GUN = 1;
    uint256 public constant AMMO = 2;
    uint256 public constant BOMB = 3;
    uint256 public constant REVIVAL = 4; // instantly wakes a dormant fox
    uint256 public constant STREAK_SHIELD = 5; // protects a daily streak from one missed day
    // Cosmetics start at 1000 (armor/weapon skins, egg patterns)
    uint256 public constant COSMETIC_BASE = 1000;

    IVilleToken public ville;
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

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, address villeToken, address treasury_, string memory uri_)
        external
        initializer
    {
        __ERC1155_init(uri_);
        __Ownable_init(initialOwner);
        ville = IVilleToken(villeToken);
        treasury = treasury_;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /// @notice Buy `qty` of `itemId`, paying in VilleToken (burned on spend).
    function buyItem(uint256 itemId, uint256 qty) external nonReentrant {
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

    // ═══════════════════════════════════════════════════════════════════════
    // v2 — gasless relayed purchases + player-to-player resale.
    //
    // New storage is appended AFTER every v1 slot above (poolCutBps) so this
    // upgrade is layout-safe: nothing existing is reordered, retyped, or
    // removed. Initialized via a `reinitializer(2)` call bundled into the same
    // Safe transaction as `upgradeToAndCall` (DESIGN.md §14.9).
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Trusted relay key allowed to submit a player's SIGNED purchase
    ///         intent (`buyItemFor`) and pay gas on their behalf. Deliberately
    ///         separate from `owner` (the Safe) — same operational shape as
    ///         `AuthorizedGame.gameServer` elsewhere (DESIGN.md §13.2), but not
    ///         literally that contract: changing ArmoryItems' inheritance chain
    ///         on a live upgrade would have reordered existing storage.
    address public relayer;

    /// @notice Replay protection for `buyItemFor` — each buyer's next valid nonce.
    mapping(address => uint256) public purchaseNonces;

    /// @dev Custody-held resale listing. The seller keeps the item (just grants
    ///      `setApprovalForAll`) until it sells — matches the non-custodial
    ///      pattern used elsewhere for player-owned assets.
    struct ResaleListing {
        address seller;
        uint256 itemId;
        uint256 qty;
        uint256 price; // total VILLE for the whole `qty`, buyer pays via ERC20 transferFrom
        bool active;
    }

    mapping(uint256 => ResaleListing) public resaleListings;
    uint256 public nextResaleId;

    /// @notice Platform cut on RESALE only (bps). Primary sales keep the full
    ///         price minus the existing pool cut; resale additionally funds
    ///         the platform since it's revenue ArmoryItems didn't originate.
    uint16 public resaleFeeBps;

    event RelayerUpdated(address indexed relayer);
    event ItemPurchasedFor(address indexed buyer, uint256 indexed itemId, uint256 qty, uint256 paid);
    event ResaleListed(uint256 indexed resaleId, address indexed seller, uint256 indexed itemId, uint256 qty, uint256 price);
    event ResaleCancelled(uint256 indexed resaleId);
    event ResalePurchased(
        uint256 indexed resaleId, address indexed buyer, address seller, uint256 itemId, uint256 qty, uint256 price, uint256 fee
    );
    event ResaleFeeUpdated(uint16 bps);

    error NotRelayer(address caller);
    error ExpiredSignature(uint256 deadline);
    error InvalidSignature();
    error ResaleNotActive();
    error NotSeller();
    error CannotBuyOwnListing();
    error InvalidPrice();
    error NotItemOwner();
    error MarketplaceNotApproved();
    error FeeTooHigh();

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer(msg.sender);
        _;
    }

    /// @notice One-time v2 init. Bundle into the SAME Safe transaction as the
    ///         upgrade itself:
    ///         `upgradeToAndCall(newImpl, abi.encodeCall(ArmoryItems.initializeV2, (relayerAddr)))`.
    function initializeV2(address relayer_) external reinitializer(2) {
        relayer = relayer_;
        resaleFeeBps = 500; // 5%, matches the existing poolCutBps default
        emit RelayerUpdated(relayer_);
    }

    function setRelayer(address relayer_) external onlyOwner {
        relayer = relayer_;
        emit RelayerUpdated(relayer_);
    }

    function setResaleFeeBps(uint16 bps) external onlyOwner {
        if (bps > 2000) revert FeeTooHigh(); // capped at 20%
        resaleFeeBps = bps;
        emit ResaleFeeUpdated(bps);
    }

    // --- EIP-712 (computed on the fly — proxy-safe: uses address(this) at call
    //     time rather than an immutable baked in at the implementation's own
    //     deploy, which would be wrong once delegatecalled through the proxy) ---

    bytes32 private constant PURCHASE_TYPEHASH =
        keccak256("Purchase(address buyer,uint256 itemId,uint256 qty,uint256 nonce,uint256 deadline)");

    function _domainSeparator() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("FoxgladeArmory")),
                block.chainid,
                address(this)
            )
        );
    }

    /// @notice The nonce a signature for `buyer` must use right now — read this
    ///         client-side before building the typed-data message to sign.
    function nonceOf(address buyer) external view returns (uint256) {
        return purchaseNonces[buyer];
    }

    /// @notice Relay-submitted purchase on a player's off-chain signature. The
    ///         player never sends a transaction or needs AVAX for gas — only
    ///         `relayer` can call this, and it pays the gas (DESIGN.md §14.9).
    ///         Same spend/mint/pool-cut mechanics as `buyItem`, just authorized
    ///         by a signature instead of `msg.sender`.
    function buyItemFor(address buyer, uint256 itemId, uint256 qty, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        onlyRelayer
        nonReentrant
    {
        if (block.timestamp > deadline) revert ExpiredSignature(deadline);
        if (qty == 0) revert ZeroQuantity();
        uint256 unit = priceOf[itemId];
        if (unit == 0) revert NotForSale(itemId);

        uint256 nonce = purchaseNonces[buyer]++;
        bytes32 structHash = keccak256(abi.encode(PURCHASE_TYPEHASH, buyer, itemId, qty, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0) || signer != buyer) revert InvalidSignature();

        uint256 total = unit * qty;
        ville.spend(buyer, total);
        _mint(buyer, itemId, qty, "");

        uint256 cut = (total * poolCutBps) / 10_000;
        emit ItemPurchasedFor(buyer, itemId, qty, total);
        emit PoolContribution(itemId, cut);
    }

    // --- Player-to-player resale (both sides are direct, player-paid
    //     transactions — Marvy's call: real gas for a real secondary market,
    //     kept OUT of the sponsored/gasless primary-purchase path). VILLE moves
    //     seller-ward as a genuine ERC20 transfer, not a burn+re-mint, so this
    //     needs no changes to VilleToken's non-cash-out transfer restriction:
    //     both hops (buyer->ArmoryItems, ArmoryItems->seller) touch a
    //     whitelisted spender, which VilleToken._update already allows. ---

    /// @notice List owned item(s) for resale. Requires a prior
    ///         `setApprovalForAll(armoryItems, true)` on this contract — the
    ///         seller keeps custody until the sale executes.
    function listForResale(uint256 itemId, uint256 qty, uint256 price) external returns (uint256 resaleId) {
        if (qty == 0) revert ZeroQuantity();
        if (price == 0) revert InvalidPrice();
        if (balanceOf(msg.sender, itemId) < qty) revert NotItemOwner();
        if (!isApprovedForAll(msg.sender, address(this))) revert MarketplaceNotApproved();

        resaleId = nextResaleId++;
        resaleListings[resaleId] =
            ResaleListing({seller: msg.sender, itemId: itemId, qty: qty, price: price, active: true});
        emit ResaleListed(resaleId, msg.sender, itemId, qty, price);
    }

    /// @notice Cancel your own active resale listing.
    function cancelResale(uint256 resaleId) external {
        ResaleListing storage l = resaleListings[resaleId];
        if (!l.active) revert ResaleNotActive();
        if (l.seller != msg.sender) revert NotSeller();
        l.active = false;
        emit ResaleCancelled(resaleId);
    }

    /// @notice Buy a resale listing. Requires a prior VILLE `approve(armoryItems,
    ///         price)` from the buyer (standard ERC20 allowance) — a real,
    ///         player-paid transaction on both sides of this trade.
    function buyResale(uint256 resaleId) external nonReentrant {
        ResaleListing storage l = resaleListings[resaleId];
        if (!l.active) revert ResaleNotActive();
        if (msg.sender == l.seller) revert CannotBuyOwnListing();

        address seller = l.seller;
        uint256 itemId = l.itemId;
        uint256 qty = l.qty;
        uint256 price = l.price;

        // Effects before interactions.
        l.active = false;

        // The seller may have moved or de-approved the item since listing.
        if (balanceOf(seller, itemId) < qty) revert NotItemOwner();

        IERC20 villeErc20 = IERC20(address(ville));
        villeErc20.transferFrom(msg.sender, address(this), price);
        uint256 fee = (price * resaleFeeBps) / 10_000;
        uint256 toSeller = price - fee;
        if (toSeller > 0) villeErc20.transfer(seller, toSeller);
        // `fee` stays in this contract's VILLE balance until swept — see withdrawVille.

        _safeTransferFrom(seller, msg.sender, itemId, qty, "");
        emit ResalePurchased(resaleId, msg.sender, seller, itemId, qty, price, fee);
    }

    /// @notice Sweep accumulated resale fees out to `to` (the treasury, typically).
    function withdrawVille(address to, uint256 amount) external onlyOwner {
        IERC20(address(ville)).transfer(to, amount);
    }
}
