import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const observedColumns = {
  observedSlot: integer("observed_slot").notNull(),
  observedSignature: text("observed_signature"),
  accountHash: text("account_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const solanaCheckpoints = pgTable("solana_checkpoints", {
  cluster: text("cluster").notNull(),
  programId: text("program_id").notNull(),
  lastFinalizedSlot: integer("last_finalized_slot").notNull(),
  scannedThroughSlot: integer("scanned_through_slot"),
  oldestSignature: text("oldest_signature"),
  newestSignature: text("newest_signature"),
  backfillComplete: boolean("backfill_complete").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  checkpointPk: primaryKey({ columns: [table.cluster, table.programId] }),
}));

/**
 * Durable alert state is keyed by the complete Solana namespace rather than
 * just the alert code.  Keeping this in the development schema is important:
 * a recovery observed for devnet must never resolve a mainnet incident for
 * the same program (or vice versa).
 */
export const solanaOperationalAlerts = pgTable("solana_operational_alerts", {
  cluster: text("cluster").notNull(),
  programId: text("program_id").notNull(),
  code: text("code").notNull(),
  severity: text("severity").notNull(),
  message: text("message").notNull(),
  action: text("action").notNull(),
  observedValue: integer("observed_value").notNull(),
  threshold: integer("threshold").notNull(),
  firstObservedAt: timestamp("first_observed_at", { withTimezone: true }).notNull(),
  lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).notNull(),
  recoveredAt: timestamp("recovered_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  alertPk: primaryKey({ columns: [table.cluster, table.programId, table.code] }),
  activeAlertIndex: index("solana_operational_alerts_active_idx").on(
    table.cluster,
    table.programId,
    table.active,
  ),
}));

export const solanaAlertOutbox = pgTable("solana_alert_outbox", {
  cluster: text("cluster").notNull(),
  programId: text("program_id").notNull(),
  code: text("code").notNull(),
  deliveryKey: text("delivery_key").notNull(),
  event: text("event").notNull(),
  notification: jsonb("notification").$type<Record<string, unknown>>().notNull(),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  outboxPk: primaryKey({ columns: [table.cluster, table.programId, table.code, table.deliveryKey] }),
  pendingIndex: index("solana_alert_outbox_pending_idx").on(
    table.cluster,
    table.programId,
    table.deliveredAt,
    table.nextAttemptAt,
  ),
}));

export const solanaTransactions = pgTable("solana_transactions", {
  cluster: text("cluster").notNull(),
  programId: text("program_id").notNull(),
  signature: text("signature").notNull(),
  slot: integer("slot").notNull(),
  blockhash: text("blockhash").notNull(),
  blockTime: integer("block_time"),
  success: boolean("success").notNull(),
  transaction: jsonb("transaction").$type<Record<string, unknown>>().notNull(),
  evidenceHash: text("evidence_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  transactionPk: primaryKey({ columns: [table.cluster, table.programId, table.signature] }),
  slotIndex: index("solana_transactions_slot_idx").on(table.cluster, table.programId, table.slot),
}));

export const solanaInstructionJournal = pgTable("solana_instruction_journal", {
  cluster: text("cluster").notNull(),
  programId: text("program_id").notNull(),
  signature: text("signature").notNull(),
  instructionIndex: integer("instruction_index").notNull(),
  innerInstructionIndex: integer("inner_instruction_index").notNull().default(-1),
  slot: integer("slot").notNull(),
  blockhash: text("blockhash").notNull(),
  instructionProgram: text("instruction_program").notNull(),
  kind: text("kind").notNull(),
  accounts: text("accounts").array().notNull(),
  data: text("data").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  instructionPk: primaryKey({
    columns: [table.cluster, table.programId, table.signature, table.instructionIndex, table.innerInstructionIndex],
  }),
  slotIndex: index("solana_instruction_journal_slot_idx").on(table.cluster, table.programId, table.slot),
}));

export const solanaAccountTransitions = pgTable("solana_account_transitions", {
  cluster: text("cluster").notNull(),
  programId: text("program_id").notNull(),
  signature: text("signature").notNull(),
  slot: integer("slot").notNull(),
  pubkey: text("pubkey").notNull(),
  accountIndex: integer("account_index").notNull(),
  writable: boolean("writable").notNull(),
  preLamports: text("pre_lamports"),
  postLamports: text("post_lamports"),
  preTokenBalance: jsonb("pre_token_balance").$type<Record<string, unknown>>(),
  postTokenBalance: jsonb("post_token_balance").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  transitionPk: primaryKey({ columns: [table.cluster, table.programId, table.signature, table.accountIndex] }),
  accountIndexBySlot: index("solana_account_transitions_account_slot_idx").on(table.cluster, table.pubkey, table.slot),
}));

export const solanaAccountSnapshots = pgTable("solana_account_snapshots", {
  cluster: text("cluster").notNull(),
  programId: text("program_id").notNull(),
  pubkey: text("pubkey").notNull(),
  slot: integer("slot").notNull(),
  signature: text("signature"),
  owner: text("owner").notNull(),
  lamports: text("lamports").notNull(),
  executable: boolean("executable").notNull(),
  dataBase64: text("data_base64").notNull(),
  dataHash: text("data_hash").notNull(),
  role: text("role").notNull(),
  decoderVersion: integer("decoder_version").notNull().default(1),
  decoded: jsonb("decoded").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  snapshotPk: primaryKey({ columns: [table.cluster, table.programId, table.pubkey, table.slot] }),
  accountIndex: index("solana_account_snapshots_account_idx").on(table.cluster, table.pubkey, table.slot),
}));

export const solanaLaunchStates = pgTable("solana_launch_states", {
  cluster: text("cluster").notNull(),
  programId: text("program_id").notNull(),
  launchState: text("launch_state").notNull(),
  baseMint: text("base_mint"),
  quoteMint: text("quote_mint"),
  creator: text("creator"),
  platform: text("platform"),
  baseVault: text("base_vault"),
  quoteVault: text("quote_vault"),
  status: text("status").notNull().default("unknown"),
  virtualBase: text("virtual_base"),
  virtualQuote: text("virtual_quote"),
  realBase: text("real_base"),
  realQuote: text("real_quote"),
  rawState: jsonb("raw_state").$type<Record<string, unknown>>().notNull().default({}),
  ...observedColumns,
}, (table) => ({
  launchPk: primaryKey({ columns: [table.cluster, table.programId, table.launchState] }),
  mintIndex: index("solana_launch_states_mint_idx").on(table.cluster, table.baseMint),
}));

export const solanaTrades = pgTable("solana_trades", {
  cluster: text("cluster").notNull(),
  programId: text("program_id").notNull(),
  signature: text("signature"),
  instructionIndex: integer("instruction_index").notNull(),
  innerInstructionIndex: integer("inner_instruction_index").notNull().default(-1),
  slot: integer("slot").notNull(),
  launchState: text("launch_state"),
  trader: text("trader"),
  side: text("side").notNull().default("unknown"),
  baseAmount: text("base_amount"),
  quoteAmount: text("quote_amount"),
  feeAmount: text("fee_amount"),
  rawInstruction: jsonb("raw_instruction").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tradePk: primaryKey({
    columns: [table.cluster, table.programId, table.signature, table.instructionIndex, table.innerInstructionIndex],
  }),
  marketIndex: index("solana_trades_market_idx").on(table.cluster, table.launchState, table.slot),
}));

export const solanaVaults = pgTable("solana_vaults", {
  cluster: text("cluster").notNull(),
  programId: text("program_id").notNull(),
  vault: text("vault").notNull(),
  launchState: text("launch_state"),
  pool: text("pool"),
  mint: text("mint"),
  authority: text("authority"),
  amount: text("amount"),
  tokenProgram: text("token_program").notNull(),
  rawState: jsonb("raw_state").$type<Record<string, unknown>>().notNull().default({}),
  ...observedColumns,
}, (table) => ({
  vaultPk: primaryKey({ columns: [table.cluster, table.programId, table.vault] }),
}));

export const solanaMints = pgTable("solana_mints", {
  cluster: text("cluster").notNull(),
  mint: text("mint").notNull(),
  tokenProgram: text("token_program").notNull(),
  decimals: integer("decimals"),
  supply: text("supply"),
  mintAuthority: text("mint_authority"),
  freezeAuthority: text("freeze_authority"),
  initialized: boolean("initialized"),
  rawState: jsonb("raw_state").$type<Record<string, unknown>>().notNull().default({}),
  ...observedColumns,
}, (table) => ({
  mintPk: primaryKey({ columns: [table.cluster, table.mint] }),
}));

export const solanaMintAuthorityHistory = pgTable("solana_mint_authority_history", {
  cluster: text("cluster").notNull(),
  mint: text("mint").notNull(),
  slot: integer("slot").notNull(),
  signature: text("signature"),
  mintAuthority: text("mint_authority"),
  freezeAuthority: text("freeze_authority"),
  supply: text("supply"),
  accountHash: text("account_hash").notNull(),
  authorityType: text("authority_type"),
  rawInstruction: jsonb("raw_instruction").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  historyPk: primaryKey({ columns: [table.cluster, table.mint, table.slot, table.accountHash] }),
}));

export const solanaMigrations = pgTable("solana_migrations", {
  cluster: text("cluster").notNull(),
  launchState: text("launch_state").notNull(),
  signature: text("signature").notNull(),
  instructionIndex: integer("instruction_index").notNull(),
  slot: integer("slot").notNull(),
  cpmmProgram: text("cpmm_program").notNull(),
  pool: text("pool"),
  baseAmount: text("base_amount"),
  quoteAmount: text("quote_amount"),
  status: text("status").notNull(),
  rawInstruction: jsonb("raw_instruction").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  migrationPk: primaryKey({ columns: [table.cluster, table.launchState, table.signature, table.instructionIndex] }),
}));

export const solanaCpmmPools = pgTable("solana_cpmm_pools", {
  cluster: text("cluster").notNull(),
  cpmmProgram: text("cpmm_program").notNull(),
  pool: text("pool").notNull(),
  launchState: text("launch_state"),
  config: text("config"),
  authority: text("authority"),
  baseMint: text("base_mint"),
  quoteMint: text("quote_mint"),
  baseVault: text("base_vault"),
  quoteVault: text("quote_vault"),
  lpMint: text("lp_mint"),
  baseReserve: text("base_reserve"),
  quoteReserve: text("quote_reserve"),
  lpSupply: text("lp_supply"),
  status: text("status").notNull().default("unknown"),
  rawState: jsonb("raw_state").$type<Record<string, unknown>>().notNull().default({}),
  ...observedColumns,
}, (table) => ({
  poolPk: primaryKey({ columns: [table.cluster, table.cpmmProgram, table.pool] }),
}));

export const solanaReconciliations = pgTable("solana_reconciliations", {
  cluster: text("cluster").notNull(),
  programId: text("program_id").notNull(),
  entity: text("entity").notNull(),
  account: text("account").notNull(),
  checkType: text("check_type").notNull(),
  slot: integer("slot").notNull(),
  signature: text("signature"),
  actual: text("actual").notNull(),
  expected: text("expected").notNull(),
  delta: text("delta"),
  healthy: boolean("healthy").notNull(),
  details: text("details").notNull().default(""),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  reconciliationPk: primaryKey({
    columns: [table.cluster, table.programId, table.entity, table.account, table.checkType],
  }),
  healthIndex: index("solana_reconciliations_health_idx").on(table.cluster, table.programId, table.healthy),
}));

export type SolanaLaunchStateRow = typeof solanaLaunchStates.$inferSelect;
export type SolanaMintRow = typeof solanaMints.$inferSelect;
export type SolanaVaultRow = typeof solanaVaults.$inferSelect;
export type SolanaCpmmPoolRow = typeof solanaCpmmPools.$inferSelect;