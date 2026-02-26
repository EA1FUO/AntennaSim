"""Sandboxed nec2c subprocess runner."""

import logging
import os
import subprocess
import tempfile
import uuid
from pathlib import Path

from src.config import settings

logger = logging.getLogger("antsim.nec_runner")


class NecExecutionError(Exception):
    """Raised when nec2c execution fails."""

    def __init__(self, message: str, stderr: str = ""):
        self.message = message
        self.stderr = stderr
        super().__init__(message)


def run_nec2c(card_deck: str) -> str:
    """Execute nec2c with the given card deck and return stdout.

    Security measures:
    - shell=False always
    - Timeout enforced
    - Temp files in dedicated workdir with UUID subdirectory
    - Cleanup in finally block
    - No user input interpolated into commands

    Args:
        card_deck: Complete NEC2 input file content.

    Returns:
        The nec2c stdout output as a string.

    Raises:
        NecExecutionError: If nec2c fails or times out.
    """
    run_id = uuid.uuid4().hex[:12]
    workdir = Path(settings.nec_workdir) / run_id
    input_file = workdir / "input.nec"
    output_file = workdir / "input.out"

    try:
        # Create isolated workdir
        workdir.mkdir(parents=True, exist_ok=True)

        # Write card deck to input file
        input_file.write_text(card_deck, encoding="ascii")

        logger.debug("Running nec2c: run_id=%s, workdir=%s", run_id, workdir)

        # Execute nec2c — NEVER shell=True
        result = subprocess.run(
            ["nec2c", "-i", str(input_file), "-o", str(output_file)],
            capture_output=True,
            text=True,
            timeout=settings.sim_timeout_seconds,
            shell=False,
            cwd=str(workdir),
        )

        # Check for errors
        if result.returncode != 0:
            logger.error(
                "nec2c failed: run_id=%s, returncode=%d, stderr=%s",
                run_id, result.returncode, result.stderr[:500],
            )
            raise NecExecutionError(
                f"nec2c exited with code {result.returncode}",
                stderr=result.stderr[:500],
            )

        # Log any warnings from stderr
        if result.stderr.strip():
            logger.warning("nec2c stderr: %s", result.stderr[:500])

        # Read output file
        if not output_file.exists():
            raise NecExecutionError(
                "nec2c produced no output file",
                stderr=result.stderr[:500],
            )

        output = output_file.read_text(encoding="ascii", errors="replace")

        # Check for NEC2 geometry errors in output
        if "GEOMETRY DATA ERROR" in output:
            raise NecExecutionError(
                "NEC2 geometry data error — check wire definitions"
            )
        if "SEGMENT DATA ERROR" in output:
            raise NecExecutionError(
                "NEC2 segment data error — check segmentation"
            )

        logger.debug(
            "nec2c success: run_id=%s, output_size=%d bytes",
            run_id, len(output),
        )
        return output

    except subprocess.TimeoutExpired:
        logger.error("nec2c timeout: run_id=%s", run_id)
        raise NecExecutionError(
            f"nec2c timed out after {settings.sim_timeout_seconds}s"
        )

    finally:
        # ALWAYS clean up temp files
        try:
            if output_file.exists():
                output_file.unlink()
            if input_file.exists():
                input_file.unlink()
            if workdir.exists():
                workdir.rmdir()
        except OSError as e:
            logger.warning("Cleanup failed for %s: %s", workdir, e)
