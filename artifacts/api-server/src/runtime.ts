import { createOnchainIndexer } from "./onchain/indexer";

/**
 * A single process-wide worker is created by the server entrypoint. Route
 * handlers use the same instance so status and projections never describe a
 * different worker than the one doing the indexing.
 */
export const onchainIndexer = createOnchainIndexer();
