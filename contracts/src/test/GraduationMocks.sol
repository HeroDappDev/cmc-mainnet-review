// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract TestQuote is ERC20 {
    constructor(address recipient, uint256 amount) ERC20("Local quote", "LQ") {
        _mint(recipient, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }
}

contract FeeOnTransferTestQuote is TestQuote {
    constructor(address recipient, uint256 amount) TestQuote(recipient, amount) {}

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            super._update(from, address(0x0000000000000000000000000000000000000001), 1);
            super._update(from, to, value - 1);
        } else {
            super._update(from, to, value);
        }
    }
}

contract TestV2Pair is ERC20 {
    address public immutable token0;
    address public immutable token1;
    uint112 private _reserve0;
    uint112 private _reserve1;

    constructor(address token0_, address token1_) ERC20("Local V2 LP", "LV2LP") {
        token0 = token0_;
        token1 = token1_;
    }

    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) {
        return (_reserve0, _reserve1, uint32(block.timestamp));
    }

    function mint(address to) external returns (uint256 liquidity) {
        require(totalSupply() == 0, "already initialized");
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        liquidity = Math.sqrt(balance0 * balance1) - 1_000;
        _mint(address(1), 1_000);
        _mint(to, liquidity);
        _reserve0 = uint112(balance0);
        _reserve1 = uint112(balance1);
    }

    function sync() external {
        _reserve0 = uint112(IERC20(token0).balanceOf(address(this)));
        _reserve1 = uint112(IERC20(token1).balanceOf(address(this)));
    }
}

contract TestV2Factory {
    mapping(address => mapping(address => address)) private _pairs;

    function getPair(address tokenA, address tokenB) external view returns (address pair) {
        return _pairs[tokenA][tokenB];
    }

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB && tokenA != address(0) && tokenB != address(0), "bad pair");
        require(_pairs[tokenA][tokenB] == address(0), "exists");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        pair = address(new TestV2Pair(token0, token1));
        _pairs[tokenA][tokenB] = pair;
        _pairs[tokenB][tokenA] = pair;
    }
}

contract TestV2Router {
    address public immutable factory;

    constructor(address factory_) {
        factory = factory_;
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) public virtual returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        require(deadline >= block.timestamp, "expired");
        require(amountADesired >= amountAMin && amountBDesired >= amountBMin, "minimum");
        address pair = TestV2Factory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) pair = TestV2Factory(factory).createPair(tokenA, tokenB);
        IERC20(tokenA).transferFrom(msg.sender, pair, amountADesired);
        IERC20(tokenB).transferFrom(msg.sender, pair, amountBDesired);
        liquidity = TestV2Pair(pair).mint(to);
        return (amountADesired, amountBDesired, liquidity);
    }
}

/// @dev Deliberately lies after consuming approvals; the candidate must revert
/// atomically rather than accepting the router's reported amounts.
contract LyingTestV2Router is TestV2Router {
    constructor(address factory_) TestV2Router(factory_) {}

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) public override returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        super.addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, to, deadline);
        return (amountADesired - 1, amountBDesired, 1);
    }
}