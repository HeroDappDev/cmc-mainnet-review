// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MarketToken} from "./MarketToken.sol";

interface ITestOnlyV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

interface ITestOnlyV2Router {
    function factory() external view returns (address);

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

interface ITestOnlyV2Pair is IERC20 {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
}

/// @notice Local-test candidate for explicitly selected Option D only.
/// @dev This is deliberately separate from Launchpad, which remains permanently
/// non-migrating. It accepts only local Hardhat chain 31337 and distinctly rejects
/// BSC mainnet (chain 56) at construction and execution. It has no fee-release,
/// governance, surplus-sweep, deployment, or administrator recovery path.
contract TestOnlyOptionDGraduation is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant USD_SCALE = 1e18;
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant CURVE_SUPPLY = 800_000_000 ether;
    uint256 public constant RESERVE_SUPPLY = 200_000_000 ether;
    uint256 public constant OPEN_MCAP_USD = 5_000 ether;
    uint256 public constant TERMINAL_MCAP_USD = 80_000 ether;
    uint256 public constant MAX_FEE_BPS = 300;
    uint256 public constant MAX_GRADUATION_DEADLINE = 10 minutes;
    uint256 public constant REDEMPTION_DELAY = 1 days;
    uint256 public constant LOCAL_CHAIN_ID = 31_337;
    address public constant LP_BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    ITestOnlyV2Router public immutable router;
    ITestOnlyV2Factory public immutable factory;

    struct Market {
        address quote;
        uint16 feeBps;
        bool curveComplete;
        bool graduated;
        bool redemptionActive;
        uint256 frozenQuoteUsd;
        uint256 virtualToken;
        uint256 virtualQuote;
        uint256 curveTokensLeft;
        uint256 quoteRaised;
        uint256 holderFees;
        uint256 buybackFees;
        uint256 treasuryFees;
        uint256 redemptionAvailableAt;
        uint256 remainingClaims;
        uint256 remainingQuote;
    }

    mapping(address => Market) private _markets;
    mapping(address => uint256) public quoteLiability;

    error MainnetRefused();
    error NonLocalChainRefused(uint256 chainId);
    error InvalidAddress();
    error InvalidAmount();
    error InvalidFee();
    error DeadlineExpired();
    error GraduationDeadlineTooFar();
    error UnknownMarket(address token);
    error CurveClosed(address token);
    error NotPendingGraduation(address token);
    error RedemptionNotAvailable(uint256 availableAt);
    error RedemptionNotActive(address token);
    error InvalidMinimum();
    error ExactTransferRequired(address asset, uint256 expected, uint256 actual);
    error InsufficientAggregateCustody(address quote, uint256 balance, uint256 liability);
    error ExistingOrDonatedPair(address pair);
    error InvalidRouterFactory();
    error InvalidPair(address pair);
    error PairReserveMismatch(uint256 tokenReserve, uint256 quoteReserve);
    error LpMintMismatch(uint256 expected, uint256 actual);
    error ZeroOutput();

    event MarketCreated(address indexed token, address indexed quote, uint16 feeBps, uint256 frozenQuoteUsd);
    event Trade(
        address indexed token,
        address indexed trader,
        bool indexed isBuy,
        uint256 tokenAmount,
        uint256 grossQuoteAmount,
        uint256 curveQuoteAmount,
        uint256 feeAmount,
        uint256 refundAmount
    );
    event PendingGraduation(
        address indexed token,
        uint256 curveProceeds,
        uint256 holderFees,
        uint256 buybackFees,
        uint256 treasuryFees,
        uint256 redemptionAvailableAt
    );
    event Graduated(
        address indexed token,
        address indexed quote,
        address indexed pair,
        uint256 tokenAmount,
        uint256 quoteAmount,
        uint256 liquidityBurned
    );
    event RedemptionActivated(address indexed token, uint256 remainingClaims, uint256 remainingQuote);
    event Redeemed(address indexed token, address indexed holder, uint256 tokenAmount, uint256 quoteAmount);

    constructor(address router_) {
        _requireLocalChain();
        if (router_ == address(0) || router_.code.length == 0) revert InvalidAddress();
        router = ITestOnlyV2Router(router_);
        address factory_ = router.factory();
        if (factory_ == address(0) || factory_.code.length == 0) revert InvalidRouterFactory();
        factory = ITestOnlyV2Factory(factory_);
    }

    function marketOf(address token) external view returns (Market memory) {
        return _market(token);
    }

    /// @notice Creates a local market with a caller-supplied frozen test reference.
    /// @dev No quote or oracle is approved by this test-only helper.
    function createMarket(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        address quote,
        uint256 quoteUsd,
        uint16 feeBps,
        uint256 firstBuyGross,
        uint256 minTokenOut,
        uint256 deadline
    ) external nonReentrant returns (address token) {
        _requireLocalChain();
        _checkDeadline(deadline);
        if (quote == address(0) || quote.code.length == 0 || quoteUsd == 0) revert InvalidAddress();
        if (IERC20Metadata(quote).decimals() != 18) revert InvalidAmount();
        if (feeBps == 0 || feeBps > MAX_FEE_BPS || firstBuyGross == 0) revert InvalidFee();

        (uint256 virtualToken, uint256 virtualQuote) = _initialVirtualReserves(quoteUsd);
        token = address(new MarketToken(name, symbol, metadataURI, address(this)));
        _markets[token] = Market({
            quote: quote,
            feeBps: feeBps,
            curveComplete: false,
            graduated: false,
            redemptionActive: false,
            frozenQuoteUsd: quoteUsd,
            virtualToken: virtualToken,
            virtualQuote: virtualQuote,
            curveTokensLeft: CURVE_SUPPLY,
            quoteRaised: 0,
            holderFees: 0,
            buybackFees: 0,
            treasuryFees: 0,
            redemptionAvailableAt: 0,
            remainingClaims: 0,
            remainingQuote: 0
        });
        emit MarketCreated(token, quote, feeBps, quoteUsd);
        _buy(token, msg.sender, firstBuyGross, minTokenOut);
    }

    function buy(address token, uint256 grossQuoteIn, uint256 minTokenOut, uint256 deadline) external nonReentrant {
        _requireLocalChain();
        _checkDeadline(deadline);
        _buy(token, msg.sender, grossQuoteIn, minTokenOut);
    }

    function sell(address token, uint256 tokenIn, uint256 minQuoteOut, uint256 deadline) external nonReentrant {
        _requireLocalChain();
        _checkDeadline(deadline);
        Market storage market = _activeMarket(token);
        if (tokenIn == 0 || tokenIn > CURVE_SUPPLY - market.curveTokensLeft) revert InvalidAmount();
        uint256 grossQuoteOut = Math.mulDiv(tokenIn, market.virtualQuote, market.virtualToken + tokenIn);
        if (grossQuoteOut == 0) revert ZeroOutput();
        uint256 fee = Math.mulDiv(grossQuoteOut, market.feeBps, BPS);
        uint256 userQuoteOut = grossQuoteOut - fee;
        if (userQuoteOut == 0 || userQuoteOut < minQuoteOut) revert InvalidMinimum();
        _assertCustody(market.quote);

        uint256 tokenBefore = IERC20(token).balanceOf(address(this));
        uint256 userQuoteBefore = IERC20(market.quote).balanceOf(msg.sender);
        uint256 quoteBefore = IERC20(market.quote).balanceOf(address(this));
        market.virtualToken += tokenIn;
        market.virtualQuote -= grossQuoteOut;
        market.curveTokensLeft += tokenIn;
        market.quoteRaised -= grossQuoteOut;
        _allocateFee(market, fee);
        quoteLiability[market.quote] -= userQuoteOut;

        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenIn);
        _requireExactIncrease(token, tokenBefore, tokenIn);
        IERC20(market.quote).safeTransfer(msg.sender, userQuoteOut);
        _requireExactDecrease(market.quote, quoteBefore, userQuoteOut);
        _requireExactIncreaseAt(market.quote, msg.sender, userQuoteBefore, userQuoteOut);
        _assertCustody(market.quote);
        emit Trade(token, msg.sender, false, tokenIn, grossQuoteOut, grossQuoteOut, fee, 0);
    }

    function quoteBuy(address token, uint256 grossQuoteIn)
        external
        view
        returns (uint256 tokenOut, uint256 grossConsumed, uint256 fee, uint256 refund)
    {
        return _buyAmounts(_activeMarketView(token), grossQuoteIn);
    }

    /// @notice Adds exactly 200M reserve tokens and all real curve proceeds.
    /// Fee buckets remain accounted in this contract and are intentionally unusable.
    /// A pre-created pair is rejected without state change. After the immutable
    /// timeout, anyone may irreversibly activate redemption instead of retrying.
    function graduate(
        address token,
        uint256 tokenAmountMin,
        uint256 quoteAmountMin,
        uint256 deadline
    ) external nonReentrant {
        _requireLocalChain();
        _checkGraduationDeadline(deadline);
        Market storage market = _market(token);
        if (!market.curveComplete || market.graduated || market.redemptionActive) revert NotPendingGraduation(token);
        uint256 quoteAmount = market.quoteRaised;
        if (quoteAmount == 0 || tokenAmountMin != RESERVE_SUPPLY || quoteAmountMin != quoteAmount) revert InvalidMinimum();
        _assertCustody(market.quote);
        if (factory.getPair(token, market.quote) != address(0)) revert ExistingOrDonatedPair(factory.getPair(token, market.quote));

        uint256 tokenBefore = IERC20(token).balanceOf(address(this));
        uint256 quoteBefore = IERC20(market.quote).balanceOf(address(this));
        if (tokenBefore < RESERVE_SUPPLY) revert InvalidAmount();
        IERC20(token).forceApprove(address(router), RESERVE_SUPPLY);
        IERC20(market.quote).forceApprove(address(router), quoteAmount);
        (uint256 usedToken, uint256 usedQuote, uint256 liquidity) = router.addLiquidity(
            token,
            market.quote,
            RESERVE_SUPPLY,
            quoteAmount,
            tokenAmountMin,
            quoteAmountMin,
            LP_BURN_ADDRESS,
            deadline
        );
        IERC20(token).forceApprove(address(router), 0);
        IERC20(market.quote).forceApprove(address(router), 0);
        if (usedToken != RESERVE_SUPPLY || usedQuote != quoteAmount || liquidity == 0) revert InvalidMinimum();
        _requireExactDecrease(token, tokenBefore, RESERVE_SUPPLY);
        _requireExactDecrease(market.quote, quoteBefore, quoteAmount);

        address pair = factory.getPair(token, market.quote);
        if (pair == address(0) || pair.code.length == 0) revert InvalidPair(pair);
        ITestOnlyV2Pair v2Pair = ITestOnlyV2Pair(pair);
        if (!((v2Pair.token0() == token && v2Pair.token1() == market.quote) || (v2Pair.token0() == market.quote && v2Pair.token1() == token))) {
            revert InvalidPair(pair);
        }
        (uint112 reserve0, uint112 reserve1,) = v2Pair.getReserves();
        uint256 tokenReserve = v2Pair.token0() == token ? reserve0 : reserve1;
        uint256 quoteReserve = v2Pair.token0() == market.quote ? reserve0 : reserve1;
        if (
            tokenReserve != RESERVE_SUPPLY || quoteReserve != quoteAmount
                || IERC20(token).balanceOf(pair) != RESERVE_SUPPLY || IERC20(market.quote).balanceOf(pair) != quoteAmount
        ) revert PairReserveMismatch(tokenReserve, quoteReserve);
        uint256 burnedLp = v2Pair.balanceOf(LP_BURN_ADDRESS);
        if (burnedLp != liquidity) revert LpMintMismatch(liquidity, burnedLp);

        market.graduated = true;
        quoteLiability[market.quote] -= quoteAmount;
        _assertCustody(market.quote);
        emit Graduated(token, market.quote, pair, RESERVE_SUPPLY, quoteAmount, liquidity);
    }

    /// @notice Permissionlessly and irreversibly chooses the local-only recovery
    /// path after a pending graduation timeout (for example, a poisoned pair).
    /// @dev No administrator can cancel it, sweep dust, or withdraw returned tokens.
    function activateRedemption(address token) external nonReentrant {
        _requireLocalChain();
        Market storage market = _market(token);
        if (!market.curveComplete || market.graduated || market.redemptionActive) revert NotPendingGraduation(token);
        if (block.timestamp < market.redemptionAvailableAt) revert RedemptionNotAvailable(market.redemptionAvailableAt);
        _assertCustody(market.quote);
        market.redemptionActive = true;
        market.remainingClaims = CURVE_SUPPLY;
        market.remainingQuote = market.quoteRaised;
        emit RedemptionActivated(token, market.remainingClaims, market.remainingQuote);
    }

    /// @notice Returns curve-distributed market tokens for floor pro-rata real
    /// proceeds. Reserve and returned tokens deliberately have no exit function.
    function redeem(address token, uint256 tokenAmount, uint256 minQuoteOut, uint256 deadline) external nonReentrant {
        _requireLocalChain();
        _checkDeadline(deadline);
        Market storage market = _market(token);
        if (!market.redemptionActive) revert RedemptionNotActive(token);
        if (tokenAmount == 0 || tokenAmount > market.remainingClaims) revert InvalidAmount();
        uint256 quoteAmount = Math.mulDiv(tokenAmount, market.remainingQuote, market.remainingClaims);
        if (quoteAmount == 0) revert ZeroOutput();
        if (quoteAmount < minQuoteOut) revert InvalidMinimum();
        _assertCustody(market.quote);

        uint256 tokenBefore = IERC20(token).balanceOf(address(this));
        uint256 quoteBefore = IERC20(market.quote).balanceOf(address(this));
        uint256 holderQuoteBefore = IERC20(market.quote).balanceOf(msg.sender);
        market.remainingClaims -= tokenAmount;
        market.remainingQuote -= quoteAmount;
        quoteLiability[market.quote] -= quoteAmount;
        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenAmount);
        _requireExactIncrease(token, tokenBefore, tokenAmount);
        IERC20(market.quote).safeTransfer(msg.sender, quoteAmount);
        _requireExactDecrease(market.quote, quoteBefore, quoteAmount);
        _requireExactIncreaseAt(market.quote, msg.sender, holderQuoteBefore, quoteAmount);
        _assertCustody(market.quote);
        emit Redeemed(token, msg.sender, tokenAmount, quoteAmount);
    }

    function _buy(address token, address buyer, uint256 grossQuoteIn, uint256 minTokenOut) internal {
        Market storage market = _activeMarket(token);
        (uint256 tokenOut, uint256 grossConsumed, uint256 fee, uint256 refund) = _buyAmounts(market, grossQuoteIn);
        if (tokenOut == 0) revert ZeroOutput();
        if (tokenOut < minTokenOut) revert InvalidMinimum();
        _assertCustody(market.quote);

        uint256 buyerQuoteBefore = IERC20(market.quote).balanceOf(buyer);
        uint256 quoteBefore = IERC20(market.quote).balanceOf(address(this));
        uint256 tokenBefore = IERC20(token).balanceOf(address(this));
        uint256 curveQuoteAmount = grossConsumed - fee;
        market.virtualToken -= tokenOut;
        market.virtualQuote += curveQuoteAmount;
        market.curveTokensLeft -= tokenOut;
        market.quoteRaised += curveQuoteAmount;
        _allocateFee(market, fee);
        quoteLiability[market.quote] += grossConsumed;

        IERC20(market.quote).safeTransferFrom(buyer, address(this), grossQuoteIn);
        if (refund != 0) IERC20(market.quote).safeTransfer(buyer, refund);
        _requireExactIncrease(market.quote, quoteBefore, grossConsumed);
        IERC20(token).safeTransfer(buyer, tokenOut);
        _requireExactDecrease(token, tokenBefore, tokenOut);
        _requireExactDecreaseAt(market.quote, buyer, buyerQuoteBefore, grossConsumed);
        _assertCustody(market.quote);
        emit Trade(token, buyer, true, tokenOut, grossConsumed, curveQuoteAmount, fee, refund);

        if (market.curveTokensLeft == 0) {
            market.curveComplete = true;
            market.redemptionAvailableAt = block.timestamp + REDEMPTION_DELAY;
            emit PendingGraduation(
                token,
                market.quoteRaised,
                market.holderFees,
                market.buybackFees,
                market.treasuryFees,
                market.redemptionAvailableAt
            );
        }
    }

    function _buyAmounts(Market memory market, uint256 grossQuoteIn)
        internal
        pure
        returns (uint256 tokenOut, uint256 grossConsumed, uint256 fee, uint256 refund)
    {
        if (grossQuoteIn == 0) revert InvalidAmount();
        fee = Math.mulDiv(grossQuoteIn, market.feeBps, BPS);
        uint256 netQuote = grossQuoteIn - fee;
        tokenOut = Math.mulDiv(netQuote, market.virtualToken, market.virtualQuote + netQuote);
        if (tokenOut < market.curveTokensLeft) return (tokenOut, grossQuoteIn, fee, 0);

        uint256 requiredNet = Math.mulDiv(
            market.curveTokensLeft,
            market.virtualQuote,
            market.virtualToken - market.curveTokensLeft,
            Math.Rounding.Ceil
        );
        // Exact minimum g such that g - floor(g * feeBps / BPS) >= requiredNet.
        grossConsumed = Math.mulDiv(requiredNet - 1, BPS, BPS - market.feeBps) + 1;
        if (grossConsumed > grossQuoteIn) {
            grossConsumed = grossQuoteIn;
            fee = Math.mulDiv(grossConsumed, market.feeBps, BPS);
            tokenOut = Math.mulDiv(grossConsumed - fee, market.virtualToken, market.virtualQuote + grossConsumed - fee);
            return (tokenOut, grossConsumed, fee, 0);
        }
        fee = Math.mulDiv(grossConsumed, market.feeBps, BPS);
        tokenOut = market.curveTokensLeft;
        refund = grossQuoteIn - grossConsumed;
    }

    function _initialVirtualReserves(uint256 quoteUsd) internal pure returns (uint256 virtualToken, uint256 virtualQuote) {
        uint256 sqrtRatio = Math.sqrt(Math.mulDiv(TERMINAL_MCAP_USD, USD_SCALE, OPEN_MCAP_USD) * USD_SCALE);
        virtualToken = Math.mulDiv(CURVE_SUPPLY, sqrtRatio, sqrtRatio - USD_SCALE, Math.Rounding.Ceil);
        uint256 initialUsdQuote = Math.mulDiv(virtualToken, OPEN_MCAP_USD, TOTAL_SUPPLY);
        virtualQuote = Math.mulDiv(initialUsdQuote, USD_SCALE, quoteUsd);
        if (virtualQuote == 0) revert InvalidAmount();
    }

    function _allocateFee(Market storage market, uint256 fee) internal {
        uint256 holderAmount = Math.mulDiv(fee, 4_000, BPS);
        uint256 buybackAmount = Math.mulDiv(fee, 3_000, BPS);
        market.holderFees += holderAmount;
        market.buybackFees += buybackAmount;
        market.treasuryFees += fee - holderAmount - buybackAmount;
    }

    function _requireExactIncrease(address asset, uint256 beforeBalance, uint256 expected) internal view {
        uint256 afterBalance = IERC20(asset).balanceOf(address(this));
        uint256 actual = afterBalance >= beforeBalance ? afterBalance - beforeBalance : 0;
        if (actual != expected) revert ExactTransferRequired(asset, expected, actual);
    }

    function _requireExactDecrease(address asset, uint256 beforeBalance, uint256 expected) internal view {
        uint256 afterBalance = IERC20(asset).balanceOf(address(this));
        uint256 actual = beforeBalance >= afterBalance ? beforeBalance - afterBalance : 0;
        if (actual != expected) revert ExactTransferRequired(asset, expected, actual);
    }

    function _requireExactIncreaseAt(address asset, address account, uint256 beforeBalance, uint256 expected) internal view {
        uint256 afterBalance = IERC20(asset).balanceOf(account);
        uint256 actual = afterBalance >= beforeBalance ? afterBalance - beforeBalance : 0;
        if (actual != expected) revert ExactTransferRequired(asset, expected, actual);
    }

    function _requireExactDecreaseAt(address asset, address account, uint256 beforeBalance, uint256 expected) internal view {
        uint256 afterBalance = IERC20(asset).balanceOf(account);
        uint256 actual = beforeBalance >= afterBalance ? beforeBalance - afterBalance : 0;
        if (actual != expected) revert ExactTransferRequired(asset, expected, actual);
    }

    function _assertCustody(address quote) internal view {
        uint256 balance = IERC20(quote).balanceOf(address(this));
        uint256 liability = quoteLiability[quote];
        if (balance < liability) revert InsufficientAggregateCustody(quote, balance, liability);
    }

    function _market(address token) internal view returns (Market storage market) {
        market = _markets[token];
        if (market.quote == address(0)) revert UnknownMarket(token);
    }

    function _activeMarket(address token) internal view returns (Market storage market) {
        market = _market(token);
        if (market.curveComplete) revert CurveClosed(token);
    }

    function _activeMarketView(address token) internal view returns (Market memory market) {
        market = _market(token);
        if (market.curveComplete) revert CurveClosed(token);
    }

    function _checkDeadline(uint256 deadline) internal view {
        if (deadline < block.timestamp) revert DeadlineExpired();
    }

    function _checkGraduationDeadline(uint256 deadline) internal view {
        _checkDeadline(deadline);
        if (deadline - block.timestamp > MAX_GRADUATION_DEADLINE) revert GraduationDeadlineTooFar();
    }

    function _requireLocalChain() internal view {
        if (block.chainid == 56) revert MainnetRefused();
        if (block.chainid != LOCAL_CHAIN_ID) revert NonLocalChainRefused(block.chainid);
    }
}