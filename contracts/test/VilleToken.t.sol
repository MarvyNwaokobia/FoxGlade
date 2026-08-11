// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {VilleToken} from "../src/VilleToken.sol";

contract VilleTokenTest is Test {
    VilleToken ville;
    address owner = address(0xA11CE);
    address server = address(0x5E12E1);
    address player = address(0xB0B);
    address spender = address(0x5DE9DE1); // stand-in for the marketplace
    address stranger = address(0xDEAD);

    function setUp() public {
        VilleToken impl = new VilleToken();
        ville = VilleToken(
            address(new ERC1967Proxy(address(impl), abi.encodeCall(VilleToken.initialize, (owner, server))))
        );
        vm.prank(owner);
        ville.setSpender(spender, true);
    }

    function test_OnlyServerCanReward() public {
        vm.prank(server);
        ville.rewardTreasure(player, 100e18, 2);
        assertEq(ville.balanceOf(player), 100e18);
    }

    function test_RewardRevertsForNonServer() public {
        vm.expectRevert();
        vm.prank(stranger);
        ville.rewardTreasure(player, 100e18, 2);
    }

    function test_PlayerToPlayerTransferBlocked() public {
        vm.prank(server);
        ville.rewardTreasure(player, 100e18, 0);
        vm.expectRevert(); // TransfersRestricted
        vm.prank(player);
        ville.transfer(stranger, 1e18);
    }

    function test_TransferToWhitelistedSpenderAllowed() public {
        vm.prank(server);
        ville.rewardTreasure(player, 100e18, 0);
        vm.prank(player);
        ville.transfer(spender, 10e18);
        assertEq(ville.balanceOf(spender), 10e18);
    }

    function test_SpendBurnsFromPlayer() public {
        vm.prank(server);
        ville.rewardTreasure(player, 100e18, 0);
        vm.prank(spender);
        ville.spend(player, 40e18);
        assertEq(ville.balanceOf(player), 60e18);
        assertEq(ville.totalSupply(), 60e18);
    }

    function test_SpendRevertsForNonSpender() public {
        vm.prank(server);
        ville.rewardTreasure(player, 100e18, 0);
        vm.expectRevert(); // NotSpender
        vm.prank(stranger);
        ville.spend(player, 1e18);
    }
}
