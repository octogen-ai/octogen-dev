import { OPERATIONS } from "@octogen-ai/sdk";
import { CONTRACT, type Contract } from "./contract.js";

export function assertOperationCoverage(
  mapped: ReadonlySet<string>,
  excluded: Readonly<Record<string, string>>,
  contract: Contract = CONTRACT,
): void {
  for (const name of new Set([
    ...Object.keys(contract.operations),
    ...mapped,
    ...Object.keys(excluded),
  ])) {
    const op = contract.operations[name];
    const sdk = (
      OPERATIONS as Readonly<Record<string, { method: string; path: string }>>
    )[name];
    if (op === undefined || sdk?.method !== op.method || sdk.path !== op.path)
      throw new Error(`Public contract/SDK operation drift: ${name}`);
    if (!mapped.has(name) && (excluded[name]?.length ?? 0) < 31)
      throw new Error(`Unmapped public operation: ${name}`);
    if (mapped.has(name) && name in excluded)
      throw new Error(`Mapped and excluded operation: ${name}`);
  }
}
