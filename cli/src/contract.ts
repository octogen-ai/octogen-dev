/** Runtime contract projection. No IO: reusable by a future browser command runtime. */
import { type Args, type FlagSpecs, type FlagSpec } from "./args.js";
import { usageError } from "./exit.js";
import { PUBLIC_CONTRACT } from "./generated/contract.js";

export interface Schema {
  type?: string;
  properties?: Record<string, Schema>;
  required?: readonly string[];
  additionalProperties?: boolean;
  anyOf?: readonly Schema[];
  enum?: readonly unknown[];
  items?: Schema;
  default?: unknown;
  description?: string;
  title?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
}
export interface RequestOperation {
  method: string;
  path: string;
  body: Schema;
  parameters: readonly {
    name: string;
    in: string;
    required?: boolean;
    schema: Schema;
  }[];
}
export interface Contract {
  operations: Readonly<Record<string, RequestOperation>>;
}
export const CONTRACT: Contract = PUBLIC_CONTRACT;

/** Only presentation and SDK naming differences belong here; no API constraints. */
export interface Binding {
  flag: string;
  unsupported?: string;
  sdkName?: string;
  multiple?: boolean;
  codec?: "singleton" | "facets" | "custom";
  placeholder?: string;
}
export type Bindings = Readonly<Record<string, Binding>>;

export function requestSchema(
  operation: string,
  contract: Contract = CONTRACT,
): Schema {
  const op = contract.operations[operation];
  if (op === undefined) throw new Error(`Removed public operation: ${operation}`);
  if (op.parameters.length === 0) return op.body;
  if (Object.keys(op.body.properties ?? {}).length > 0) {
    throw new Error(`Mixed body/parameters require an explicit adapter: ${operation}`);
  }
  return {
    type: "object",
    properties: Object.fromEntries(op.parameters.map((p) => [p.name, p.schema])),
    required: op.parameters.filter((p) => p.required === true).map((p) => p.name),
    additionalProperties: false,
  };
}

export function assertBindings(
  operation: string,
  bindings: Bindings,
  contract: Contract = CONTRACT,
): void {
  const fields = requestSchema(operation, contract).properties ?? {};
  for (const field of new Set([...Object.keys(fields), ...Object.keys(bindings)])) {
    const binding = bindings[field];
    if (!(field in fields) || binding === undefined)
      throw new Error(`${operation}.${field}: stale or missing field binding`);
    if (binding.unsupported !== undefined && binding.flag.startsWith("--"))
      throw new Error(`${operation}.${field}: cannot be mapped and excluded`);
    if (binding.unsupported !== undefined && binding.unsupported.length < 31)
      throw new Error(`${operation}.${field}: exclusion needs a substantive reason`);
  }
}

export function scalar(schema: Schema): Schema {
  const alternatives = schema.anyOf?.filter((s) => s.type !== "null");
  if (alternatives !== undefined) {
    if (alternatives.length !== 1) return schema;
    const result = { ...schema, ...alternatives[0] };
    delete result.anyOf;
    return result;
  }
  return schema;
}

export function contractFlags(
  operation: string,
  bindings: Bindings,
  contract: Contract = CONTRACT,
): FlagSpecs {
  assertBindings(operation, bindings, contract);
  const fields = requestSchema(operation, contract).properties ?? {};
  const flags: Record<string, FlagSpec> = {};
  for (const [field, binding] of Object.entries(bindings)) {
    if (binding.unsupported !== undefined || !binding.flag.startsWith("--")) continue;
    const schema = scalar(fields[field] ?? {});
    const name = binding.flag.slice(2).split(" ")[0] ?? "";
    if (name in flags) throw new Error(`${operation}: duplicate flag --${name}`);
    const kind =
      binding.codec !== undefined || schema.type === "array"
        ? "string"
        : schema.type === "integer" || schema.type === "number"
          ? "number"
          : schema.type === "boolean"
            ? "boolean"
            : "string";
    const detail = [
      schema.description ?? schema.title ?? field,
      ...(schema.default === undefined
        ? []
        : [`Default: ${JSON.stringify(schema.default)}.`]),
      ...(schema.minimum === undefined ? [] : [`Minimum: ${String(schema.minimum)}.`]),
      ...(schema.maximum === undefined ? [] : [`Maximum: ${String(schema.maximum)}.`]),
    ].join(" ");
    flags[name] = {
      kind,
      describe: detail,
      ...(binding.multiple === true ? { multiple: true } : {}),
      ...(binding.placeholder === undefined
        ? {}
        : { placeholder: binding.placeholder }),
      ...(schema.enum === undefined ? {} : { choices: schema.enum.map(String) }),
    };
  }
  return flags;
}

/** Validate the resolved public request schema, including nested facets/source. */
export function validate(schema: Schema, value: unknown, label: string): void {
  const fail = (detail: string): never => {
    throw usageError(`${label} ${detail}`, "invalid_option_value");
  };
  if (schema.anyOf !== undefined) {
    const { anyOf, ...siblings } = schema;
    validate(siblings, value, label);
    for (const branch of anyOf) {
      try {
        validate(branch, value, label);
        return;
      } catch {
        /* Try next schema alternative. */
      }
    }
    fail("does not match the public request schema");
  }
  if (schema.enum !== undefined && !schema.enum.includes(value))
    fail(`must be one of: ${schema.enum.map(String).join(", ")}`);
  if (schema.type === "null" && value !== null) fail("must be null");
  if (schema.type === "boolean" && typeof value !== "boolean") fail("must be boolean");
  if (schema.type === "string" || typeof value === "string") {
    if (typeof value !== "string") fail("must be a string");
    const length = Array.from(value as string).length;
    if (schema.minLength !== undefined && length < schema.minLength)
      fail(`must have at least ${String(schema.minLength)} characters`);
    if (schema.maxLength !== undefined && length > schema.maxLength)
      fail(`must have at most ${String(schema.maxLength)} characters`);
  }
  if (
    schema.type === "number" ||
    schema.type === "integer" ||
    typeof value === "number"
  ) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (schema.type === "integer" && !Number.isInteger(value))
    )
      fail(`must be ${schema.type ?? "number"}`);
    if (
      schema.minimum !== undefined &&
      schema.maximum !== undefined &&
      ((value as number) < schema.minimum || (value as number) > schema.maximum)
    )
      fail(`must be between ${String(schema.minimum)} and ${String(schema.maximum)}`);
    if (schema.minimum !== undefined && (value as number) < schema.minimum)
      fail(`must be at least ${String(schema.minimum)}`);
    if (schema.maximum !== undefined && (value as number) > schema.maximum)
      fail(`must be at most ${String(schema.maximum)}`);
  }
  if (schema.type === "array" || Array.isArray(value)) {
    if (!Array.isArray(value)) fail("must be an array");
    const list = value as unknown[];
    if (schema.minItems !== undefined && list.length < schema.minItems)
      fail(`needs at least ${String(schema.minItems)} entries`);
    if (schema.maxItems !== undefined && list.length > schema.maxItems)
      fail(`allows at most ${String(schema.maxItems)} entries`);
    for (const item of list) validate(schema.items ?? {}, item, label);
  }
  if (schema.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      fail("must be an object");
    const object = value as Record<string, unknown>;
    for (const field of schema.required ?? [])
      if (object[field] === undefined) fail(`requires ${field}`);
    for (const [field, item] of Object.entries(object)) {
      const property = schema.properties?.[field];
      if (property !== undefined) validate(property, item, `${label}.${field}`);
      else if (schema.additionalProperties === false) fail(`does not accept ${field}`);
    }
  }
}

/** Build SDK arguments from contract fields. Custom codecs supply wire-shaped values. */
// SDK adapters have heterogeneous method signatures; conformance tests verify the serialized payload.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function contractRequest<T>(
  operation: string,
  bindings: Bindings,
  args: Args,
  custom: Readonly<Record<string, unknown>> = {},
  contract: Contract = CONTRACT,
): T {
  assertBindings(operation, bindings, contract);
  const schema = requestSchema(operation, contract);
  const request: Record<string, unknown> = {};
  for (const [field, binding] of Object.entries(bindings)) {
    if (binding.unsupported !== undefined) continue;
    const property = scalar(schema.properties?.[field] ?? {});
    const name = binding.flag.slice(2).split(" ")[0] ?? "";
    let value = custom[field];
    if (
      value === undefined &&
      binding.flag.startsWith("--") &&
      binding.codec !== "custom" &&
      binding.codec !== "facets"
    ) {
      value =
        binding.multiple === true
          ? args.strings(name)
          : property.type === "integer" || property.type === "number"
            ? args.number(name)
            : property.type === "boolean"
              ? args.boolean(name)
              : args.string(name);
      if (Array.isArray(value) && value.length === 0) value = undefined;
      if (binding.codec === "singleton" && value !== undefined) value = [value];
    }
    // Defaults on exposed fields override hard-coded SDK defaults and follow the contract.
    if (value === undefined) value = property.default;
    if (value !== undefined) request[field] = value;
  }
  validate(schema, request, operation);
  return Object.fromEntries(
    Object.entries(request).map(([field, value]) => [
      bindings[field]?.sdkName ?? field,
      value,
    ]),
  ) as T;
}
