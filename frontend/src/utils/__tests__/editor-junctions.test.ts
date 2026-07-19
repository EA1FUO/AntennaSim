import { describe, expect, it } from "vitest";
import type { WireGeometry } from "../../templates/types";
import {
  expandJunctionEndpoints,
  findCoincidentEndpoints,
  getEndpointPosition,
  translateEndpoints,
  wireLength,
  type EditorJunction,
} from "../editor-junctions";

const wires: WireGeometry[] = [
  { tag: 1, segments: 3, x1: 0, y1: 0, z1: 0, x2: 1, y2: 0, z2: 0, radius: 0.001 },
  { tag: 2, segments: 3, x1: 1, y1: 0, z1: 0, x2: 1, y2: 1, z2: 0, radius: 0.001 },
  { tag: 3, segments: 3, x1: 1, y1: 0, z1: 0, x2: 2, y2: 0, z2: 0, radius: 0.001 },
];

describe("editor junction geometry", () => {
  it("finds every coincident endpoint with the selected endpoint first", () => {
    expect(findCoincidentEndpoints(wires, { wireTag: 1, endpoint: "end" })).toEqual([
      { wireTag: 1, endpoint: "end" },
      { wireTag: 2, endpoint: "start" },
      { wireTag: 3, endpoint: "start" },
    ]);
  });

  it("expands selected endpoints to all junction members without duplicates", () => {
    const junctions: EditorJunction[] = [
      {
        id: 1,
        endpoints: [
          { wireTag: 1, endpoint: "end" },
          { wireTag: 2, endpoint: "start" },
          { wireTag: 3, endpoint: "start" },
        ],
      },
    ];

    expect(
      expandJunctionEndpoints(
        [
          { wireTag: 1, endpoint: "end" },
          { wireTag: 2, endpoint: "start" },
        ],
        junctions,
      ),
    ).toHaveLength(3);
  });

  it("translates both endpoints without changing wire length", () => {
    const originalLength = wireLength(wires[0]!);
    const moved = translateEndpoints(
      wires,
      [
        { wireTag: 1, endpoint: "start" },
        { wireTag: 1, endpoint: "end" },
      ],
      { x: 5, y: -2, z: 3 },
    );

    expect(getEndpointPosition(moved, { wireTag: 1, endpoint: "start" })).toEqual({
      x: 5,
      y: -2,
      z: 3,
    });
    expect(wireLength(moved[0]!)).toBeCloseTo(originalLength, 12);
    expect(moved[1]).toBe(wires[1]);
  });
});
