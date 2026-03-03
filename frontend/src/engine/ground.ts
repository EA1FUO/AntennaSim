/**
 * Ground configuration utilities shared by both engine implementations.
 */

import type { GroundConfig } from "../templates/types";

/** Ground type to NEC2 ground parameters mapping */
export const GROUND_PARAMS: Record<
  string,
  { permittivity: number; conductivity: number }
> = {
  salt_water: { permittivity: 80, conductivity: 5.0 },
  fresh_water: { permittivity: 80, conductivity: 0.001 },
  pastoral: { permittivity: 14, conductivity: 0.01 },
  average: { permittivity: 13, conductivity: 0.005 },
  rocky: { permittivity: 12, conductivity: 0.002 },
  city: { permittivity: 5, conductivity: 0.001 },
  dry_sandy: { permittivity: 3, conductivity: 0.0001 },
};

/** Build ground payload for the backend API */
export function buildGroundPayload(
  ground: GroundConfig,
): Record<string, unknown> {
  if (ground.type === "free_space") {
    return { ground_type: "free_space" };
  } else if (ground.type === "perfect") {
    return { ground_type: "perfect" };
  } else if (ground.type === "custom") {
    return {
      ground_type: "custom",
      dielectric_constant: ground.custom_permittivity ?? 13,
      conductivity: ground.custom_conductivity ?? 0.005,
    };
  } else {
    const params = GROUND_PARAMS[ground.type] ?? GROUND_PARAMS.average!;
    return {
      ground_type: ground.type,
      dielectric_constant: params.permittivity,
      conductivity: params.conductivity,
    };
  }
}
