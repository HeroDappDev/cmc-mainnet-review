// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Local-only adversarial quote fixture. It is deliberately not used
/// by deployment code. The modes model transfer taxes, sender surcharges, and
/// a token callback that attempts to re-enter its caller.
contract SecurityQuote is ERC20 {
    enum Mode {
        Plain,
        InboundFee,
        OutboundFee,
        SenderSurcharge,
        Rebase,
        Callback
    }

    uint256 public constant FEE = 100;
    uint256 public constant BPS = 10_000;

    address public launchpad;
    Mode public mode;
    address public callbackTarget;
    bytes public callbackData;
    bool private _inCallback;

    error CallbackFailed();

    constructor() ERC20("Security Quote", "sQUOTE") {}

    function setLaunchpad(address launchpad_) external {
        launchpad = launchpad_;
    }

    function setMode(Mode mode_) external {
        mode = mode_;
    }

    function setCallback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function rebase(address account, uint256 amount) external {
        _burn(account, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (mode == Mode.InboundFee && to == launchpad && from != address(0)) {
            uint256 fee = (value * FEE) / BPS;
            super._update(from, to, value - fee);
            super._update(from, address(0), fee);
            return;
        }
        if (mode == Mode.OutboundFee && from == launchpad && to != address(0)) {
            uint256 fee = (value * FEE) / BPS;
            super._update(from, to, value - fee);
            super._update(from, address(0), fee);
            return;
        }
        if (mode == Mode.SenderSurcharge && from != address(0)) {
            uint256 fee = (value * FEE) / BPS;
            super._update(from, address(0), fee);
            super._update(from, to, value);
            return;
        }
        if (mode == Mode.Rebase && launchpad != address(0) && balanceOf(launchpad) != 0) {
            uint256 loss = balanceOf(launchpad) / BPS;
            if (loss != 0) super._update(launchpad, address(0), loss);
        }

        super._update(from, to, value);

        if (mode == Mode.Callback && callbackTarget != address(0) && !_inCallback) {
            _inCallback = true;
            (bool ok,) = callbackTarget.call(callbackData);
            _inCallback = false;
            if (!ok) revert CallbackFailed();
        }
    }
}