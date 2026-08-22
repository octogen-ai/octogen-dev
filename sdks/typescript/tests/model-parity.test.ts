import { describe, expect, it } from "vitest";

import type { components } from "../src/generated/types.js";
import type {
  MerchantProductImageMetadataView,
  MerchantProductListItem,
  MerchantProductView,
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
  });
});
