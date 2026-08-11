// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PetNFT} from "../src/PetNFT.sol";

contract PetNFTTest is Test {
    PetNFT fox;
    address owner = address(0xA11CE);
    address server = address(0x5E12E1);
    address player = address(0xB0B);
    uint256 tokenId;

    function setUp() public {
        PetNFT impl = new PetNFT();
        fox = PetNFT(
            address(new ERC1967Proxy(address(impl), abi.encodeCall(PetNFT.initialize, (owner, server, "ipfs://fox/"))))
        );
        vm.prank(player);
        tokenId = fox.mintEgg(player);
    }

    function test_FullHealthDuringGrace() public {
        assertEq(fox.currentHealth(tokenId), fox.MAX_HEALTH());
        vm.warp(block.timestamp + 24 hours);
        assertEq(fox.currentHealth(tokenId), fox.MAX_HEALTH());
    }

    function test_DecaysToZeroAt48h() public {
        vm.warp(block.timestamp + 48 hours);
        assertEq(fox.currentHealth(tokenId), 0);
        assertTrue(fox.isDormant(tokenId));
    }

    function test_EaseInMidpointIsAboveLinear() public {
        // At hour 36 (midpoint) the quadratic ease-in leaves 75% health,
        // strictly above the 50% a linear curve would give — the busy-two-days
        // forgiveness from DESIGN.md §12.
        vm.warp(block.timestamp + 36 hours);
        assertEq(fox.currentHealth(tokenId), 7500);
    }

    function test_RecordRunResetsDecay() public {
        vm.warp(block.timestamp + 40 hours);
        assertLt(fox.currentHealth(tokenId), fox.MAX_HEALTH());
        vm.prank(server);
        fox.recordRun(tokenId);
        assertEq(fox.currentHealth(tokenId), fox.MAX_HEALTH());
    }

    function test_EvolveForwardOnly() public {
        vm.prank(server);
        fox.evolve(tokenId, PetNFT.Stage.Juvenile);
        assertEq(uint8(fox.stageOf(tokenId)), uint8(PetNFT.Stage.Juvenile));

        vm.expectRevert(); // NotForward
        vm.prank(server);
        fox.evolve(tokenId, PetNFT.Stage.Baby);
    }

    function test_ReviveWakesDormantFox() public {
        vm.warp(block.timestamp + 50 hours);
        assertTrue(fox.isDormant(tokenId));
        vm.prank(server);
        fox.revive(tokenId);
        assertFalse(fox.isDormant(tokenId));
    }
}
