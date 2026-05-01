"""Shared utility functions for the AntennaSim MCP server modules."""

from __future__ import annotations

import collections.abc
from typing import Any


def is_non_string_sequence(value: Any) -> bool:
    """Return True if value is a sequence but not a string, bytes, or mapping.

    This distinguishes between a single excitation object and a list of them,
    without accidentally treating strings as sequences.
    """
    return (
        isinstance(value, collections.abc.Sequence)
        and not isinstance(value, (str, bytes, bytearray))
        and not isinstance(value, collections.abc.Mapping)
    )


def get_field(item: Any, key: str) -> Any:
    """Get a field from a Mapping or object attribute.

    Abstracts over dict-like objects and dataclass/pydantic model instances.
    Tries mapping access first (for dicts), then falls back to attribute access.

    Args:
        item: A Mapping or object with attributes.
        key:  The field name to retrieve.

    Returns:
        The value at item[key] or getattr(item, key).

    Raises:
        KeyError: If item is a Mapping and key is not present.
        AttributeError: If item is not a Mapping and has no such attribute.
    """
    if isinstance(item, collections.abc.Mapping):
        return item[key]
    return getattr(item, key)