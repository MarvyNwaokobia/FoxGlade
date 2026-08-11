// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {VilleToken} from "../src/VilleToken.sol";
import {TreasureNFT} from "../src/TreasureNFT.sol";
import {ArmoryItems} from "../src/ArmoryItems.sol";
import {PetNFT} from "../src/PetNFT.sol";
import {SeasonRewards} from "../src/SeasonRewards.sol";

/// @notice Deploys the full Foxglade contract set behind UUPS proxies
///         (DESIGN.md §14.9) and wires them together. Deploying straight to
///         mainnet, no testnet stop.
///         Usage:
///           forge script script/Deploy.s.sol --rpc-url avalanche --broadcast --verify
///         Requires PRIVATE_KEY and GAME_SERVER_ADDRESS in the environment.
///         Optional SAFE_ADDRESS: the admin/owner of every contract (rotates
///         gameServer, whitelists spenders, authorizes upgrades). If unset,
///         falls back to the deployer address — fine for a dry run, WRONG for
///         a real mainnet deploy (the deployer key would hold upgrade power).
///         DOUBLE-CHECK the deployer wallet balance and GAME_SERVER_ADDRESS
///         before running with --broadcast: this is real AVAX, irreversible.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address gameServer = vm.envAddress("GAME_SERVER_ADDRESS");
        address deployer = vm.addr(pk);
        address admin = vm.envOr("SAFE_ADDRESS", deployer);

        if (admin == deployer) {
            console2.log("WARNING: SAFE_ADDRESS not set - deployer holds owner/upgrade power");
        }

        vm.startBroadcast(pk);

        VilleToken villeImpl = new VilleToken();
        VilleToken ville = VilleToken(
            address(
                new ERC1967Proxy(
                    address(villeImpl), abi.encodeCall(VilleToken.initialize, (admin, gameServer))
                )
            )
        );

        TreasureNFT treasureImpl = new TreasureNFT();
        TreasureNFT treasure = TreasureNFT(
            address(
                new ERC1967Proxy(
                    address(treasureImpl),
                    abi.encodeCall(TreasureNFT.initialize, (admin, gameServer, "ipfs://treasure/"))
                )
            )
        );

        PetNFT foxImpl = new PetNFT();
        PetNFT fox = PetNFT(
            address(
                new ERC1967Proxy(
                    address(foxImpl), abi.encodeCall(PetNFT.initialize, (admin, gameServer, "ipfs://fox/"))
                )
            )
        );

        SeasonRewards rewardsImpl = new SeasonRewards();
        SeasonRewards rewards = SeasonRewards(
            payable(
                address(
                    new ERC1967Proxy(
                        address(rewardsImpl), abi.encodeCall(SeasonRewards.initialize, (admin, gameServer))
                    )
                )
            )
        );

        // Treasury receives the mirrored marketplace cut; admin (Safe) for v1.
        ArmoryItems armoryImpl = new ArmoryItems();
        ArmoryItems armory = ArmoryItems(
            address(
                new ERC1967Proxy(
                    address(armoryImpl),
                    abi.encodeCall(ArmoryItems.initialize, (admin, address(ville), admin, "ipfs://items/{id}.json"))
                )
            )
        );

        // Whitelist the marketplace as the only VILLE spender (enforces non-cash-out).
        // Only works here if admin == deployer (the broadcaster); once admin is the
        // Safe, run this call separately from the Safe itself.
        if (admin == deployer) {
            ville.setSpender(address(armory), true);
        } else {
            console2.log("REMINDER: call ville.setSpender(armory, true) from the Safe");
        }

        vm.stopBroadcast();

        console2.log("Admin/owner    ", admin);
        console2.log("VilleToken     (proxy)", address(ville));
        console2.log("  impl                ", address(villeImpl));
        console2.log("TreasureNFT    (proxy)", address(treasure));
        console2.log("  impl                ", address(treasureImpl));
        console2.log("PetNFT         (proxy)", address(fox));
        console2.log("  impl                ", address(foxImpl));
        console2.log("ArmoryItems    (proxy)", address(armory));
        console2.log("  impl                ", address(armoryImpl));
        console2.log("SeasonRewards  (proxy)", address(rewards));
        console2.log("  impl                ", address(rewardsImpl));
    }
}
