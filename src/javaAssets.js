import * as THREE from 'three';
import { unzipSync, strFromU8 } from 'fflate';

const prefix = 'assets/minecraft/';
const aliases = {
  grass: 'grass_block', wood: 'oak_log', leaves: 'oak_leaves',
  planks: 'oak_planks', cobble: 'cobblestone', snow: 'snow_block',
  gold: 'gold_block', diamond: 'diamond_block',
};

const sides = {
  east: {axis: 0, positive: true, normal: [1, 0, 0]},
  west: {axis: 0, positive: false, normal: [-1, 0, 0]},
  up: {axis: 1, positive: true, normal: [0, 1, 0]},
  down: {axis: 1, positive: false, normal: [0, -1, 0]},
  south: {axis: 2, positive: true, normal: [0, 0, 1]},
  north: {axis: 2, positive: false, normal: [0, 0, -1]},
};

function elementCorners(from, to, side) {
  const [x, y, z] = from.map(v => v / 16);
  const [X, Y, Z] = to.map(v => v / 16);
  switch(side) {
    case 'east': return [[X,y,z],[X,Y,z],[X,Y,Z],[X,y,Z]];
    case 'west': return [[x,y,Z],[x,Y,Z],[x,Y,z],[x,y,z]];
    case 'up': return [[x,Y,Z],[X,Y,Z],[X,Y,z],[x,Y,z]];
    case 'down': return [[x,y,z],[X,y,z],[X,y,Z],[x,y,Z]];
    case 'south': return [[X,y,Z],[X,Y,Z],[x,Y,Z],[x,y,Z]];
    case 'north': return [[x,y,z],[x,Y,z],[X,Y,z],[X,y,z]];
  }
}

const defaultProperties = {
  north:'false', south:'false', east:'false', west:'false', up:'false', down:'false',
  facing:'south', axis:'y', half:'bottom', type:'bottom', shape:'straight',
  open:'false', powered:'false', waterlogged:'false', snowy:'false',
  in_wall:'false', hinge:'left', attached:'false', hanging:'false',
  enabled:'true', lit:'false', persistent:'true', distance:'1',
};

function conditionMatches(condition, properties) {
  if (condition.OR) return condition.OR.some(part => conditionMatches(part, properties));
  if (condition.AND) return condition.AND.every(part => conditionMatches(part, properties));
  return Object.entries(condition).every(([property, expected]) => {
    const value=properties[property] ?? 'false';
    return String(expected).split('|').includes(value);
  });
}

function chooseVariants(state, id) {
  const properties=id==='redstone_wire'
    ? {...defaultProperties,north:'none',south:'none',east:'none',west:'none'}
    : defaultProperties;
  if(state.variants) {
    const entries = Object.entries(state.variants);
    const preferred = entries.find(([settings]) =>
      !settings || settings.split(',').every(pair => {
        const [name, value]=pair.split('=');
        return (properties[name] ?? value) === value;
      }));
    const variant = (preferred || entries[0])?.[1];
    return variant ? [Array.isArray(variant) ? variant[0] : variant] : [];
  }
  if(state.multipart) {
    return state.multipart.map(part => ({
      ...(Array.isArray(part.apply) ? part.apply[0] : part.apply),
      when: part.when,
    })).filter(part => part.model);
  }
  return [];
}

/**
 * Reads the user's own 1.21.11 client archive only in this browser tab.
 * The archive and image bytes are never uploaded or added to the web bundle.
 */
export async function loadJavaResources(file, progress = () => {}) {
  progress('JARを展開しています…');
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: entry => entry.name === 'version.json'
      || entry.name.startsWith(prefix + 'blockstates/')
      || entry.name.startsWith(prefix + 'models/block/')
      || entry.name.startsWith(prefix + 'models/item/')
      || entry.name.startsWith(prefix + 'textures/block/')
      || entry.name.startsWith(prefix + 'items/')
      || entry.name.startsWith(prefix + 'textures/item/'),
  });
  const version = archive['version.json'];
  if (!version || JSON.parse(strFromU8(version)).id !== '1.21.11') {
    throw new Error('Minecraft Java Edition 1.21.11 のクライアントJARを選択してください。');
  }

  const names = Object.keys(archive)
    .filter(n => n.startsWith(prefix + 'blockstates/') && n.endsWith('.json'))
    .map(n => n.slice((prefix + 'blockstates/').length, -5))
    .filter(n => n !== 'air' && n !== 'cave_air' && n !== 'void_air')
    .sort();
  const itemNames = Object.keys(archive)
    .filter(n => n.startsWith(prefix + 'items/') && n.endsWith('.json'))
    .map(n => n.slice((prefix + 'items/').length, -5))
    .sort();
  const iconUrls = new Map();
  function readItemModelTexture(modelName, visited = new Set()) {
    const name = modelName?.replace(/^minecraft:/, '');
    if (!name || visited.has(name)) return null;
    visited.add(name);
    const raw = readJson(prefix + 'models/' + name + '.json');
    if (!raw) return null;
    let texture = raw.textures?.layer0 || raw.textures?.particle;
    for (let i = 0; texture?.startsWith('#') && i < 12; i++) {
      texture = raw.textures?.[texture.slice(1)];
    }
    if (texture && !texture.startsWith('#')) return texture.replace(/^minecraft:/, '');
    return readItemModelTexture(raw.parent, visited);
  }
  function itemModelReference(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'minecraft:model') return node.model;
    // A static preview uses the default state of conditional item models.
    return itemModelReference(node.on_false)
      || itemModelReference(node.fallback)
      || itemModelReference(node.entries?.[0]?.model)
      || itemModelReference(node.cases?.[0]?.model)
      || itemModelReference(node.models?.[0]?.model);
  }
  function itemIcon(id) {
    const actual = aliases[id] || id;
    if (iconUrls.has(actual)) return iconUrls.get(actual);
    const itemDefinition = readJson(prefix + 'items/' + actual + '.json');
    const modelTexture = readItemModelTexture(itemModelReference(itemDefinition?.model));
    const candidates = [modelTexture, `item/${actual}`, `block/${actual}`, `block/${actual}_top`, `block/${actual}_side`].filter(Boolean);
    const path = candidates.find(name => archive[prefix + 'textures/' + name + '.png']);
    if (!path) return null;
    const url = URL.createObjectURL(new Blob([archive[prefix + 'textures/' + path + '.png']], {type:'image/png'}));
    iconUrls.set(actual, url);
    return url;
  }
  const modelCache = new Map();
  const resolved = new Map();
  const atlas = document.createElement('canvas');
  atlas.width = 2048;
  atlas.height = 2048;
  const ctx = atlas.getContext('2d', {willReadFrequently: false});
  ctx.imageSmoothingEnabled = false;
  const tex = new THREE.CanvasTexture(atlas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  const uvSlots = new Map();
  const pending = new Map();
  const TILE = 32;
  const COLS = atlas.width / TILE;

  function readJson(path) {
    const bytes = archive[path];
    if (!bytes) return null;
    try { return JSON.parse(strFromU8(bytes)); }
    catch { return null; }
  }

  function loadModel(name, trail = new Set()) {
    if (!name) return null;
    const id = name.replace(/^minecraft:/, '').replace(/^block\//, '');
    if (modelCache.has(id)) return modelCache.get(id);
    if (trail.has(id)) return null;
    trail.add(id);
    const raw = readJson(prefix + 'models/block/' + id + '.json');
    if (!raw) return null;
    const base = raw.parent ? loadModel(raw.parent, trail) : null;
    const model = {
      textures: {...(base?.textures || {}), ...(raw.textures || {})},
      elements: raw.elements || base?.elements || [],
    };
    modelCache.set(id, model);
    return model;
  }

  function resolveTexture(ref, textures) {
    let value = ref;
    for(let tries=0; tries<12 && value?.startsWith('#'); tries++) {
      value = textures[value.slice(1)];
    }
    return value?.replace(/^minecraft:/, '') || null;
  }

  async function sprite(path) {
    if (uvSlots.has(path)) return uvSlots.get(path);
    if (pending.has(path)) return pending.get(path);
    const promise = (async () => {
      const bytes = archive[prefix + 'textures/' + path + '.png'];
      if (!bytes || uvSlots.size >= COLS * COLS) return null;
      const index = uvSlots.size;
      const col = index % COLS, row = Math.floor(index / COLS);
      const bitmap = await createImageBitmap(new Blob([bytes], {type:'image/png'}));
      ctx.drawImage(bitmap, col * TILE, row * TILE, TILE, TILE);
      bitmap.close();
      const entry = {col, row};
      uvSlots.set(path, entry);
      tex.needsUpdate = true;
      return entry;
    })();
    pending.set(path, promise);
    try { return await promise; }
    finally { pending.delete(path); }
  }

  async function ensure(id) {
    const actual = aliases[id] || id;
    if (resolved.has(actual)) return resolved.get(actual);
    const state = readJson(prefix + 'blockstates/' + actual + '.json');
    const variants = state ? chooseVariants(state, actual) : [];
    const definitions = [];
    for (const variant of variants) {
      const model=loadModel(variant.model);
      if(!model)continue;
      for (const element of model.elements) {
      const faces = {};
      for (const [faceName, face] of Object.entries(element.faces || {})) {
        if (!sides[faceName]) continue;
        const path = resolveTexture(face.texture, model.textures);
        const tile = path && await sprite(path);
        if (tile) faces[faceName] = {
          tile, uv:face.uv || [0,0,16,16], cull:!!face.cullface,
          tint: Number.isInteger(face.tintindex),
        };
      }
      if (Object.keys(faces).length) definitions.push({
        from: element.from, to: element.to, faces, rotation:element.rotation,
        x:variant.x||0, y:variant.y||0, when:variant.when,
      });
      }
    }
    if(!definitions.length)return null;
    const fullCube = definitions.length === 1
      && definitions[0].from.every(v => v === 0)
      && definitions[0].to.every(v => v === 16)
      && !definitions[0].rotation;
    const transparent = /glass|ice|water|leaves|slime|honey|pane|grate|bars/.test(actual);
    const result = {elements:definitions, fullCube, transparent, multipart:!!state?.multipart};
    resolved.set(actual,result);
    return result;
  }

  function addBlock(out, block, x, y, z, getNeighbor, id, getRawNeighbor = getNeighbor) {
    const properties = {...defaultProperties};
    if(id === 'redstone_wire') {
      for(const direction of ['north','south','east','west']) properties[direction]='none';
    }
    if(/_fence$|_wall$|_pane$/.test(id) || id === 'iron_bars') {
      const offsets = {north:[0,0,-1], south:[0,0,1], east:[1,0,0], west:[-1,0,0]};
      for(const [direction, offset] of Object.entries(offsets)) {
        const neighbor = getRawNeighbor(...offset);
        const matches = neighbor === id || (id.endsWith('_fence') && neighbor.endsWith('_fence'))
          || ((id.endsWith('_pane') || id === 'iron_bars') && (neighbor.endsWith('_pane') || neighbor === 'iron_bars'));
        const solid = neighbor !== 'air' && !/glass|leaves|water|ice|slime|honey/.test(neighbor)
          && !neighbor.endsWith('_fence') && !neighbor.endsWith('_pane') && neighbor !== 'iron_bars';
        const connects = matches || solid;
        properties[direction] = id.endsWith('_wall') ? (connects ? 'low' : 'none') : String(connects);
      }
      if(id.endsWith('_wall')) properties.up = 'true';
    }
    const rotate = (v, axis, angle, origin) => {
      const pivot = new THREE.Vector3(...origin.map(n => n / 16));
      v.sub(pivot).applyAxisAngle(axis, angle * Math.PI / 180).add(pivot);
    };
    for (const element of block.elements) {
      if(element.when && !conditionMatches(element.when,properties)) continue;
      for (const [side, face] of Object.entries(element.faces)) {
        if ((block.fullCube || face.cull) && getNeighbor(...sides[side].normal) !== 'air') continue;
        const corners = elementCorners(element.from, element.to, side);
        if (!corners) continue;
        const [u0,v0,u1,v1] = face.uv;
        const tile = face.tile;
        const uMin = (tile.col * TILE + u0 / 16 * TILE + .1) / atlas.width;
        const uMax = (tile.col * TILE + u1 / 16 * TILE - .1) / atlas.width;
        const vTop = 1 - (tile.row * TILE + v0 / 16 * TILE + .1) / atlas.height;
        const vBottom = 1 - (tile.row * TILE + v1 / 16 * TILE - .1) / atlas.height;
        const texCoords = [[uMax,vBottom],[uMax,vTop],[uMin,vTop],[uMin,vBottom]];
        const vertices = corners.map(c => {
          const v = new THREE.Vector3(...c);
          if(element.rotation) rotate(v, new THREE.Vector3(
            ...(element.rotation.axis === 'x' ? [1,0,0] : element.rotation.axis === 'y' ? [0,1,0] : [0,0,1])
          ),element.rotation.angle,element.rotation.origin);
          if(element.x) rotate(v,new THREE.Vector3(1,0,0),-element.x,[8,8,8]);
          if(element.y) rotate(v,new THREE.Vector3(0,1,0),-element.y,[8,8,8]);
          return v;
        });
        const tint = face.tint
          ? (/leaves/.test(id) ? [.39,.65,.32] : /grass/.test(id) ? [.51,.78,.36] : [.75,.82,.7])
          : [1,1,1];
        for (const index of [0,1,2,0,2,3]) {
          const v=vertices[index], uv=texCoords[index];
          out.pos.push(x+v.x,y+v.y,z+v.z);
          out.uv.push(...uv);
          out.color.push(...tint);
        }
      }
    }
  }

  const opaqueMaterial = new THREE.MeshLambertMaterial({
    map:tex, vertexColors:true, side:THREE.DoubleSide, transparent:false, alphaTest:.12,
  });
  const glassMaterial = new THREE.MeshLambertMaterial({
    map:tex, vertexColors:true, side:THREE.DoubleSide, transparent:true, opacity:.78, depthWrite:false,
  });

  return {
    version:'1.21.11',
    blockNames:names,
    itemNames,
    itemIcon,
    ensure,
    getModel(id){return resolved.get(aliases[id]||id)},
    addBlock,
    opaqueMaterial,
    glassMaterial,
    textureCount(){return uvSlots.size},
    dispose(){for(const url of iconUrls.values())URL.revokeObjectURL(url);tex.dispose();opaqueMaterial.dispose();glassMaterial.dispose()},
  };
}
