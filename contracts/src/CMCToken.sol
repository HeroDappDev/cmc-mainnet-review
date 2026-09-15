// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @notice Fixed-supply CMC protocol token. There is no privileged mint path.
contract CMCToken is ERC20, ERC20Burnable {
    uint256 public constant INITIAL_SUPPLY = 100_000_000 ether;

    constructor(address initialHolder) ERC20("Commodity Market Capital", "CMC") {
        require(initialHolder != address(0), "CMC: zero holder");
        _mint(initialHolder, INITIAL_SUPPLY);
    }
}