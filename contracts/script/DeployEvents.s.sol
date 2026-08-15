// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {GameEvents} from "../src/GameEvents.sol";
import {HeroNFT} from "../src/HeroNFT.sol";

/// @notice Additive deploy for GameEvents + HeroNFT, alongside the already-live
///         v1 contract set (Deploy.s.sol). Same admin (Safe) / gameServer as
///         everything else — see DESIGN.md §14.9.
///         Usage:
///           forge script script/DeployEvents.s.sol --rpc-url avalanche --broadcast
///         Requires PRIVATE_KEY and GAME_SERVER_ADDRESS in the environment.
///         Optional SAFE_ADDRESS: falls back to the deployer address if unset
///         (fine for a dry run, WRONG for a real mainnet deploy).
contract DeployEvents is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address gameServer = vm.envAddress("GAME_SERVER_ADDRESS");
        address deployer = vm.addr(pk);
        address admin = vm.envOr("SAFE_ADDRESS", deployer);

        if (admin == deployer) {
            console2.log("WARNING: SAFE_ADDRESS not set - deployer holds owner/upgrade power");
        }

        vm.startBroadcast(pk);

        GameEvents eventsImpl = new GameEvents();
        GameEvents events = GameEvents(
            address(
                new ERC1967Proxy(address(eventsImpl), abi.encodeCall(GameEvents.initialize, (admin, gameServer)))
            )
        );

        HeroNFT heroImpl = new HeroNFT();
        HeroNFT hero = HeroNFT(
            address(
                new ERC1967Proxy(
                    address(heroImpl), abi.encodeCall(HeroNFT.initialize, (admin, gameServer, "ipfs://hero/"))
                )
            )
        );

        vm.stopBroadcast();

        console2.log("Admin/owner    ", admin);
        console2.log("GameEvents     (proxy)", address(events));
        console2.log("  impl                ", address(eventsImpl));
        console2.log("HeroNFT        (proxy)", address(hero));
        console2.log("  impl                ", address(heroImpl));
    }
}
