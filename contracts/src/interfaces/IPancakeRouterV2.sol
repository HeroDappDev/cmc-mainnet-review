// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice PancakeSwap V2 router subset. This foundation intentionally does not
/// call it while migration remains disabled pending economics approval.
interface IPancakeRouterV2 {
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);
}