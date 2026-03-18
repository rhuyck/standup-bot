import { CENTER_LNG, CENTER_LAT } from './constants';

type BlockDef = [dLng: number, dLat: number, blockW: number, blockH: number, numBuildings: number];

/** Deterministic LCG pseudo-random number generator seeded at 42. */
function makePrng(seed = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/**
 * Generates a synthetic GeoJSON FeatureCollection of block boundaries and
 * building footprints around the Columbus, OH downtown center.
 */
export function buildSitePlan(): GeoJSON.FeatureCollection {
  const rng = makePrng();

  const blocks: BlockDef[] = [
    [-0.009, -0.005, 0.006, 0.0035, 3],
    [-0.002, -0.005, 0.005, 0.0035, 4],
    [ 0.004, -0.005, 0.005, 0.0035, 2],
    [-0.009,  0.000, 0.006, 0.0035, 4],
    [-0.002,  0.000, 0.005, 0.0035, 5],
    [ 0.004,  0.000, 0.005, 0.0035, 3],
    [-0.009,  0.005, 0.006, 0.0035, 2],
    [-0.002,  0.005, 0.005, 0.0035, 4],
    [ 0.004,  0.005, 0.005, 0.0035, 3],
  ];

  const features: GeoJSON.Feature[] = [];

  for (const [dLng, dLat, bw, bh, nb] of blocks) {
    const ox = CENTER_LNG + dLng;
    const oy = CENTER_LAT + dLat;

    // Block boundary
    features.push({
      type: 'Feature',
      properties: { kind: 'block' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[ox, oy], [ox + bw, oy], [ox + bw, oy + bh], [ox, oy + bh], [ox, oy]]],
      },
    });

    // Buildings inside block
    const pad = 0.0003;
    for (let i = 0; i < nb; i++) {
      const fw = 0.0007 + rng() * 0.0012;
      const fh = 0.0005 + rng() * 0.0009;
      const fx = ox + pad + rng() * Math.max(0.0001, bw - pad * 2 - fw);
      const fy = oy + pad + rng() * Math.max(0.0001, bh - pad * 2 - fh);
      features.push({
        type: 'Feature',
        properties: { kind: 'building', floors: 2 + Math.floor(rng() * 18) },
        geometry: {
          type: 'Polygon',
          coordinates: [[[fx, fy], [fx + fw, fy], [fx + fw, fy + fh], [fx, fy + fh], [fx, fy]]],
        },
      });
    }
  }

  return { type: 'FeatureCollection', features };
}
