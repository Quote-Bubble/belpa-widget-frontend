"use client";

// Isolated 3D-roof prototype. Not wired into the widget flow — delete this
// folder + components/roof3d + lib/roof3d + the three/fiber/drei deps to revert.
import dynamic from "next/dynamic";

import { HP13_SCAN } from "@/lib/roof3d/scan-hp13";

const RoofScene = dynamic(
  () => import("@/components/roof3d/RoofScene").then((m) => m.RoofScene),
  { ssr: false, loading: () => <Loading /> },
);

function Loading() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        color: "#5b6472",
        font: "500 15px system-ui, sans-serif",
      }}
    >
      Building your roof…
    </div>
  );
}

export default function Roof3DTestPage() {
  return (
    <main style={{ position: "fixed", inset: 0, background: "#dfe7f2" }}>
      <RoofScene scan={HP13_SCAN} />
      <div
        style={{
          position: "absolute",
          left: 16,
          bottom: 16,
          padding: "8px 12px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.82)",
          backdropFilter: "blur(8px)",
          font: "600 13px system-ui, sans-serif",
          color: "#0a0b0d",
          boxShadow: "0 8px 24px -12px rgba(16,24,40,0.4)",
        }}
      >
        30 Walton Drive · reconstructed from the Solar scan · drag to orbit
      </div>
    </main>
  );
}
