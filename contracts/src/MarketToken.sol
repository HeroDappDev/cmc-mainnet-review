// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice A market has exactly one billion tokens, minted once to its launchpad.
contract MarketToken is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;

    address public immutable launchpad;
    string public metadataURI;

    constructor(
        string memory name_,
        string memory symbol_,
        string memory metadataURI_,
        address launchpad_
    ) ERC20(name_, symbol_) {
        require(launchpad_ != address(0), "MarketToken: zero launchpad");
        launchpad = launchpad_;
        metadataURI = metadataURI_;
        _mint(launchpad_, TOTAL_SUPPLY);
    }
}