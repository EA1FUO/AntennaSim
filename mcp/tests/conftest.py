"""pytest configuration for AntennaSim MCP unit tests.

Adds the mcp/ source directory to sys.path so tests can do
    from server import _classify_pattern_shape
    from simulator import parse_ground_spec
    from templates import resolve_params
without installing the antsim-mcp-server package.

IMPORTANT: because AntennaSim/mcp/__init__.py marks the directory as a Python
package, pytest automatically inserts AntennaSim/ into sys.path.  That would
make 'import mcp' resolve to our local mcp/ directory instead of the installed
mcp package, causing 'from mcp.server.fastmcp import FastMCP' to fail with
  ModuleNotFoundError: No module named 'mcp.server.fastmcp'; 'mcp.server' is not a package
We therefore remove AntennaSim/ from sys.path here so the installed mcp package
always wins.
"""

import sys
from pathlib import Path

_MCP_DIR = Path(__file__).parent.parent          # …/AntennaSim/mcp
_PARENT_DIR = _MCP_DIR.parent                    # …/AntennaSim

# Add mcp/ so 'from server import …' works as a flat import.
if str(_MCP_DIR) not in sys.path:
    sys.path.insert(0, str(_MCP_DIR))

# Remove the parent (AntennaSim/) if pytest already inserted it.
# This prevents our local mcp/ package from shadowing the installed mcp library.
while str(_PARENT_DIR) in sys.path:
    sys.path.remove(str(_PARENT_DIR))