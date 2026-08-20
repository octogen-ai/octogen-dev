# Tests

Shared test assets for the SDKs.

Use:

- `contract/` for language-neutral API contract tests — today, the conformance
  check that holds both SDKs to the published `/v1` contract
  ([README](contract/README.md))
- `fixtures/` for stable mocked API payloads and commerce scenarios, and the
  committed contract snapshot both SDKs are generated and tested against
  ([README](fixtures/README.md))
- `integration/` for live or sandbox API tests

Live integration tests should require explicit sandbox credentials and should not run by default.
