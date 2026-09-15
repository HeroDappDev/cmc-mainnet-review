import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import { createChainRouter } from "./chain";
import { createOnchainIndexer } from "../onchain/indexer";

const router: IRouter = Router();
export const onchainIndexer = createOnchainIndexer();

router.use(healthRouter);
router.use(storageRouter);
router.use(createChainRouter(onchainIndexer));

export default router;
