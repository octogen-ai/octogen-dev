# TypeScript Examples

Runnable examples for the TypeScript SDK.

## Search Clothes

Requires `OCTOGEN_PLATFORM_API_KEY` in the environment.

```bash
npm --prefix sdks/typescript run example:search-clothes
```

## Check Coverage

Looks up two products Octogen covers and one it does not, after checking
`GET /v1/domains` — including the `www.` host normalization that makes a naive
coverage check report covered merchants as uncovered.

```bash
npm --prefix sdks/typescript run example:check-coverage
```
