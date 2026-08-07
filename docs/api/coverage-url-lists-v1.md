# Coverage URL Lists API v1 — Reference

Coverage URL Lists let a Catalog Partner organization upload named sets of
product URLs and have Octogen continuously answer "which of these URLs do you
cover?". Each list is joined against every active crawled catalog daily and
the result is shared back as a per-list BigQuery Analytics Hub listing your
organization's registered BigQuery Readers can subscribe to.

| Property | Value |
| --- | --- |
| Base URL | `https://api.octogen.ai/v1` |
| Authentication | Bearer Platform API key (`octo_live_...`) |
| Content type | `application/json` |
| OpenAPI contract | `https://cdn.octogen.ai/openapi/platform/v1/openapi.json` |

Authentication is identical to the
[Platform Catalog API v1](./platform-catalog-api-v1.md): send your Platform
API key as a Bearer token on every request.

## Lifecycle

- `provisioning` — the list was just created; Octogen is creating its
  BigQuery resources. The `bigQuery` field is `null` while provisioning.
  Lists typically become `active` within a minute; you can add URLs
  immediately.
- `active` — the list is live. `bigQuery` describes the listing and shared
  dataset; `lastExportedAt` / `lastRowCount` update after each daily export.
- `delete_pending` — deletion was requested and teardown is in progress.
  The list still appears in reads until teardown completes, then disappears.
  Deletion is permanent — there is no grace window and no restore — and the
  name is released immediately.

Limits: 5 live lists per organization, 100,000 URLs per list, 1,000 URLs per
mutation request, 2,048 characters per URL, list names up to 80 characters.

## URL normalization

Every URL you submit is normalized server-side — the scheme and host are
lowercased, fragments and trailing slashes are dropped, and tracking
parameters (`utm_*` and similar) are stripped while meaningful query
parameters are preserved. Membership is keyed on the normalized form, so
adding the same product URL twice — or two variants that
normalize identically — stores one entry. Responses always echo both the URL
you sent and the `normalizedUrl` that was stored. URLs that cannot be
normalized as product URLs are rejected per URL with code `invalid_url`
without failing the batch.

## Endpoints

### `POST /coverage/url-lists` — create a URL list

Body: `{"name": "q3-campaign"}`. Returns `201` with the list in
`provisioning`. Names must be unique among your live lists
(`url_list_name_conflict` on conflict); a sixth live list returns
`url_list_limit_exceeded`.

### `GET /coverage/url-lists` — list your URL lists

Cursor pagination via `cursor` and `limit` (default 50, max 100), newest
first. Returns `{"items": [...], "nextCursor": ...}`.

### `GET /coverage/url-lists/{urlListId}` — get a URL list

Returns the list object:

```json
{
  "urlListId": "cul_01KZAC9QSY5RWSTZ63FGBS50F2",
  "name": "q3-campaign",
  "status": "active",
  "urlCount": 5445,
  "bigQuery": {
    "exchangeId": "catalogs_prod",
    "listingId": "coverage_cul_01KZAC9QSY5RWSTZ63FGBS50F2_v1",
    "sharedDatasetId": "coverage_share_cul_01KZAC9QSY5RWSTZ63FGBS50F2_v1",
    "viewId": "products_current_v1",
    "lastExportedAt": "2026-08-06T06:31:12Z",
    "lastRowCount": 1128,
    "readerCount": 1
  },
  "createdAt": "2026-08-05T20:14:03Z",
  "updatedAt": "2026-08-06T06:31:12Z"
}
```

### `DELETE /coverage/url-lists/{urlListId}` — delete a URL list

Returns `202` with the list in `delete_pending`. Teardown (revoking Reader
access, deleting the listing and datasets, purging entries) runs
asynchronously. Permanent; no restore.

### `POST /coverage/url-lists/{urlListId}/urls` — add URLs

Body: `{"urls": ["https://...", ...]}` (1–1,000 per request). Idempotent
set-add. Returns per-URL outcomes:

```json
{
  "accepted": [
    {
      "url": "https://shop.example/products/dress?utm_source=x",
      "normalizedUrl": "https://shop.example/products/dress"
    }
  ],
  "rejected": [
    {"url": "not-a-url", "code": "invalid_url", "message": "..."}
  ],
  "urlCount": 5445,
  "requestId": "..."
}
```

Adding past the 100,000-entry cap fails the whole request with
`list_url_capacity_exceeded` (409).

### `POST /coverage/url-lists/{urlListId}/urls/remove` — remove URLs

Same request/response shape as add; an idempotent set-remove. Removing a URL
that isn't present is accepted and simply doesn't change `urlCount`.

### `POST /coverage/url-lists/{urlListId}/urls/contains` — check membership

Same request shape. Returns one result per input URL with `present` and, when
present, the entry's `addedAt`.

### `GET /coverage/url-lists/{urlListId}/urls` — enumerate URLs

Cursor pagination via `cursor` and `limit` (default 50, max 100), stable
insertion order. Items carry `url` (as originally submitted), `normalizedUrl`,
and `addedAt`.

## Errors

Errors use the shared `{"detail": "<code>"}` envelope from the
[Platform Catalog API v1 error model](./platform-catalog-api-v1.md#error-model).
Coverage-specific codes:

| Code | Status | Meaning |
| --- | --- | --- |
| `url_list_not_found` | 404 | No list with that id in your organization. |
| `url_list_deleting` | 409 | The list is `delete_pending`; mutations are refused. |
| `url_list_migrating` | 409 | Entries are being re-normalized; retry shortly. |
| `url_list_name_conflict` | 409 | A live list already uses that name. |
| `url_list_limit_exceeded` | 409 | Your organization already has 5 live lists. |
| `list_url_capacity_exceeded` | 409 | The add would exceed 100,000 entries. |
| `invalid_cursor` | 400 | The pagination cursor is malformed or stale. |
| `url_lists_unavailable` | 503 | The feature is temporarily disabled; retry later. |

Invalid URLs never fail a batch — they are reported per URL in `rejected`
with code `invalid_url`.

## BigQuery output

Once a list is `active`, its `bigQuery` block names an Analytics Hub listing
in the `catalogs_prod` exchange. Access is granted automatically to your
organization's registered BigQuery Readers — the same Readers used for
catalog listings — so subscribing works exactly like any other listing (see
the [Python SDK's BigQuery subscribe helpers](../../sdks/python/README.md#bigquery-subscribe-optional)).

The shared dataset exposes two views, both refreshed by the same daily
export (each run replaces the prior snapshot; `lastExportedAt` on the list
object tells you what they currently reflect):

- **`products_current_v1`** — the currently matched products for your list,
  in the same schema as catalog exports. `lastRowCount` is this view's row
  count.
- **`url_coverage_v1`** — one row per URL in your list, saying whether that
  URL matched:

  | column | meaning |
  | --- | --- |
  | `url` | The URL as you submitted it |
  | `normalized_url` | Octogen's normalized form of it |
  | `covered` | `TRUE` iff the export matched at least one product |
  | `exported_at` | The snapshot timestamp |

  The uncovered portion of your list is one query:

  ```sql
  SELECT url
  FROM `my-gcp-project.<linked_dataset>.url_coverage_v1`
  WHERE NOT covered
  ```

Don't infer coverage by comparing row counts across the two views: one URL
can match several products and several URLs can match one product, so the
counts are not ordered. `url_coverage_v1` is the per-URL ground truth.

URLs added after the last export appear in `url_coverage_v1` on the next
daily run.

## Command line

`octogen-url-lists` wraps every endpoint below, batching large URL files into
1,000-URL requests and keeping mutations dry-run by default:

```bash
octogen-url-lists create --name q3-campaign --apply
octogen-url-lists add-urls cul_01... --file urls.txt --apply
octogen-url-lists get cul_01...
```

See the [Python SDK README](../../sdks/python/README.md#coverage-url-lists-cli)
for the full command and exit-code tables.

## SDK equivalents

Both SDKs in this repository expose all eight endpoints:

- Python: `create_coverage_url_list`, `list_coverage_url_lists`,
  `get_coverage_url_list`, `delete_coverage_url_list`,
  `add_coverage_url_list_urls`, `remove_coverage_url_list_urls`,
  `check_coverage_url_list_urls`, `list_coverage_url_list_urls`
  ([README](../../sdks/python/README.md)).
- TypeScript: `createCoverageUrlList`, `listCoverageUrlLists`,
  `getCoverageUrlList`, `deleteCoverageUrlList`, `addCoverageUrlListUrls`,
  `removeCoverageUrlListUrls`, `checkCoverageUrlListUrls`,
  `listCoverageUrlListUrls` ([README](../../sdks/typescript/README.md)).

## OpenAPI

The published contract includes operation IDs `createUrlList`,
`listUrlLists`, `getUrlList`, `deleteUrlList`, `addUrlListUrls`,
`removeUrlListUrls`, `checkUrlListUrls`, and `listUrlListUrls` with full
request/response schemas for code generation.

## Next

- [Platform Catalog API v1 — Reference](./platform-catalog-api-v1.md)
- [Python SDK — BigQuery subscribe](../../sdks/python/README.md#bigquery-subscribe-optional)
