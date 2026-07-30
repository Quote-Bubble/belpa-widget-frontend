import type { SolarScan } from "@/lib/types";

/**
 * Reconstruct a 3D roof from a Google Solar scan.
 *
 * Each roof segment becomes a quad tilted to its real pitch, oriented to its
 * real azimuth, sat at its real relative height — so the assembled planes form
 * the actual roofscape. Everything is UV-mapped against a shared geographic
 * bounds (the aerial mosaic), so one top-down photo projects seamlessly across
 * roof AND ground. Realism from the photo, 3D from the Solar data.
 *
 * Local metres; origin = scan centre; +x = east, +z = south (north = -z), +y up.
 */

const DEG = Math.PI / 180;
const M = 111_320;

export type LocalBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export function makeToLocal(scan: SolarScan) {
  const c = scan.center;
  const cosLat = Math.cos(c.lat * DEG);
  return (lat: number, lng: number): [number, number] => [
    (lng - c.lng) * M * cosLat,
    -(lat - c.lat) * M,
  ];
}

export type RoofGeometry = {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
  footprint: LocalBounds;
  wallHeight: number;
  ridgeHeight: number;
};

/**
 * @param uv  local-metre bounds the texture is mapped against (the aerial
 *            mosaic bounds). u = x within [minX,maxX]; v = z within [minZ,maxZ]
 *            with v=0 at north (top of image); use texture.flipY = false.
 */
export function buildRoofGeometry(
  scan: SolarScan,
  uv: LocalBounds,
  wallHeight = 5,
): RoofGeometry {
  const toLocal = makeToLocal(scan);
  const segs = scan.roofSegmentStats;
  const heights = segs
    .map((s) => s.planeHeightAtCenterMeters)
    .filter((h): h is number => typeof h === "number");
  const minPlaneH = heights.length ? Math.min(...heights) : 0;
  const bboxCentre = (b: {
    north: number;
    south: number;
    east: number;
    west: number;
  }) => ({ lat: (b.north + b.south) / 2, lng: (b.east + b.west) / 2 });

  const [bxW, bzN] = toLocal(scan.boundingBox.north, scan.boundingBox.west);
  const [bxE, bzS] = toLocal(scan.boundingBox.south, scan.boundingBox.east);
  const footprint: LocalBounds = {
    minX: Math.min(bxW, bxE),
    maxX: Math.max(bxW, bxE),
    minZ: Math.min(bzN, bzS),
    maxZ: Math.max(bzN, bzS),
  };

  const spanU = uv.maxX - uv.minX || 1;
  const spanV = uv.maxZ - uv.minZ || 1;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let ridgeHeight = wallHeight;

  segs.forEach((seg) => {
    const tanP = Math.tan(seg.pitchDegrees * DEG);
    const az = seg.azimuthDegrees * DEG;
    // Up-slope unit in local (x, z): (-sin az, cos az).
    const uX = -Math.sin(az);
    const uZ = Math.cos(az);

    const bb = seg.boundingBox;
    const cen = seg.center ?? bboxCentre(bb);
    const [ccx, ccz] = toLocal(cen.lat, cen.lng);
    const relH = (seg.planeHeightAtCenterMeters ?? minPlaneH) - minPlaneH;
    const baseY = wallHeight + relH;
    const corners: [number, number][] = [
      toLocal(bb.north, bb.west),
      toLocal(bb.north, bb.east),
      toLocal(bb.south, bb.east),
      toLocal(bb.south, bb.west),
    ];

    const start = positions.length / 3;
    corners.forEach(([x, z]) => {
      const dot = (x - ccx) * uX + (z - ccz) * uZ;
      const y = baseY + dot * tanP;
      ridgeHeight = Math.max(ridgeHeight, y);
      positions.push(x, y, z);
      uvs.push((x - uv.minX) / spanU, (z - uv.minZ) / spanV);
    });
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  });

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(indices),
    footprint,
    wallHeight,
    ridgeHeight,
  };
}

/* ---- Esri World Imagery aerial mosaic (free, CORS-enabled tiles) ---- */

const ESRI_TILE = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

function tileToLngLat(x: number, y: number, z: number): [number, number] {
  const n = 2 ** z;
  const lng = (x / n) * 360 - 180;
  const lat =
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return [lng, lat];
}

export type AerialMosaic = {
  urls: { url: string; col: number; row: number }[];
  grid: number; // NxN tiles
  tilePx: number;
  /** WGS84 bounds of the whole mosaic. */
  latLngBounds: { north: number; south: number; east: number; west: number };
};

/**
 * NxN tile mosaic (odd `grid`) centred on the scan, at Esri's best zoom for the
 * spot. z19 is the practical ceiling for most UK residential imagery.
 */
export function buildAerialMosaic(
  scan: SolarScan,
  z = 19,
  grid = 3,
): AerialMosaic {
  const c = scan.center;
  const n = 2 ** z;
  const xc = Math.floor(((c.lng + 180) / 360) * n);
  const latRad = c.lat * DEG;
  const yc = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  const half = Math.floor(grid / 2);
  const urls: AerialMosaic["urls"] = [];
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      urls.push({
        url: ESRI_TILE(z, xc - half + col, yc - half + row),
        col,
        row,
      });
    }
  }
  const [west, north] = tileToLngLat(xc - half, yc - half, z);
  const [east, south] = tileToLngLat(xc + half + 1, yc + half + 1, z);
  return { urls, grid, tilePx: 256, latLngBounds: { north, south, east, west } };
}

/** The aerial mosaic's WGS84 bounds converted to local-metre UV bounds. */
export function mosaicLocalBounds(
  scan: SolarScan,
  mosaic: AerialMosaic,
): LocalBounds {
  const toLocal = makeToLocal(scan);
  const b = mosaic.latLngBounds;
  const [wX, nZ] = toLocal(b.north, b.west);
  const [eX, sZ] = toLocal(b.south, b.east);
  return {
    minX: Math.min(wX, eX),
    maxX: Math.max(wX, eX),
    minZ: Math.min(nZ, sZ),
    maxZ: Math.max(nZ, sZ),
  };
}
