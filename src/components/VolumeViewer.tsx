import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { decompress } from "fzstd";
import {
  colormapLut,
  colorToLut,
  isColormapName,
  type ColormapName,
} from "../lib/colormaps";
import {
  loadVolumeDimensions,
  resolveVolumeUrl,
  type VolumeDimensions,
} from "../lib/volumes";

// Cache decoded volume data so switching variants doesn't re-download the .raw.zst file.
const volumeDataCache = new Map<string, Uint8Array>();

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
}

// The canvas needs concrete dimensions, which are resolved from the manifest
// before it is mounted.
interface VolumeCanvasProps extends VolumeViewerProps, VolumeDimensions {}

const VERTEX_SHADER = /* glsl */ `
	varying vec3 vPos;

	void main() {
		vPos = position;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;

const FRAGMENT_SHADER = /* glsl */ `
	precision highp float;
	precision highp int;
	precision highp sampler3D;

	layout(location = 0) out highp vec4 fragColor;

	varying vec3 vPos;

	uniform sampler3D uVolume;
	uniform sampler2D uColorMap;
	uniform vec3 uCamPos;
	uniform vec3 uBoxMin;
	uniform vec3 uBoxMax;
	uniform float uStepSize;
	uniform vec2 uClim;
	uniform float uAlpha;
	uniform float uGamma;
	uniform vec3 uLightDir;
	uniform vec3 uVoxelSize;
	uniform float uUseLighting;

	// Ray / axis-aligned box intersection (slab method). Returns (tNear, tFar).
	vec2 intersectBox(vec3 ro, vec3 rd, vec3 boxMin, vec3 boxMax) {
		vec3 invDir = 1.0 / rd;
		vec3 t0 = (boxMin - ro) * invDir;
		vec3 t1 = (boxMax - ro) * invDir;
		vec3 tmin = min(t0, t1);
		vec3 tmax = max(t0, t1);
		float tNear = max(max(tmin.x, tmin.y), tmin.z);
		float tFar = min(min(tmax.x, tmax.y), tmax.z);
		return vec2(tNear, tFar);
	}

	float sampleVolume(vec3 uvw) {
		return texture(uVolume, uvw).r;
	}

	void main() {
		vec3 ro = uCamPos;
		vec3 rd = normalize(vPos - ro);

		vec2 tb = intersectBox(ro, rd, uBoxMin, uBoxMax);
		float t = max(tb.x, 0.0);
		float tFar = tb.y;

		if (t >= tFar) {
			discard;
		}

		vec3 boxSize = uBoxMax - uBoxMin;
		vec3 accum = vec3(0.0);
		float transmittance = 1.0;

		const int MAX_STEPS = 2048;
		for (int i = 0; i < MAX_STEPS; i++) {
			if (t > tFar) {
				break;
			}

			vec3 p = ro + rd * t;
			vec3 uvw = (p - uBoxMin) / boxSize;

			float intensity = sampleVolume(uvw);
			float v = clamp((intensity - uClim.x) / (uClim.y - uClim.x), 0.0, 1.0);
			float alpha = pow(v, uGamma) * uAlpha;

			if (alpha > 0.001) {
				vec3 baseColor = texture(uColorMap, vec2(v, 0.5)).rgb;
				vec3 color = baseColor;

				if (uUseLighting > 0.5) {
					// Surface normal from the intensity gradient (central differences).
					vec3 grad;
					grad.x = sampleVolume(uvw - vec3(uVoxelSize.x, 0.0, 0.0)) - sampleVolume(uvw + vec3(uVoxelSize.x, 0.0, 0.0));
					grad.y = sampleVolume(uvw - vec3(0.0, uVoxelSize.y, 0.0)) - sampleVolume(uvw + vec3(0.0, uVoxelSize.y, 0.0));
					grad.z = sampleVolume(uvw - vec3(0.0, 0.0, uVoxelSize.z)) - sampleVolume(uvw + vec3(0.0, 0.0, uVoxelSize.z));
					vec3 normal = vec3(0.0);
					float gradLen = length(grad);
					if (gradLen > 0.0001) {
						normal = grad / gradLen;
					}

					float diffuse = max(dot(normal, uLightDir), 0.0);
					float shading = 0.35 + 0.65 * diffuse;
					color = baseColor * shading;
				}

				accum += transmittance * alpha * color;
				transmittance *= (1.0 - alpha);
				if (transmittance < 0.02) {
					break;
				}
			}

			t += uStepSize;
		}

		float opacity = 1.0 - transmittance;
		vec3 color = accum / max(opacity, 0.0001);
		fragColor = vec4(color, opacity);
	}
`;

interface Uniforms {
  [key: string]: { value: any };
  uVolume: { value: THREE.Data3DTexture | null };
  uColorMap: { value: THREE.DataTexture | null };
  uCamPos: { value: THREE.Vector3 };
  uBoxMin: { value: THREE.Vector3 };
  uBoxMax: { value: THREE.Vector3 };
  uStepSize: { value: number };
  uClim: { value: THREE.Vector2 };
  uAlpha: { value: number };
  uGamma: { value: number };
  uLightDir: { value: THREE.Vector3 };
  uVoxelSize: { value: THREE.Vector3 };
  uUseLighting: { value: number };
}

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
}: VolumeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uniformsRef = useRef<Uniforms | null>(null);
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
    let renderer: THREE.WebGLRenderer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const disposables: { dispose: () => void }[] = [];

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setStatus("error");
      setError("WebGL2 is not supported on this device.");
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
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

    function resize() {
      const w = root.clientWidth;
      const h = root.clientHeight;
      if (w === 0 || h === 0) return;
      renderer!.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);

    const uniforms: Uniforms = {
      uVolume: { value: null },
      uColorMap: { value: null },
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
    };
    uniformsRef.current = uniforms;

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      // Back faces so raycasting still works when the camera enters the volume.
      side: THREE.BackSide,
    });
    disposables.push(material);

    const geometry = new THREE.BoxGeometry(box.x, box.y, box.z);
    disposables.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    scene.add(mesh);

    function animate() {
      animationId = requestAnimationFrame(animate);
      controls.update();
      uniforms.uCamPos.value.copy(camera.position);
      renderer!.render(scene, camera);
    }
    animate();

    (async () => {
      try {
        let data = volumeDataCache.get(url);
        if (!data) {
          const response = await fetch(resolveVolumeUrl(url));
          if (!response.ok) {
            throw new Error(`Failed to load volume (HTTP ${response.status}).`);
          }
          const buffer = await response.arrayBuffer();
          let decoded = new Uint8Array(buffer);
          if (url.endsWith(".zst")) {
            decoded = decompress(decoded);
          }

          const expected = width * height * depth;
          if (decoded.length !== expected) {
            throw new Error(
              `Unexpected volume size: got ${decoded.length} bytes, expected ${expected}.`,
            );
          }
          volumeDataCache.set(url, decoded);
          data = decoded;
        }
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

        uniforms.uVolume.value = texture;
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
  ]);

  // Swap the colormap lookup table without reloading the volume.
  useEffect(() => {
    const uniforms = uniformsRef.current;
    if (!uniforms) return;

    const lut =
      colormap && isColormapName(colormap)
        ? colormapLut(colormap)
        : colorToLut(color);

    const texture = new THREE.DataTexture(lut, 256, 1, THREE.RGBAFormat);
    texture.type = THREE.UnsignedByteType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.unpackAlignment = 1;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    uniforms.uColorMap.value = texture;

    return () => {
      texture.dispose();
      if (uniforms.uColorMap.value === texture) {
        uniforms.uColorMap.value = null;
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
  const [dimensions, setDimensions] = useState<VolumeDimensions | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDimensions(null);
    setError(null);

    loadVolumeDimensions(url)
      .then((resolved) => {
        if (!cancelled) setDimensions(resolved);
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
