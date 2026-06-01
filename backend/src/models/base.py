"""Shared Pydantic base models."""

from pydantic import BaseModel, ConfigDict


class StrictModel(BaseModel):
    """Base model for request payloads that rejects unknown fields.

    With ``extra="forbid"`` an unrecognized or misspelled key (e.g. the legacy
    ``{"ground": {"type": ...}}`` instead of ``{"ground_type": ...}``) raises a
    422 validation error instead of being silently ignored and replaced by a
    default. Request/input models should inherit from this; response models
    stay on the permissive ``BaseModel``.
    """

    model_config = ConfigDict(extra="forbid")
