import * as THREE from 'three';
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
const game=$('#game'), canvas=document.createElement('canvas');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,isTouchDevice ? 1.5 : 2)); renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.24;game.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x8bc3e4);scene.fog=new THREE.Fog(0x8bc3e4,45,130);
const camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.05,250);
const sun=new THREE.DirectionalLight(0xfff1ca,2.6);sun.position.set(50,80,30);sun.castShadow=true;sun.shadow.mapSize.set(isTouchDevice ? 1024 : 2048,isTouchDevice ? 1024 : 2048);sun.shadow.camera.left=-85;sun.shadow.camera.right=85;sun.shadow.camera.top=85;sun.shadow.camera.bottom=-85;sun.shadow.camera.near=1;sun.shadow.camera.far=250;sun.shadow.bias=-.0007;scene.add(sun,sun.target);
scene.add(new THREE.HemisphereLight(0xd0ecff,0x4b5039,2));
const waterMaterial=new THREE.MeshPhysicalMaterial({color:0x3b8cbb,transparent:true,opacity:.72,roughness:.13,metalness:.14,clearcoat:1,clearcoatRoughness:.04,side:THREE.DoubleSide,depthWrite:false});
const water=new THREE.Mesh(new THREE.PlaneGeometry(250,250,1,1),waterMaterial);water.rotation.x=-Math.PI/2;water.position.y=SEA+.14;scene.add(water);
const skyClouds=new THREE.Group();scene.add(skyClouds);
for(let i=0;i<36;i++){const c=new THREE.Mesh(new THREE.BoxGeometry(10+Math.random()*13,.65,4+Math.random()*5),new THREE.MeshBasicMaterial({color:0xf9f9f0,transparent:true,opacity:.74,depthWrite:false}));c.position.set(Math.random()*270-135,52+Math.random()*8,Math.random()*270-135);skyClouds.add(c)}
const chunkGroup=new THREE.Group();scene.add(chunkGroup);
let seed=1,seedString='',worldName='',mode='creative',savedEdits=new Map(),editedChunkHeights=new Map(),loaded=new Map(),pendingChunks=[],active=false,paused=false,inventoryOpen=false,chatOpen=false,fly=false,timeOfDay=6000;
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
  for(const [k,g] of loaded){
    const [x,z]=k.split(',').map(Number);
    if(Math.abs(x-cx)>RADIUS||Math.abs(z-cz)>RADIUS){
      chunkGroup.remove(g);g.traverse(o=>o.geometry?.dispose());loaded.delete(k);
    }
  }
  water.position.x=cx*CHUNK;water.position.z=cz*CHUNK;
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
  const obj={version:2,id:worldId,worldName,seedString,seed,mode,edits:[...savedEdits],slots,position:location,timeOfDay};
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
    container.appendChild(button);
  }
  container.classList.toggle('hidden',!container.classList.contains('hidden'));
}
function stringSeed(s){if(!s)return Math.floor(Math.random()*2147483647);if(/^-?\d+$/.test(s))return Number(BigInt.asIntN(32,BigInt(s)));let h=0;for(const ch of s)h=(Math.imul(31,h)+ch.charCodeAt(0))|0;return h}
function lockPointer(){if(!isTouchDevice)renderer.domElement.requestPointerLock?.()}
function newWorld(data){worldId=data.id??crypto.randomUUID();worldName=data.worldName;seedString=data.seedString;seed=data.seed;heightCache.clear();treeCache.clear();treeColumnCache.clear();mode=data.mode;slots=data.slots??['grass','dirt','stone','wood','planks','glass','bricks','leaves','water'];savedEdits=new Map(data.edits??[]);rebuildEditedChunkHeights();for(const id of savedEdits.values())if(id!==AIR)registerBlock(id);location=data.position??{x:0,y:height(0,0)+3,z:0};timeOfDay=data.timeOfDay??6000;vy=0;fly=mode==='creative';yaw=0;pitch=0;camera.rotation.order='YXZ';loaded.forEach(g=>{chunkGroup.remove(g);g.traverse(o=>o.geometry?.dispose())});loaded.clear();pendingChunks=[];lastChunkX=Infinity;lastChunkZ=Infinity;active=true;paused=false;$('#menu').classList.add('hidden');$('#worldlist').classList.add('hidden');$('#hud').classList.remove('hidden');$('#pause').classList.add('hidden');$('#coords').innerHTML=`${worldName}<br>XYZ ${location.x.toFixed(1)} / ${location.y.toFixed(1)} / ${location.z.toFixed(1)}<br>地形を生成中… · Seed ${seed}`;updateChunks();renderHotbar();updateSun();notice(`ワールド「${worldName}」 · シード ${seed}`);saveData();if(data.migrateLegacy&&localStorage.getItem(WORLD_PREFIX+worldId))localStorage.removeItem('maincraft.world');lockPointer()}
$('#create').onclick=()=>{const seedString=$('#seed').value.trim();const seed=stringSeed(seedString);newWorld({worldName:$('#worldname').value.trim()||'新しいワールド',seedString:seedString||String(seed),seed,mode:$('#mode').value,edits:[],position:{x:0,y:heightFor(seed,0,0)+4,z:0}})};
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
function execute(raw){const input=raw.trim();if(!input)return;if(!input.startsWith('/')){chat(`<${worldName}> ${input}`);return}const parts=input.slice(1).split(/\s+/),cmd=parts.shift().toLowerCase();const xyz=(offset=0)=>parts.slice(offset,offset+3).map((v,i)=>{const base=[location.x,location.y,location.z][i];return v?.startsWith('~')?Math.floor(base)+Number(v.slice(1)||0):Number(v)});const valid=v=>v.every(Number.isFinite);
  switch(cmd){case 'help':chat('/help /seed /tp x y z /setblock x y z block /fill x1 y1 z1 x2 y2 z2 block /give block /time set day|night|noon|midnight /gamemode creative|survival /weather clear|rain /save /spawnpoint /locate');break;
  case 'seed':chat(`シード: ${seedString} (${seed})`);break;
  case 'tp':case 'teleport':{const p=xyz();if(!valid(p)){chat('使用法 /tp x y z');break}location={x:p[0],y:p[1],z:p[2]};vy=0;updateChunks();chat('テレポートしました');break}
  case 'setblock':{const p=xyz(),id=parts[3]?.replace('minecraft:','');if(!valid(p)||!(id===AIR||byId[id])){chat('使用法 /setblock x y z block');break}setBlock(...p,id);if(id!==AIR)void ensureJavaBlock(id);chat(`ブロックを設置しました ${id}`);break}
  case 'fill':{const a=xyz(),b=xyz(3),id=parts[6]?.replace('minecraft:','');if(!valid(a)||!valid(b)||!(id===AIR||byId[id])){chat('使用法 /fill x1 y1 z1 x2 y2 z2 block');break}const count=(Math.abs(a[0]-b[0])+1)*(Math.abs(a[1]-b[1])+1)*(Math.abs(a[2]-b[2])+1);if(count>4096){chat('一度に変更できるのは4096ブロックまでです');break}for(let x=Math.min(a[0],b[0]);x<=Math.max(a[0],b[0]);x++)for(let z=Math.min(a[2],b[2]);z<=Math.max(a[2],b[2]);z++)for(let y=Math.max(1,Math.min(a[1],b[1]));y<=Math.min(100,Math.max(a[1],b[1]));y++){const k=key(x,y,z);if(id===generatedBlock(x,y,z))savedEdits.delete(k);else {savedEdits.set(k,id);if(id!==AIR)rememberEditHeight(x,y,z)}}for(const [k,g] of [...loaded]){const [cx,cz]=k.split(',').map(Number);rebuild(cx,cz)}if(id!==AIR)void ensureJavaBlock(id);scheduleSave();chat(`${count} ブロックを変更しました`);break}
  case 'give':{const id=parts.find(p=>byId[p.replace('minecraft:','')])?.replace('minecraft:','');if(!id){chat('使用法 /give block');break}slots[selected]=id;renderHotbar();void ensureJavaBlock(id);chat(`${id} を入手しました`);break}
  case 'time':{const t=parts.at(-1),named={day:1000,noon:6000,night:13000,midnight:18000};const val=named[t]??Number(t);if(!Number.isFinite(val)){chat('使用法 /time set day|night|noon|midnight');break}timeOfDay=((val%24000)+24000)%24000;updateSun();chat(`時刻 ${timeOfDay}`);break}
  case 'gamemode':{if(!['creative','survival'].includes(parts[0])){chat('使用法 /gamemode creative|survival');break}mode=parts[0];fly=mode==='creative';chat(`ゲームモード ${mode}`);break}
  case 'weather':chat(`天気を ${parts[0]||'clear'} に設定しました（天候描画は開発中）`);break;
  case 'save':saveData();chat('ワールドを保存しました');break;
  case 'spawnpoint':chat('現在地がスポーン地点です（固定スポーンの実装は開発中）');break;
  case 'locate':chat('構造物の探索は今後実装予定です');break;
  default:chat(`不明なコマンド: /${cmd}。/help を参照してください`)} }
function updateSun(){const a=(timeOfDay/24000)*Math.PI*2;const elevation=Math.cos(a);sun.position.set(location.x+Math.sin(a)*80,Math.max(5,elevation*85),location.z+35);sun.intensity=Math.max(.13,elevation*2.35);const daylight=clamp((elevation+.2)*1.25,0,1);scene.background.setRGB(THREE.MathUtils.lerp(.035,.53,daylight),THREE.MathUtils.lerp(.06,.76,daylight),THREE.MathUtils.lerp(.16,.92,daylight));scene.fog.color.copy(scene.background);waterMaterial.color.set(daylight>.4?0x3b8cbb:0x1b405e);skyClouds.visible=daylight>.25}
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
    location.y=clamp(location.y,1.8,110);camera.position.set(location.x,location.y,location.z);camera.rotation.set(pitch,yaw,0,'YXZ');updateChunks();skyClouds.position.x+=dt*.35;water.material.opacity=.70+Math.sin(now*.0018)*.04;second+=dt;frames++;if(second>.5){fps=Math.round(frames/second);second=0;frames=0;$('#coords').innerHTML=`${worldName}<br>XYZ ${location.x.toFixed(1)} / ${location.y.toFixed(1)} / ${location.z.toFixed(1)}<br>FPS ${fps} · ${mode} · Seed ${seed}`}}renderer.render(scene,camera)}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});requestAnimationFrame(animate);
window.addEventListener('beforeunload',saveData);
