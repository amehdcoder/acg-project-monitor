import { useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Grid } from "@react-three/drei";
import * as THREE from "three";

export interface Household3D {
  id: string;
  lat: number;
  lng: number;
  roofHeightM: number;
  coverageStatus: "unassessed" | "covered" | "missed" | "refused" | "revisit";
  label?: string | null;
  intervention_status?: string | null;
}

export interface Village3DMapProps {
  centerLat: number;
  centerLng: number;
  perimeter: Array<{ lat: number; lng: number }>;
  households: Household3D[];
  onTapHousehold: (id: string) => void;
  onAddHouseholdAt?: (lat: number, lng: number) => void;
  selectedId?: string | null;
}

const STATUS_COLORS: Record<Household3D["coverageStatus"], string> = {
  unassessed: "#94a3b8", // slate-400
  covered: "#22c55e", // green-500
  missed: "#ef4444", // red-500
  refused: "#eab308", // yellow-500
  revisit: "#f97316", // orange-500
};

// Convert lat/lng to local meters relative to center
function toLocalMeters(lat: number, lng: number, centerLat: number, centerLng: number) {
  const R = 6371000;
  const x = ((lng - centerLng) * Math.PI) / 180 * R * Math.cos((centerLat * Math.PI) / 180);
  const z = -((lat - centerLat) * Math.PI) / 180 * R; // negate so north is -z
  return { x, z };
}

function fromLocalMeters(x: number, z: number, centerLat: number, centerLng: number) {
  const R = 6371000;
  const lat = centerLat + ((-z) / R) * (180 / Math.PI);
  const lng = centerLng + (x / (R * Math.cos((centerLat * Math.PI) / 180))) * (180 / Math.PI);
  return { lat, lng };
}

function House({
  position,
  height,
  color,
  selected,
  onTap,
}: {
  position: [number, number, number];
  height: number;
  color: string;
  selected: boolean;
  onTap: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  return (
    <group position={position}>
      {/* Walls */}
      <mesh
        ref={meshRef}
        position={[0, height / 2, 0]}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onTap();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "default";
        }}
      >
        <boxGeometry args={[2.5, height, 2.5]} />
        <meshStandardMaterial color="#d6d3d1" />
      </mesh>
      {/* Roof — color-coded coverage status */}
      <mesh position={[0, height + 0.4, 0]} castShadow>
        <coneGeometry args={[1.9, 0.9, 4]} />
        <meshStandardMaterial
          color={color}
          emissive={selected ? color : "#000"}
          emissiveIntensity={selected ? 0.4 : 0}
        />
      </mesh>
      {(hovered || selected) && (
        <mesh position={[0, height + 1.4, 0]}>
          <ringGeometry args={[1.6, 1.9, 32]} />
          <meshBasicMaterial color={color} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

function PerimeterLine({
  perimeter,
  centerLat,
  centerLng,
}: {
  perimeter: Array<{ lat: number; lng: number }>;
  centerLat: number;
  centerLng: number;
}) {
  const points = useMemo(() => {
    return perimeter.map((p) => {
      const { x, z } = toLocalMeters(p.lat, p.lng, centerLat, centerLng);
      return new THREE.Vector3(x, 0.05, z);
    });
  }, [perimeter, centerLat, centerLng]);

  if (points.length < 2) return null;

  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);

  return (
    <line>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial color="#3b82f6" linewidth={3} />
    </line>
  );
}

function GroundClick({
  onClick,
  centerLat,
  centerLng,
}: {
  onClick?: (lat: number, lng: number) => void;
  centerLat: number;
  centerLng: number;
}) {
  if (!onClick) return null;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      onClick={(e) => {
        const { x, z } = e.point;
        const ll = fromLocalMeters(x, z, centerLat, centerLng);
        onClick(ll.lat, ll.lng);
      }}
    >
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial color="#0f172a" transparent opacity={0} />
    </mesh>
  );
}

function CameraSetup({ households }: { households: Household3D[] }) {
  const { camera } = useThree();
  useMemo(() => {
    const range = Math.max(20, Math.min(100, households.length * 4));
    camera.position.set(range * 0.6, range * 0.8, range * 0.6);
    camera.lookAt(0, 0, 0);
  }, [camera, households.length]);
  return null;
}

const Village3DMap = ({
  centerLat,
  centerLng,
  perimeter,
  households,
  onTapHousehold,
  onAddHouseholdAt,
  selectedId,
}: Village3DMapProps) => {
  return (
    <Canvas
      shadows
      camera={{ position: [40, 40, 40], fov: 50 }}
      style={{ background: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)" }}
    >
      <CameraSetup households={households} />
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[30, 50, 30]}
        intensity={1.0}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <Grid
        args={[200, 200]}
        cellSize={5}
        cellThickness={0.5}
        cellColor="#334155"
        sectionSize={25}
        sectionThickness={1}
        sectionColor="#475569"
        fadeDistance={120}
        fadeStrength={1}
        infiniteGrid
      />

      <GroundClick onClick={onAddHouseholdAt} centerLat={centerLat} centerLng={centerLng} />

      <PerimeterLine perimeter={perimeter} centerLat={centerLat} centerLng={centerLng} />

      {households.map((h) => {
        const { x, z } = toLocalMeters(h.lat, h.lng, centerLat, centerLng);
        return (
          <House
            key={h.id}
            position={[x, 0, z]}
            height={Math.max(2, h.roofHeightM)}
            color={STATUS_COLORS[h.coverageStatus]}
            selected={selectedId === h.id}
            onTap={() => onTapHousehold(h.id)}
          />
        );
      })}

      {/* North indicator */}
      <Text position={[0, 0.5, -50]} fontSize={3} color="#f8fafc" anchorX="center" anchorY="middle">
        N
      </Text>

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        maxPolarAngle={Math.PI / 2.1}
        minDistance={10}
        maxDistance={200}
      />
    </Canvas>
  );
};

export default Village3DMap;
