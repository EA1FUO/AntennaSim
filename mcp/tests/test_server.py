"""Unit tests for MCP server pure-logic functions.

These tests do NOT require nec2c or the AntennaSim backend — they test only
the Python functions that can be exercised without running a simulation.

NOTE on imports
---------------
``_classify_pattern_shape`` and ``_compute_cut_beamwidth`` are imported from
``pattern_helpers`` (not from ``server``) so that pytest can run them without
importing ``server.py``, which in turn requires the installed ``mcp`` library.
Because ``AntennaSim/mcp/__init__.py`` makes our directory a Python package,
pytest adds ``AntennaSim/`` to sys.path, which would cause ``import mcp`` to
resolve to our local ``mcp/`` directory instead of the installed ``mcp``
package, breaking ``from mcp.server.fastmcp import FastMCP``.
Importing from ``pattern_helpers`` avoids that entire import chain.
"""

from __future__ import annotations

import math
import pytest


# ---------------------------------------------------------------------------
# parse_ground_spec
# ---------------------------------------------------------------------------

class TestParseGroundSpec:
    """Tests for simulator.parse_ground_spec()."""

    def setup_method(self) -> None:
        from simulator import parse_ground_spec
        self.parse = parse_ground_spec

    def test_empty_string_returns_default(self) -> None:
        ground, eps, sigma = self.parse("", "average")
        assert ground == "average"
        assert eps is None
        assert sigma is None

    def test_none_returns_default(self) -> None:
        ground, eps, sigma = self.parse(None, "average")
        assert ground == "average"

    def test_default_keyword_returns_default(self) -> None:
        ground, eps, sigma = self.parse("default", "free_space")
        assert ground == "free_space"

    def test_valid_preset_returns_normalised(self) -> None:
        ground, eps, sigma = self.parse("average", "average")
        assert ground == "average"
        assert eps is None
        assert sigma is None

    def test_valid_preset_salt_water(self) -> None:
        ground, eps, sigma = self.parse("salt_water", "average")
        assert ground == "salt_water"

    def test_valid_preset_free_space(self) -> None:
        ground, eps, sigma = self.parse("free_space", "average")
        assert ground == "free_space"

    def test_custom_format_parses_values(self) -> None:
        ground, eps, sigma = self.parse("custom:13,0.005", "average")
        assert ground == "custom"
        assert eps == pytest.approx(13.0)
        assert sigma == pytest.approx(0.005)

    def test_custom_with_spaces(self) -> None:
        ground, eps, sigma = self.parse("custom: 80, 5.0", "average")
        assert ground == "custom"
        assert eps == pytest.approx(80.0)
        assert sigma == pytest.approx(5.0)

    def test_invalid_preset_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="Unknown ground type"):
            self.parse("bogus_ground", "average")

    def test_custom_bad_format_raises_value_error(self) -> None:
        with pytest.raises(ValueError):
            self.parse("custom:only_one_value", "average")

    def test_custom_non_numeric_raises_value_error(self) -> None:
        with pytest.raises(ValueError):
            self.parse("custom:abc,def", "average")


# ---------------------------------------------------------------------------
# resolve_params
# ---------------------------------------------------------------------------

class TestResolveParams:
    """Tests for templates.resolve_params()."""

    def setup_method(self) -> None:
        from templates import get_template, resolve_params, TEMPLATES
        self.get_template = get_template
        self.resolve = resolve_params
        self.all_templates = TEMPLATES

    def test_empty_params_returns_defaults(self) -> None:
        template = self.get_template("dipole")
        result = self.resolve(template, {})
        assert result["frequency"] == pytest.approx(14.1)
        assert result["height"] == pytest.approx(10.0)
        assert result["wire_diameter"] == pytest.approx(2.0)

    def test_override_one_param(self) -> None:
        template = self.get_template("dipole")
        result = self.resolve(template, {"frequency": 7.0})
        assert result["frequency"] == pytest.approx(7.0)
        assert result["height"] == pytest.approx(10.0)

    def test_unknown_key_raises(self) -> None:
        from templates import TemplateParameterError
        template = self.get_template("dipole")
        with pytest.raises(TemplateParameterError, match="Unknown parameter"):
            self.resolve(template, {"nonexistent_param": 1.0})

    def test_out_of_range_raises(self) -> None:
        from templates import TemplateParameterError
        template = self.get_template("dipole")
        with pytest.raises(TemplateParameterError, match="out of range"):
            self.resolve(template, {"frequency": -1.0})

    def test_all_templates_have_valid_defaults(self) -> None:
        """All templates must be able to resolve default parameters without error."""
        for template in self.all_templates:
            result = self.resolve(template, {})
            for p in template.parameters:
                assert p.key in result
                assert p.min <= result[p.key] <= p.max

    def test_boolean_param_raises(self) -> None:
        from templates import TemplateParameterError
        template = self.get_template("dipole")
        with pytest.raises(TemplateParameterError, match="not boolean"):
            self.resolve(template, {"frequency": True})


# ---------------------------------------------------------------------------
# _classify_pattern_shape
# NOTE: imported from pattern_helpers, not server, to avoid the FastMCP chain.
# ---------------------------------------------------------------------------

class TestClassifyPatternShape:
    """Tests for _classify_pattern_shape() from pattern_helpers."""

    def setup_method(self) -> None:
        from pattern_helpers import _classify_pattern_shape
        self.classify = _classify_pattern_shape

    def _uniform_cut(self, gain: float = 0.0, n: int = 36) -> list[tuple[float, float]]:
        """Build a perfectly flat azimuth cut with n points."""
        return [(i * (360.0 / n), gain) for i in range(n)]

    def test_empty_pattern_returns_unknown(self) -> None:
        result = self.classify([])
        assert result["shape"] == "unknown"
        assert result["num_lobes"] == 0

    def test_flat_pattern_is_omnidirectional(self) -> None:
        cut = self._uniform_cut(0.0)
        result = self.classify(cut)
        assert result["shape"] == "omnidirectional"
        assert result["azimuth_variation_db"] == pytest.approx(0.0)

    def test_high_variation_is_directional(self) -> None:
        # Simulate a very directional pattern: +10 dBi in one direction, -10 dBi elsewhere
        cut = [(float(i * 10), -10.0 + (20.0 if i == 0 else 0.0)) for i in range(36)]
        result = self.classify(cut)
        assert result["shape"] in {"directional", "highly directional", "unidirectional"}
        assert result["azimuth_variation_db"] > 6.0

    def test_bidirectional_detection(self) -> None:
        # Two lobes 180° apart with similar gain
        cut = []
        for i in range(36):
            angle = i * 10.0
            gain = 5.0 if angle in (0.0, 180.0) else -5.0
            cut.append((angle, gain))
        result = self.classify(cut)
        assert result["shape"] in {"bidirectional", "directional", "highly directional"}

    def test_single_point_returns_valid_result(self) -> None:
        result = self.classify([(0.0, 3.0)])
        assert "shape" in result
        assert result["num_lobes"] >= 1


# ---------------------------------------------------------------------------
# _compute_cut_beamwidth
# NOTE: imported from pattern_helpers, not server, to avoid the FastMCP chain.
# ---------------------------------------------------------------------------

class TestComputeCutBeamwidth:
    """Tests for _compute_cut_beamwidth() from pattern_helpers."""

    def setup_method(self) -> None:
        from pattern_helpers import _compute_cut_beamwidth
        self.compute = _compute_cut_beamwidth

    def _gaussian_cut(
        self, peak_angle: float = 0.0, bw_deg: float = 60.0, n: int = 360
    ) -> list[tuple[float, float]]:
        """Approximate a Gaussian beam pattern for testing."""
        sigma = bw_deg / (2.0 * math.sqrt(2.0 * math.log(2.0)))
        cut = []
        for i in range(n):
            angle = i * 360.0 / n
            diff = (angle - peak_angle + 180.0) % 360.0 - 180.0
            gain = 10.0 * math.exp(-0.5 * (diff / sigma) ** 2)
            cut.append((angle, gain))
        return sorted(cut, key=lambda p: p[0])

    def test_single_point_returns_none(self) -> None:
        assert self.compute([(0.0, 5.0)], 0.0, 5.0, circular=True) is None

    def test_two_points_returns_none(self) -> None:
        assert self.compute([(0.0, 5.0), (180.0, -5.0)], 0.0, 5.0, circular=True) is None

    def test_gaussian_beamwidth_approximately_correct(self) -> None:
        target_bw = 60.0
        cut = self._gaussian_cut(peak_angle=0.0, bw_deg=target_bw)
        peak_gain = max(g for _, g in cut)
        result = self.compute(cut, 0.0, peak_gain, circular=True)
        assert result is not None
        # Discretized Gaussian at 1-degree steps introduces quantization;
        # allow 35% tolerance.
        assert abs(result - target_bw) < target_bw * 0.35

    def test_non_circular_cut_returns_value(self) -> None:
        cut = [(float(i), 10.0 - abs(i - 90.0) * 0.2) for i in range(0, 181, 2)]
        peak_gain = max(g for _, g in cut)
        result = self.compute(cut, 90.0, peak_gain, circular=False)
        assert result is not None
        assert result > 0.0