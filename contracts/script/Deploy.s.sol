// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VilleToken} from "../src/VilleToken.sol";
import {TreasureNFT} from "../src/TreasureNFT.sol";
import {ArmoryItems} from "../src/ArmoryItems.sol";
import {PetNFT} from "../src/PetNFT.sol";
import {SeasonRewards} from "../src/SeasonRewards.sol";

/// @notice Deploys the full Foxglade contract set and wires them together.
///         Usage:
///           forge script script/Deploy.s.sol --rpc-url fuji --broadcast --verify
///         Requires PRIVATE_KEY and GAME_SERVER_ADDRESS in the environment.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address gameServer = vm.envAddress("GAME_SERVER_ADDRESS");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        VilleToken ville = new VilleToken(deployer, gameServer);
        TreasureNFT treasure = new TreasureNFT(deployer, gameServer, "ipfs://treasure/");
        PetNFT fox = new PetNFT(deployer, gameServer, "ipfs://fox/");
        SeasonRewards rewards = new SeasonRewards(deployer, gameServer);

        // Treasury receives the mirrored marketplace cut; deployer for v1.
        ArmoryItems armory = new ArmoryItems(deployer, address(ville), deployer, "ipfs://items/{id}.json");

        // Whitelist the marketplace as the only VILLE spender (enforces non-cash-out).
        ville.setSpender(address(armory), true);

        vm.stopBroadcast();

        console2.log("VilleToken   ", address(ville));
        console2.log("TreasureNFT  ", address(treasure));
        console2.log("PetNFT       ", address(fox));
        console2.log("ArmoryItems  ", address(armory));
        console2.log("SeasonRewards", address(rewards));
    }
}
