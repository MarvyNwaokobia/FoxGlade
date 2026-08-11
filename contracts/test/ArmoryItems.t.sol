// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {VilleToken} from "../src/VilleToken.sol";
import {ArmoryItems} from "../src/ArmoryItems.sol";

contract ArmoryItemsTest is Test {
    VilleToken ville;
    ArmoryItems armory;

    address owner = address(0xA11CE);
    address server = address(0x5E12E1);
    address relayer = address(0x2E1A4E2);
    address treasury = address(0x72EA5);

    uint256 buyerPk = 0xB0B;
    address buyer = vm.addr(0xB0B);
    uint256 sellerPk = 0x5E11E2;
    address seller = vm.addr(0x5E11E2);
    address stranger = address(0xDEAD);

    uint256 constant ITEM_1 = 111;
    uint256 constant PRICE_1 = 100e18;

    bytes32 constant PURCHASE_TYPEHASH =
        keccak256("Purchase(address buyer,uint256 itemId,uint256 qty,uint256 nonce,uint256 deadline)");

    function setUp() public {
        VilleToken villeImpl = new VilleToken();
        ville = VilleToken(
            address(new ERC1967Proxy(address(villeImpl), abi.encodeCall(VilleToken.initialize, (owner, server))))
        );

        ArmoryItems armoryImpl = new ArmoryItems();
        armory = ArmoryItems(
            address(
                new ERC1967Proxy(
                    address(armoryImpl),
                    abi.encodeCall(ArmoryItems.initialize, (owner, address(ville), treasury, "ipfs://items/{id}.json"))
                )
            )
        );

        vm.startPrank(owner);
        ville.setSpender(address(armory), true);
        armory.upgradeToAndCall(address(armoryImpl), abi.encodeCall(ArmoryItems.initializeV2, (relayer)));
        armory.setPrice(ITEM_1, PRICE_1);
        vm.stopPrank();

        vm.prank(server);
        ville.rewardTreasure(buyer, 1000e18, 0);
        vm.prank(server);
        ville.rewardTreasure(seller, 1000e18, 0);
    }

    // --- v1 buyItem still works after the v2 upgrade ---

    function test_BuyItemStillWorks() public {
        vm.prank(buyer);
        armory.buyItem(ITEM_1, 1);
        assertEq(armory.balanceOf(buyer, ITEM_1), 1);
        assertEq(ville.balanceOf(buyer), 900e18);
    }

    // --- buyItemFor (relayed, signature-authorized) ---

    function _sign(uint256 pk, address buyer_, uint256 itemId, uint256 qty, uint256 nonce, uint256 deadline)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("FoxgladeArmory")),
                block.chainid,
                address(armory)
            )
        );
        bytes32 structHash = keccak256(abi.encode(PURCHASE_TYPEHASH, buyer_, itemId, qty, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (v, r, s) = vm.sign(pk, digest);
    }

    function test_BuyItemForWithValidSignature() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign(buyerPk, buyer, ITEM_1, 1, 0, deadline);

        vm.prank(relayer);
        armory.buyItemFor(buyer, ITEM_1, 1, deadline, v, r, s);

        assertEq(armory.balanceOf(buyer, ITEM_1), 1);
        assertEq(ville.balanceOf(buyer), 900e18);
        assertEq(armory.purchaseNonces(buyer), 1);
    }

    function test_BuyItemForRevertsForNonRelayer() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign(buyerPk, buyer, ITEM_1, 1, 0, deadline);

        vm.expectRevert();
        vm.prank(stranger);
        armory.buyItemFor(buyer, ITEM_1, 1, deadline, v, r, s);
    }

    function test_BuyItemForRevertsOnWrongSigner() public {
        uint256 deadline = block.timestamp + 1 hours;
        // Signed by `seller`, but claiming to be `buyer` — signature won't recover to buyer.
        (uint8 v, bytes32 r, bytes32 s) = _sign(sellerPk, buyer, ITEM_1, 1, 0, deadline);

        vm.expectRevert(); // InvalidSignature
        vm.prank(relayer);
        armory.buyItemFor(buyer, ITEM_1, 1, deadline, v, r, s);
    }

    function test_BuyItemForRevertsOnReplay() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign(buyerPk, buyer, ITEM_1, 1, 0, deadline);

        vm.prank(relayer);
        armory.buyItemFor(buyer, ITEM_1, 1, deadline, v, r, s);

        // Same signature (same nonce=0) replayed — nonce has already advanced to 1.
        vm.expectRevert(); // InvalidSignature (signer recovers wrong because nonce moved)
        vm.prank(relayer);
        armory.buyItemFor(buyer, ITEM_1, 1, deadline, v, r, s);
    }

    function test_BuyItemForRevertsOnExpiredDeadline() public {
        uint256 deadline = block.timestamp + 1;
        (uint8 v, bytes32 r, bytes32 s) = _sign(buyerPk, buyer, ITEM_1, 1, 0, deadline);
        vm.warp(block.timestamp + 2);

        vm.expectRevert(); // ExpiredSignature
        vm.prank(relayer);
        armory.buyItemFor(buyer, ITEM_1, 1, deadline, v, r, s);
    }

    // --- Resale: list, cancel, buy ---

    function _giveSellerAnItem() internal {
        vm.prank(seller);
        armory.buyItem(ITEM_1, 1);
    }

    function test_ListCancelResale() public {
        _giveSellerAnItem();
        vm.startPrank(seller);
        armory.setApprovalForAll(address(armory), true);
        uint256 resaleId = armory.listForResale(ITEM_1, 1, 50e18);
        armory.cancelResale(resaleId);
        vm.stopPrank();

        (,,,, bool active) = armory.resaleListings(resaleId);
        assertFalse(active);
    }

    function test_ListRevertsWithoutApproval() public {
        _giveSellerAnItem();
        vm.expectRevert(); // MarketplaceNotApproved
        vm.prank(seller);
        armory.listForResale(ITEM_1, 1, 50e18);
    }

    function test_BuyResaleTransfersItemAndSplitsPayment() public {
        _giveSellerAnItem();
        vm.startPrank(seller);
        armory.setApprovalForAll(address(armory), true);
        uint256 resaleId = armory.listForResale(ITEM_1, 1, 50e18);
        vm.stopPrank();

        vm.prank(buyer);
        ville.approve(address(armory), 50e18);

        uint256 sellerBalBefore = ville.balanceOf(seller);
        vm.prank(buyer);
        armory.buyResale(resaleId);

        assertEq(armory.balanceOf(buyer, ITEM_1), 1);
        assertEq(armory.balanceOf(seller, ITEM_1), 0);
        // 5% default resale fee: seller nets 47.5 VILLE, ArmoryItems keeps 2.5.
        assertEq(ville.balanceOf(seller), sellerBalBefore + 47.5e18);
        assertEq(ville.balanceOf(address(armory)), 2.5e18);
    }

    function test_CannotBuyOwnListing() public {
        _giveSellerAnItem();
        vm.startPrank(seller);
        armory.setApprovalForAll(address(armory), true);
        uint256 resaleId = armory.listForResale(ITEM_1, 1, 50e18);
        ville.approve(address(armory), 50e18);
        vm.expectRevert(); // CannotBuyOwnListing
        armory.buyResale(resaleId);
        vm.stopPrank();
    }

    function test_WithdrawVilleSweepsFees() public {
        _giveSellerAnItem();
        vm.startPrank(seller);
        armory.setApprovalForAll(address(armory), true);
        uint256 resaleId = armory.listForResale(ITEM_1, 1, 50e18);
        vm.stopPrank();
        vm.prank(buyer);
        ville.approve(address(armory), 50e18);
        vm.prank(buyer);
        armory.buyResale(resaleId);

        vm.prank(owner);
        armory.withdrawVille(treasury, 2.5e18);
        assertEq(ville.balanceOf(treasury), 2.5e18);
        assertEq(ville.balanceOf(address(armory)), 0);
    }
}
