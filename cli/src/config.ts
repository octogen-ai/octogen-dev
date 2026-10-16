/** CLI defaults are independent of the SDK's compatibility defaults. */
export const DEFAULT_BASE_URL = "https://api.storerouter.ai/v1";

export function resolveBaseUrl(
  override: string | undefined,
  env: Readonly<Record<string, string | undefined>>,
): string {
  return (
    override ??
    nonEmpty(env["STOREROUTER_BASE_URL"]) ??
    nonEmpty(env["OCTOGEN_BASE_URL"]) ??
    DEFAULT_BASE_URL
  );
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === "" ? undefined : trimmed;
}
