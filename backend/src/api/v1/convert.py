"""POST /api/v1/convert — file format conversion endpoint.

Supports:
  - .maa -> JSON (MMANA-GAL import)
  - .nec -> JSON (NEC2 card deck import)
  - JSON -> .maa (MMANA-GAL export)
  - JSON -> .nec (NEC2 card deck export)
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.models.antenna import Wire, Excitation, LumpedLoad, TransmissionLine
from src.models.ground import GroundConfig
from src.converters.maa_import import parse_maa, MAAParseError
from src.converters.maa_export import export_maa
from src.converters.nec_file import parse_nec_file, NECParseError
from src.simulation.nec_input import build_card_deck
from src.models.simulation import SimulationRequest, FrequencyConfig

logger = logging.getLogger("antsim.api.convert")

router = APIRouter()


# ---- Request / Response Models ----

class ImportRequest(BaseModel):
    """Import a .maa or .nec file."""
    content: str = Field(description="Raw file content as text")
    format: str = Field(description="File format: 'maa' or 'nec'")


class ImportResponse(BaseModel):
    """Parsed antenna data from an imported file."""
    title: str
    wires: list[dict]
    excitations: list[dict]
    loads: list[dict]
    transmission_lines: list[dict]
    ground_type: str
    ground_dielectric: float
    ground_conductivity: float
    frequency_start_mhz: float
    frequency_stop_mhz: float
    frequency_steps: int
    warnings: list[str]


class ExportRequest(BaseModel):
    """Export antenna data to .maa or .nec format."""
    format: str = Field(description="Output format: 'maa' or 'nec'")
    title: str = Field(default="AntennaSim export")
    wires: list[Wire]
    excitations: list[Excitation]
    loads: list[LumpedLoad] = Field(default_factory=list)
    transmission_lines: list[TransmissionLine] = Field(default_factory=list)
    ground: GroundConfig = Field(default_factory=GroundConfig)
    frequency_start_mhz: float = Field(default=14.0, ge=0.1, le=2000.0)
    frequency_stop_mhz: float = Field(default=14.5, ge=0.1, le=2000.0)
    frequency_steps: int = Field(default=11, ge=1, le=201)


class ExportResponse(BaseModel):
    """Exported file content."""
    content: str
    format: str
    filename_suggestion: str


# ---- Endpoints ----

@router.post("/convert/import", response_model=ImportResponse)
async def import_file(request: ImportRequest) -> ImportResponse:
    """Import a .maa or .nec file and return parsed antenna data."""
    warnings: list[str] = []

    if request.format.lower() == "maa":
        try:
            data = parse_maa(request.content)
        except MAAParseError as e:
            raise HTTPException(status_code=400, detail=f"Invalid .maa file: {e}")

        return ImportResponse(
            title=data.title,
            wires=[w.model_dump() for w in data.wires],
            excitations=[e.model_dump() for e in data.excitations],
            loads=[ld.model_dump() for ld in data.loads],
            transmission_lines=[],
            ground_type=data.ground.ground_type.value,
            ground_dielectric=data.ground.dielectric_constant,
            ground_conductivity=data.ground.conductivity,
            frequency_start_mhz=data.frequency_mhz - 0.5,
            frequency_stop_mhz=data.frequency_mhz + 0.5,
            frequency_steps=21,
            warnings=warnings,
        )

    elif request.format.lower() == "nec":
        try:
            data_nec = parse_nec_file(request.content)
        except NECParseError as e:
            raise HTTPException(status_code=400, detail=f"Invalid .nec file: {e}")

        return ImportResponse(
            title=data_nec.comment,
            wires=[w.model_dump() for w in data_nec.wires],
            excitations=[e.model_dump() for e in data_nec.excitations],
            loads=[ld.model_dump() for ld in data_nec.loads],
            transmission_lines=[tl.model_dump() for tl in data_nec.transmission_lines],
            ground_type=data_nec.ground.ground_type.value,
            ground_dielectric=data_nec.ground.dielectric_constant,
            ground_conductivity=data_nec.ground.conductivity,
            frequency_start_mhz=data_nec.frequency_start_mhz,
            frequency_stop_mhz=data_nec.frequency_stop_mhz,
            frequency_steps=data_nec.frequency_steps,
            warnings=warnings,
        )

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported import format: '{request.format}'. Use 'maa' or 'nec'.",
        )


@router.post("/convert/export", response_model=ExportResponse)
async def export_file(request: ExportRequest) -> ExportResponse:
    """Export antenna data to .maa or .nec format."""

    if request.format.lower() == "maa":
        content = export_maa(
            title=request.title,
            wires=request.wires,
            excitations=request.excitations,
            loads=request.loads if request.loads else None,
            frequency_mhz=(request.frequency_start_mhz + request.frequency_stop_mhz) / 2,
        )
        return ExportResponse(
            content=content,
            format="maa",
            filename_suggestion="antenna.maa",
        )

    elif request.format.lower() == "nec":
        # Build a SimulationRequest to reuse the card deck builder
        freq_config = FrequencyConfig(
            start_mhz=request.frequency_start_mhz,
            stop_mhz=request.frequency_stop_mhz,
            steps=request.frequency_steps,
        )
        sim_request = SimulationRequest(
            wires=request.wires,
            excitations=request.excitations,
            ground=request.ground,
            frequency=freq_config,
            comment=request.title,
            loads=request.loads,
            transmission_lines=request.transmission_lines,
        )
        content = build_card_deck(sim_request)
        return ExportResponse(
            content=content,
            format="nec",
            filename_suggestion="antenna.nec",
        )

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported export format: '{request.format}'. Use 'maa' or 'nec'.",
        )
