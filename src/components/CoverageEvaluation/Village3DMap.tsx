import { useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Grid, Html, Float } from "@react-three/drei";
import * as THREE from "three";
import { Segment } from "@/lib/ces/kmeansSegments";

export interface Household3D {
  id: string;
  lat: number;
  lng: number;
  roofHeightM: number;
  coverageStatus: "unassessed" | "covered" | "missed" | "refused" | "revisit";
  label?: string | null;
  hh_number?: string | null;
  intervention_status?: string | null;
}

export interface Village3DMapProps {
  centerLat: number;
  centerLng: number;
  perimeter: Array<{ lat: number; lng: number }>;
  households: Household3D[];
  segments?: Segment[];
  inferredCoverage?: Record<string, number>; // label -> 0..1
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

// Heatmap colors for coverage (Red -> Yellow -> Green)
function getCoverageColor(rate: number) {
  if (rate >= 0.8) return "#22c55e"; // Green
  if (rate >= 0.5) return "#eab308"; // Yellow
  return "#ef4444"; // Red
}

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
  label,
  onTap,
}: {
  position: [number, number, number];
  height: number;
  color: string;
  selected: boolean;
  label?: string | null;
  onTap: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <group position={position}>
      {/* House Body */}
      <mesh
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
        <meshStandardMaterial color="#f1f5f9" roughness={0.7} metalness={0.1} />
      </mesh>
      
      {/* Roof — color-coded coverage status */}
      <mesh position={[0, height, 0]} castShadow>
        <coneGeometry args={[1.9, 1.2, 4]} />
        <meshStandardMaterial
          color={color}
          emissive={selected ? color : "#000"}
          emissiveIntensity={selected ? 0.6 : 0}
        />
      </mesh>

      {/* Selected/Hover indicator ring */}
      {(hovered || selected) && (
        <mesh position={[0, height + 1.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.6, 2.0, 32]} />
          <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.8} />
        </mesh>
      )}

      {selected && label && (
        <Html position={[0, height + 3, 0]} center distanceFactor={10}>
          <div className="bg-slate-900/90 text-white px-2 py-1 rounded text-[10px] whitespace-nowrap border border-slate-700 shadow-xl pointer-events-none">
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

function SegmentPolygon({
  segment,
  rate,
  centerLat,
  centerLng,
}: {
  segment: Segment;
  rate: number;
  centerLat: number;
  centerLng: number;
}) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    segment.polygon.forEach((p, i) => {
      const { x, z } = toLocalMeters(p.lat, p.lng, centerLat, centerLng);
      if (i === 0) s.moveTo(x, z);
      else s.lineTo(x, z);
    });
    return s;
  }, [segment, centerLat, centerLng]);

  const color = getCoverageColor(rate);
  const { x, z } = toLocalMeters(segment.centroid.lat, segment.centroid.lng, centerLat, centerLng);

  const points = useMemo(() => {
     return segment.polygon.map(p => {
            const { x, z } = toLocalMeters(p.lat, p.lng, centerLat, centerLng);
            return new THREE.Vector3(x, 0.03, z);
          }).concat([toLocalMeters(segment.polygon[0].lat, segment.polygon[0].lng, centerLat, centerLng)].map(p => new THREE.Vector3(p.x, 0.03, p.z)))
  }, [segment, centerLat, centerLng]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={1}
        />
      </mesh>
      {/* Border */}
      <line>
        <bufferGeometry attach="geometry" {...new THREE.BufferGeometry().setFromPoints(points)} />
        <lineBasicMaterial color={color} linewidth={2} transparent opacity={0.5} />
      </line>

      {/* Segment Label */}
      <Text
        position={[x, 0.5, z]}
        fontSize={2.5}
        color={color}
        anchorX="center"
        anchorY="middle"
        rotation={[-Math.PI / 2, 0, 0]}
      >
        {`${segment.label}\n${Math.round(rate * 100)}%`}
      </Text>
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
      return new THREE.Vector3(x, 0.1, z);
    });
  }, [perimeter, centerLat, centerLng]);

  if (points.length < 2) return null;

  const geometry = new THREE.BufferGeometry().setFromPoints(points.concat([points[0]]));

  return (
    <line>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial color="#3b82f6" linewidth={4} />
    </line>
  );
}

function MapGround({
  onClick,
  centerLat,
  centerLng,
}: {
  onClick?: (lat: number, lng: number) => void;
  centerLat: number;
  centerLng: number;
}) {
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        onClick={(e) => {
          if (!onClick) return;
          const { x, z } = e.point;
          const ll = fromLocalMeters(x, z, centerLat, centerLng);
          onClick(ll.lat, ll.lng);
        }}
      >
        <planeGeometry args={[1000, 1000]} />
        <meshStandardMaterial color="#0f172a" roughness={1} metalness={0} />
      </mesh>
      
      <Grid
        args={[500, 500]}
        cellSize={10}
        cellThickness={1}
        cellColor="#1e293b"
        sectionSize={50}
        sectionThickness={1.5}
        sectionColor="#334155"
        fadeDistance={400}
        fadeStrength={1}
        infiniteGrid
      />
      
      {/* Decorative "Roads" */}
      <Grid
        args={[500, 500]}
        cellSize={100}
        cellThickness={4}
        cellColor="#334155"
        sectionSize={100}
        sectionThickness={0}
        fadeDistance={400}
      />
    </group>
  );
}

function CameraSetup({ households }: { households: Household3D[] }) {
  const { camera } = useThree();
  useMemo(() => {
    const range = Math.max(40, Math.min(150, households.length * 5));
    camera.position.set(range * 0.7, range * 0.8, range * 0.7);
    camera.lookAt(0, 0, 0);
  }, [camera, households.length]);
  return null;
}

const Village3DMap = ({
  centerLat,
  centerLng,
  perimeter,
  households,
  segments = [],
  inferredCoverage = {},
  onTapHousehold,
  onAddHouseholdAt,
  selectedId,
}: Village3DMapProps) => {
  return (
    <Canvas
      shadows
      camera={{ position: [60, 60, 60], fov: 45 }}
      style={{ background: "#020617" }}
    >
      <CameraSetup households={households} />
      <fog attach="fog" args={["#020617", 100, 500]} />
      
      <ambientLight intensity={0.4} />
      <pointLight position={[100, 100, 100]} intensity={1} castShadow />
      <directionalLight
        position={[-50, 80, 50]}
        intensity={0.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />

      <MapGround onClick={onAddHouseholdAt} centerLat={centerLat} centerLng={centerLng} />

      <PerimeterLine perimeter={perimeter} centerLat={centerLat} centerLng={centerLng} />

      {/* Segments with Geostatistical Coloring */}
      {segments.map((seg) => (
        <SegmentPolygon
          key={seg.label}
          segment={seg}
          rate={inferredCoverage[seg.label] ?? 0}
          centerLat={centerLat}
          centerLng={centerLng}
        />
      ))}

      {/* Houses */}
      {households.map((h) => {
        const { x, z } = toLocalMeters(h.lat, h.lng, centerLat, centerLng);
        return (
          <House
            key={h.id}
            position={[x, 0, z]}
            height={Math.max(2.5, h.roofHeightM)}
            color={STATUS_COLORS[h.coverageStatus]}
            selected={selectedId === h.id}
            label={h.label || h.hh_number || null}
            onTap={() => onTapHousehold(h.id)}
          />
        );
      })}

      {/* Compass / North indicator */}
      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <group position={[0, 1, -80]}>
          <Text fontSize={6} color="#3b82f6" anchorX="center" anchorY="middle" rotation={[-Math.PI / 2, 0, 0]}>
            N
          </Text>
          <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[2, 8, 4]} />
            <meshStandardMaterial color="#3b82f6" />
          </mesh>
        </group>
      </Float>

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        maxPolarAngle={Math.PI / 2.2}
        minDistance={20}
        maxDistance={400}
        makeDefault
      />
    </Canvas>
  );
};

export default Village3DMap;
