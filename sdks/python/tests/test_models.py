"""View-model parity with the wire: image metadata objects, not strings.

Regression coverage for the shape bug where ``MerchantProductListItem.images``
was typed ``list[str]`` while the wire has always carried image metadata
objects — pydantic rejected every product that had images, and
``primary_image`` (the non-deprecated display-image field) was missing from
the model entirely.
"""

import pydantic
import pytest
from octogen_ai_sdk import MerchantProductListItem, MerchantProductView

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
