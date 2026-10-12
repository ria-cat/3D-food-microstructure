import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  colormapLut,
  colorToLut,
  isColormapName,
  type ColormapName,
} from "../lib/colormaps";
import {
  loadVolumeData,
  loadVolumeDimensions,
  type VolumeDimensions,
} from "../lib/volumes";
import { OCCUPANCY_RESOLUTION } from "../lib/occupancy";
import {
  createVolumeMaterial,
  type VolumeShaderUniforms,
} from "../lib/volumeMaterial";

interface VolumeViewerProps {
  url: string;
  spacing?: [number, number, number];
  color?: string;
  colormap?: ColormapName;
  alpha?: number;
  gamma?: number;
  clim?: [number, number];
  magFilter?: "linear" | "nearest";
  lighting?: boolean;
  antialias?: boolean;
}

// The canvas needs concrete dimensions, which are resolved from the manifest
// before it is mounted.
interface VolumeCanvasProps extends VolumeViewerProps, VolumeDimensions {}

type Uniforms = VolumeShaderUniforms;

function VolumeCanvas({
  url,
  width,
  height,
  depth,
  spacing = [1, 1, 1],
  color = "#2dd4bf",
  colormap,
  alpha = 1,
  gamma = 1,
  clim = [0, 1],
  magFilter = "nearest",
  lighting = true,
  antialias = true,
}: VolumeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uniformsRef = useRef<Uniforms | null>(null);
  const materialBindingsRef = useRef<ReturnType<
    typeof createVolumeMaterial
  > | null>(null);
  // The colormap texture lives in a ref so it survives the main effect
  // recreating the material when volume options change.
  const colormapTextureRef = useRef<THREE.DataTexture | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);

  // Set up the renderer, scene, camera, controls, and load the volume.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const root = container;

    setStatus("loading");
    setError(null);

    let cancelled = false;
    let animationId = 0;
    let renderer: WebGPURenderer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const disposables: { dispose: () => void }[] = [];

    try {
      // TSL node materials are rendered by WebGPURenderer. Force its WebGL
      // backend to retain the viewer's existing WebGL2 requirement.
      renderer = new WebGPURenderer({
        antialias,
        alpha: true,
        forceWebGL: true,
      });
    } catch {
      setStatus("error");
      setError("WebGL2 is not supported on this device.");
      return;
    }

    // Cap the pixel ratio so HiDPI phones don't render 3x the pixels.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    // The backing store is sized with the device pixel ratio in `resize()`,
    // which is called with `updateStyle: false` so it leaves the CSS size
    // alone. Pin the canvas to its container with CSS instead: otherwise the
    // element is displayed at its attribute size (`height x devicePixelRatio`
    // CSS pixels), so on HiDPI devices (i.e. phones) the canvas is larger than
    // its container and the volume renders off-centre.
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    root.appendChild(renderer.domElement);
    disposables.push(renderer);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 50);
    camera.position.set(0, 0, 1.8);

    // Physical size in voxel units, normalized so the largest side is 1.
    const sx = width * spacing[0];
    const sy = height * spacing[1];
    const sz = depth * spacing[2];
    const maxDim = Math.max(sx, sy, sz);
    const box = new THREE.Vector3(sx / maxDim, sy / maxDim, sz / maxDim);

    // Distance at which the volume's bounding sphere fits the viewport. The
    // horizontal field of view shrinks with the aspect ratio, so narrow
    // (portrait/phone) viewports need the camera further away to keep the
    // whole volume visible.
    const boundingRadius = box.length() / 2;
    const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    function fitDistance(aspect: number) {
      const halfFovH = Math.atan(Math.tan(halfFov) * aspect);
      return Math.max(
        boundingRadius / Math.sin(halfFov),
        boundingRadius / Math.sin(halfFovH),
      );
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    // Allow zooming all the way inside the volume.
    controls.minDistance = 0.05;
    controls.maxDistance = 6;
    controls.update();
    disposables.push(controls);

    // Fit distance for the current aspect ratio, tracked so the user's zoom
    // level can be preserved when the viewport changes (e.g. rotating a phone).
    let currentFit = 0;

    function resize() {
      const w = root.clientWidth;
      const h = root.clientHeight;
      if (w === 0 || h === 0) return;
      const aspect = w / h;
      renderer!.setSize(w, h, false);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();

      const nextFit = fitDistance(aspect);
      const zoom = currentFit > 0 ? camera.position.length() / currentFit : 1;
      currentFit = nextFit;
      // Keep the fit distance reachable even on very narrow viewports.
      controls.maxDistance = Math.max(6, nextFit);
      camera.position.setLength(nextFit * zoom);
    }
    resize();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);

    const placeholderVolume = new THREE.Data3DTexture(
      new Uint8Array([0]),
      1,
      1,
      1,
    );
    placeholderVolume.format = THREE.RedFormat;
    placeholderVolume.type = THREE.UnsignedByteType;
    placeholderVolume.needsUpdate = true;
    disposables.push(placeholderVolume);

    const placeholderOccupancy = new THREE.Data3DTexture(
      new Uint8Array([255]),
      1,
      1,
      1,
    );
    placeholderOccupancy.format = THREE.RedFormat;
    placeholderOccupancy.type = THREE.UnsignedByteType;
    placeholderOccupancy.needsUpdate = true;
    disposables.push(placeholderOccupancy);

    const placeholderColorMap = new THREE.DataTexture(
      new Uint8Array([0, 0, 0, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    placeholderColorMap.colorSpace = THREE.SRGBColorSpace;
    placeholderColorMap.needsUpdate = true;
    disposables.push(placeholderColorMap);

    const uniforms: Uniforms = {
      uVolume: { value: placeholderVolume },
      uColorMap: { value: colormapTextureRef.current ?? placeholderColorMap },
      uCamPos: { value: new THREE.Vector3() },
      uBoxMin: { value: box.clone().multiplyScalar(-0.5) },
      uBoxMax: { value: box.clone().multiplyScalar(0.5) },
      uStepSize: {
        value: Math.min(box.x / width, box.y / height, box.z / depth),
      },
      uClim: { value: new THREE.Vector2(clim[0], clim[1]) },
      uAlpha: { value: alpha },
      uGamma: { value: gamma },
      uLightDir: { value: new THREE.Vector3(0.5, 0.7, 0.5).normalize() },
      uVoxelSize: {
        value: new THREE.Vector3(1 / width, 1 / height, 1 / depth),
      },
      uUseLighting: { value: lighting ? 1 : 0 },
      uOccupancy: { value: placeholderOccupancy },
      uOccRes: {
        value: new THREE.Vector3(
          OCCUPANCY_RESOLUTION,
          OCCUPANCY_RESOLUTION,
          OCCUPANCY_RESOLUTION,
        ),
      },
      uOccStep: {
        value: Math.min(
          box.x / OCCUPANCY_RESOLUTION,
          box.y / OCCUPANCY_RESOLUTION,
          box.z / OCCUPANCY_RESOLUTION,
        ),
      },
      uUseOccupancy: { value: 0 },
    };
    uniformsRef.current = uniforms;

    const materialBindings = createVolumeMaterial(uniforms);
    materialBindingsRef.current = materialBindings;
    const material = materialBindings.material;
    disposables.push(material);

    const geometry = new THREE.BoxGeometry(box.x, box.y, box.z);
    disposables.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    scene.add(mesh);

    void renderer.init().catch((err: unknown) => {
      if (!cancelled) {
        setStatus("error");
        setError(
          err instanceof Error ? err.message : "Failed to initialize WebGL2.",
        );
      }
    });

    function draw() {
      if (!renderer?.initialized) return;
      uniforms.uCamPos.value.copy(camera.position);
      renderer.render(scene, camera);
    }

    function animate() {
      animationId = requestAnimationFrame(animate);
      controls.update();
      draw();
    }
    animate();

    (async () => {
      try {
        const { data, occupancy } = await loadVolumeData(url, {
          width,
          height,
          depth,
        });
        if (cancelled) return;

        const texture = new THREE.Data3DTexture(data, width, height, depth);
        texture.format = THREE.RedFormat;
        texture.type = THREE.UnsignedByteType;
        // Linear when minified (smooth); magnification filter is configurable
        // per sample (nearest = crisp voxels, linear = smooth surface).
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter =
          magFilter === "linear" ? THREE.LinearFilter : THREE.NearestFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.wrapR = THREE.ClampToEdgeWrapping;
        texture.unpackAlignment = 1;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        disposables.push(texture);

        // Upload the occupancy grid and enable empty-space skipping only when it
        // can actually help: a grid with no empty cells (a dense volume) would
        // otherwise just add a texture fetch per step for no benefit.
        const occTexture = new THREE.Data3DTexture(
          occupancy,
          OCCUPANCY_RESOLUTION,
          OCCUPANCY_RESOLUTION,
          OCCUPANCY_RESOLUTION,
        );
        occTexture.format = THREE.RedFormat;
        occTexture.type = THREE.UnsignedByteType;
        occTexture.minFilter = THREE.NearestFilter;
        occTexture.magFilter = THREE.NearestFilter;
        occTexture.wrapS = THREE.ClampToEdgeWrapping;
        occTexture.wrapT = THREE.ClampToEdgeWrapping;
        occTexture.wrapR = THREE.ClampToEdgeWrapping;
        occTexture.unpackAlignment = 1;
        occTexture.generateMipmaps = false;
        occTexture.needsUpdate = true;
        disposables.push(occTexture);

        materialBindings.setOccupancyTexture(occTexture);
        materialBindings.setOccupancyEnabled(
          occupancy.some((v) => v === 0) ? 1 : 0,
        );

        materialBindings.setVolumeTexture(texture);
        mesh.visible = true;

        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setError(
            err instanceof Error ? err.message : "Failed to load volume.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationId);
      resizeObserver?.disconnect();
      for (const d of disposables) d.dispose();
      materialBindingsRef.current = null;
      uniformsRef.current = null;
      controls.dispose();
      scene.remove(mesh);
      renderer!.domElement.remove();
      renderer = null;
    };
  }, [
    url,
    width,
    height,
    depth,
    spacing[0],
    spacing[1],
    spacing[2],
    alpha,
    gamma,
    clim[0],
    clim[1],
    magFilter,
    lighting,
    antialias,
  ]);

  // Swap the colormap lookup table without reloading the volume.
  useEffect(() => {
    const lut =
      colormap && isColormapName(colormap)
        ? colormapLut(colormap)
        : colorToLut(color);

    const texture = new THREE.DataTexture(lut, 256, 1, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.type = THREE.UnsignedByteType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.unpackAlignment = 1;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    colormapTextureRef.current = texture;
    materialBindingsRef.current?.setColorMapTexture(texture);
    const uniforms = uniformsRef.current;
    if (uniforms) uniforms.uColorMap.value = texture;

    return () => {
      texture.dispose();
      if (colormapTextureRef.current === texture) {
        colormapTextureRef.current = null;
      }
    };
  }, [colormap, color]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-teal-400" />
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
          <p className="text-sm text-zinc-400">{error}</p>
        </div>
      )}
    </div>
  );
}

// Resolves the volume's voxel dimensions from the manifest, then mounts the
// canvas. Keeping this separate lets the canvas assume dimensions are known.
export default function VolumeViewer(props: VolumeViewerProps) {
  const { url } = props;
  const [resolved, setResolved] = useState<{
    url: string;
    dimensions: VolumeDimensions;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    loadVolumeDimensions(url)
      .then((dimensions) => {
        if (!cancelled) setResolved({ url, dimensions });
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load volume dimensions.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  // Only use dimensions that belong to the current url. Otherwise, when the
  // variant changes, the canvas would briefly render with the new url but the
  // previous volume's dimensions, triggering a redundant download of the new
  // volume before it is unmounted and remounted.
  const dimensions = resolved?.url === url ? resolved.dimensions : null;

  return (
    <div className="absolute inset-0">
      {dimensions ? (
        <VolumeCanvas {...props} {...dimensions} />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-4 text-center">
          {error ? (
            <p className="text-sm text-zinc-400">{error}</p>
          ) : (
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-teal-400" />
          )}
        </div>
      )}
    </div>
  );
}
