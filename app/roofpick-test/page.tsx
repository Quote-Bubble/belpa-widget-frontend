"use client";

// Isolated prototype: satellite photo + slide-your-share divider + live area.
// No drawn outline, no OSM, no reconstruction. Revert = delete this file.
import { useMemo, useRef, useState } from "react";

// Real 30 Walton Drive HP13 6TS data.
const CENTER = { lat: 51.6387737, lng: -0.7275063 };
const BBOX = { north: 51.6388325, south: 51.6387006, east: -0.7274176, west: -0.7276016 };
const SOLAR_AREA_M2 = 138.58517; // whole building (the semi pair)
const Z = 19;
const TILE = 256;
const GRID = 3;
const VB = GRID * TILE; // 768 viewBox units

function worldPx(lat: number, lng: number) {
  const size = TILE * 2 ** Z;
  const x = ((lng + 180) / 360) * size;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size;
  return { x, y };
}

const esriTile = (x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${y}/${x}`;

export default function RoofPickTest() {
  const geo = useMemo(() => {
    const c = worldPx(CENTER.lat, CENTER.lng);
    const tileX = Math.floor(c.x / TILE);
    const tileY = Math.floor(c.y / TILE);
    const originX = (tileX - 1) * TILE;
    const originY = (tileY - 1) * TILE;
    const toVB = (lat: number, lng: number) => {
      const p = worldPx(lat, lng);
      return { x: p.x - originX, y: p.y - originY };
    };
    const nw = toVB(BBOX.north, BBOX.west);
    const se = toVB(BBOX.south, BBOX.east);
    const tiles: { href: string; x: number; y: number }[] = [];
    for (let r = 0; r < GRID; r++)
      for (let col = 0; col < GRID; col++)
        tiles.push({
          href: esriTile(tileX - 1 + col, tileY - 1 + r),
          x: col * TILE,
          y: r * TILE,
        });
    return {
      tiles,
      box: { x: nw.x, y: nw.y, w: se.x - nw.x, h: se.y - nw.y },
    };
  }, []);

  const { box } = geo;
  const [dividerX, setDividerX] = useState(box.x + box.w / 2);
  const [yourSide, setYourSide] = useState<"left" | "right">("left");
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const leftFrac = (dividerX - box.x) / box.w;
  const frac = yourSide === "left" ? leftFrac : 1 - leftFrac;
  const area = Math.round(SOLAR_AREA_M2 * frac);
  const round50 = (n: number) => Math.round(n / 50) * 50;
  const lo = round50(area * 110);
  const hi = round50(area * 190);

  function moveTo(clientX: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((clientX - rect.left) / rect.width) * VB;
    setDividerX(Math.max(box.x, Math.min(box.x + box.w, x)));
  }

  const shade =
    yourSide === "left"
      ? { x: box.x, w: dividerX - box.x }
      : { x: dividerX, w: box.x + box.w - dividerX };

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "#0b1220",
        color: "#fff",
        font: "500 15px system-ui, sans-serif",
      }}
    >
      <div style={{ padding: "16px 18px 10px", textAlign: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Which part is your home?</div>
        <div style={{ opacity: 0.7, fontSize: 13, marginTop: 4 }}>
          Slide the line to the wall between you and next door.
        </div>
      </div>

      <div style={{ flex: 1, display: "grid", placeItems: "center", minHeight: 0, padding: 12 }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB} ${VB}`}
          style={{ width: "min(92vw, 70vh)", height: "min(92vw, 70vh)", borderRadius: 16, touchAction: "none", background: "#111" }}
          onPointerMove={(e) => dragging.current && moveTo(e.clientX)}
          onPointerUp={() => (dragging.current = false)}
          onPointerLeave={() => (dragging.current = false)}
        >
          {geo.tiles.map((t, i) => (
            <image key={i} href={t.href} x={t.x} y={t.y} width={TILE} height={TILE} preserveAspectRatio="none" />
          ))}

          {/* Detected building extent */}
          <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="none" stroke="#ffffff" strokeOpacity={0.5} strokeDasharray="4 4" strokeWidth={1.5} />
          {/* Your side */}
          <rect x={shade.x} y={box.y} width={shade.w} height={box.h} fill="#2f6bff" fillOpacity={0.34} />
          {/* Divider line */}
          <line x1={dividerX} y1={box.y - 14} x2={dividerX} y2={box.y + box.h + 14} stroke="#fff" strokeWidth={2.5} />
          {/* Big handle */}
          <circle
            cx={dividerX}
            cy={box.y + box.h / 2}
            r={16}
            fill="#2f6bff"
            stroke="#fff"
            strokeWidth={3}
            style={{ cursor: "ew-resize" }}
            onPointerDown={(e) => {
              dragging.current = true;
              (e.target as SVGElement).setPointerCapture(e.pointerId);
            }}
          />
        </svg>
      </div>

      <div style={{ padding: "8px 18px 24px", textAlign: "center" }}>
        <button
          onClick={() => setYourSide((s) => (s === "left" ? "right" : "left"))}
          style={{ marginBottom: 12, padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#fff", fontWeight: 600, fontSize: 13 }}
        >
          My home is on the {yourSide === "left" ? "left ◀" : "right ▶"} — tap to flip
        </button>
        <div style={{ fontSize: 26, fontWeight: 800 }}>≈ {area} m²</div>
        <div style={{ opacity: 0.85, marginTop: 2 }}>
          Estimated roof · ballpark £{lo.toLocaleString()} – £{hi.toLocaleString()}
        </div>
        <div style={{ opacity: 0.5, fontSize: 12, marginTop: 8 }}>
          Whole building {Math.round(SOLAR_AREA_M2)} m² (Google Solar) · your share {Math.round(frac * 100)}%
        </div>
      </div>
    </main>
  );
}
