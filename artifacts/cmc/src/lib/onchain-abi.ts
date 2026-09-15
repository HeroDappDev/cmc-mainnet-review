/**
 * Client-side ABI boundary for the reviewed Launchpad and ERC20 interfaces.
 * Keep this copy limited to the read/write surface used by wallet mode; it is
 * intentionally sourced from contracts/abi/Launchpad.json and the OpenZeppelin
 * ERC20 interface rather than introducing a second contract interface.
 */
export const LAUNCHPAD_ABI = [
  {
    type: "function",
    name: "marketOf",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{
      name: "",
      type: "tuple",
      components: [
        { name: "quote", type: "address" },
        { name: "creator", type: "address" },
        { name: "feeBps", type: "uint16" },
        { name: "curveComplete", type: "bool" },
        { name: "frozenQuoteUsd", type: "uint256" },
        { name: "virtualToken", type: "uint256" },
        { name: "virtualQuote", type: "uint256" },
        { name: "curveTokensLeft", type: "uint256" },
        { name: "quoteRaised", type: "uint256" },
        { name: "holderFees", type: "uint256" },
        { name: "buybackFees", type: "uint256" },
        { name: "treasuryFees", type: "uint256" },
      ],
    }],
  },
  {
    type: "function",
    name: "quoteBuy",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "grossQuoteIn", type: "uint256" },
    ],
    outputs: [
      { name: "tokenOut", type: "uint256" },
      { name: "grossConsumed", type: "uint256" },
      { name: "fee", type: "uint256" },
      { name: "refund", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "quoteSell",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokenIn", type: "uint256" },
    ],
    outputs: [
      { name: "grossQuoteOut", type: "uint256" },
      { name: "fee", type: "uint256" },
      { name: "userQuoteOut", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "initialVirtualReserves",
    stateMutability: "view",
    inputs: [{ name: "quote", type: "address" }],
    outputs: [
      { name: "virtualToken", type: "uint256" },
      { name: "virtualQuote", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "quoteConfigs",
    stateMutability: "view",
    inputs: [{ name: "quote", type: "address" }],
    outputs: [{ name: "enabled", type: "bool" }],
  },
  {
    type: "function",
    name: "createMarket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "metadataURI", type: "string" },
      { name: "quote", type: "address" },
      { name: "feeBps", type: "uint16" },
      { name: "firstBuyGross", type: "uint256" },
      { name: "minTokenOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "token", type: "address" }],
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "grossQuoteIn", type: "uint256" },
      { name: "minTokenOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "sell",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokenIn", type: "uint256" },
      { name: "minQuoteOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;