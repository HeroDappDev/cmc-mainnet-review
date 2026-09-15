import {
  verifyControlledValidatorSnapshot,
} from "./controlled-validator.mjs";

const verified = await verifyControlledValidatorSnapshot();
process.stdout.write(`${JSON.stringify(verified)}\n`);