import type { ModelGeometry } from "./types";

/** Returns printable Z heights, excluding sloped extrusion moves and Z-hop travel. */
export function getToolpathLayerHeights(geometry: ModelGeometry): number[] {
  const heights = new Set<number>();
  for (let index = 0; index < geometry.positions.length; index += 6) {
    const startZ = geometry.positions[index + 2];
    const endZ = geometry.positions[index + 5];
    if (Math.abs(startZ - endZ) <= 0.001) {
      heights.add(Math.round(endZ * 1000) / 1000);
    }
  }
  return Array.from(heights).sort((left, right) => left - right);
}
