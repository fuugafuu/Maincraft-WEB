import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { loadJavaResources } from './javaAssets.js';
import './style.css';

const isTouchDevice = matchMedia('(pointer: coarse)').matches;
const BLOCKS = [
  {id:'grass',name:'草ブロック',color:0x699b46,top:0x83b85a,side:0x806343},
  {id:'dirt',name:'土',color:0x806043},
  {id:'stone',name:'石',color:0x8f9291},
  {id:'sand',name:'砂',color:0xd9c68b},
  {id:'wood',name:'オークの原木',color:0x795334,top:0xac895e},
  {id:'leaves',name:'葉',color:0x3c8140,transparent:true},
  {id:'planks',name:'オークの板材',color:0xbc8e52},
  {id:'glass',name:'ガラス',color:0xb8e7e9,transparent:true},
  {id:'bricks',name:'レンガ',color:0xa55445},
  {id:'cobble',name:'丸石',color:0x777e7b},
  {id:'snow',name:'雪',color:0xf2f6f5},
  {id:'gold',name:'金ブロック',color:0xf2bd35},
  {id:'diamond',name:'ダイヤモンドブロック',color:0x5edcd2},
  {id:'obsidian',name:'黒曜石',color:0x282038},
  {id:'water',name:'水',color:0x4288c2,transparent:true},
  {id:'bedrock',name:'岩盤',color:0x393b3b},
];
const byId = Object.fromEntries(BLOCKS.map(b=>[b.id,b]));
const WORLD_INDEX_KEY = 'maincraft.world.index';
const WORLD_PREFIX = 'maincraft.world.';
let worldId = null;
let javaResources = null;
const AIR = 'air', SEA = 9, CHUNK = 16, RADIUS = isTouchDevice ? 1 : 2;
const app = document.getElementById('app');
app.innerHTML = `<div id="game"></div><div id="menu"><div class="menu-card"><div class="mark"></div><h1>MAIN<span>CRAFT</span></h1><div class="subtitle">WEB · VOXEL SANDBOX</div><p>ブラウザの中に、あなただけの世界を。</p><label>ワールド名</label><input class="field" id="worldname" maxlength="40" value="新しいワールド"><div class="row"><div><label>シード値（文字も入力可）</label><input class="field" id="seed" placeholder="空欄でランダム"></div><div><label>ゲームモード</label><select class="field" id="mode"><option value="creative">クリエイティブ</option><option value="survival">サバイバル（試作）</option></select></div></div><label for="javajar">Minecraft 1.21.11 Java Client (.jar)</label><input id="javajar" class="field" type="file" accept=".jar,.zip,application/java-archive"><div id="assetstatus" class="assetstatus">Optional: load textures and models from your own installation, locally in your browser.</div><button class="primary" id="create">新しいワールドを作成</button><button class="secondary" id="resume">保存したワールドを読み込む</button><div class="tiny">自動保存 · シード生成 · WebGL 3D · オフラインデータ保存</div></div></div><div id="hud" class="hidden"><div id="crosshair"></div><div id="coords"></div><div id="tip">W A S D 移動 · マウス 視点<br>左クリック 破壊 · 右クリック 設置<br>Space ジャンプ · Shift 走る · F 飛行<br>E インベントリ · T / チャット<br>1〜9 選択 · Esc ポーズ</div><div id="notice"></div><div id="bottom"><div id="selected-name"></div><div id="hotbar"></div></div><div id="chat" class="hidden"><div id="chatlog"></div><input id="command" placeholder="コマンドを入力（/help）" autocomplete="off"></div><div id="mobile"><div class="mobtop"><button data-action="pause" aria-label="メニュー">☰</button><button data-action="chat" aria-label="チャットとコマンド">⌨</button><button data-action="fly" aria-label="飛行切り替え">飛行</button></div><div class="mobgroup"><span></span><button data-key="KeyW" aria-label="前進">▲</button><span></span><button data-key="KeyA" aria-label="左移動">◀</button><button data-key="KeyS" aria-label="後退">▼</button><button data-key="KeyD" aria-label="右移動">▶</button></div><div class="mobactions"><button data-key="ControlLeft" aria-label="下降">↓</button><button data-key="Space" aria-label="ジャンプ・上昇">↑</button><button data-action="break" aria-label="破壊">⛏</button><button data-action="place" aria-label="設置">▣</button><button data-action="inventory" aria-label="インベントリ">▦</button></div><div class="mobhint">画面をスワイプして視点移動</div></div></div><div id="inventory" class="hidden"><div class="inventory-panel"><button class="close" id="closeinv">×</button><h2>ブロックとアイテム</h2><p>選択するとホットバーの現在のスロットにセットします。</p><input id="itemsearch" class="field" placeholder="Search blocks / ブロック検索" autocomplete="off"><div id="itemcount" class="itemcount"></div><div class="items" id="items"></div></div></div><div id="pause" class="hidden"><div class="pause-card"><h2>ゲームメニュー</h2><button class="primary" id="continue">ゲームに戻る</button><button class="secondary" id="loadassets">Load Java 1.21.11 textures</button><button class="secondary" id="save">ワールドを保存</button><button class="secondary" id="back">タイトル画面へ</button></div></div>`;
const $=s=>document.querySelector(s);
$('#resume').insertAdjacentHTML('afterend','<div id="worldlist" class="worldlist hidden" aria-label="保存されたワールド"></div>');
$('#worldlist').insertAdjacentHTML('afterend','<button class="secondary" id="importworld">ワールドデータを読み込む（JSON）</button><input id="importfile" type="file" accept=".json,application/json" class="hidden" aria-label="ワールドデータファイル">');
$('#save').insertAdjacentHTML('afterend','<button class="secondary" id="exportworld">ワールドを書き出す（JSON）</button>');
const game=$('#game'), canvas=document.createElement('canvas');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,isTouchDevice ? 1.5 : 2)); renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.24;game.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x8bc3e4);scene.fog=new THREE.Fog(0x8bc3e4,45,130);
const camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.05,250);
const sun=new THREE.DirectionalLight(0xfff1ca,2.6);sun.position.set(50,80,30);sun.castShadow=true;sun.shadow.mapSize.set(isTouchDevice ? 1024 : 2048,isTouchDevice ? 1024 : 2048);sun.shadow.camera.left=-85;sun.shadow.camera.right=85;sun.shadow.camera.top=85;sun.shadow.camera.bottom=-85;sun.shadow.camera.near=1;sun.shadow.camera.far=250;sun.shadow.bias=-.0007;scene.add(sun,sun.target);
scene.add(new THREE.HemisphereLight(0xd0ecff,0x4b5039,2));
const waterMaterial=new THREE.MeshPhysicalMaterial({color:0x3b8cbb,transparent:true,opacity:.72,roughness:.13,metalness:.14,clearcoat:1,clearcoatRoughness:.04,side:THREE.DoubleSide,depthWrite:false});
const water=new THREE.Mesh(new THREE.BufferGeometry(),waterMaterial);water.rotation.x=-Math.PI/2;water.position.y=SEA+.14;scene.add(water);
// Render the reflected scene at reduced resolution on desktop GPUs.
// Mobile uses the lightweight physical material to keep touch controls responsive.
let reflectedWater=null;
if(!isTouchDevice){
  const shader={
    ...Reflector.ReflectorShader,
    uniforms:{...Reflector.ReflectorShader.uniforms,time:{value:0}},
    fragmentShader:Reflector.ReflectorShader.fragmentShader
      .replace('uniform sampler2D tDiffuse;','uniform sampler2D tDiffuse;\n uniform float time;')
      .replace('vec4 base = texture2DProj( tDiffuse, vUv );',
        'vec4 rippleUv = vUv;\n rippleUv.xy += vec2(sin(vUv.x * 36.0 / vUv.w + time * 0.6), cos(vUv.y * 29.0 / vUv.w + time * 0.48)) * 0.0015 * vUv.w;\n vec4 base = texture2DProj( tDiffuse, rippleUv );')
      .replace('vec4( blendOverlay( base.rgb, color ), 1.0 )',
        'vec4( mix(base.rgb, color, 0.45), 0.76 )')
  };
  reflectedWater=new Reflector(new THREE.BufferGeometry(),{
    shader,textureWidth:512,textureHeight:512,multisample:0,clipBias:0.003,color:0x3b8cbb
  });
  reflectedWater.rotation.x=-Math.PI/2;
  reflectedWater.position.y=SEA+.145;
  reflectedWater.material.transparent=true;
  reflectedWater.material.depthWrite=false;
  scene.add(reflectedWater);
  water.visible=false;
}
const skyClouds=new THREE.Group();scene.add(skyClouds);
for(let i=0;i<36;i++){const c=new THREE.Mesh(new THREE.BoxGeometry(10+Math.random()*13,.65,4+Math.random()*5),new THREE.MeshBasicMaterial({color:0xf9f9f0,transparent:true,opacity:.74,depthWrite:false}));c.position.set(Math.random()*270-135,52+Math.random()*8,Math.random()*270-135);skyClouds.add(c)}
const chunkGroup=new THREE.Group();scene.add(chunkGroup);
const rainCount=isTouchDevice?220:650;
const rainGeometry=new THREE.BufferGeometry();
const rainPositions=new Float32Array(rainCount*6);
const rainDrops=Array.from({length:rainCount},()=>({x:Math.random()*54-27,y:Math.random()*36-8,z:Math.random()*54-27}));
rainGeometry.setAttribute('position',new THREE.BufferAttribute(rainPositions,3).setUsage(THREE.DynamicDrawUsage));
const rain=new THREE.LineSegments(rainGeometry,new THREE.LineBasicMaterial({color:0xa6c8ed,transparent:true,opacity:.48,depthWrite:false}));
rain.frustumCulled=false;
rain.visible=false;
scene.add(rain);
let weather='clear';
function updateRain(dt){
  rain.visible=active&&weather!=='clear'&&location.y>0;
  if(!rain.visible)return;
  for(let i=0;i<rainCount;i++){
    const drop=rainDrops[i];
    drop.y-=dt*19;
    if(drop.y<-8){drop.y+=36;drop.x=Math.random()*54-27;drop.z=Math.random()*54-27}
    const offset=i*6;
    rainPositions[offset]=drop.x;
    rainPositions[offset+1]=drop.y;
    rainPositions[offset+2]=drop.z;
    rainPositions[offset+3]=drop.x-.12;
    rainPositions[offset+4]=drop.y-.9;
    rainPositions[offset+5]=drop.z-.07;
  }
  rain.position.set(location.x,location.y,location.z);
  rainGeometry.attributes.position.needsUpdate=true;
}
let seed=1,seed64='1',seedString='',worldName='',mode='creative',savedEdits=new Map(),editedChunkHeights=new Map(),loaded=new Map(),pendingChunks=[],active=false,paused=false,inventoryOpen=false,chatOpen=false,fly=false,timeOfDay=6000,spawnPosition=null;
let slots=['grass','dirt','stone','wood','planks','glass','bricks','leaves','water'],selected=0,location={x:0,y:23,z:0},vy=0,grounded=false,yaw=0,pitch=0,lastChunkX=Infinity,lastChunkZ=Infinity;
const keys=new Set();const raycaster=new THREE.Raycaster();raycaster.far=7;
const clamp=THREE.MathUtils.clamp;const key=(x,y,z)=>`${x},${y},${z}`;
function hash(x,z,s=seed){let n=Math.imul(x,374761393)+Math.imul(z,668265263)+Math.imul(s,1442695041);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295}
function noise(x,z,scale){const a=Math.floor(x/scale),b=Math.floor(z/scale),u=x/scale-a,v=z/scale-b;const t=u*u*(3-2*u),w=v*v*(3-2*v);const ab=(n,m)=>hash(n,m);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(ab(a,b),ab(a+1,b),t),THREE.MathUtils.lerp(ab(a,b+1),ab(a+1,b+1),t),w)}
const heightCache=new Map(),treeCache=new Map(),treeColumnCache=new Map();
function height(x,z){
  const position=`${x},${z}`;
  if(heightCache.has(position))return heightCache.get(position);
  const h=Math.floor(5+noise(x,z,86)*13+noise(x+400,z-300,31)*9+noise(x-150,z+80,11)*3);
  heightCache.set(position,h);
  return h;
}
function surface(x,z){let h=height(x,z);return h<SEA+2?'sand':h>24?'snow':'grass'}
function treeAt(x,z){
  const position=`${x},${z}`;
  if(treeCache.has(position))return treeCache.get(position);
  const h=height(x,z);
  const hasTree=h>SEA+2 && h<24 && hash(x,z,seed+17)>.989 && hash(x+2,z+1,seed+21)>.35;
  treeCache.set(position,hasTree);
  return hasTree;
}
function treesForColumn(x,z){
  const position=`${x},${z}`;
  if(treeColumnCache.has(position))return treeColumnCache.get(position);
  const trees=[];
  for(let tx=x-2;tx<=x+2;tx++)for(let tz=z-2;tz<=z+2;tz++){
    if(!treeAt(tx,tz))continue;
    const base=height(tx,tz);
    trees.push({dx:Math.abs(x-tx),dz:Math.abs(z-tz),base,top:base+4+Math.floor(hash(tx,tz,seed+20)*3)});
  }
  treeColumnCache.set(position,trees);
  return trees;
}
function generatedBlock(x,y,z){
  if(y<0)return AIR;
  if(y===0)return 'bedrock';
  const h=height(x,z);
  if(y>h+9)return AIR;
  if(y<=h){
    if(y===h)return surface(x,z);
    if(y>h-4)return surface(x,z)==='sand'?'sand':'dirt';
    return 'stone';
  }
  if(y<=SEA)return 'water';
  for(const tree of treesForColumn(x,z)){
    if(tree.dx===0&&tree.dz===0&&y>tree.base&&y<=tree.top)return 'wood';
    const dy=y-tree.top;
    if(dy>=-2&&dy<=2&&tree.dx+tree.dz+Math.abs(dy)*.4<4.3)return 'leaves';
  }
  return AIR;
}
function getBlock(x,y,z){x=Math.floor(x);y=Math.floor(y);z=Math.floor(z);return savedEdits.get(key(x,y,z))??generatedBlock(x,y,z)}
function rememberEditHeight(x,y,z){
  const chunk=`${Math.floor(x/CHUNK)},${Math.floor(z/CHUNK)}`;
  editedChunkHeights.set(chunk,Math.max(y,editedChunkHeights.get(chunk)??0));
}
function rebuildEditedChunkHeights(){
  editedChunkHeights.clear();
  for(const [position,id] of savedEdits){
    if(id===AIR)continue;
    const [x,y,z]=position.split(',').map(Number);
    rememberEditHeight(x,y,z);
  }
}
const PLAYER_RADIUS=.3, PLAYER_EYE=1.62, PLAYER_HEIGHT=1.8;
function isSolid(id){
  return id!==AIR && id!=='water' && !/^(lava|.*_torch|.*_flower|.*_sapling|.*_grass|.*_fern|.*_mushroom|.*_carpet|.*_rail|.*_button|.*_pressure_plate|.*_sign|.*_banner|.*_vine|.*_seagrass|.*_coral_fan|.*_candle|redstone_wire|tripwire|lever|ladder|fire|soul_fire)$/.test(id);
}
function playerCollides(x,y,z){
  const minX=Math.floor(x-PLAYER_RADIUS+.001),maxX=Math.floor(x+PLAYER_RADIUS-.001);
  const minY=Math.floor(y-PLAYER_EYE+.001),maxY=Math.floor(y-PLAYER_EYE+PLAYER_HEIGHT-.001);
  const minZ=Math.floor(z-PLAYER_RADIUS+.001),maxZ=Math.floor(z+PLAYER_RADIUS-.001);
  for(let bx=minX;bx<=maxX;bx++)for(let bz=minZ;bz<=maxZ;bz++)for(let by=minY;by<=maxY;by++){
    if(isSolid(getBlock(bx,by,bz)))return true;
  }
  return false;
}
function moveHorizontal(dx,dz){
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dz))/.15));
  const stepX=dx/steps,stepZ=dz/steps;
  for(let i=0;i<steps;i++){
    if(!playerCollides(location.x+stepX,location.y,location.z))location.x+=stepX;
    if(!playerCollides(location.x,location.y,location.z+stepZ))location.z+=stepZ;
  }
}
function moveVertical(dy){
  const steps=Math.max(1,Math.ceil(Math.abs(dy)/.15));
  const step=dy/steps;
  for(let i=0;i<steps;i++){
    if(playerCollides(location.x,location.y+step,location.z)){
      if(step<0)grounded=true;
      vy=0;
      return;
    }
    location.y+=step;
  }
}
function setBlock(x,y,z,id){if(y<1||y>100)return;const k=key(x,y,z);if(id===generatedBlock(x,y,z))savedEdits.delete(k);else {savedEdits.set(k,id);if(id!==AIR)rememberEditHeight(x,y,z)}for(let cx=Math.floor(x/CHUNK)-1;cx<=Math.floor(x/CHUNK)+1;cx++)for(let cz=Math.floor(z/CHUNK)-1;cz<=Math.floor(z/CHUNK)+1;cz++){if(x>=cx*CHUNK-1&&x<=cx*CHUNK+CHUNK&&z>=cz*CHUNK-1&&z<=cz*CHUNK+CHUNK)rebuild(cx,cz)}scheduleSave()}
// Each visible block face is added directly to a chunk mesh, keeping draw calls low.
const faces=[{d:[1,0,0],v:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]],shade:.8},{d:[-1,0,0],v:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]],shade:.8},{d:[0,1,0],v:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]],shade:1.13},{d:[0,-1,0],v:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],shade:.54},{d:[0,0,1],v:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]],shade:.9},{d:[0,0,-1],v:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]],shade:.73}];
const materials={};for(const b of BLOCKS)materials[b.id]=new THREE.MeshLambertMaterial({vertexColors:true,side:b.transparent?THREE.DoubleSide:THREE.FrontSide,transparent:!!b.transparent,opacity:b.transparent?.72:1,depthWrite:!b.transparent});
function rebuild(cx,cz){
  const chunkKey=`${cx},${cz}`;
  const prior=loaded.get(chunkKey);
  if(prior){chunkGroup.remove(prior);prior.traverse(o=>o.geometry?.dispose())}
  const group=new THREE.Group();
  const buffers=new Map();
  const textured=[{pos:[],uv:[],color:[]},{pos:[],uv:[],color:[]}];
  for(let x=cx*CHUNK;x<(cx+1)*CHUNK;x++)
  for(let z=cz*CHUNK;z<(cz+1)*CHUNK;z++)
  for(let y=0;y<=Math.max(height(x,z)+9,32,editedChunkHeights.get(chunkKey)??0);y++){
    const id=getBlock(x,y,z);
    if(id===AIR||id==='water')continue;
    const b=byId[id];
    if(!b)continue;
    const native=javaResources?.getModel(id);
    if(native?.elements.length){
      const output=textured[Number(native.transparent)];
      javaResources.addBlock(output,native,x,y,z,(dx,dy,dz)=>{
        const neighbor=getBlock(x+dx,y+dy,z+dz);
        return (byId[neighbor]?.transparent)?AIR:neighbor;
      },id,(dx,dy,dz)=>getBlock(x+dx,y+dy,z+dz));
      continue;
    }
    if(!buffers.has(id))buffers.set(id,{pos:[],color:[],normal:[]});
    const out=buffers.get(id);
    for(let fi=0;fi<6;fi++){
      const f=faces[fi];
      const adjacent=getBlock(x+f.d[0],y+f.d[1],z+f.d[2]);
      if(adjacent!==AIR && !(byId[adjacent]?.transparent&&!b.transparent))continue;
      const rgb=new THREE.Color(fi===2?(b.top??b.color):(fi===0||fi===1||fi===4||fi===5?(b.side??b.color):b.color));
      rgb.multiplyScalar(f.shade*(.91+hash(x+fi,z+y)*.15));
      for(const n of [0,1,2,0,2,3]){
        const v=f.v[n];
        out.pos.push(x+v[0],y+v[1],z+v[2]);
        out.normal.push(...f.d);
        out.color.push(rgb.r,rgb.g,rgb.b);
      }
    }
  }
  for(const [id,buf] of buffers){
    if(!buf.pos.length)continue;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(buf.pos,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(buf.normal,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(buf.color,3));
    geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,materials[id]);
    mesh.userData.blockId=id;
    mesh.receiveShadow=true;
    mesh.castShadow=id!=='leaves'&&id!=='glass';
    group.add(mesh);
  }
  if(javaResources){
    for(let i=0;i<2;i++){
      const buf=textured[i];
      if(!buf.pos.length)continue;
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(buf.pos,3));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(buf.uv,2));
      geometry.setAttribute('color',new THREE.Float32BufferAttribute(buf.color,3));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,i?javaResources.glassMaterial:javaResources.opaqueMaterial);
      mesh.receiveShadow=true;
      mesh.castShadow=!i;
      group.add(mesh);
    }
  }
  loaded.set(chunkKey,group);
  chunkGroup.add(group);
  updateWaterSurface();
}
function updateWaterSurface(){
  // A surface tile exists only where a water block touches the open air.
  const positions=[],uvs=[];
  for(const chunk of loaded.keys()){
    const [cx,cz]=chunk.split(',').map(Number);
    for(let x=cx*CHUNK;x<(cx+1)*CHUNK;x++)for(let z=cz*CHUNK;z<(cz+1)*CHUNK;z++){
      if(getBlock(x,SEA,z)!=='water'||getBlock(x,SEA+1,z)!==AIR)continue;
      // Water meshes lie in local XY and rotate into world XZ.
      positions.push(x,-z,0,x+1,-z-1,0,x+1,-z,0,x,-z,0,x,-z-1,0,x+1,-z-1,0);
      uvs.push(0,0,1,1,1,0,0,0,0,1,1,1);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.computeBoundingSphere();
  const old=water.geometry;
  water.geometry=geometry;
  if(reflectedWater)reflectedWater.geometry=geometry;
  old.dispose();
}
function updateChunks(){
  const cx=Math.floor(location.x/CHUNK),cz=Math.floor(location.z/CHUNK);
  if(cx===lastChunkX&&cz===lastChunkZ)return;
  lastChunkX=cx;lastChunkZ=cz;
  pendingChunks=[];
  for(let a=cx-RADIUS;a<=cx+RADIUS;a++)for(let b=cz-RADIUS;b<=cz+RADIUS;b++){
    if(!loaded.has(`${a},${b}`))pendingChunks.push([a,b]);
  }
  pendingChunks.sort((a,b)=>
    (a[0]-cx)**2+(a[1]-cz)**2-(b[0]-cx)**2-(b[1]-cz)**2);
  let removedChunks=false;
  for(const [k,g] of loaded){
    const [x,z]=k.split(',').map(Number);
    if(Math.abs(x-cx)>RADIUS||Math.abs(z-cz)>RADIUS){
      chunkGroup.remove(g);g.traverse(o=>o.geometry?.dispose());loaded.delete(k);removedChunks=true;
    }
  }
  if(removedChunks)updateWaterSurface();
  sun.position.set(location.x+50,80,location.z+30);
  sun.target.position.set(location.x,0,location.z);
  sun.target.updateMatrixWorld();
}
function loadNextChunk(){
  const next=pendingChunks.shift();
  if(next&&!loaded.has(`${next[0]},${next[1]}`))rebuild(...next);
}
function readWorldIndex(){
  try { return JSON.parse(localStorage.getItem(WORLD_INDEX_KEY)) || []; }
  catch { return []; }
}
function saveData(){
  if(!active || !worldId)return;
  const obj={version:2,id:worldId,worldName,seedString,seed,seed64,mode,edits:[...savedEdits],slots,position:location,rotation:{yaw,pitch},spawnPosition,timeOfDay,weather};
  try {
    localStorage.setItem(WORLD_PREFIX+worldId,JSON.stringify(obj));
    const index=readWorldIndex().filter(item=>item.id!==worldId);
    index.unshift({id:worldId,name:worldName,seed:seedString,updated:Date.now()});
    localStorage.setItem(WORLD_INDEX_KEY,JSON.stringify(index));
  }catch{notice('保存容量の上限に達しました')}
}
let saveTimer;function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveData,900)}
function availableWorlds(){
  const saved=readWorldIndex().filter(entry=>localStorage.getItem(WORLD_PREFIX+entry.id));
  const legacy=localStorage.getItem('maincraft.world');
  if(legacy){
    try { saved.push({id:'legacy',name:JSON.parse(legacy)?.worldName||'以前のワールド',seed:'',updated:0}); }
    catch { /* A damaged legacy save does not hide other worlds. */ }
  }
  return saved;
}
function showWorlds(){
  const container=$('#worldlist');
  container.replaceChildren();
  const worlds=availableWorlds();
  if(!worlds.length){notice('保存されたワールドがありません');return}
  for(const entry of worlds){
    const row=document.createElement('div');
    row.className='world-entry-row';
    const button=document.createElement('button');
    button.className='world-entry';
    button.textContent=entry.name+' · Seed '+(entry.seed||'以前のデータ');
    button.onclick=()=>{
      try {
        const data=JSON.parse(localStorage.getItem(entry.id==='legacy'?'maincraft.world':WORLD_PREFIX+entry.id));
        if(!data)throw Error('データを読み込めません');
        newWorld(entry.id==='legacy'?{...data,migrateLegacy:true}:data);
      }catch{notice('ワールドを読み込めませんでした')}
    };
    const exportButton=document.createElement('button');
    exportButton.className='world-export';
    exportButton.textContent='書き出し';
    exportButton.setAttribute('aria-label',`${entry.name} を書き出す`);
    exportButton.onclick=()=>exportWorld(entry.id);
    row.append(button,exportButton);
    container.appendChild(row);
  }
  container.classList.toggle('hidden',!container.classList.contains('hidden'));
}
function exportWorld(id){
  if(active&&id===worldId)saveData();
  const data=localStorage.getItem(id==='legacy'?'maincraft.world':WORLD_PREFIX+id);
  if(!data){notice('ワールドデータがありません');return}
  const parsed=JSON.parse(data);
  const file=new Blob([data],{type:'application/json'});
  const url=URL.createObjectURL(file);
  const link=document.createElement('a');
  link.href=url;
  link.download=`${String(parsed.worldName||'world').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_')}.maincraft.json`;
  document.body.appendChild(link);
  link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  notice('ワールドデータを書き出しました');
}
function validateImportedWorld(data){
  if(!data||typeof data!=='object'||Array.isArray(data))return false;
  if(typeof data.worldName!=='string'||!data.worldName.trim()||data.worldName.length>100)return false;
  if(!Number.isInteger(data.seed)||!['creative','survival'].includes(data.mode))return false;
  if(data.seed64!==undefined&&(typeof data.seed64!=='string'||!isSignedLong(data.seed64)))return false;
  if(!Array.isArray(data.edits)||data.edits.length>200000)return false;
  if(!data.edits.every(entry=>Array.isArray(entry)&&entry.length===2&&/^[-]?\d+,[-]?\d+,[-]?\d+$/.test(entry[0])&&typeof entry[1]==='string'&&entry[1].length<=100))return false;
  const position=data.position;
  if(position&&!['x','y','z'].every(axis=>Number.isFinite(position[axis])))return false;
  return true;
}
$('#importworld').onclick=()=>$('#importfile').click();
$('#importfile').addEventListener('change',async event=>{
  const file=event.target.files?.[0];
  event.target.value='';
  if(!file)return;
  try{
    if(file.size>15*1024*1024)throw Error('ファイルが大きすぎます（15MBまで）');
    const data=JSON.parse(await file.text());
    if(!validateImportedWorld(data))throw Error('ワールドデータの形式が正しくありません');
    const id=crypto.randomUUID();
    const imported={...data,id,version:2,worldName:data.worldName.trim(),seedString:String(data.seedString??data.seed)};
    const storageKey=WORLD_PREFIX+id;
    localStorage.setItem(storageKey,JSON.stringify(imported));
    try{
      const index=readWorldIndex();
      index.unshift({id,name:imported.worldName,seed:imported.seedString,updated:Date.now()});
      localStorage.setItem(WORLD_INDEX_KEY,JSON.stringify(index));
    }catch(error){localStorage.removeItem(storageKey);throw error}
    $('#worldlist').classList.add('hidden');
    notice(`「${imported.worldName}」を読み込みました`);
  }catch(error){notice(`読み込み失敗: ${error instanceof SyntaxError?'JSONが不正です':error.message}`)}
});
$('#exportworld').onclick=()=>exportWorld(worldId);
const LONG_MIN=-(1n<<63n),LONG_MAX=(1n<<63n)-1n;
function isSignedLong(value){if(!/^-?\d+$/.test(value))return false;const n=BigInt(value);return n>=LONG_MIN&&n<=LONG_MAX}
function stringSeed(s){
  if(!s){
    const random=new Uint32Array(2);crypto.getRandomValues(random);
    return BigInt.asIntN(64,(BigInt(random[0])<<32n)|BigInt(random[1]));
  }
  if(isSignedLong(s))return BigInt(s);
  // Java String.hashCode iterates UTF-16 code units, including surrogate pairs.
  let hash=0;
  for(let i=0;i<s.length;i++)hash=(Math.imul(31,hash)+s.charCodeAt(i))|0;
  return BigInt(hash);
}
function lockPointer(){if(!isTouchDevice)renderer.domElement.requestPointerLock?.()}
function newWorld(data){worldId=data.id??crypto.randomUUID();worldName=data.worldName;seedString=data.seedString;seed=data.seed;seed64=data.seed64??String(seed);heightCache.clear();treeCache.clear();treeColumnCache.clear();mode=data.mode;weather=['clear','rain','thunder'].includes(data.weather)?data.weather:'clear';slots=data.slots??['grass','dirt','stone','wood','planks','glass','bricks','leaves','water'];savedEdits=new Map(data.edits??[]);rebuildEditedChunkHeights();for(const id of savedEdits.values())if(id!==AIR)registerBlock(id);location=data.position??{x:0,y:height(0,0)+3,z:0};spawnPosition=data.spawnPosition??{x:0,y:height(0,0)+3,z:0};timeOfDay=data.timeOfDay??6000;vy=0;fly=mode==='creative';yaw=data.rotation?.yaw??0;pitch=data.rotation?.pitch??0;camera.rotation.order='YXZ';loaded.forEach(g=>{chunkGroup.remove(g);g.traverse(o=>o.geometry?.dispose())});loaded.clear();pendingChunks=[];lastChunkX=Infinity;lastChunkZ=Infinity;active=true;paused=false;$('#menu').classList.add('hidden');$('#worldlist').classList.add('hidden');$('#hud').classList.remove('hidden');$('#pause').classList.add('hidden');$('#coords').innerHTML=`${worldName}<br>XYZ ${location.x.toFixed(1)} / ${location.y.toFixed(1)} / ${location.z.toFixed(1)}<br>地形を生成中… · Seed ${seed64}`;updateChunks();renderHotbar();updateSun();notice(`ワールド「${worldName}」 · シード ${seed64}`);saveData();if(data.migrateLegacy&&localStorage.getItem(WORLD_PREFIX+worldId))localStorage.removeItem('maincraft.world');lockPointer()}
$('#create').onclick=()=>{const seedString=$('#seed').value.trim();const longSeed=stringSeed(seedString);const seed=Number(BigInt.asIntN(32,longSeed));newWorld({worldName:$('#worldname').value.trim()||'新しいワールド',seedString:seedString||String(longSeed),seed64:String(longSeed),seed,mode:$('#mode').value,edits:[],position:{x:0,y:heightFor(seed,0,0)+4,z:0}})};
function heightFor(s,x,z){const old=seed;seed=s;heightCache.clear();treeCache.clear();treeColumnCache.clear();const n=height(x,z);seed=old;heightCache.clear();treeCache.clear();treeColumnCache.clear();return n}
$('#resume').onclick=showWorlds;
function registerBlock(id){
  if(byId[id])return;
  let value=0;
  for(const char of id)value=(Math.imul(value,31)+char.charCodeAt(0))|0;
  const tint=new THREE.Color().setHSL((value>>>0)%360/360,.22,.45);
  const block={id,name:id.replaceAll('_',' '),color:tint.getHex(),transparent:/glass|ice|leaves|pane|grate|bars/.test(id)};
  BLOCKS.push(block);
  byId[id]=block;
  materials[id]=materials.stone;
}
async function ensureJavaBlock(id){
  if(!javaResources)return;
  try{
    const model=await javaResources.ensure(id);
    if(model&&byId[id])byId[id].transparent=model.transparent;
    if(active&&model){
      for(const chunk of [...loaded.keys()]){
        const [cx,cz]=chunk.split(',').map(Number);
        rebuild(cx,cz);
      }
    }
  }catch(error){notice(`Model import: ${error.message}`)}
}
async function importJavaJar(file){
  if(!file)return;
  const status=$('#assetstatus');
  status.textContent='Reading Java 1.21.11 resources…';
  try{
    const imported=await loadJavaResources(file,message=>status.textContent=message);
    for(const name of imported.blockNames)registerBlock(name);
    const old=javaResources;
    javaResources=imported;
    for(const id of new Set([...slots,'grass','dirt','stone','sand','wood','leaves','planks','glass','bricks','cobble','snow','gold','diamond','obsidian','bedrock'])){
      await javaResources.ensure(id);
    }
    for(const id of new Set([...savedEdits.values()])){
      if(id!=='air')await javaResources.ensure(id);
    }
    old?.dispose();
    if(active)for(const chunk of [...loaded.keys()]){
      const [cx,cz]=chunk.split(',').map(Number);
      rebuild(cx,cz);
    }
    status.textContent=`Java 1.21.11 loaded · ${imported.blockNames.length} blockstate IDs · ${imported.textureCount()} textures`;
    notice(status.textContent);
  }catch(error){
    status.textContent=`Asset import failed: ${error.message}`;
    notice(status.textContent);
  }
}
$('#javajar').addEventListener('change',event=>{
  importJavaJar(event.target.files?.[0]);
  event.target.value='';
});
$('#loadassets').onclick=()=>$('#javajar').click();
function renderHotbar(){$('#hotbar').innerHTML=slots.map((id,i)=>`<div class="slot ${i===selected?'selected':''}" data-slot="${i}"><em>${i+1}</em><i style="background:#${(byId[id]?.color??0xffffff).toString(16).padStart(6,'0')}"></i></div>`).join('');$('#selected-name').textContent=byId[slots[selected]]?.name??slots[selected];$$('.slot').forEach(s=>s.onclick=()=>{selected=Number(s.dataset.slot);renderHotbar()})}
function $$(s){return [...document.querySelectorAll(s)]}
function notice(msg){const el=$('#notice');el.textContent=msg;el.classList.add('show');clearTimeout(notice.timeout);notice.timeout=setTimeout(()=>el.classList.remove('show'),2400)}
function renderInventory(query=''){
  const matches=BLOCKS.filter(b=>b.id!=='bedrock'&&(b.id.includes(query.toLowerCase())||b.name.includes(query)));
  $('#itemcount').textContent=`${matches.length} blocks · displaying ${Math.min(matches.length,120)}`;
  $('#items').innerHTML=matches.slice(0,120).map(b=>`<button class="item-tile" data-id="${b.id}"><i style="background:#${b.color.toString(16).padStart(6,'0')}"></i>${b.name}</button>`).join('');
  $$('.item-tile').forEach(el=>el.onclick=async()=>{
    const id=el.dataset.id;
    slots[selected]=id;
    renderHotbar();
    closeInventory();
    scheduleSave();
    await ensureJavaBlock(id);
  });
}
function openInventory(){
  inventoryOpen=true;
  document.exitPointerLock?.();
  $('#inventory').classList.remove('hidden');
  $('#itemsearch').value='';
  renderInventory();
  if(!isTouchDevice)$('#itemsearch').focus();
}
$('#itemsearch').addEventListener('input',e=>renderInventory(e.target.value.trim()));
function closeInventory(){inventoryOpen=false;$('#inventory').classList.add('hidden');if(active&&!paused)lockPointer()}
$('#closeinv').onclick=closeInventory;
function pause(){if(!active)return;paused=true;document.exitPointerLock?.();$('#pause').classList.remove('hidden')}
function unpause(){paused=false;$('#pause').classList.add('hidden');lockPointer()}
$('#continue').onclick=unpause;$('#save').onclick=()=>{saveData();notice('保存しました');unpause()};$('#back').onclick=()=>{saveData();active=false;paused=false;$('#pause').classList.add('hidden');$('#hud').classList.add('hidden');$('#menu').classList.remove('hidden')};
document.addEventListener('pointerlockchange',()=>{if(!isTouchDevice&&!document.pointerLockElement&&active&&!inventoryOpen&&!chatOpen&&!paused)pause()});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==renderer.domElement||paused)return;yaw-=e.movementX*.0024;pitch=clamp(pitch-e.movementY*.0024,-Math.PI/2+.01,Math.PI/2-.01)});
document.addEventListener('keydown',e=>{if(!active)return;if(chatOpen){if(e.code==='Enter'){execute($('#command').value);$('#command').value='';closeChat()}else if(e.code==='Escape')closeChat();return}if(inventoryOpen){if(e.code==='Escape'||e.code==='KeyE')closeInventory();return}if(e.code==='Escape'){pause();return}if(paused)return;if(e.code==='KeyT'||e.code==='Slash'){openChat(e.code==='Slash'?'/':'');e.preventDefault();return}if(e.code==='KeyE'){openInventory();return}if(e.code==='KeyF'){fly=!fly;vy=0;notice(fly?'飛行モード ON':'飛行モード OFF');return}if(/^Digit[1-9]$/.test(e.code)){selected=Number(e.code.slice(-1))-1;renderHotbar()}keys.add(e.code);if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault()});
document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());renderer.domElement.addEventListener('mousedown',e=>{if(!active||paused||inventoryOpen||chatOpen||isTouchDevice)return;if(document.pointerLockElement!==renderer.domElement){lockPointer();return}if(e.button===0)interact(false);if(e.button===2)interact(true)});
document.addEventListener('wheel',e=>{if(!active||paused||inventoryOpen)return;selected=(selected+(e.deltaY>0?1:8))%9;renderHotbar()},{passive:true});
function pick(){camera.updateMatrixWorld();raycaster.setFromCamera(new THREE.Vector2(),camera);const targets=[...loaded.values()].flatMap(g=>g.children);const hits=raycaster.intersectObjects(targets,false);return hits.find(h=>h.distance<=6.5)}
function interact(place){const hit=pick();if(!hit)return;const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld).round();const p=hit.point.clone().addScaledVector(normal,place?.025:-.025);if(place)p.copy(hit.point).addScaledVector(normal,.025);const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z);if(place){if(Math.abs(x-location.x)<.8&&Math.abs(z-location.z)<.8&&y<location.y+.6&&y+1>location.y-1.6)return;setBlock(x,y,z,slots[selected])}else if(getBlock(x,y,z)!=='bedrock')setBlock(x,y,z,AIR)}
function openChat(prefill=''){chatOpen=true;document.exitPointerLock?.();$('#chat').classList.remove('hidden');$('#command').value=prefill;$('#command').focus()}
function closeChat(){chatOpen=false;$('#chat').classList.add('hidden');lockPointer()}
function chat(text){const log=$('#chatlog');const line=document.createElement('div');line.textContent=text;log.appendChild(line);log.scrollTop=log.scrollHeight;while(log.children.length>16)log.firstChild.remove()}
function updateBlockRegion(positions){
  const chunks=new Set();
  for(const [x,,z] of positions){
    const cx=Math.floor(x/CHUNK),cz=Math.floor(z/CHUNK);
    chunks.add(`${cx},${cz}`);
    if(x%CHUNK===0)chunks.add(`${cx-1},${cz}`);
    if(x%CHUNK===CHUNK-1)chunks.add(`${cx+1},${cz}`);
    if(z%CHUNK===0)chunks.add(`${cx},${cz-1}`);
    if(z%CHUNK===CHUNK-1)chunks.add(`${cx},${cz+1}`);
  }
  rebuildEditedChunkHeights();
  for(const chunk of chunks){
    if(!loaded.has(chunk))continue;
    const [cx,cz]=chunk.split(',').map(Number);
    rebuild(cx,cz);
  }
  scheduleSave();
}
function writeBlock(x,y,z,id){
  const position=key(x,y,z);
  if(id===generatedBlock(x,y,z))savedEdits.delete(position);
  else savedEdits.set(position,id);
}
function execute(raw){const input=raw.trim();if(!input)return;if(!input.startsWith('/')){chat(`<${worldName}> ${input}`);return}const parts=input.slice(1).split(/\s+/),cmd=parts.shift().toLowerCase();const xyz=(offset=0)=>parts.slice(offset,offset+3).map((v,i)=>{const base=[location.x,location.y,location.z][i];return v?.startsWith('~')?Math.floor(base)+Number(v.slice(1)||0):Number(v)});const valid=v=>v.every(Number.isFinite)&&v.every(Number.isInteger);const inWorld=v=>valid(v)&&v[1]>=1&&v[1]<=100;const volume=(a,b)=>(Math.abs(a[0]-b[0])+1)*(Math.abs(a[1]-b[1])+1)*(Math.abs(a[2]-b[2])+1);const bounds=(a,b)=>a.map((n,i)=>[Math.min(n,b[i]),Math.max(n,b[i])]);
  switch(cmd){case 'help':chat('/help /seed /tp x y z /setblock x y z block [keep|replace] /fill x1 y1 z1 x2 y2 z2 block [replace|keep|hollow|outline] /clone x1 y1 z1 x2 y2 z2 x y z /give block /time set day|night|noon|midnight /gamemode creative|survival /weather clear|rain|thunder /save /spawnpoint [x y z] /setworldspawn [x y z] /kill /locate');break;
  case 'seed':chat(`シード: ${seed64}`);break;
  case 'tp':case 'teleport':{const p=xyz();if(!valid(p)){chat('使用法 /tp x y z');break}location={x:p[0],y:p[1],z:p[2]};vy=0;updateChunks();chat('テレポートしました');break}
  case 'setblock':{const p=xyz(),id=parts[3]?.replace('minecraft:',''),action=parts[4]||'replace';if(!inWorld(p)||!(id===AIR||byId[id])||!['keep','replace','destroy'].includes(action)){chat('使用法 /setblock x y z block [keep|replace|destroy]');break}if(action==='keep'&&getBlock(...p)!==AIR){chat('変更対象が空気ではありません');break}setBlock(...p,id);if(id!==AIR)void ensureJavaBlock(id);chat(`ブロックを設置しました ${id}`);break}
  case 'fill':{
    const a=xyz(),b=xyz(3),id=parts[6]?.replace('minecraft:',''),action=parts[7]||'replace';
    if(!inWorld(a)||!inWorld(b)||!(id===AIR||byId[id])||!['replace','keep','hollow','outline'].includes(action)){chat('使用法 /fill x1 y1 z1 x2 y2 z2 block [replace|keep|hollow|outline]');break}
    if(volume(a,b)>4096){chat('一度に変更できるのは4096ブロックまでです');break}
    const [[minX,maxX],[minY,maxY],[minZ,maxZ]]=bounds(a,b),changed=[];
    for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++)for(let y=minY;y<=maxY;y++){
      const edge=x===minX||x===maxX||y===minY||y===maxY||z===minZ||z===maxZ;
      if(action==='outline'&&!edge)continue;
      if(action==='keep'&&getBlock(x,y,z)!==AIR)continue;
      const next=action==='hollow'&&!edge?AIR:id;
      if(getBlock(x,y,z)===next)continue;
      writeBlock(x,y,z,next);changed.push([x,y,z]);
    }
    updateBlockRegion(changed);
    if(id!==AIR)void ensureJavaBlock(id);
    chat(`${changed.length} ブロックを変更しました`);break;
  }
  case 'clone':{
    const a=xyz(),b=xyz(3),dest=xyz(6);
    if(!inWorld(a)||!inWorld(b)||!inWorld(dest)){chat('使用法 /clone x1 y1 z1 x2 y2 z2 x y z');break}
    if(volume(a,b)>4096){chat('一度に複製できるのは4096ブロックまでです');break}
    const ranges=bounds(a,b),size=ranges.map(([min,max])=>max-min+1);
    if(dest[1]+size[1]-1>100){chat('複製先がワールドの高さを超えています');break}
    const source=[];
    for(let dx=0;dx<size[0];dx++)for(let dz=0;dz<size[2];dz++)for(let dy=0;dy<size[1];dy++){
      source.push([dest[0]+dx,dest[1]+dy,dest[2]+dz,getBlock(ranges[0][0]+dx,ranges[1][0]+dy,ranges[2][0]+dz)]);
    }
    const changed=[],usedBlocks=new Set();
    for(const [x,y,z,id] of source){if(getBlock(x,y,z)===id)continue;writeBlock(x,y,z,id);changed.push([x,y,z]);if(id!==AIR)usedBlocks.add(id)}
    updateBlockRegion(changed);
    for(const id of usedBlocks)void ensureJavaBlock(id);
    chat(`${changed.length} ブロックを複製しました`);break;
  }
  case 'give':{const id=parts.find(p=>byId[p.replace('minecraft:','')])?.replace('minecraft:','');if(!id){chat('使用法 /give block');break}slots[selected]=id;renderHotbar();void ensureJavaBlock(id);chat(`${id} を入手しました`);break}
  case 'time':{const t=parts.at(-1),named={day:1000,noon:6000,night:13000,midnight:18000};const val=named[t]??Number(t);if(!Number.isFinite(val)){chat('使用法 /time set day|night|noon|midnight');break}timeOfDay=((val%24000)+24000)%24000;updateSun();chat(`時刻 ${timeOfDay}`);break}
  case 'gamemode':{if(!['creative','survival'].includes(parts[0])){chat('使用法 /gamemode creative|survival');break}mode=parts[0];fly=mode==='creative';chat(`ゲームモード ${mode}`);break}
  case 'weather':{if(!['clear','rain','thunder'].includes(parts[0])||parts.length!==1){chat('使用法 /weather clear|rain|thunder');break}weather=parts[0];updateSun();scheduleSave();chat(`天気を ${weather} に設定しました`);break}
  case 'save':saveData();chat('ワールドを保存しました');break;
  case 'spawnpoint':case 'setworldspawn':{
    const target=parts.length===0?location:xyz();
    if(parts.length!==0&&parts.length!==3||!target.every(Number.isFinite)||target.y<1||target.y>100){chat(`使用法 /${cmd} [x y z]`);break}
    spawnPosition={x:target.x??target[0],y:target.y??target[1],z:target.z??target[2]};
    scheduleSave();
    chat(`スポーン位置を ${spawnPosition.x} ${spawnPosition.y} ${spawnPosition.z} に設定しました`);
    break;
  }
  case 'kill':{
    if(parts.length&&parts[0]!=='@s'){chat('使用法 /kill [@s]');break}
    location={...spawnPosition};vy=0;grounded=false;
    updateChunks();scheduleSave();
    chat('スポーン地点に戻りました');break;
  }
  case 'locate':chat('構造物の探索は今後実装予定です');break;
  default:chat(`不明なコマンド: /${cmd}。/help を参照してください`)} }
function updateSun(){const a=(timeOfDay/24000)*Math.PI*2;const elevation=Math.cos(a);sun.position.set(location.x+Math.sin(a)*80,Math.max(5,elevation*85),location.z+35);sun.intensity=Math.max(.13,elevation*2.35);const daylight=clamp((elevation+.2)*1.25,0,1)*(weather==='thunder'?.52:weather==='rain'?.78:1);scene.background.setRGB(THREE.MathUtils.lerp(.035,.53,daylight),THREE.MathUtils.lerp(.06,.76,daylight),THREE.MathUtils.lerp(.16,.92,daylight));scene.fog.color.copy(scene.background);waterMaterial.color.set(daylight>.4?0x3b8cbb:0x1b405e);if(reflectedWater)reflectedWater.material.uniforms.color.value.set(daylight>.4?0x3b8cbb:0x1b405e);skyClouds.visible=daylight>.25}
if(isTouchDevice){
  let lookPointer=null;
  let previousX=0,previousY=0;
  const view=renderer.domElement;
  view.addEventListener('pointerdown',event=>{
    if(!active||paused||inventoryOpen||chatOpen||lookPointer!==null)return;
    lookPointer=event.pointerId;
    previousX=event.clientX;previousY=event.clientY;
    view.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  view.addEventListener('pointermove',event=>{
    if(lookPointer!==event.pointerId||!active||paused||inventoryOpen||chatOpen)return;
    yaw-=(event.clientX-previousX)*.005;
    pitch=clamp(pitch-(event.clientY-previousY)*.005,-1.5,1.5);
    previousX=event.clientX;previousY=event.clientY;
    event.preventDefault();
  });
  const releaseView=event=>{if(lookPointer===event.pointerId)lookPointer=null};
  view.addEventListener('pointerup',releaseView);
  view.addEventListener('pointercancel',releaseView);
  view.addEventListener('lostpointercapture',releaseView);
  const held=new Map();
  function releaseButton(event){
    const code=held.get(event.pointerId);
    if(code){keys.delete(code);held.delete(event.pointerId)}
  }
  for(const btn of $$('#mobile button')){
    btn.addEventListener('pointerdown',event=>{
      if(!active||paused||inventoryOpen||chatOpen)return;
      event.preventDefault();
      btn.setPointerCapture(event.pointerId);
      const code=btn.dataset.key;
      if(code){keys.add(code);held.set(event.pointerId,code);return}
      switch(btn.dataset.action){
        case 'break':interact(false);break;
        case 'place':interact(true);break;
        case 'inventory':openInventory();break;
        case 'chat':openChat('/');break;
        case 'pause':pause();break;
        case 'fly':fly=!fly;vy=0;notice(fly?'飛行モード ON':'飛行モード OFF');break;
      }
    });
    btn.addEventListener('pointerup',releaseButton);
    btn.addEventListener('pointercancel',releaseButton);
    btn.addEventListener('lostpointercapture',releaseButton);
  }
}
let last=performance.now(),frames=0,fps=0,second=0;
function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.05);last=now;if(active&&!paused&&!inventoryOpen&&!chatOpen){loadNextChunk();const forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));const strafe=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));const length=Math.hypot(forward,strafe)||1;const speed=(keys.has('ShiftLeft')||keys.has('ShiftRight'))?10:5.4;const dx=(Math.sin(yaw)*forward+Math.cos(yaw)*strafe)*speed*dt/length;const dz=(-Math.cos(yaw)*forward+Math.sin(yaw)*strafe)*speed*dt/length;
    if(fly){location.x+=dx;location.z+=dz;location.y+=(Number(keys.has('Space'))-Number(keys.has('ControlLeft')))*speed*dt;vy=0}else{
      moveHorizontal(dx,dz);
      if(keys.has('Space')&&grounded){vy=8.2;grounded=false}
      grounded=false;
      vy-=22*dt;
      moveVertical(vy*dt);
      if(vy===0&&playerCollides(location.x,location.y-.025,location.z))grounded=true;
    }
    location.y=clamp(location.y,1.8,110);camera.position.set(location.x,location.y,location.z);camera.rotation.set(pitch,yaw,0,'YXZ');updateChunks();updateRain(dt);skyClouds.position.x+=dt*.35;water.material.opacity=.70+Math.sin(now*.0018)*.04;if(reflectedWater){reflectedWater.visible=location.y>SEA+.2;water.visible=!reflectedWater.visible;reflectedWater.material.uniforms.time.value=now*.001}second+=dt;frames++;if(second>.5){fps=Math.round(frames/second);second=0;frames=0;$('#coords').innerHTML=`${worldName}<br>XYZ ${location.x.toFixed(1)} / ${location.y.toFixed(1)} / ${location.z.toFixed(1)}<br>FPS ${fps} · ${mode} · Seed ${seed64}`}}renderer.render(scene,camera)}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});requestAnimationFrame(animate);
window.addEventListener('beforeunload',saveData);
