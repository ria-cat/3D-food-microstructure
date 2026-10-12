import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Break,
  Continue,
  float,
  Fn,
  If,
  Loop,
  max,
  min,
  positionGeometry,
  texture,
  texture3D,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

export interface VolumeShaderUniforms {
  uVolume: { value: THREE.Data3DTexture };
  uColorMap: { value: THREE.DataTexture };
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
  uOccupancy: { value: THREE.Data3DTexture };
  uOccRes: { value: THREE.Vector3 };
  uOccStep: { value: number };
  uUseOccupancy: { value: number };
}

export function createVolumeMaterial(uniforms: VolumeShaderUniforms) {
  const volume = texture3D(uniforms.uVolume.value);
  const colorMap = texture(uniforms.uColorMap.value);
  const occupancy = texture3D(uniforms.uOccupancy.value);

  const cameraPosition = uniform(uniforms.uCamPos.value);
  const boxMin = uniform(uniforms.uBoxMin.value);
  const boxMax = uniform(uniforms.uBoxMax.value);
  const stepSize = uniform(uniforms.uStepSize.value);
  const clim = uniform(uniforms.uClim.value);
  const alphaScale = uniform(uniforms.uAlpha.value);
  const gamma = uniform(uniforms.uGamma.value);
  const lightDirection = uniform(uniforms.uLightDir.value);
  const voxelSize = uniform(uniforms.uVoxelSize.value);
  const useLighting = uniform(uniforms.uUseLighting.value);
  const occupancyResolution = uniform(uniforms.uOccRes.value);
  const occupancyStep = uniform(uniforms.uOccStep.value);
  const occupancyEnabled = uniform(uniforms.uUseOccupancy.value);
  const fragmentPosition = varying(positionGeometry);

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
  });

  material.fragmentNode = Fn(() => {
    const rayOrigin = cameraPosition;
    const rayDirection = fragmentPosition.sub(rayOrigin).normalize();
    const inverseDirection = rayDirection.reciprocal();
    const t0 = boxMin.sub(rayOrigin).mul(inverseDirection);
    const t1 = boxMax.sub(rayOrigin).mul(inverseDirection);
    const tMin = min(t0, t1);
    const tMax = max(t0, t1);
    const tNear = max(max(tMin.x, tMin.y), tMin.z);
    const tFar = min(min(tMax.x, tMax.y), tMax.z);

    tNear.greaterThanEqual(tFar).discard();

    const t = max(tNear, 0).toVar("rayDistance");
    const boxSize = boxMax.sub(boxMin);
    const accumulatedColor = vec3(0).toVar("accumulatedColor");
    const transmittance = float(1).toVar("transmittance");

    Loop(2048, () => {
      If(t.greaterThan(tFar), () => Break());

      const position = rayOrigin.add(rayDirection.mul(t));
      const uvw = position.sub(boxMin).div(boxSize);

      If(occupancyEnabled.greaterThan(0.5), () => {
        const cell = uvw
          .mul(occupancyResolution)
          .floor()
          .clamp(vec3(0), occupancyResolution.sub(vec3(1)));
        const occupied = occupancy.sample(
          cell.add(vec3(0.5)).div(occupancyResolution),
        ).r;

        If(occupied.lessThan(0.5), () => {
          t.addAssign(occupancyStep);
          Continue();
        });
      });

      const intensity = volume.sample(uvw).r;
      const value = intensity.sub(clim.x).div(clim.y.sub(clim.x)).clamp(0, 1);
      const sampleAlpha = value.pow(gamma).mul(alphaScale);

      If(sampleAlpha.greaterThan(0.001), () => {
        const baseColor = colorMap.sample(vec2(value, 0.5)).rgb;
        const sampleColor = baseColor.toVar("sampleColor");

        If(useLighting.greaterThan(0.5), () => {
          const gradient = vec3(
            volume
              .sample(uvw.sub(vec3(voxelSize.x, 0, 0)))
              .r.sub(volume.sample(uvw.add(vec3(voxelSize.x, 0, 0))).r),
            volume
              .sample(uvw.sub(vec3(0, voxelSize.y, 0)))
              .r.sub(volume.sample(uvw.add(vec3(0, voxelSize.y, 0))).r),
            volume
              .sample(uvw.sub(vec3(0, 0, voxelSize.z)))
              .r.sub(volume.sample(uvw.add(vec3(0, 0, voxelSize.z))).r),
          );
          const gradientLength = gradient.length();
          const normal = vec3(0).toVar("normal");

          If(gradientLength.greaterThan(0.0001), () => {
            normal.assign(gradient.div(gradientLength));
          });

          const diffuse = max(normal.dot(lightDirection), 0);
          const shading = diffuse.mul(0.65).add(0.35);
          sampleColor.assign(baseColor.mul(shading));
        });

        accumulatedColor.addAssign(
          transmittance.mul(sampleAlpha).mul(sampleColor),
        );
        transmittance.mulAssign(float(1).sub(sampleAlpha));
        If(transmittance.lessThan(0.02), () => Break());
      });

      t.addAssign(stepSize);
    });

    const opacity = float(1).sub(transmittance);
    const color = accumulatedColor.div(max(opacity, 0.0001));
    return vec4(color, opacity);
  })();

  return {
    material,
    setVolumeTexture(value: THREE.Data3DTexture) {
      volume.value = value;
      uniforms.uVolume.value = value;
    },
    setOccupancyTexture(value: THREE.Data3DTexture) {
      occupancy.value = value;
      uniforms.uOccupancy.value = value;
    },
    setColorMapTexture(value: THREE.DataTexture) {
      colorMap.value = value;
      uniforms.uColorMap.value = value;
    },
    setOccupancyEnabled(value: number) {
      occupancyEnabled.value = value;
      uniforms.uUseOccupancy.value = value;
    },
  };
}
