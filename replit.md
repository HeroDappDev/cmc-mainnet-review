# Commodity Markets Capital ($CMC)

A Solana-first commodity-reference token launchpad targeting Raydium LaunchLab and CPMM migration. The public application remains explicitly fail-closed until the mainnet release gates are satisfied.

## Run & Operate

- `pnpm --filter @workspace/cmc run dev` — Next.js application; use the managed CMC workflow to supply PORT.
- The shared API and canvas scaffolds are not needed by the initial simulation.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/cmc test` — offline commodity quote contract tests (Node.js 24); fixture responses replace all provider requests.
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- No credentials are required to browse and simulate. Mainnet activation and real transactions require reviewed Solana configuration and an explicit release flag.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/cmc/` — application.
- `contracts/` — legacy isolated BSC contract foundation; it is not the Solana execution path.
- `.local/conversation-workspace/files/attached_assets/` — three original starter documents.
- `.local/conversation-workspace/files/research/reference-review.md` — full retrieved reference documentation and initial source findings.

## Architecture decisions

- CMC's target execution path is Raydium LaunchLab with CPMM graduation on Solana. Legacy BSC/PancakeSwap code must remain isolated and disabled; never use it as an automatic fallback.
- A published commodity reference price does not create a token peg. Never claim physical backing, guaranteed redemption, or oracle-enforced market value without implementing and validating those mechanisms.
- SOL is the only launch/trading quote. Commodity prices and SOL/USD are informational references; neither changes the fixed SOL curve thresholds after creation.
- Mainnet support is the target, but activation must fail closed until reviewed program/config IDs, Platform PDA authorities, fee destinations, start slot, indexer, transaction builder, audit, and an explicit release flag are present.

## Product

The homepage acts as a product overview and strictly displays an empty "Active Markets" section until real tokens are deployed (no seeded or browser-demo markets on the homepage). The Exchange Coin panel is pending live data and awaiting the user to supply the CMC Contract Address (CA) at go-live. Browser simulation remains available on the dedicated launch and market pages.

## User preferences

- Brand: Commodity Markets Capital, ticker CMC. Rawpair/RAW in the attachments are superseded.
- Original UI, copy and contracts; reference product functionality rather than copy its branding.
- No drugs commodity category.
- Users complete token launch details on the Launch page, below “Tokenize anything.” Commodities is a price catalogue; its rows link to Launch with the pairing preselected.
- Commodity price feeds must use free sources only. Delayed or daily data and limited coverage are acceptable; label timing and missing coverage accurately. Do not add paid subscriptions.
- Market template: 1 billion supply; 800 million curve, 200 million CPMM migration. Zero-migration-fee constant product fixes a 16× valuation ratio; the local template uses 5 SOL opening FDV, 80 SOL graduation FDV, and a 16 SOL net raise.
- Initial fee policy: Raydium protocol fee plus a fixed 0.50% CMC platform fee, no creator fee, no holder reward, and no automatic buyback. Platform fee goes to a governed treasury only after Platform PDA verification.
- Next.js App Router, TypeScript, Tailwind; Solana/Raydium replaces wagmi/viem/RainbowKit and Hardhat/OpenZeppelin for new execution work.

## Gotchas

- RPC URLs containing credentials belong only in server-side Secrets, never browser env, logs, or source.
- Keep demo storage and balances separate from real wallet identities. A wallet connection is not authorization to transact.
- Legacy Solidity is not production execution code. Raydium SDK/IDL versions and program accounts must be pinned and verified by cluster before activation.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
