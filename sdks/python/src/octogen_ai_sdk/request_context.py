"""Typed, transient metadata for one API call; never shared visitor state."""

from __future__ import annotations

import json
from enum import Enum
from typing import Annotated, Any, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ModelWrapValidatorHandler,
    ValidationError,
    model_validator,
)

REQUEST_CONTEXT_HEADER = "X-Octogen-Request-Context"
MAX_CONTEXT_HEADER_BYTES = 4096

ContextString = Annotated[str, Field(max_length=256)]
RequestTrigger = Literal[
    "user_search",
    "page_load",
    "filter_change",
    "pagination",
    "autoplay",
    "prefetch",
    "isr_refresh",
    "background",
]
VisitorClassification = Literal[
    "likely_human", "verified_bot", "suspected_bot", "unknown"
]


class InvalidRequestContext(TypeError):
    """A payload-free validation error, including for model construction."""

    def __init__(self) -> None:
        super().__init__("Invalid RequestContext")


class _ContextModel(BaseModel):
    model_config = ConfigDict(
        frozen=True,
        strict=True,
        extra="forbid",
        hide_input_in_errors=True,
        revalidate_instances="always",
    )

    @model_validator(mode="wrap")
    @classmethod
    def _private_errors(
        cls, value: Any, handler: ModelWrapValidatorHandler[Self]
    ) -> Self:
        try:
            return handler(value)
        except ValidationError:
            # TypeError escapes Pydantic's input-bearing ValidationError wrapper.
            raise InvalidRequestContext() from None


class RequestVisitor(_ContextModel):
    """Caller-reported assessment, including when it says verified_bot."""

    classification: VisitorClassification | None = None
    provider: ContextString | None = None
    bot_name: ContextString | None = None


class RequestContextDefaults(_ContextModel):
    """Only stable application metadata may be reused by a client."""

    application: ContextString | None = None
    feature: ContextString | None = None
    trigger: RequestTrigger | None = None


class RequestContext(RequestContextDefaults):
    """Per-call metadata. Omitted fields inherit; explicit None clears a field."""

    user_id: ContextString | None = None
    session_id: ContextString | None = None
    page_view_id: ContextString | None = None
    user_agent: Annotated[str, Field(max_length=1024)] | None = None
    visitor: RequestVisitor | None = None


class _ContextUnset(Enum):
    INHERIT = "inherit"


_CONTEXT_UNSET = _ContextUnset.INHERIT


def _snapshot_defaults(
    defaults: RequestContextDefaults | None,
) -> dict[str, Any] | None:
    if defaults is None:
        return None
    if not isinstance(defaults, RequestContextDefaults):
        raise InvalidRequestContext()
    # Revalidate even model_construct/model_copy and reject a RequestContext
    # subclass carrying visitor fields where stable defaults were expected.
    result = RequestContextDefaults.model_validate(
        defaults.model_dump(exclude_unset=True, warnings=False)
    ).model_dump(exclude_unset=True, warnings=False)
    _serialize(result)
    return result


def _serialize(value: dict[str, Any]) -> str:
    header = json.dumps(value, ensure_ascii=True, separators=(",", ":"))
    if len(header) > MAX_CONTEXT_HEADER_BYTES:
        raise InvalidRequestContext()
    return header


def _context_header(
    defaults: dict[str, Any] | None,
    context: RequestContext | None | _ContextUnset,
) -> str | None:
    if context is None:
        return None
    if context is _CONTEXT_UNSET:
        return None if defaults is None else _serialize(defaults)
    if not isinstance(context, RequestContext):
        raise InvalidRequestContext()
    supplied = RequestContext.model_validate(
        context.model_dump(exclude_unset=True, warnings=False)
    ).model_dump(exclude_unset=True, warnings=False)
    return _serialize({**(defaults or {}), **supplied})
