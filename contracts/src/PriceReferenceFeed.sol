// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice Trusted-keeper USD reference feed for testnet integration work.
/// It is not an independent oracle and must not be represented as a peg.
contract PriceReferenceFeed is Ownable2Step {
    uint256 public constant MIN_MAX_AGE = 1 minutes;
    uint256 public constant MAX_MAX_AGE = 72 hours;

    struct Reference {
        uint256 usdPerToken; // USD, 18 decimal fixed point, for one 18-decimal token.
        uint64 updatedAt;
        uint64 maxAge;
    }

    mapping(address => Reference) private _references;
    mapping(address => bool) public keepers;

    error NotKeeper();
    error InvalidAsset();
    error InvalidPrice();
    error InvalidMaxAge();
    error MissingReference(address asset);
    error StaleReference(address asset, uint256 updatedAt, uint256 maxAge);

    event AssetConfigured(address indexed asset, uint256 maxAge);
    event KeeperSet(address indexed keeper, bool allowed);
    event ReferencePushed(address indexed asset, uint256 usdPerToken, uint256 updatedAt);

    constructor(address initialOwner) Ownable(initialOwner) {
        keepers[initialOwner] = true;
        emit KeeperSet(initialOwner, true);
    }

    /// @dev On accepted handover (or renunciation), the outgoing owner's
    /// publishing permission must not survive its administrative authority.
    /// The new owner appoints keepers explicitly; ownership does not grant it
    /// an implicit right to publish.
    function _transferOwnership(address newOwner) internal override {
        address previousOwner = owner();
        if (keepers[previousOwner]) {
            keepers[previousOwner] = false;
            emit KeeperSet(previousOwner, false);
        }
        super._transferOwnership(newOwner);
    }

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        if (keeper == address(0)) revert InvalidAsset();
        keepers[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    function configureAsset(address asset, uint64 maxAge) external onlyOwner {
        if (asset == address(0)) revert InvalidAsset();
        if (maxAge < MIN_MAX_AGE || maxAge > MAX_MAX_AGE) revert InvalidMaxAge();
        _references[asset].maxAge = maxAge;
        emit AssetConfigured(asset, maxAge);
    }

    function pushReference(address asset, uint256 usdPerToken) external {
        if (!keepers[msg.sender]) revert NotKeeper();
        Reference storage entry = _references[asset];
        if (entry.maxAge == 0) revert MissingReference(asset);
        if (usdPerToken == 0) revert InvalidPrice();

        entry.usdPerToken = usdPerToken;
        entry.updatedAt = uint64(block.timestamp);
        emit ReferencePushed(asset, usdPerToken, block.timestamp);
    }

    function referenceOf(address asset) external view returns (Reference memory) {
        return _references[asset];
    }

    function getFreshUsdPrice(address asset) external view returns (uint256) {
        Reference memory entry = _references[asset];
        if (entry.usdPerToken == 0 || entry.updatedAt == 0) revert MissingReference(asset);
        if (block.timestamp > uint256(entry.updatedAt) + uint256(entry.maxAge)) {
            revert StaleReference(asset, entry.updatedAt, entry.maxAge);
        }
        return entry.usdPerToken;
    }
}