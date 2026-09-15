// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MarketToken} from "./MarketToken.sol";
import {PriceReferenceFeed} from "./PriceReferenceFeed.sol";

/// @notice Bounded testnet bonding-curve foundation using 18-decimal,
/// administrator-allowlisted quote assets. This contract deliberately has no
/// active PancakeSwap migration implementation; see README before any release.
contract Launchpad is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint16 public constant MIN_FEE_BPS = 100;
    uint16 public constant MAX_FEE_BPS = 300;
    uint16 public constant HOLDER_BPS = 4_000;
    uint16 public constant BUYBACK_BPS = 3_000;
    uint256 public constant USD_SCALE = 1e18;
    uint256 public constant ONE_USD = 1e18;

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant CURVE_SUPPLY = 800_000_000 ether;
    uint256 public constant RESERVE_SUPPLY = 200_000_000 ether;
    uint256 public constant OPEN_MCAP_USD = 5_000 ether;
    uint256 public constant TERMINAL_MCAP_USD = 35_000 ether;

    PriceReferenceFeed public immutable priceFeed;
    address public treasuryRecipient;
    address public buybackRecipient;

    struct QuoteConfig {
        bool enabled;
    }

    struct Market {
        address quote;
        address creator;
        uint16 feeBps;
        bool curveComplete;
        uint256 frozenQuoteUsd;
        uint256 virtualToken;
        uint256 virtualQuote;
        uint256 curveTokensLeft;
        uint256 quoteRaised;
        uint256 holderFees;
        uint256 buybackFees;
        uint256 treasuryFees;
    }

    mapping(address => QuoteConfig) public quoteConfigs;
    mapping(address => Market) private _markets;
    // Aggregate liability for each quote asset. Keeping this separate from
    // each market's buckets prevents a shortfall from being hidden by another
    // market that happens to use the same quote token.
    mapping(address => uint256) private _accountedQuote;
    address[] public allMarkets;

    error DeadlineExpired();
    error InvalidAddress();
    error InvalidFee();
    error InvalidAmount();
    error InvalidMinOut();
    error QuoteNotAllowed(address quote);
    error QuoteMustUse18Decimals(address quote);
    error UnknownMarket(address token);
    error CurveClosed(address token);
    error FirstBuyTooSmall(uint256 suppliedUsd, uint256 minimumUsd);
    error ZeroOutput();
    error MigrationDisabledPendingDesign();
    error ArrayLengthMismatch();
    error HolderFeesExceeded();
    error QuoteTransferMismatch(address quote, address from, address to, uint256 amount);
    error QuoteCustodyShortfall(address quote, uint256 accounted, uint256 actual);
    error MarketQuoteShortfall(address token, uint256 required, uint256 available);

    event QuoteAllowlistSet(address indexed quote, bool enabled);
    event RecipientsSet(address indexed treasuryRecipient, address indexed buybackRecipient);
    event MarketCreated(
        address indexed token,
        address indexed quote,
        address indexed creator,
        uint16 feeBps,
        uint256 frozenQuoteUsd,
        uint256 virtualToken,
        uint256 virtualQuote,
        string name,
        string symbol,
        string metadataURI
    );
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
    event CurveCompleted(address indexed token);
    event HolderFeesDistributed(address indexed token, uint256 totalAmount, uint256 recipientCount);
    event ProtocolFeesReleased(address indexed token, uint256 buybackAmount, uint256 treasuryAmount);

    constructor(
        address initialOwner,
        PriceReferenceFeed priceFeed_,
        address treasuryRecipient_,
        address buybackRecipient_
    ) Ownable(initialOwner) {
        if (
            address(priceFeed_) == address(0) || treasuryRecipient_ == address(0)
                || buybackRecipient_ == address(0)
        ) revert InvalidAddress();
        priceFeed = priceFeed_;
        treasuryRecipient = treasuryRecipient_;
        buybackRecipient = buybackRecipient_;
    }

    function marketCount() external view returns (uint256) {
        return allMarkets.length;
    }

    function marketOf(address token) external view returns (Market memory) {
        return _market(token);
    }

    function setQuoteAllowed(address quote, bool enabled) external onlyOwner {
        if (quote == address(0)) revert InvalidAddress();
        // The curve stores all quote balances in 18-decimal units. Supporting
        // arbitrary decimals would silently invalidate both USD conversion and math.
        if (enabled && IERC20Metadata(quote).decimals() != 18) revert QuoteMustUse18Decimals(quote);
        quoteConfigs[quote].enabled = enabled;
        emit QuoteAllowlistSet(quote, enabled);
    }

    function setRecipients(address treasuryRecipient_, address buybackRecipient_) external onlyOwner {
        if (treasuryRecipient_ == address(0) || buybackRecipient_ == address(0)) revert InvalidAddress();
        treasuryRecipient = treasuryRecipient_;
        buybackRecipient = buybackRecipient_;
        emit RecipientsSet(treasuryRecipient_, buybackRecipient_);
    }

    /// @notice Creates a market and executes its required first purchase against
    /// a fresh reference price. That USD conversion is frozen for this market.
    function createMarket(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        address quote,
        uint16 feeBps,
        uint256 firstBuyGross,
        uint256 minTokenOut,
        uint256 deadline
    ) external nonReentrant returns (address token) {
        _checkDeadline(deadline);
        if (!quoteConfigs[quote].enabled) revert QuoteNotAllowed(quote);
        if (IERC20Metadata(quote).decimals() != 18) revert QuoteMustUse18Decimals(quote);
        if (feeBps < MIN_FEE_BPS || feeBps > MAX_FEE_BPS) revert InvalidFee();
        if (firstBuyGross == 0) revert InvalidAmount();

        uint256 quoteUsd = priceFeed.getFreshUsdPrice(quote);
        uint256 suppliedUsd = Math.mulDiv(firstBuyGross, quoteUsd, USD_SCALE);
        if (suppliedUsd < ONE_USD) revert FirstBuyTooSmall(suppliedUsd, ONE_USD);

        (uint256 virtualToken, uint256 virtualQuote) = _initialVirtualReserves(quoteUsd);
        token = address(new MarketToken(name, symbol, metadataURI, address(this)));
        _markets[token] = Market({
            quote: quote,
            creator: msg.sender,
            feeBps: feeBps,
            curveComplete: false,
            frozenQuoteUsd: quoteUsd,
            virtualToken: virtualToken,
            virtualQuote: virtualQuote,
            curveTokensLeft: CURVE_SUPPLY,
            quoteRaised: 0,
            holderFees: 0,
            buybackFees: 0,
            treasuryFees: 0
        });
        allMarkets.push(token);

        emit MarketCreated(
            token, quote, msg.sender, feeBps, quoteUsd, virtualToken, virtualQuote, name, symbol, metadataURI
        );
        _buy(token, msg.sender, firstBuyGross, minTokenOut);
    }

    function buy(address token, uint256 grossQuoteIn, uint256 minTokenOut, uint256 deadline)
        external
        nonReentrant
    {
        _checkDeadline(deadline);
        _buy(token, msg.sender, grossQuoteIn, minTokenOut);
    }

    function sell(address token, uint256 tokenIn, uint256 minQuoteOut, uint256 deadline)
        external
        nonReentrant
    {
        _checkDeadline(deadline);
        Market storage market = _activeMarket(token);
        if (tokenIn == 0 || tokenIn > CURVE_SUPPLY - market.curveTokensLeft) revert InvalidAmount();

        uint256 grossQuoteOut = Math.mulDiv(tokenIn, market.virtualQuote, market.virtualToken + tokenIn);
        if (grossQuoteOut == 0) revert ZeroOutput();
        uint256 fee = Math.mulDiv(grossQuoteOut, market.feeBps, BPS);
        uint256 userQuoteOut = grossQuoteOut - fee;
        if (userQuoteOut < minQuoteOut) revert InvalidMinOut();
        if (grossQuoteOut > market.quoteRaised) {
            // Curve proceeds and fee buckets are separate liabilities. A sell
            // may never spend another market's proceeds or this market's fees.
            revert MarketQuoteShortfall(token, grossQuoteOut, market.quoteRaised);
        }
        _assertQuoteCustody(market.quote);

        market.virtualToken += tokenIn;
        market.virtualQuote -= grossQuoteOut;
        market.curveTokensLeft += tokenIn;
        market.quoteRaised -= grossQuoteOut;
        _allocateFee(market, fee);
        _accountedQuote[market.quote] -= userQuoteOut;

        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenIn);
        if (msg.sender == address(this)) revert QuoteTransferMismatch(market.quote, address(this), msg.sender, userQuoteOut);
        _quoteTransferOut(market.quote, msg.sender, userQuoteOut);
        _assertQuoteCustody(market.quote);
        emit Trade(token, msg.sender, false, tokenIn, grossQuoteOut, grossQuoteOut, fee, 0);
    }

    /// @notice Pure curve quote helper. The return values mirror buy execution,
    /// including a possible completing-buy refund.
    function quoteBuy(address token, uint256 grossQuoteIn)
        external
        view
        returns (uint256 tokenOut, uint256 grossConsumed, uint256 fee, uint256 refund)
    {
        Market memory market = _activeMarketView(token);
        return _buyAmounts(market, grossQuoteIn);
    }

    function quoteSell(address token, uint256 tokenIn)
        external
        view
        returns (uint256 grossQuoteOut, uint256 fee, uint256 userQuoteOut)
    {
        Market memory market = _activeMarketView(token);
        if (tokenIn == 0 || tokenIn > CURVE_SUPPLY - market.curveTokensLeft) revert InvalidAmount();
        grossQuoteOut = Math.mulDiv(tokenIn, market.virtualQuote, market.virtualToken + tokenIn);
        fee = Math.mulDiv(grossQuoteOut, market.feeBps, BPS);
        userQuoteOut = grossQuoteOut - fee;
    }

    function curveSpotQuotePerToken(address token) external view returns (uint256) {
        Market memory market = _market(token);
        return Math.mulDiv(market.virtualQuote, USD_SCALE, market.virtualToken);
    }

    /// @notice Intentionally permanent for this foundation. No V2 router call,
    /// LP mint, or reserve withdrawal can occur until a separately audited
    /// migration design is approved and deployed.
    function migrateToPancakeV2(address) external pure {
        revert MigrationDisabledPendingDesign();
    }

    /// @notice Trusted, manual holder distribution. It does not discover holders
    /// and must never be described as automatic.
    function distributeHolderFees(address token, address[] calldata recipients, uint256[] calldata amounts)
        external
        onlyOwner
        nonReentrant
    {
        if (recipients.length != amounts.length) revert ArrayLengthMismatch();
        Market storage market = _market(token);
        uint256 total;
        for (uint256 i; i < amounts.length; ++i) {
            total += amounts[i];
        }
        if (total > market.holderFees) revert HolderFeesExceeded();
        _assertQuoteCustody(market.quote);
        uint256 released;
        for (uint256 i; i < recipients.length; ++i) {
            if (recipients[i] == address(0)) revert InvalidAddress();
            // A self-transfer is a no-op. Leave that amount in its bucket
            // rather than turning accounted custody into an untracked surplus.
            if (amounts[i] != 0 && recipients[i] != address(this)) {
                _quoteTransferOut(market.quote, recipients[i], amounts[i]);
                released += amounts[i];
            }
        }
        market.holderFees -= released;
        _accountedQuote[market.quote] -= released;
        _assertQuoteCustody(market.quote);
        emit HolderFeesDistributed(token, released, recipients.length);
    }

    /// @notice Trusted, manual release of accounted fee buckets. Buyback funds
    /// are not swapped or burned by this contract.
    function releaseProtocolFees(address token) external onlyOwner nonReentrant {
        Market storage market = _market(token);
        address buybackTo = buybackRecipient;
        address treasuryTo = treasuryRecipient;
        uint256 buybackAmount = buybackTo == address(this) ? 0 : market.buybackFees;
        uint256 treasuryAmount = treasuryTo == address(this) ? 0 : market.treasuryFees;
        _assertQuoteCustody(market.quote);
        market.buybackFees -= buybackAmount;
        market.treasuryFees -= treasuryAmount;
        _accountedQuote[market.quote] -= buybackAmount + treasuryAmount;
        if (buybackAmount != 0) _quoteTransferOut(market.quote, buybackTo, buybackAmount);
        if (treasuryAmount != 0) _quoteTransferOut(market.quote, treasuryTo, treasuryAmount);
        _assertQuoteCustody(market.quote);
        emit ProtocolFeesReleased(token, buybackAmount, treasuryAmount);
    }

    function initialVirtualReserves(address quote) external view returns (uint256 virtualToken, uint256 virtualQuote) {
        if (!quoteConfigs[quote].enabled) revert QuoteNotAllowed(quote);
        return _initialVirtualReserves(priceFeed.getFreshUsdPrice(quote));
    }

    function _buy(address token, address buyer, uint256 grossQuoteIn, uint256 minTokenOut) internal {
        Market storage market = _activeMarket(token);
        (uint256 tokenOut, uint256 grossConsumed, uint256 fee, uint256 refund) = _buyAmounts(market, grossQuoteIn);
        if (tokenOut == 0) revert ZeroOutput();
        if (tokenOut < minTokenOut) revert InvalidMinOut();
        _assertQuoteCustody(market.quote);

        uint256 curveQuoteAmount = grossConsumed - fee;
        _quoteTransferIn(market.quote, buyer, grossQuoteIn);
        if (refund != 0) _quoteTransferOut(market.quote, buyer, refund);

        market.virtualToken -= tokenOut;
        market.virtualQuote += curveQuoteAmount;
        market.curveTokensLeft -= tokenOut;
        market.quoteRaised += curveQuoteAmount;
        _allocateFee(market, fee);
        _accountedQuote[market.quote] += grossConsumed;

        IERC20(token).safeTransfer(buyer, tokenOut);
        _assertQuoteCustody(market.quote);
        emit Trade(token, buyer, true, tokenOut, grossConsumed, curveQuoteAmount, fee, refund);

        if (market.curveTokensLeft == 0) {
            market.curveComplete = true;
            emit CurveCompleted(token);
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

        if (tokenOut < market.curveTokensLeft) {
            grossConsumed = grossQuoteIn;
            return (tokenOut, grossConsumed, fee, 0);
        }

        // ceil(R * Vq / (Vt - R)) is the net curve amount required for the
        // final R tokens. For a floored fee, the exact minimum gross whose
        // post-fee amount is at least requiredNet is:
        //
        //   floor((requiredNet - 1) * BPS / (BPS - feeBps)) + 1
        //
        // This is one wei smaller than ceil(requiredNet * BPS /
        // (BPS - feeBps)) at the boundary where the fee floors down.
        uint256 requiredNet = Math.mulDiv(
            market.curveTokensLeft,
            market.virtualQuote,
            market.virtualToken - market.curveTokensLeft,
            Math.Rounding.Ceil
        );
        grossConsumed = Math.mulDiv(
            requiredNet - 1,
            BPS,
            BPS - market.feeBps
        ) + 1;
        if (grossConsumed > grossQuoteIn) {
            // The supplied amount cannot complete the curve. Use ordinary
            // execution rather than charging more than was supplied.
            grossConsumed = grossQuoteIn;
            fee = Math.mulDiv(grossConsumed, market.feeBps, BPS);
            tokenOut = Math.mulDiv(
                grossConsumed - fee, market.virtualToken, market.virtualQuote + grossConsumed - fee
            );
            return (tokenOut, grossConsumed, fee, 0);
        }

        fee = Math.mulDiv(grossConsumed, market.feeBps, BPS);
        tokenOut = market.curveTokensLeft;
        refund = grossQuoteIn - grossConsumed;
    }

    /// @dev Require that all recorded quote liabilities are backed before
    /// touching a quote asset. A donated surplus is intentionally ignored;
    /// it is never credited to a market or fee bucket. These checks still
    /// depend on a truthful balanceOf and do not make out-of-band rebases or
    /// malicious quote implementations suitable for the allowlist.
    function _assertQuoteCustody(address quote) internal view {
        uint256 accounted = _accountedQuote[quote];
        uint256 actual = IERC20(quote).balanceOf(address(this));
        if (actual < accounted) revert QuoteCustodyShortfall(quote, accounted, actual);
    }

    /// @dev Pull an exact amount. Checking both sides catches inbound taxes,
    /// sender surcharges, rebases during transfer, and non-standard tokens
    /// that return success without moving the requested amount.
    function _quoteTransferIn(address quote, address from, uint256 amount) internal {
        if (from == address(this)) revert QuoteTransferMismatch(quote, from, address(this), amount);
        uint256 fromBefore = IERC20(quote).balanceOf(from);
        uint256 launchpadBefore = IERC20(quote).balanceOf(address(this));
        IERC20(quote).safeTransferFrom(from, address(this), amount);
        uint256 fromAfter = IERC20(quote).balanceOf(from);
        uint256 launchpadAfter = IERC20(quote).balanceOf(address(this));
        if (
            fromAfter > fromBefore || fromBefore - fromAfter != amount
                || launchpadAfter < launchpadBefore || launchpadAfter - launchpadBefore != amount
        ) {
            revert QuoteTransferMismatch(quote, from, address(this), amount);
        }
    }

    /// @dev Push an exact amount and verify both the launchpad debit and the
    /// recipient credit. A configured recipient equal to the launchpad is a
    /// deliberate no-op handled by the payout callers; accepting it here
    /// would silently erase a fee liability.
    function _quoteTransferOut(address quote, address to, uint256 amount) internal {
        if (to == address(this)) revert QuoteTransferMismatch(quote, address(this), to, amount);
        uint256 launchpadBefore = IERC20(quote).balanceOf(address(this));
        uint256 recipientBefore = IERC20(quote).balanceOf(to);
        IERC20(quote).safeTransfer(to, amount);
        uint256 launchpadAfter = IERC20(quote).balanceOf(address(this));
        uint256 recipientAfter = IERC20(quote).balanceOf(to);
        if (
            launchpadBefore < launchpadAfter || launchpadBefore - launchpadAfter != amount
                || recipientAfter < recipientBefore || recipientAfter - recipientBefore != amount
        ) {
            revert QuoteTransferMismatch(quote, address(this), to, amount);
        }
    }

    function _initialVirtualReserves(uint256 quoteUsd)
        internal
        pure
        returns (uint256 virtualToken, uint256 virtualQuote)
    {
        // Pterminal / Popen = 35,000 / 5,000 = 7. For x*y=k and 800m
        // curve tokens sold, Vt0/(Vt0-800m) = sqrt(7). This is materially
        // different from the starter's linear reserve sizing.
        uint256 sqrtRatio = Math.sqrt(
            Math.mulDiv(TERMINAL_MCAP_USD, USD_SCALE, OPEN_MCAP_USD) * USD_SCALE
        );
        virtualToken = Math.mulDiv(
            CURVE_SUPPLY, sqrtRatio, sqrtRatio - USD_SCALE, Math.Rounding.Ceil
        );
        uint256 initialUsdQuote = Math.mulDiv(virtualToken, OPEN_MCAP_USD, TOTAL_SUPPLY);
        virtualQuote = Math.mulDiv(initialUsdQuote, USD_SCALE, quoteUsd);
        if (virtualQuote == 0) revert InvalidAmount();
    }

    function _allocateFee(Market storage market, uint256 fee) internal {
        uint256 holderAmount = Math.mulDiv(fee, HOLDER_BPS, BPS);
        uint256 buybackAmount = Math.mulDiv(fee, BUYBACK_BPS, BPS);
        market.holderFees += holderAmount;
        market.buybackFees += buybackAmount;
        // Assign dust to treasury so every charged wei is accounted for.
        market.treasuryFees += fee - holderAmount - buybackAmount;
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
}