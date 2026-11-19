"""View-model parity with the wire: image metadata objects, not strings.

Regression coverage for the shape bug where ``MerchantProductListItem.images``
was typed ``list[str]`` while the wire has always carried image metadata
objects — pydantic rejected every product that had images, and
``primary_image`` (the non-deprecated display-image field) was missing from
the model entirely.
"""

import octogen_ai_sdk
import pydantic
import pytest
from octogen_ai_sdk import MerchantProductListItem, MerchantProductView
from octogen_ai_sdk.generated import models as generated

WIRE_LIST_ITEM = {
    "uuid": "product-1",
    "productUrl": "https://example.com/products/linen-dress",
    "title": "Linen Dress",
    "imageUrl": "https://cdn.octogen.ai/abc/primary.webp",
    "primaryImage": {
        "url": "https://example.com/image.jpg",
        "cdnUrl": "https://cdn.octogen.ai/abc/primary.webp",
        "width": 1200,
        "height": 1600,
        "mimeType": "image/webp",
    },
    "images": [
        {
            "url": "https://example.com/image.jpg",
            "cdnUrl": "https://cdn.octogen.ai/abc/primary.webp",
            "sizeBytes": 123456,
        },
        {"url": "https://example.com/image-2.jpg"},
    ],
}


def test_list_item_parses_image_metadata_objects() -> None:
    item = MerchantProductListItem.model_validate(WIRE_LIST_ITEM)

    assert item.primary_image is not None
    assert item.primary_image.url == "https://example.com/image.jpg"
    assert item.primary_image.cdn_url == "https://cdn.octogen.ai/abc/primary.webp"
    assert item.primary_image.width == 1200
    assert [image.url for image in item.images] == [
        "https://example.com/image.jpg",
        "https://example.com/image-2.jpg",
    ]
    assert item.images[0].size_bytes == 123456
    assert item.images[1].cdn_url is None


def test_product_view_inherits_image_metadata() -> None:
    view = MerchantProductView.model_validate({**WIRE_LIST_ITEM, "inStock": True})

    assert view.in_stock is True
    assert view.primary_image is not None
    assert view.images[0].cdn_url == "https://cdn.octogen.ai/abc/primary.webp"


def test_string_images_are_rejected_as_contract_violations() -> None:
    # The wire never sends bare strings; accepting them would hide the same
    # drift this module exists to prevent.
    with pytest.raises(pydantic.ValidationError):
        MerchantProductListItem.model_validate(
            {**WIRE_LIST_ITEM, "images": ["https://example.com/image.jpg"]}
        )


@pytest.mark.parametrize(
    ("original", "alias"),
    [
        ("Attribute", "EnrichmentAttribute"),
        ("AttributeValue", "EnrichmentAttributeValue"),
        ("AdditionalAttributeView", "MerchantProvidedAttribute"),
        ("AudienceView", "ProductAudience"),
        ("BrandView", "ProductBrand"),
        ("BreadcrumbView", "ProductBreadcrumb"),
        ("CategoryView", "ProductCategory"),
        ("ColorView", "ProductColor"),
        ("MerchantProductView", "ProductDetail"),
        ("IdentifiersView", "ProductIdentifiers"),
        ("MerchantProductImageMetadataView", "ProductImage"),
        ("PromotionView", "ProductPromotion"),
        ("RatingView", "ProductRatingSummary"),
        ("ReviewView", "ProductReview"),
        ("ProductDetailsView", "ProductSpecifications"),
        ("MerchantProductListItem", "ProductSummary"),
        ("MerchantVariantView", "ProductVariant"),
        ("VideoView", "ProductVideo"),
    ],
)
def test_product_aliases_preserve_public_and_generated_models(
    original: str, alias: str
) -> None:
    assert alias in octogen_ai_sdk.__all__
    assert getattr(octogen_ai_sdk, alias) is getattr(octogen_ai_sdk, original)

    original_model = getattr(generated, original)
    alias_model = getattr(generated, alias)
    assert issubclass(alias_model, original_model)
    assert alias_model.model_json_schema() == {
        **original_model.model_json_schema(),
        "title": alias,
    }


def test_generated_lookup_and_retrieve_still_parse_legacy_model_classes() -> None:
    product = {**WIRE_LIST_ITEM, "variants": [{"color": {"label": "Blue"}}]}
    lookup = generated.ProgrammaticProductLookupResponse.model_validate(
        {"requestId": "request-1", "source": "indexed", "product": product}
    )
    retrieve = generated.ProductRetrieveResult.model_validate(
        {"requestedUuid": "product-1", "status": "found", "product": product}
    )
    for item in (lookup.product, retrieve.product):
        assert type(item) is generated.MerchantProductView
        assert item.variants is not None
        assert type(item.variants[0]) is generated.MerchantVariantView
        assert item.variants[0].color is not None
        assert item.variants[0].color.label == "Blue"


def test_scoped_product_detail_uses_typed_options_prices_and_variant_images() -> None:
    group = "pg-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    selection = "prd-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    variant = "var-cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    item = MerchantProductView.model_validate(
        {
            **WIRE_LIST_ITEM,
            "uuid": selection,
            "productGroupUuid": group,
            "selectedOptions": {"color": "Blue"},
            "availableOptions": {
                "color": [{"value": "Blue", "productUuid": selection}]
            },
            "priceRange": {"min": 0, "max": 30, "currency": "USD"},
            "variants": [
                {
                    "variantUuid": variant,
                    "options": {"size": "M"},
                    "primaryImage": WIRE_LIST_ITEM["primaryImage"],
                    "images": WIRE_LIST_ITEM["images"],
                }
            ],
        }
    )
    assert item.product_group_uuid == group
    assert item.selected_options == {"color": "Blue"}
    assert item.available_options["color"][0].product_uuid == selection
    assert item.price_range is not None
    assert item.price_range.min == 0 and item.price_range.currency == "USD"
    assert item.variants[0].variant_uuid == variant
    assert item.variants[0].options == {"size": "M"}
    assert item.variants[0].primary_image is not None
    assert item.variants[0].primary_image.width == 1200

    request = generated.ProductRetrieveBatchRequest(uuids=[group, selection])
    assert request.model_dump(mode="json") == {"uuids": [group, selection]}
