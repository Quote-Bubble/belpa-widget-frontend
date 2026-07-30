import type { SolarScan } from "@/lib/types";

/** Real Google Solar scan for 30 Walton Drive, HP13 6TS — prototype data. */
export const HP13_SCAN: SolarScan = {
  center: { lat: 51.6387737, lng: -0.7275063 },
  boundingBox: {
    north: 51.6388325,
    south: 51.6387006,
    east: -0.7274176,
    west: -0.7276016,
  },
  imageryQuality: "HIGH",
  imageryDate: "2023-08-28",
  wholeRoofStats: { areaMeters2: 138.58517, groundAreaMeters2: 119.15 },
  roofSegmentStats: [
    { pitchDegrees: 2.5556962, azimuthDegrees: 149.58192, areaMeters2: 28.688536, groundAreaMeters2: 28.66, boundingBox: { north: 51.6387966, south: 51.6387259, east: -0.7274265, west: -0.7275065 }, center: { lat: 51.6387612, lng: -0.7274679 }, planeHeightAtCenterMeters: 167.61293 },
    { pitchDegrees: 36.565105, azimuthDegrees: 12.501977, areaMeters2: 23.31979, groundAreaMeters2: 18.73, boundingBox: { north: 51.6388295, south: 51.6387871, east: -0.7274754, west: -0.7275829 }, center: { lat: 51.6388094, lng: -0.7275392 }, planeHeightAtCenterMeters: 170.9625 },
    { pitchDegrees: 37.97799, azimuthDegrees: 104.84126, areaMeters2: 23.533226, groundAreaMeters2: 18.55, boundingBox: { north: 51.6388135, south: 51.6387421, east: -0.7274762, west: -0.7275447 }, center: { lat: 51.6387810, lng: -0.7275103 }, planeHeightAtCenterMeters: 170.56125 },
    { pitchDegrees: 37.567783, azimuthDegrees: 194.24242, areaMeters2: 21.92693, groundAreaMeters2: 17.38, boundingBox: { north: 51.6387920, south: 51.6387455, east: -0.7275134, west: -0.7275951 }, center: { lat: 51.6387675, lng: -0.7275587 }, planeHeightAtCenterMeters: 170.98235 },
    { pitchDegrees: 4.3745313, azimuthDegrees: 181.38509, areaMeters2: 14.652686, groundAreaMeters2: 14.61, boundingBox: { north: 51.6387456, south: 51.6387012, east: -0.7274507, west: -0.7275222 }, center: { lat: 51.6387194, lng: -0.7274902 }, planeHeightAtCenterMeters: 167.26306 },
    { pitchDegrees: 47.238823, azimuthDegrees: 13.911394, areaMeters2: 11.679903, groundAreaMeters2: 7.93, boundingBox: { north: 51.6388312, south: 51.6388066, east: -0.7274176, west: -0.727527 }, center: { lat: 51.6388188, lng: -0.7274665 }, planeHeightAtCenterMeters: 168.09085 },
    { pitchDegrees: 23.54498, azimuthDegrees: 183.81725, areaMeters2: 7.592064, groundAreaMeters2: 6.96, boundingBox: { north: 51.6388123, south: 51.6387931, east: -0.7274185, west: -0.7274814 }, center: { lat: 51.6388014, lng: -0.7274529 }, planeHeightAtCenterMeters: 168.14107 },
    { pitchDegrees: 28.340742, azimuthDegrees: 191.14651, areaMeters2: 7.1920376, groundAreaMeters2: 6.33, boundingBox: { north: 51.6387561, south: 51.6387343, east: -0.7275369, west: -0.7276 }, center: { lat: 51.6387444, lng: -0.7275714 }, planeHeightAtCenterMeters: 167.59961 },
  ],
};
