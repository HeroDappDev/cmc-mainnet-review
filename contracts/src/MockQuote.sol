// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice BSC testnet-only 18-decimal quote asset. It is not a stablecoin,
/// commodity claim, peg mechanism, or mainnet asset.
contract MockQuote is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 10_000 ether;
    uint256 public constant FAUCET_COOLDOWN = 1 days;

    mapping(address => uint256) public nextFaucetAt;

    error TestnetOnly();
    error FaucetCoolingDown(uint256 availableAt);

    constructor(address initialHolder, uint256 initialSupply) ERC20("CMC Test Quote", "tQUOTE") {
        if (block.chainid != 97) revert TestnetOnly();
        require(initialHolder != address(0), "MockQuote: zero holder");
        _mint(initialHolder, initialSupply);
    }

    function faucet() external {
        uint256 availableAt = nextFaucetAt[msg.sender];
        if (block.timestamp < availableAt) revert FaucetCoolingDown(availableAt);
        nextFaucetAt[msg.sender] = block.timestamp + FAUCET_COOLDOWN;
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}