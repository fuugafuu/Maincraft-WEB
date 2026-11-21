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

// Keep the shadow camera near the player while retaining a consistent sun
// direction regardless of how far the player travels from world origin.
export function positionSunForPlayer(sun, location, timeOfDay) {
  const angle = (timeOfDay / 24000) * Math.PI * 2;
  const elevation = Math.sin(angle);
  sun.target.position.set(location.x, location.y, location.z);
  sun.position.set(
    location.x + Math.cos(angle) * 80,
    location.y + Math.max(5, elevation * 85),
    location.z + 35,
  );
  sun.target.updateMatrixWorld();
  return elevation;
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

const LIGHT_BLOCKS = new Map([
  ['torch', [0xffb978, 1.3]], ['wall_torch', [0xffb978, 1.3]],
  ['lantern', [0xffdca0, 1.6]], ['soul_lantern', [0x8bcaff, 1.3]],
  ['soul_torch', [0x8bcaff, 1.2]], ['glowstone', [0xffdca0, 2.1]],
  ['sea_lantern', [0xaeefff, 2.0]], ['shroomlight', [0xffaa73, 1.9]],
  ['jack_o_lantern', [0xffc076, 1.5]], ['lava', [0xff812a, 2.0]],
  ['end_rod', [0xd9e7ff, 1.7]],
]);

// Update a small pool of nearby lights instead of creating a GPU light per block.
export function createBlockLighting(scene, isTouchDevice) {
  const lights=Array.from({length:isTouchDevice?3:6},()=>{
    const light=new THREE.PointLight(0xffffff,0,12,2);
    light.visible=false;
    scene.add(light);
    return light;
  });
  let lastX=Infinity,lastY=Infinity,lastZ=Infinity;
  return {
    update(position,getBlock,force=false) {
      const px=Math.floor(position.x),py=Math.floor(position.y),pz=Math.floor(position.z);
      if(!force&&px===lastX&&py===lastY&&pz===lastZ)return;
      lastX=px;lastY=py;lastZ=pz;
      const candidates=[];
      for(let dx=-9;dx<=9;dx+=1)for(let dz=-9;dz<=9;dz+=1)for(let dy=-5;dy<=4;dy+=1){
        const distance=dx*dx+dz*dz+dy*dy;
        if(distance>100)continue;
        const data=LIGHT_BLOCKS.get(getBlock(px+dx,py+dy,pz+dz));
        if(data)candidates.push({x:px+dx+.5,y:py+dy+.65,z:pz+dz+.5,distance,data});
      }
      candidates.sort((a,b)=>a.distance-b.distance);
      lights.forEach((light,index)=>{
        const source=candidates[index];
        light.visible=!!source;
        if(!source)return;
        light.color.setHex(source.data[0]);
        light.intensity=source.data[1];
        light.position.set(source.x,source.y,source.z);
      });
    },
    invalidate(){lastX=Infinity},
  };
}
