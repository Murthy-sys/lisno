import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  BackSide,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  FrontSide,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  TorusGeometry
} from "three";
import type { Group, WebGLProgramParametersWithUniforms } from "three";
import type { BudgetLiquidMetric, BudgetLiquidSceneProps, BudgetLiquidTone } from "./budgetLiquidMetrics";

const VESSEL_HEIGHT = 2.7;
const VESSEL_RADIUS = 0.9;
const LIQUID_RADIUS = VESSEL_RADIUS - 0.045;
const LIQUID_BOTTOM = -VESSEL_HEIGHT / 2 + 0.105;
const LIQUID_CAPACITY = VESSEL_HEIGHT - 0.24;
const FILL_DURATION = 0.6;
const COLORS: Record<BudgetLiquidTone, string> = {
  total: "#9bc6b3",
  usable: "#bfd8c3",
  expense: "#e4b4a7",
  overhead: "#dce2df",
  reserve: "#e4d3a4"
};

// Concentric rings give the liquid a curved interior, rather than a flat circle fan.
function createLiquidSurface(segments: number, rings: number) {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const radius = (ring / rings) * LIQUID_RADIUS;
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      positions.push(x, 0, z);
      normals.push(0, 1, 0);
      uvs.push(x / (2 * LIQUID_RADIUS) + 0.5, z / (2 * LIQUID_RADIUS) + 0.5);
      if (ring < rings && segment < segments) {
        const a = ring * (segments + 1) + segment;
        const b = a + segments + 1;
        indices.push(a, b + 1, b, a, a + 1, b + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function createGeometries(mobile: boolean) {
  const segments = mobile ? 36 : 56;
  return {
    wall: new CylinderGeometry(VESSEL_RADIUS, VESSEL_RADIUS, VESSEL_HEIGHT, segments, 1, true),
    base: new CylinderGeometry(VESSEL_RADIUS, VESSEL_RADIUS, 0.095, segments),
    rim: new TorusGeometry(VESSEL_RADIUS, 0.013, 8, segments),
    reflection: new CylinderGeometry(VESSEL_RADIUS + 0.003, VESSEL_RADIUS + 0.003, VESSEL_HEIGHT - 0.12, segments, 1, true, -0.72, 0.035),
    softReflection: new CylinderGeometry(VESSEL_RADIUS + 0.003, VESSEL_RADIUS + 0.003, VESSEL_HEIGHT - 0.12, segments, 1, true, 0.75, 0.1),
    liquid: new CylinderGeometry(LIQUID_RADIUS, LIQUID_RADIUS, 1, segments, 1, true),
    bottom: new CircleGeometry(LIQUID_RADIUS, segments),
    surface: createLiquidSurface(segments, mobile ? 8 : 14)
  };
}

type VesselGeometries = ReturnType<typeof createGeometries>;

function createVesselMaterials() {
  const front = new MeshPhysicalMaterial({
    color: "#f1f5f2", roughness: 0.1, metalness: 0,
    transparent: true, opacity: 0.1, side: FrontSide, depthWrite: false, clearcoat: 1
  });
  front.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
      float glassEdge = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.5);
      diffuseColor.a = 0.025 + 0.2 * glassEdge;
      outgoingLight = mix(outgoingLight, vec3(0.64, 0.7, 0.68), glassEdge * 0.5);
      #include <opaque_fragment>
    `);
  };
  front.customProgramCacheKey = () => "budget-clear-glass-v1";
  return {
    back: new MeshPhysicalMaterial({
      color: "#e4eeeb", roughness: 0.16, metalness: 0,
      transparent: true, opacity: 0.055, side: BackSide, depthWrite: false
    }),
    front,
    rim: new MeshPhysicalMaterial({
      color: "#d8e3df", roughness: 0.12, metalness: 0, clearcoat: 1,
      transparent: true, opacity: 0.72, depthWrite: false
    }),
    base: new MeshPhysicalMaterial({
      color: "#deebe6", roughness: 0.12, metalness: 0, clearcoat: 1,
      transparent: true, opacity: 0.24, depthWrite: false
    }),
    reflection: new MeshStandardMaterial({
      color: "#ffffff", roughness: 0.12, transparent: true, opacity: 0.44, depthWrite: false
    }),
    softReflection: new MeshStandardMaterial({
      color: "#ffffff", roughness: 0.2, transparent: true, opacity: 0.12, depthWrite: false
    })
  };
}

type VesselMaterials = ReturnType<typeof createVesselMaterials>;

const WAVE_VERTEX = `
uniform float budgetTime;
uniform float budgetAmplitude;
uniform float budgetPhase;
vec3 budgetWave(vec2 p) {
  float radius = ${LIQUID_RADIUS};
  float radiusSquared = ${LIQUID_RADIUS * LIQUID_RADIUS};
  float edge = max(0.0, 1.0 - dot(p, p) / radiusSquared);
  float phase = budgetTime * 1.366 + budgetPhase;
  vec2 tilt = vec2(0.62 * cos(phase), 0.18 * sin(phase)) / radius;
  vec2 direction = vec2(cos(phase * 0.55), sin(phase * 0.55));
  float travel = dot(p, direction) * 5.2;
  float ripple = sin(travel) * sin(phase * 1.45);
  vec2 rippleSlope = 5.2 * direction * cos(travel) * sin(phase * 1.45);
  vec2 crossDirection = vec2(-direction.y, direction.x);
  float crossTravel = dot(p, crossDirection) * 8.8;
  float crossRipple = sin(crossTravel) * cos(phase * 1.2);
  vec2 crossSlope = 8.8 * crossDirection * cos(crossTravel) * cos(phase * 1.2);
  float localWave = 0.26 * ripple + 0.12 * crossRipple;
  vec2 localSlope = 0.26 * rippleSlope + 0.12 * crossSlope;
  // Every term is odd about the vessel centre, so sloshing never changes its mean fill.
  return budgetAmplitude * vec3(
    dot(p, tilt) + edge * localWave,
    tilt.x + edge * localSlope.x - 2.0 * p.x * localWave / radiusSquared,
    tilt.y + edge * localSlope.y - 2.0 * p.y * localWave / radiusSquared
  );
}
`;

function createLiquidMaterials(tone: BudgetLiquidTone, phase: number) {
  const time = { value: 0 };
  const amplitude = { value: 0 };
  const height = { value: LIQUID_CAPACITY };
  const surface = new MeshPhysicalMaterial({
    color: COLORS[tone], roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08,
    transparent: true, opacity: 0.86, depthWrite: false
  });
  surface.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.budgetTime = time;
    shader.uniforms.budgetAmplitude = amplitude;
    shader.uniforms.budgetPhase = { value: phase };
    shader.vertexShader = WAVE_VERTEX + "varying vec2 budgetSurfacePosition;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <beginnormal_vertex>",
      "#include <beginnormal_vertex>\nvec3 wave = budgetWave(position.xz);\nobjectNormal = normalize(vec3(-wave.y, 1.0, -wave.z));"
    ).replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed.y += wave.x;\nbudgetSurfacePosition = position.xz;");
    shader.fragmentShader = "uniform float budgetTime;\nuniform float budgetPhase;\nvarying vec2 budgetSurfacePosition;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
      #include <color_fragment>
      float distanceToCentre = length(budgetSurfacePosition) / ${LIQUID_RADIUS};
      float reflectionPhase = budgetTime * 0.85 + budgetPhase;
      float rippleReflection = sin(distanceToCentre * 18.0 - reflectionPhase
        + 0.8 * sin(budgetSurfacePosition.x * 7.0 + budgetSurfacePosition.y * 4.0 + reflectionPhase * 0.6));
      float reflectedRibbon = pow(max(0.0, rippleReflection), 16.0) * (1.0 - smoothstep(0.7, 1.0, distanceToCentre));
      float meniscus = smoothstep(0.95, 1.0, distanceToCentre);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.99, 0.98), reflectedRibbon * 0.4 + meniscus * 0.54);
    `);
  };
  surface.customProgramCacheKey = () => "budget-liquid-surface-v3";

  const volumeAppearance = {
    color: COLORS[tone], roughness: 0.16, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.12,
    transparent: true, opacity: 0.8, depthWrite: false
  };
  const body = new MeshPhysicalMaterial(volumeAppearance);
  const bottom = new MeshPhysicalMaterial(volumeAppearance);
  body.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.budgetTime = time;
    shader.uniforms.budgetAmplitude = amplitude;
    shader.uniforms.budgetHeight = height;
    shader.uniforms.budgetPhase = { value: phase };
    shader.vertexShader = WAVE_VERTEX + "uniform float budgetHeight;\nvarying vec3 budgetPosition;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nbudgetPosition = position;\ntransformed.y += budgetWave(position.xz).x * (position.y + 0.5) / max(budgetHeight, 0.00001);"
    );
    shader.fragmentShader = "uniform float budgetTime;\nuniform float budgetPhase;\nvarying vec3 budgetPosition;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
      #include <color_fragment>
      float waterDepth = 1.0 - smoothstep(-0.5, 0.5, budgetPosition.y);
      diffuseColor.rgb *= 1.0 - waterDepth * 0.12;
      float softCaustic = pow(max(0.0, sin(budgetPosition.y * 15.0 + budgetPosition.x * 5.0
        + budgetTime * 0.75 + budgetPhase)), 10.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.99, 0.98), softCaustic * 0.1);
    `).replace("#include <opaque_fragment>", `
      float waterEdge = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 1.4);
      diffuseColor.a = 0.48 + waterEdge * 0.36;
      #include <opaque_fragment>
    `);
  };
  body.customProgramCacheKey = () => "budget-liquid-volume-v3";
  return { surface, body, bottom, time, amplitude, height };
}

function LiquidVessel({ metric, index, animationActive, geometries, materials }: {
  metric: BudgetLiquidMetric;
  index: number;
  animationActive: boolean;
  geometries: VesselGeometries;
  materials: VesselMaterials;
}) {
  const liquid = useRef<Group>(null);
  const body = useRef<Mesh>(null);
  const surface = useRef<Mesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  const appearance = useMemo(() => createLiquidMaterials(metric.id, index * 0.83), [metric.id, index]);
  const fill = useRef({ current: metric.fill, from: metric.fill, target: metric.fill, elapsed: FILL_DURATION });

  const applyFill = (level: number) => {
    const height = LIQUID_CAPACITY * level;
    if (liquid.current) liquid.current.visible = level > 0;
    if (body.current) {
      body.current.scale.y = height;
      body.current.position.y = LIQUID_BOTTOM + height / 2;
    }
    if (surface.current) surface.current.position.y = LIQUID_BOTTOM + height;
    // Keep both the moving contact line and all ripples inside the rim and above the base.
    const headroom = VESSEL_HEIGHT / 2 - 0.045 - (LIQUID_BOTTOM + height);
    appearance.height.value = height;
    appearance.amplitude.value = Math.min(0.18, height * 0.42, Math.max(0, headroom));
  };

  useLayoutEffect(() => {
    const transition = fill.current;
    transition.from = transition.current;
    transition.target = metric.fill;
    transition.elapsed = animationActive ? 0 : FILL_DURATION;
    if (!animationActive) transition.current = metric.fill;
    applyFill(transition.current);
    invalidate();
  }, [metric.fill, animationActive, appearance, invalidate]);

  useEffect(() => () => {
    appearance.surface.dispose();
    appearance.body.dispose();
    appearance.bottom.dispose();
  }, [appearance]);

  useFrame((_, delta) => {
    if (!animationActive) return;
    const step = Math.min(delta, 0.05);
    appearance.time.value += step;
    const transition = fill.current;
    if (transition.elapsed < FILL_DURATION) {
      transition.elapsed = Math.min(FILL_DURATION, transition.elapsed + step);
      const progress = transition.elapsed / FILL_DURATION;
      const eased = progress * progress * (3 - 2 * progress);
      transition.current = transition.from + (transition.target - transition.from) * eased;
      applyFill(transition.current);
    }
  });

  return (
    <group rotation={[0.21, 0, 0]}>
      <mesh geometry={geometries.wall} material={materials.back} renderOrder={0} />
      <mesh geometry={geometries.base} material={materials.base} position={[0, -VESSEL_HEIGHT / 2 + 0.03, 0]} renderOrder={1} />
      <group ref={liquid} visible={metric.fill > 0}>
        <mesh ref={body} geometry={geometries.liquid} material={appearance.body} renderOrder={3} />
        <mesh ref={surface} geometry={geometries.surface} material={appearance.surface} renderOrder={4} />
        <mesh geometry={geometries.bottom} material={appearance.bottom} rotation={[-Math.PI / 2, 0, 0]} position={[0, LIQUID_BOTTOM, 0]} renderOrder={2} />
      </group>
      <mesh geometry={geometries.wall} material={materials.front} renderOrder={5} />
      <mesh geometry={geometries.reflection} material={materials.reflection} renderOrder={6} />
      <mesh geometry={geometries.softReflection} material={materials.softReflection} renderOrder={6} />
      <mesh geometry={geometries.rim} material={materials.rim} rotation={[Math.PI / 2, 0, 0]} position={[0, VESSEL_HEIGHT / 2, 0]} renderOrder={7} />
      <mesh geometry={geometries.rim} material={materials.rim} rotation={[Math.PI / 2, 0, 0]} position={[0, -VESSEL_HEIGHT / 2, 0]} renderOrder={7} />
    </group>
  );
}

function SceneLifecycle({ onReady, onFailure }: Pick<BudgetLiquidSceneProps, "onReady" | "onFailure">) {
  const gl = useThree((state) => state.gl);
  const callbacks = useRef({ onReady, onFailure });
  callbacks.current = { onReady, onFailure };
  const status = useRef({ mounted: false, announced: false, failed: false });

  useLayoutEffect(() => {
    const state = status.current;
    state.mounted = true;
    const fail = () => {
      if (!state.mounted || state.failed) return;
      state.failed = true;
      callbacks.current.onFailure();
    };
    const lost = (event: Event) => {
      event.preventDefault();
      fail();
    };
    const previousShaderError = gl.debug.onShaderError;
    gl.debug.onShaderError = fail;
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => {
      state.mounted = false;
      gl.debug.onShaderError = previousShaderError;
      gl.domElement.removeEventListener("webglcontextlost", lost);
    };
  }, [gl]);

  useFrame(() => {
    const state = status.current;
    if (state.announced || state.failed) return;
    state.announced = true;
    // Fiber draws after frame subscribers. Reveal the canvas only once that draw completes.
    queueMicrotask(() => {
      if (state.mounted && !state.failed) callbacks.current.onReady();
    });
  });
  return null;
}

function Vessels({ metrics, layout, animationActive, onReady, onFailure }: BudgetLiquidSceneProps) {
  const mobile = layout.columns === 1;
  const geometries = useMemo(() => createGeometries(mobile), [mobile]);
  const materials = useMemo(createVesselMaterials, []);
  const height = Math.ceil(metrics.length / layout.columns) * layout.rowHeight;
  const cellWidth = layout.width / layout.columns;
  const scale = Math.min(88, (cellWidth - 20) / (2 * VESSEL_RADIUS + 0.1), layout.visualHeight / 3.15);

  useEffect(() => () => {
    Object.values(geometries).forEach((geometry) => geometry.dispose());
  }, [geometries]);
  useEffect(() => () => {
    Object.values(materials).forEach((material) => material.dispose());
  }, [materials]);

  return (
    <>
      <hemisphereLight args={["#ffffff", "#c2d2ca", 1.6]} />
      <directionalLight position={[-400, 500, 600]} intensity={2} color="#ffffff" />
      <directionalLight position={[350, 100, -250]} intensity={1.4} color="#eef6f2" />
      <directionalLight position={[100, -200, 350]} intensity={0.55} color="#ffffff" />
      {metrics.map((metric, index) => (
        <group key={metric.id} scale={scale} position={[
          (index % layout.columns + 0.5) * cellWidth - layout.width / 2,
          height / 2 - Math.floor(index / layout.columns) * layout.rowHeight - layout.visualHeight / 2,
          0
        ]}>
          <LiquidVessel metric={metric} index={index} animationActive={animationActive} geometries={geometries} materials={materials} />
        </group>
      ))}
      <SceneLifecycle onReady={onReady} onFailure={onFailure} />
    </>
  );
}

export default function BudgetLiquidScene(props: BudgetLiquidSceneProps) {
  const mobile = props.layout.columns === 1;
  return (
    <Canvas
      aria-hidden="true"
      orthographic
      camera={{ position: [0, 0, 1000], near: 0.1, far: 2000, zoom: 1 }}
      frameloop={props.animationActive ? "always" : "demand"}
      dpr={mobile ? 1 : [1, 1.5]}
      gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
      style={{ pointerEvents: "none", touchAction: "auto" }}
      resize={{ scroll: false }}
    >
      <Vessels {...props} />
    </Canvas>
  );
}
