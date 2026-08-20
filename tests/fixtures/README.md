# Fixtures

Stable mocked API payloads shared by both SDK test suites and by the
cross-language conformance tests in [`../contract`](../contract).

## `platform-v1/`

Response bodies for the published
[Platform Catalog API v1](https://cdn.octogen.ai/openapi/platform/v1/openapi.json)
contract, one file per shape. They are hand-written rather than captured from
production: nothing here may contain a real API key, a customer URL, or a
payload export.

| File                         | Operation                              |
| ---------------------------- | -------------------------------------- |
| `list-domains.json`          | `listDomains`                          |
| `product-refresh.json`       | `refreshProducts`                      |
| `resolve-from-html.json`     | `resolveProductFromHtml`               |
| `voyage-task-running.json`   | `startVoyage`, `getVoyage` — in flight |
| `voyage-task-completed.json` | `getVoyage` — finished, catalog live   |
| `voyage-list.json`           | `listVoyages`, including `quotas`      |

A fixture that stops matching the contract should be fixed here rather than
worked around in one language's tests: both suites read the same file, which is
the point.
