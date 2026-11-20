import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

// The graphics pipeline is shared by native-JAR blocks and generated terrain.
export function configureRenderer(renderer, touchDevice) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touchDevice ? 1.35 : 2));
}

export function createSky(scene) {
  const sky = new Sky();
  sky.scale.setScalar(450000);
  sky.material.uniforms.turbidity.value = 8;
  sky.material.uniforms.rayleigh.value = 2;
  sky.material.uniforms.mieCoefficient.value = 0.005;
  sky.material.uniforms.mieDirectionalG.value = 0.85;
  scene.add(sky);
  return {
    update(sunDirection, weather) {
      sky.material.uniforms.sunPosition.value.copy(sunDirection);
      sky.material.uniforms.turbidity.value = weather === 'thunder' ? 16 : weather === 'rain' ? 12 : 8;
      sky.material.uniforms.rayleigh.value = weather === 'clear' ? 2 : 0.8;
    },
  };
}

export function makeTerrainMaterial(options = {}) {
  return new THREE.MeshStandardMaterial({
    roughness: 1,
    metalness: 0,
    ...options,
  });
}

export function makeWaterMaterial() {
  const time = { value: 0 };
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x3b8cbb,
    transparent: true,
    opacity: 0.72,
    roughness: 0.085,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.045,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.waterTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterWorld;\nuniform float waterTime;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float waveA = sin(vWaterWorld.x * 2.8 + vWaterWorld.z * 1.6 + waterTime * 1.45);
        float waveB = cos(vWaterWorld.z * 3.6 - vWaterWorld.x * 1.3 + waterTime * 1.1);
        vec3 rippleNormal = vec3(waveA * 0.09, 0.0, waveB * 0.09);
        normal = normalize(normal + (viewMatrix * vec4(rippleNormal, 0.0)).xyz);
      `);
  };
  material.customProgramCacheKey = () => 'water-ripple-v1';
  return { material, update(seconds) { time.value = seconds; } };
}
