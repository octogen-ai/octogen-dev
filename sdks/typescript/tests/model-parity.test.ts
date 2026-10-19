import { describe, expect, it } from "vitest";

import type { components } from "../src/generated/types.js";
import type {
  MerchantProductImageMetadataView,
  MerchantProductListItem,
  MerchantProductView,
  MoreLikeThisEffectiveQuery,
  MoreLikeThisProductsResponse,
  ProgrammaticFacetCountsRequest,
  ProgrammaticMoreLikeThisRequest,
  ProgrammaticProductSearchPage,
  ProgrammaticProductSearchRequest,
} from "../src/models.js";

/**
 * Compile-time parity gates between the hand-written view models and the
 * generated contract. The hand-written models are allowed to be friendlier
 * than the contract (optionality, named enums), but they must not silently
 * drop contract fields or type a field with a shape the wire never sends —
 * `images: string[]` shipped exactly that way once, while the wire carried
 * image metadata objects.
 */
type GeneratedListItem = components["schemas"]["MerchantProductListItem"];
type GeneratedProductView = components["schemas"]["MerchantProductView"];
type GeneratedImageView = components["schemas"]["MerchantProductImageMetadataView"];
type GeneratedSearchRequest = components["schemas"]["ProgrammaticProductSearchRequest"];
type GeneratedSearchPage = components["schemas"]["ProgrammaticProductSearchPage"];
type GeneratedFacetCountsRequest =
  components["schemas"]["ProgrammaticFacetCountsRequest"];
type GeneratedMoreLikeThisRequest =
  components["schemas"]["ProgrammaticMoreLikeThisRequest"];
type GeneratedMoreLikeThisResponse =
  components["schemas"]["ProgrammaticMoreLikeThisResponse"];
type GeneratedMoreLikeThisEffectiveQuery =
  components["schemas"]["ProgrammaticMoreLikeThisEffectiveQuery"];

type Extends<A, B> = A extends B ? true : false;

/**
 * When a generated schema gains a field the hand-written model lacks, this
 * type resolves to the missing key names and the `true` assignment below
 * fails naming them.
 */
type MissingListItemKeys = Exclude<
  keyof GeneratedListItem,
  keyof MerchantProductListItem
>;
type MissingProductViewKeys = Exclude<
  keyof GeneratedProductView,
  keyof MerchantProductView
>;

const listItemKeysCovered: MissingListItemKeys extends never
  ? true
  : MissingListItemKeys = true;
const productViewKeysCovered: MissingProductViewKeys extends never
  ? true
  : MissingProductViewKeys = true;

// The search body must carry exactly the contract's fields: a field the API
// gains shows up as a missing key, and one it retires (as `catalog` and
// `text_search_query` were in 0.5.0) as an extra one.
type MissingSearchRequestKeys = Exclude<
  keyof GeneratedSearchRequest,
  keyof ProgrammaticProductSearchRequest
>;
type ExtraSearchRequestKeys = Exclude<
  keyof ProgrammaticProductSearchRequest,
  keyof GeneratedSearchRequest
>;
type MissingSearchPageKeys = Exclude<
  keyof GeneratedSearchPage,
  keyof ProgrammaticProductSearchPage
>;

const searchRequestKeysCovered: MissingSearchRequestKeys extends never
  ? true
  : MissingSearchRequestKeys = true;
const searchRequestKeysCurrent: ExtraSearchRequestKeys extends never
  ? true
  : ExtraSearchRequestKeys = true;
const searchPageKeysCovered: MissingSearchPageKeys extends never
  ? true
  : MissingSearchPageKeys = true;

// The facet-counts body is hand-written for the same reason as the search body
// (defaulted contract fields come out required), so it is pinned the same way.
type MissingFacetCountsRequestKeys = Exclude<
  keyof GeneratedFacetCountsRequest,
  keyof ProgrammaticFacetCountsRequest
>;
type ExtraFacetCountsRequestKeys = Exclude<
  keyof ProgrammaticFacetCountsRequest,
  keyof GeneratedFacetCountsRequest
>;

const facetCountsRequestKeysCovered: MissingFacetCountsRequestKeys extends never
  ? true
  : MissingFacetCountsRequestKeys = true;
const facetCountsRequestKeysCurrent: ExtraFacetCountsRequestKeys extends never
  ? true
  : ExtraFacetCountsRequestKeys = true;

// The more-like-this body must not carry a field the contract retired (as it
// retired `include_facets` for `facets`), and must cover every field except
// the ones this SDK does not expose yet.
type UnexposedMoreLikeThisRequestKeys =
  "omit_generated_facets" | "ranking_embedding_columns" | "retrieval_embedding_columns";
type MissingMoreLikeThisRequestKeys = Exclude<
  keyof GeneratedMoreLikeThisRequest,
  keyof ProgrammaticMoreLikeThisRequest | UnexposedMoreLikeThisRequestKeys
>;
type ExtraMoreLikeThisRequestKeys = Exclude<
  keyof ProgrammaticMoreLikeThisRequest,
  keyof GeneratedMoreLikeThisRequest
>;
// Its effective query must not declare a field the server stopped sending, as
// it stopped sending `relaxationRounds` for `relaxation`.
type ExtraMoreLikeThisEffectiveQueryKeys = Exclude<
  keyof MoreLikeThisEffectiveQuery,
  keyof GeneratedMoreLikeThisEffectiveQuery
>;

const moreLikeThisRequestKeysCovered: MissingMoreLikeThisRequestKeys extends never
  ? true
  : MissingMoreLikeThisRequestKeys = true;
const moreLikeThisRequestKeysCurrent: ExtraMoreLikeThisRequestKeys extends never
  ? true
  : ExtraMoreLikeThisRequestKeys = true;
const moreLikeThisEffectiveQueryKeysCurrent: ExtraMoreLikeThisEffectiveQueryKeys extends never
  ? true
  : ExtraMoreLikeThisEffectiveQueryKeys = true;
const moreLikeThisSourcesParity: Extends<
  NonNullable<GeneratedMoreLikeThisResponse["sources"]>[number],
  NonNullable<MoreLikeThisProductsResponse["sources"]>[number]
> = true;
const moreLikeThisRelaxationParity: Extends<
  NonNullable<GeneratedMoreLikeThisEffectiveQuery["relaxation"]>,
  NonNullable<MoreLikeThisEffectiveQuery["relaxation"]>
> = true;

// The image fields must accept exactly what the contract sends.
const imageViewParity: Extends<GeneratedImageView, MerchantProductImageMetadataView> =
  true;
const listItemImagesParity: Extends<
  GeneratedListItem["images"],
  NonNullable<MerchantProductListItem["images"]>
> = true;
const listItemPrimaryImageParity: Extends<
  NonNullable<GeneratedListItem["primaryImage"]>,
  NonNullable<MerchantProductListItem["primaryImage"]>
> = true;

describe("Unit: view model parity with the generated contract", () => {
  it("keeps the hand-written models field-complete against the contract", () => {
    expect(listItemKeysCovered).toBe(true);
    expect(productViewKeysCovered).toBe(true);
    expect(imageViewParity).toBe(true);
    expect(listItemImagesParity).toBe(true);
    expect(listItemPrimaryImageParity).toBe(true);
    expect(searchRequestKeysCovered).toBe(true);
    expect(searchRequestKeysCurrent).toBe(true);
    expect(searchPageKeysCovered).toBe(true);
    expect(facetCountsRequestKeysCovered).toBe(true);
    expect(facetCountsRequestKeysCurrent).toBe(true);
    expect(moreLikeThisRequestKeysCovered).toBe(true);
    expect(moreLikeThisRequestKeysCurrent).toBe(true);
    expect(moreLikeThisEffectiveQueryKeysCurrent).toBe(true);
    expect(moreLikeThisRelaxationParity).toBe(true);
    expect(moreLikeThisSourcesParity).toBe(true);
  });
});
