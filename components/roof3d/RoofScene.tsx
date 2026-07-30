"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import type { SolarScan } from "@/lib/types";
import {
  buildAerialMosaic,
  buildRoofGeometry,
  mosaicLocalBounds,
  type LocalBounds,
} from "@/lib/roof3d/model";

/** Stitch the Esri tile mosaic into one canvas texture (manual load, no Suspense). */
function useAerialTexture(scan: SolarScan): THREE.CanvasTexture | null {
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null);
  useEffect(() => {
    let cancelled = false;
    const mosaic = buildAerialMosaic(scan, 19, 3);
    const px = mosaic.grid * mosaic.tilePx;
    const canvas = document.createElement("canvas");
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let done = 0;
    const finish = () => {
      if (cancelled) return;
      const t = new THREE.CanvasTexture(canvas);
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.needsUpdate = true;
      setTex(t);
    };
    mosaic.urls.forEach(({ url, col, row }) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const settle = () => {
        done += 1;
        if (done === mosaic.urls.length) finish();
      };
      img.onload = () => {
        if (!cancelled) ctx.drawImage(img, col * 256, row * 256, 256, 256);
        settle();
      };
      img.onerror = settle;
      img.src = url;
    });
    return () => {
      cancelled = true;
    };
  }, [scan]);
  return tex;
}

function groundGeometry(b: LocalBounds): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array([
    b.minX, 0, b.minZ,
    b.maxX, 0, b.minZ,
    b.maxX, 0, b.maxZ,
    b.minX, 0, b.maxZ,
  ]);
  const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

function RoofModel({ scan }: { scan: SolarScan }) {
  const mosaic = useMemo(() => buildAerialMosaic(scan, 19, 3), [scan]);
  const uvBounds = useMemo(
    () => mosaicLocalBounds(scan, mosaic),
    [scan, mosaic],
  );
  const model = useMemo(() => buildRoofGeometry(scan, uvBounds, 5), [scan, uvBounds]);
  const tex = useAerialTexture(scan);

  const roofGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(model.positions, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(model.uvs, 2));
    g.setIndex(new THREE.BufferAttribute(model.indices, 1));
    g.computeVertexNormals();
    return g;
  }, [model]);
  const ground = useMemo(() => groundGeometry(uvBounds), [uvBounds]);

  const { minX, maxX, minZ, maxZ } = model.footprint;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const span = Math.max(width, depth);

  return (
    <group>
      <mesh geometry={ground} receiveShadow>
        <meshStandardMaterial
          map={tex ?? undefined}
          color={tex ? "#ffffff" : "#c9d3c0"}
          roughness={1}
        />
      </mesh>

      <mesh position={[cx, model.wallHeight / 2, cz]} castShadow receiveShadow>
        <boxGeometry args={[width, model.wallHeight, depth]} />
        <meshStandardMaterial color="#e8e2d8" roughness={0.85} />
      </mesh>

      <mesh geometry={roofGeom} castShadow receiveShadow>
        <meshStandardMaterial
          map={tex ?? undefined}
          color={tex ? "#ffffff" : "#9aa7b4"}
          side={THREE.DoubleSide}
          roughness={0.82}
        />
      </mesh>

      <ContactShadows
        position={[cx, 0.02, cz]}
        scale={span * 3}
        opacity={0.45}
        blur={2.6}
        far={model.ridgeHeight + 6}
      />

      <OrbitControls
        target={[cx, model.wallHeight * 0.55, cz]}
        autoRotate
        autoRotateSpeed={0.9}
        enablePan={false}
        minPolarAngle={0.25}
        maxPolarAngle={Math.PI / 2.15}
        minDistance={span * 0.9}
        maxDistance={span * 5}
      />
    </group>
  );
}

export function RoofScene({ scan }: { scan: SolarScan }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [18, 16, 18], fov: 42, near: 0.1, far: 3000 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#dfe7f2"]} />
      <hemisphereLight args={["#eaf1ff", "#9c9484", 0.85]} />
      <directionalLight
        position={[20, 30, 14]}
        intensity={2.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-bias={-0.0002}
      />
      <RoofModel scan={scan} />
    </Canvas>
  );
}
