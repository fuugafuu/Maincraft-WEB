import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { configureRenderer, createSky, createBlockLighting, makeTerrainMaterial, makeWaterMaterial } from './renderPipeline.js';
import { loadJavaResources } from './javaAssets.js';
import { rememberJavaJar, recallJavaJar } from './javaJarStore.js';
import { DEFAULT_CONTROLS, settings, createSettingsUI } from './settings.js';
import { MobWorld } from './mobs.js';
import './style.css';

const isTouchDevice = matchMedia('(pointer: coarse)').matches;
const BLOCKS = [
  {id:'grass',name:'草ブロック',color:0x699b46,top:0x83b85a,side:0x806343},
  {id:'dirt',name:'土',color:0x806043},
  {id:'stone',name:'石',color:0x8f9291},
  {id:'coal_ore',name:'石炭鉱石',color:0x727776},
  {id:'iron_ore',name:'鉄鉱石',color:0xa89483},
  {id:'gold_ore',name:'金鉱石',color:0xab9561},
  {id:'diamond_ore',name:'ダイヤモンド鉱石',color:0x659f9b},
  {id:'sand',name:'砂',color:0xd9c68b},
  {id:'sandstone',name:'砂岩',color:0xdbc895},
  {id:'wood',name:'オークの原木',color:0x795334,top:0xac895e},
  {id:'leaves',name:'葉',color:0x3c8140,transparent:true},
  {id:'planks',name:'オークの板材',color:0xbc8e52},
  {id:'crafting_table',name:'作業台',color:0xa67843},
  {id:'furnace',name:'かまど',color:0x787878},
  {id:'chest',name:'チェスト',color:0xa67a47},
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
const FOODS = [
  {id:'apple',name:'リンゴ',color:0xd64235,nutrition:4,saturation:2.4},
  {id:'bread',name:'パン',color:0xc9984f,nutrition:5,saturation:6},
  {id:'cooked_beef',name:'ステーキ',color:0x82503a,nutrition:8,saturation:12.8},
  {id:'carrot',name:'ニンジン',color:0xe98224,nutrition:3,saturation:3.6},
];
const byId = Object.fromEntries(BLOCKS.map(b=>[b.id,b]));
const foodById=Object.fromEntries(FOODS.map(food=>[food.id,food]));
const ITEMS=[];
const itemById=Object.create(null);
const knownItem=id=>Boolean(byId[id]||foodById[id]||itemById[id]);
const itemInfo=id=>byId[id]??foodById[id]??itemById[id];
function itemStyle(id){
  const icon=javaResources?.itemIcon(id);
  if(icon)return `background-image:url('${icon}');background-size:contain;background-position:center;background-repeat:no-repeat`;
  return `background:#${(itemInfo(id)?.color??0xffffff).toString(16).padStart(6,'0')}`;
}
const AIR = 'air', SEA = 9, CHUNK = 16, RADIUS = isTouchDevice ? 1 : 2;
const CRAFTING_RECIPES=[
  {id:'planks',name:'オークの板材 ×4',pattern:['wood'],amount:4},
  {id:'crafting_table',name:'作業台',pattern:['planks','planks','planks','planks'],amount:1},
  {id:'furnace',name:'かまど',pattern:['cobble','cobble','cobble','cobble',AIR,'cobble','cobble','cobble','cobble'],amount:1},
  {id:'chest',name:'チェスト',pattern:['planks','planks','planks','planks',AIR,'planks','planks','planks','planks'],amount:1},
];
const WORLD_INDEX_KEY = 'maincraft.world.index';
const WORLD_PREFIX = 'maincraft.world.';
let worldId = null;
let javaResources = null;
const app = document.getElementById('app');
app.innerHTML = `<div id="game"></div><div id="menu"><div class="menu-card"><div class="mark"></div><h1>MAIN<span>CRAFT</span></h1><div class="subtitle">WEB · VOXEL SANDBOX</div><p>ブラウザの中に、あなただけの世界を。</p><label>ワールド名</label><input class="field" id="worldname" maxlength="40" value="新しいワールド"><div class="row"><div><label>シード値（文字も入力可）</label><input class="field" id="seed" placeholder="空欄でランダム"></div><div><label>ゲームモード</label><select class="field" id="mode"><option value="creative">クリエイティブ</option><option value="survival">サバイバル（試作）</option></select></div></div><label for="javajar">Minecraft 1.21.11 Java Client (.jar)</label><input id="javajar" class="field" type="file" accept=".jar,.zip,application/java-archive"><div id="assetstatus" class="assetstatus">Optional: load textures and models from your own installation, locally in your browser.</div><button class="primary" id="create">新しいワールドを作成</button><button class="secondary" id="resume">保存したワールドを読み込む</button><div class="tiny">自動保存 · シード生成 · WebGL 3D · オフラインデータ保存</div></div></div><div id="hud" class="hidden"><div id="crosshair"></div><div id="coords"></div><div id="tip">W A S D 移動 · マウス 視点<br>左クリック 破壊 · 中クリック 選択 · 右クリック 設置<br>Space ジャンプ · Shift 走る · F 飛行<br>E インベントリ · T / チャット<br>1〜9 選択 · Esc ポーズ</div><div id="notice"></div><div id="bottom"><div id="selected-name"></div><div id="hotbar"></div></div><div id="chat" class="hidden"><div id="chatlog"></div><input id="command" placeholder="コマンドを入力（/help）" autocomplete="off"></div><div id="mobile"><div class="mobtop"><button data-action="pause" aria-label="メニュー">☰</button><button data-action="chat" aria-label="チャットとコマンド">⌨</button><button data-action="fly" aria-label="飛行切り替え">飛行</button></div><div class="mobgroup"><span></span><button data-key="KeyW" aria-label="前進">▲</button><span></span><button data-key="KeyA" aria-label="左移動">◀</button><button data-key="KeyS" aria-label="後退">▼</button><button data-key="KeyD" aria-label="右移動">▶</button></div><div class="mobactions"><button data-key="ControlLeft" aria-label="下降">↓</button><button data-key="Space" aria-label="ジャンプ・上昇">↑</button><button data-action="break" aria-label="破壊">⛏</button><button data-action="pick" aria-label="見ているブロックを選択">▤</button><button data-action="place" aria-label="設置">▣</button><button data-action="inventory" aria-label="インベントリ">▦</button></div><div class="mobhint">画面をスワイプして視点移動</div></div></div><div id="inventory" class="hidden"><div class="inventory-panel"><button class="close" id="closeinv">×</button><h2>ブロックとアイテム</h2><p>選択するとホットバーの現在のスロットにセットします。</p><input id="itemsearch" class="field" placeholder="Search blocks / ブロック検索" autocomplete="off"><div id="itemcount" class="itemcount"></div><div class="items" id="items"></div></div></div><div id="pause" class="hidden"><div class="pause-card"><h2>ゲームメニュー</h2><button class="primary" id="continue">ゲームに戻る</button><button class="secondary" id="loadassets">Load Java 1.21.11 textures</button><button class="secondary" id="save">ワールドを保存</button><button class="secondary" id="back">タイトル画面へ</button></div></div>`;
const $=s=>document.querySelector(s);
$('#itemsearch').insertAdjacentHTML('beforebegin','<nav id="creative-tabs" class="creative-tabs hidden" aria-label="クリエイティブインベントリのカテゴリ"></nav>');
$('#items').insertAdjacentHTML('afterend','<div id="creative-hotbar" class="creative-hotbar hidden" aria-label="クリエイティブのホットバー"></div>');
// Keep the existing world creation controls, but show them only after the
// singleplayer entry, as in the Java client title flow.
const worldSetupCard=$('#menu .menu-card');
worldSetupCard.classList.add('world-setup-card','hidden');
worldSetupCard.querySelector('h1').textContent='ワールドを作成';
worldSetupCard.querySelector('.subtitle').textContent='シングルプレイ / ワールド設定';
worldSetupCard.querySelector('.mark').remove();
worldSetupCard.querySelector('p').remove();
const titleCard=document.createElement('div');
titleCard.className='mc-title-screen';
titleCard.innerHTML=`<div class="mc-logo" role="heading" aria-level="1">MAINCRAFT<span>JAVA EDITION · WEB</span></div>
  <div class="mc-title-actions"><button id="title-singleplayer" class="primary">シングルプレイ</button>
  <button id="title-options" class="secondary">設定…</button></div>
  <div class="mc-title-footer"><span>Java 1.21.11 inspired · Web Edition</span><span>ローカルワールド</span></div>`;
$('#menu').prepend(titleCard);
const worldBack=document.createElement('button');
worldBack.id='world-back';worldBack.className='secondary';worldBack.textContent='戻る';
worldSetupCard.appendChild(worldBack);
function showTitleScreen(){titleCard.classList.remove('hidden');worldSetupCard.classList.add('hidden')}
function showWorldSetup(){titleCard.classList.add('hidden');worldSetupCard.classList.remove('hidden')}
$('#title-singleplayer').onclick=showWorldSetup;
worldBack.onclick=showTitleScreen;
$('#resume').insertAdjacentHTML('afterend','<div id="worldlist" class="worldlist hidden" aria-label="保存されたワールド"></div>');
$('#worldlist').insertAdjacentHTML('afterend','<button class="secondary" id="importworld">ワールドデータを読み込む（JSON）</button><input id="importfile" type="file" accept=".json,application/json" class="hidden" aria-label="ワールドデータファイル">');
$('#save').insertAdjacentHTML('afterend','<button class="secondary" id="exportworld">ワールドを書き出す（JSON）</button>');
$('#save').insertAdjacentHTML('beforebegin','<button class="secondary" id="pause-settings">設定…</button>');
$('#resume').insertAdjacentHTML('beforebegin','<button class="secondary" id="title-settings">設定…</button>');
$('#pause').insertAdjacentHTML('afterend','<div id="settings-overlay" class="hidden" role="dialog" aria-modal="true" aria-label="設定"></div>');
const game=$('#game'), canvas=document.createElement('canvas');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
configureRenderer(renderer,isTouchDevice);renderer.setSize(innerWidth,innerHeight);game.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x8bc3e4);scene.fog=new THREE.Fog(0x8bc3e4,45,130);
const atmosphere=createSky(scene);
const camera=new THREE.PerspectiveCamera(settings.fov,innerWidth/innerHeight,.05,250);
const sun=new THREE.DirectionalLight(0xfff1ca,2.6);sun.position.set(50,80,30);sun.castShadow=true;sun.shadow.mapSize.set(isTouchDevice ? 1024 : 2048,isTouchDevice ? 1024 : 2048);sun.shadow.camera.left=-48;sun.shadow.camera.right=48;sun.shadow.camera.top=48;sun.shadow.camera.bottom=-48;sun.shadow.camera.near=1;sun.shadow.camera.far=250;sun.shadow.bias=-.0003;sun.shadow.normalBias=.015;scene.add(sun,sun.target);
const ambientLight=new THREE.HemisphereLight(0xd0ecff,0x4b5039,2);scene.add(ambientLight);
const blockLighting=createBlockLighting(scene,isTouchDevice);
const waterSurface=makeWaterMaterial();
const waterMaterial=waterSurface.material;
const water=new THREE.Mesh(new THREE.BufferGeometry(),waterMaterial);water.rotation.x=-Math.PI/2;water.position.y=SEA+.14;scene.add(water);
// Water placed above or below sea level needs its own surface geometry;
// the planar reflector can only reflect at the fixed sea level.
const elevatedWater=new THREE.Mesh(new THREE.BufferGeometry(),waterMaterial);
elevatedWater.rotation.x=-Math.PI/2;
elevatedWater.position.y=SEA+.14;
scene.add(elevatedWater);
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
const mobs=new MobWorld(scene,getBlock,isSolid);
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
let seed=1,seed64='1',seedString='',worldgenVersion=1,worldName='',mode='creative',savedEdits=new Map(),savedStates=new Map(),editedChunkHeights=new Map(),loaded=new Map(),pendingChunks=[],active=false,paused=false,inventoryOpen=false,chatOpen=false,fly=false,timeOfDay=6000,doDaylightCycle=true,spawnPosition=null;
let slots=['grass','dirt','stone','wood','planks','glass','bricks','leaves','water'],slotCounts=Array(9).fill(64),storageSlots=Array(27).fill(AIR),storageCounts=Array(27).fill(0),inventorySelection=null,craftGrid=Array(4).fill(AIR),craftingTableOpen=false,selected=0,location={x:0,y:23,z:0},vy=0,grounded=false,yaw=0,pitch=0,lastChunkX=Infinity,lastChunkZ=Infinity;
let chestContents=new Map(),openChestKey=null;
let playerHealth=20,playerDamageCooldown=0,fallDistance=0;
const DIFFICULTIES=['peaceful','easy','normal','hard'];
let difficulty='normal';
let experienceTotal=0;
function xpAtLevel(level){
  if(level<=16)return level*level+6*level;
  if(level<=31)return Math.floor(2.5*level*level-40.5*level+360);
  return Math.floor(4.5*level*level-162.5*level+2220);
}
function xpLevel(total){
  let low=0,high=50000;
  while(low<high){const middle=Math.ceil((low+high)/2);if(xpAtLevel(middle)<=total)low=middle;else high=middle-1}
  return low;
}
const xpHud=document.createElement('div');
xpHud.id='experience';
$('#bottom').prepend(xpHud);
function renderExperience(){
  const level=xpLevel(experienceTotal),start=xpAtLevel(level),required=xpAtLevel(level+1)-start;
  xpHud.classList.toggle('hidden',mode!=='survival');
  xpHud.replaceChildren();
  const label=document.createElement('span');label.textContent=String(level);
  const track=document.createElement('div');track.className='experience-track';
  const fill=document.createElement('div');fill.className='experience-fill';fill.style.width=`${(experienceTotal-start)/required*100}%`;
  track.appendChild(fill);xpHud.append(label,track);
}
let foodLevel=20,foodSaturation=5,foodExhaustion=0,foodTimer=0;
const SUPPORTED_EFFECTS=new Set(['speed','slowness','jump_boost','regeneration','resistance','weakness']);
let playerEffects={};
let regenerationTimer=0;
const effectHud=document.createElement('div');
effectHud.id='effects';
$('#bottom').prepend(effectHud);
function effectLevel(id){return playerEffects[id]?.amplifier??-1}
function renderEffects(){
  effectHud.replaceChildren();
  for(const [id,value] of Object.entries(playerEffects)){
    const line=document.createElement('div');
    line.textContent=`${id.replaceAll('_',' ')} ${value.amplifier+1} · ${Math.ceil(value.seconds)}s`;
    effectHud.appendChild(line);
  }
}
function updateEffects(dt){
  let changed=false;
  for(const [id,value] of Object.entries(playerEffects)){
    value.seconds-=dt;
    if(value.seconds<=0){delete playerEffects[id];changed=true}
  }
  if(effectLevel('regeneration')>=0&&mode==='survival'&&playerHealth<20){
    regenerationTimer+=dt;
    const interval=Math.max(.05,2.5/2**effectLevel('regeneration'));
    if(regenerationTimer>=interval){
      regenerationTimer%=interval;
      playerHealth=Math.min(20,playerHealth+1);
      updateHealthHud();changed=true;
    }
  }else regenerationTimer=0;
  if(changed)scheduleSave();
  renderEffects();
}
const healthHud=document.createElement('div');
healthHud.id='health';
$('#bottom').prepend(healthHud);
const hungerHud=document.createElement('div');
hungerHud.id='hunger';
healthHud.after(hungerHud);
function updateHealthHud(){
  renderExperience();
  healthHud.classList.toggle('hidden',mode!=='survival');
  healthHud.textContent=`${'♥'.repeat(Math.ceil(playerHealth/2))}${'♡'.repeat(10-Math.ceil(playerHealth/2))} ${playerHealth}/20`;
  hungerHud.classList.toggle('hidden',mode!=='survival');
  hungerHud.textContent=`${'◆'.repeat(Math.ceil(foodLevel/2))}${'◇'.repeat(10-Math.ceil(foodLevel/2))} ${foodLevel}/20`;
}
function eatSelectedFood(){
  const food=foodById[slots[selected]];
  if(!food||mode!=='survival'||foodLevel>=20||slotCounts[selected]<=0)return false;
  foodLevel=Math.min(20,foodLevel+food.nutrition);
  foodSaturation=Math.min(foodLevel,foodSaturation+food.saturation);
  slotCounts[selected]--;
  if(slotCounts[selected]===0)slots[selected]='air';
  updateHealthHud();renderHotbar();scheduleSave();
  notice(`${food.name} を食べました`);
  return true;
}
function updateHunger(dt,isMoving,isSprinting){
  if(mode!=='survival')return;
  if(difficulty==='peaceful'){
    if(foodLevel!==20||foodSaturation!==5||foodExhaustion!==0){
      foodLevel=20;foodSaturation=5;foodExhaustion=0;updateHealthHud();scheduleSave();
    }
    foodTimer+=dt;
    if(foodTimer>=1&&playerHealth<20){foodTimer=0;playerHealth=Math.min(20,playerHealth+1);updateHealthHud();scheduleSave()}
    return;
  }
  if(isMoving)foodExhaustion+=dt*(isSprinting?1:.054);
  if(foodExhaustion>=4){
    const lost=Math.floor(foodExhaustion/4);
    foodExhaustion%=4;
    for(let i=0;i<lost;i++){
      if(foodSaturation>0)foodSaturation=Math.max(0,foodSaturation-1);
      else foodLevel=Math.max(0,foodLevel-1);
    }
    updateHealthHud();scheduleSave();
  }
  foodTimer+=dt;
  if(foodTimer<4)return;
  foodTimer=0;
  if(foodLevel>=18&&playerHealth<20){
    playerHealth=Math.min(20,playerHealth+1);
    foodExhaustion+=6;
    updateHealthHud();scheduleSave();
  }else if(foodLevel===0&&playerHealth>(difficulty==='easy'?10:difficulty==='normal'?1:0)){
    damagePlayer(1);
  }
}
function respawn(){
  location={...spawnPosition};
  vy=0;
  grounded=false;
  fallDistance=0;
  playerHealth=20;
  playerEffects={};regenerationTimer=0;renderEffects();
  foodLevel=20;foodSaturation=5;foodExhaustion=0;foodTimer=0;
  playerDamageCooldown=1.5;
  updateHealthHud();
  updateChunks();
  scheduleSave();
  notice('死亡しました。スポーン地点で復活しました');
}
function damagePlayer(amount){
  if(mode!=='survival'||playerDamageCooldown>0)return;
  if(effectLevel('resistance')>=0)amount*=Math.max(0,1-.2*(effectLevel('resistance')+1));
  playerHealth=Math.max(0,playerHealth-amount);
  playerDamageCooldown=.65;
  updateHealthHud();
  if(playerHealth===0)respawn();
  else scheduleSave();
}
function applyPlayerDamage(amount,ignoreCooldown=false){
  if(!ignoreCooldown)return damagePlayer(amount);
  const previousCooldown=playerDamageCooldown;
  playerDamageCooldown=0;
  damagePlayer(amount);
  if(mode==='creative')playerDamageCooldown=previousCooldown;
}
const keys=new Set();const raycaster=new THREE.Raycaster();raycaster.far=7;
const clamp=THREE.MathUtils.clamp;const key=(x,y,z)=>`${x},${y},${z}`;
function hash(x,z,s=seed){let n=Math.imul(x,374761393)+Math.imul(z,668265263)+Math.imul(s,1442695041);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295}
// New worlds retain all 64 seed bits when initializing the terrain noise.
// Preserve the original 32-bit seed for worlds created before version 6.
function terrainSeed(longSeed,version){
  if(version<6)return Number(BigInt.asIntN(32,longSeed));
  let value=BigInt.asUintN(64,longSeed);
  value=BigInt.asUintN(64,(value^(value>>30n))*0xbf58476d1ce4e5b9n);
  value=BigInt.asUintN(64,(value^(value>>27n))*0x94d049bb133111ebn);
  value^=value>>31n;
  return Number(BigInt.asIntN(32,value^(value>>32n)));
}
function noise(x,z,scale){const a=Math.floor(x/scale),b=Math.floor(z/scale),u=x/scale-a,v=z/scale-b;const t=u*u*(3-2*u),w=v*v*(3-2*v);const ab=(n,m)=>hash(n,m);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(ab(a,b),ab(a+1,b),t),THREE.MathUtils.lerp(ab(a,b+1),ab(a+1,b+1),t),w)}
function hash3(x,y,z){
  let n=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,1442695041)^Math.imul(seed,1274126177);
  n=Math.imul(n^(n>>>13),1274126177);
  return ((n^(n>>>16))>>>0)/4294967295;
}
function noise3(x,y,z,scale){
  const a=Math.floor(x/scale),b=Math.floor(y/scale),c=Math.floor(z/scale);
  const smooth=t=>t*t*(3-2*t),u=smooth(x/scale-a),v=smooth(y/scale-b),w=smooth(z/scale-c);
  const layer=k=>THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(hash3(a,b,k),hash3(a+1,b,k),u),
    THREE.MathUtils.lerp(hash3(a,b+1,k),hash3(a+1,b+1,k),u),v);
  return THREE.MathUtils.lerp(layer(c),layer(c+1),w);
}
function isCave(x,y,z,h){
  if(worldgenVersion<2||y<3||y>h-5)return false;
  return noise3(x,y*1.3,z,17)>.67&&noise3(x+113,y*1.3-47,z-79,9)>.43;
}
function generatedOre(x,y,z,h){
  if(worldgenVersion<3)return 'stone';
  // Distinct seeded 3D fields create continuous veins in the surrounding stone.
  if(y<13&&noise3(x+419,y*1.5,z-271,5)>.87)return 'diamond_ore';
  if(y<18&&noise3(x-297,y*1.2,z+83,6)>.84)return 'gold_ore';
  if(y<25&&noise3(x+151,y,z+367,7)>.81)return 'iron_ore';
  if(y<h-3&&noise3(x-71,y,z-193,8)>.79)return 'coal_ore';
  return 'stone';
}
const heightCache=new Map(),biomeCache=new Map(),treeCache=new Map(),treeColumnCache=new Map();
const structureCache=new Map();
function biome(x,z){
  if(worldgenVersion<4)return 'plains';
  const position=`${x},${z}`;
  if(biomeCache.has(position))return biomeCache.get(position);
  const temperature=noise(x+1200,z-1800,190);
  const humidity=noise(x-2400,z+3600,170);
  const ruggedness=noise(x+700,z+900,220);
  let result='plains';
  if(ruggedness>.7)result='mountains';
  else if(temperature<.35)result='snowy_plains';
  else if(temperature>.56&&humidity<.39)result='desert';
  else if(humidity>.57)result='forest';
  biomeCache.set(position,result);
  return result;
}
function locateBiome(target,x,z){
  const originX=Math.floor(x/16)*16,originZ=Math.floor(z/16)*16;
  for(let radius=0;radius<=64;radius++){
    let nearest=null,nearestDistance=Infinity;
    for(let dx=-radius;dx<=radius;dx++)for(const dz of radius===0?[0]:[-radius,radius]){
      const px=originX+dx*16,pz=originZ+dz*16;
      if(biome(px,pz)!==target)continue;
      const distance=(px-x)**2+(pz-z)**2;
      if(distance<nearestDistance){nearest={x:px,z:pz};nearestDistance=distance}
    }
    for(let dz=-radius+1;dz<radius;dz++)for(const dx of [-radius,radius]){
      const px=originX+dx*16,pz=originZ+dz*16;
      if(biome(px,pz)!==target)continue;
      const distance=(px-x)**2+(pz-z)**2;
      if(distance<nearestDistance){nearest={x:px,z:pz};nearestDistance=distance}
    }
    if(nearest)return nearest;
  }
  return null;
}
function height(x,z){
  const position=`${x},${z}`;
  if(heightCache.has(position))return heightCache.get(position);
  let elevation=5+noise(x,z,86)*13+noise(x+400,z-300,31)*9+noise(x-150,z+80,11)*3;
  if(worldgenVersion>=4){
    const continental=noise(x-1300,z+1500,250);
    const ruggedness=noise(x+700,z+900,220);
    elevation+=(continental-.5)*13+Math.max(0,ruggedness-.57)*36;
  }
  const h=Math.max(2,Math.floor(elevation));
  heightCache.set(position,h);
  return h;
}
function surface(x,z){let h=height(x,z);if(worldgenVersion>=4){const region=biome(x,z);if(region==='desert'||h<SEA+2)return 'sand';if(region==='snowy_plains'||region==='mountains'&&h>27)return 'snow';return 'grass'}return h<SEA+2?'sand':h>24?'snow':'grass'}
function treeAt(x,z){
  const position=`${x},${z}`;
  if(treeCache.has(position))return treeCache.get(position);
  const h=height(x,z);
  const region=biome(x,z);
  const threshold=worldgenVersion>=4&&region==='forest'?.962:.989;
  const hasTree=h>SEA+2 && (worldgenVersion>=4?h<45&&region!=='desert'&&region!=='mountains'&&region!=='snowy_plains':h<24) && hash(x,z,seed+17)>threshold && hash(x+2,z+1,seed+21)>.35;
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
function desertWellInCell(cellX,cellZ){
  if(worldgenVersion<5)return null;
  const index=`${cellX},${cellZ}`;
  if(structureCache.has(index))return structureCache.get(index);
  const x=cellX*96+24+Math.floor(hash(cellX,cellZ,seed+600)*48);
  const z=cellZ*96+24+Math.floor(hash(cellX,cellZ,seed+601)*48);
  const y=height(x,z);
  let valid=hash(cellX,cellZ,seed+602)>.35&&biome(x,z)==='desert'&&y>SEA+2;
  if(valid){
    for(let dx=-2;dx<=2&&valid;dx++)for(let dz=-2;dz<=2;dz++){
      if(biome(x+dx,z+dz)!=='desert'||Math.abs(height(x+dx,z+dz)-y)>1){valid=false;break}
    }
  }
  const result=valid?{x,y,z}:null;
  structureCache.set(index,result);
  return result;
}
function desertWellBlock(x,y,z){
  if(worldgenVersion<5)return null;
  const well=desertWellInCell(Math.floor(x/96),Math.floor(z/96));
  if(!well)return null;
  const dx=x-well.x,dz=z-well.z,dy=y-well.y;
  if(Math.abs(dx)>2||Math.abs(dz)>2||dy<0||dy>4)return null;
  if(dy===0)return 'sandstone';
  if(dy===1){
    if(Math.abs(dx)+Math.abs(dz)<=1)return 'water';
    if(Math.abs(dx)===2||Math.abs(dz)===2)return 'sandstone';
    return AIR;
  }
  if(dy<=3)return Math.abs(dx)===2&&Math.abs(dz)===2?'sandstone':AIR;
  return 'sandstone';
}
function locateDesertWell(x,z){
  const cx=Math.floor(x/96),cz=Math.floor(z/96);
  let closest=null,bestDistance=Infinity;
  for(let radius=0;radius<=12;radius++){
    for(let a=-radius;a<=radius;a++)for(let b=-radius;b<=radius;b++){
      if(Math.max(Math.abs(a),Math.abs(b))!==radius)continue;
      const well=desertWellInCell(cx+a,cz+b);
      if(!well)continue;
      const distance=(well.x-x)**2+(well.z-z)**2;
      if(distance<bestDistance){closest=well;bestDistance=distance}
    }
    if(closest&&Math.sqrt(bestDistance)<radius*96-140)break;
  }
  return closest;
}
function generatedBlock(x,y,z){
  if(y<0)return AIR;
  if(y===0)return 'bedrock';
  const h=height(x,z);
  const structure=desertWellBlock(x,y,z);
  if(structure!==null)return structure;
  if(y>h+9)return AIR;
  if(y<=h){
    if(isCave(x,y,z,h))return AIR;
    if(y===h)return surface(x,z);
    if(y>h-4)return surface(x,z)==='sand'?'sand':'dirt';
    return generatedOre(x,y,z,h);
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
function playerInWater(){
  const feetY=location.y-PLAYER_EYE;
  return getBlock(location.x,feetY+.25,location.z)==='water'||
    getBlock(location.x,feetY+1,location.z)==='water';
}
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
function setBlock(x,y,z,id,properties=null){
  if(y<1||y>100)return;
  writeBlock(x,y,z,id);
  if(properties&&Object.keys(properties).length)savedStates.set(key(x,y,z),properties);
  updateBlockRegion([[x,y,z]]);
}
function placementProperties(id,normal,hitPoint){
  if(/_(log|wood|stem|hyphae)$/.test(id)||id==='wood'){
    const axis=Math.abs(normal.x)>.5?'x':Math.abs(normal.z)>.5?'z':'y';
    return {axis};
  }
  if(/_stairs$/.test(id)){
    // Camera yaw 0 looks north (-Z); stairs face back toward their placer.
    const directions=['south','east','north','west'];
    const facing=directions[((Math.round(yaw/(Math.PI/2))%4)+4)%4];
    const half=normal.y<-.5||(Math.abs(normal.y)<.5&&hitPoint.y-Math.floor(hitPoint.y)>.5)?'top':'bottom';
    return {facing,half,shape:'straight'};
  }
  if(/_slab$/.test(id)){
    return {type:normal.y<-.5||(Math.abs(normal.y)<.5&&hitPoint.y-Math.floor(hitPoint.y)>.5)?'top':'bottom'};
  }
  return null;
}
// Each visible block face is added directly to a chunk mesh, keeping draw calls low.
const faces=[{d:[1,0,0],v:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]],shade:.8},{d:[-1,0,0],v:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]],shade:.8},{d:[0,1,0],v:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]],shade:1.13},{d:[0,-1,0],v:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],shade:.54},{d:[0,0,1],v:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]],shade:.9},{d:[0,0,-1],v:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]],shade:.73}];
// Minecraft-style smooth ambient occlusion: count the two edge neighbors and
// the diagonal neighbor immediately outside each face corner.
function blockCornerLight(x,y,z,normal,vertex){
  const axis=normal.findIndex(value=>value!==0);
  const tangents=[0,1,2].filter(i=>i!==axis);
  const edgeA=[...normal],edgeB=[...normal],corner=[...normal];
  for(const [index,tangent] of tangents.entries()){
    const side=vertex[tangent]===0?-1:1;
    (index===0?edgeA:edgeB)[tangent]=side;
    corner[tangent]=side;
  }
  const opaque=offset=>{
    const id=getBlock(x+offset[0],y+offset[1],z+offset[2]);
    return id!==AIR&&id!=='water'&&!byId[id]?.transparent&&isSolid(id);
  };
  const a=opaque(edgeA),b=opaque(edgeB),diagonal=opaque(corner);
  const occlusion=a&&b?3:Number(a)+Number(b)+Number(diagonal);
  return 1-occlusion*.17;
}
const materials={};for(const b of BLOCKS)materials[b.id]=makeTerrainMaterial({vertexColors:true,side:b.transparent?THREE.DoubleSide:THREE.FrontSide,transparent:!!b.transparent,opacity:b.transparent?.72:1,depthWrite:!b.transparent});
function rebuild(cx,cz,deferWater=false){
  const chunkKey=`${cx},${cz}`;
  const prior=loaded.get(chunkKey);
  if(prior){chunkGroup.remove(prior);prior.traverse(o=>o.geometry?.dispose())}
  const group=new THREE.Group();
  const blockIds=new Set();
  const buffers=new Map();
  const textured=[{pos:[],uv:[],color:[]},{pos:[],uv:[],color:[]}];
  for(let x=cx*CHUNK;x<(cx+1)*CHUNK;x++)
  for(let z=cz*CHUNK;z<(cz+1)*CHUNK;z++)
  for(let y=0;y<=Math.max(height(x,z)+9,32,editedChunkHeights.get(chunkKey)??0);y++){
    const id=getBlock(x,y,z);
    if(id===AIR||(id==='water'&&y<=SEA))continue;
    blockIds.add(id);
    const b=byId[id];
    if(!b)continue;
    const properties=savedStates.get(key(x,y,z))||{};
    const native=javaResources?.getModel(id,properties);
    if(native?.elements.length){
      const output=textured[Number(native.transparent)];
      javaResources.addBlock(output,native,x,y,z,(dx,dy,dz)=>{
        const neighbor=getBlock(x+dx,y+dy,z+dz);
        return (byId[neighbor]?.transparent)?AIR:neighbor;
      },id,(dx,dy,dz)=>getBlock(x+dx,y+dy,z+dz),properties);
      continue;
    }
    if(!buffers.has(id))buffers.set(id,{pos:[],color:[],normal:[]});
    const out=buffers.get(id);
    for(let fi=0;fi<6;fi++){
      const f=faces[fi];
      const adjacent=getBlock(x+f.d[0],y+f.d[1],z+f.d[2]);
      // Different translucent blocks must keep their shared boundary visible.
      // Hide internal faces only between identical translucent blocks or
      // where the neighbour is opaque.
      if(adjacent!==AIR && !(byId[adjacent]?.transparent&&(!b.transparent||adjacent!==id)))continue;
      const rgb=new THREE.Color(fi===2?(b.top??b.color):(fi===0||fi===1||fi===4||fi===5?(b.side??b.color):b.color));
      rgb.multiplyScalar(f.shade*(.91+hash(x+fi,z+y)*.15));
      const cornerLight=b.transparent?null:f.v.map(v=>blockCornerLight(x,y,z,f.d,v));
      for(const n of [0,1,2,0,2,3]){
        const v=f.v[n];
        out.pos.push(x+v[0],y+v[1],z+v[2]);
        out.normal.push(...f.d);
        const ao=cornerLight?.[n]??1;
        out.color.push(rgb.r*ao,rgb.g*ao,rgb.b*ao);
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
  group.userData.blockIds=blockIds;
  chunkGroup.add(group);
  if(!deferWater)updateWaterSurface();
}
function updateWaterSurface(){
  // A surface tile exists only where a water block touches the open air.
  const positions=[],uvs=[],otherPositions=[],otherUvs=[];
  const addSurface=(x,y,z)=>{
    const onSea=y===SEA;
    const dest=onSea?positions:otherPositions,uv=onSea?uvs:otherUvs;
    // Placed water is also rendered as a translucent block; draw its surface
    // just above the top face so both materials do not fight for the same depth.
    const offset=onSea?0:y-SEA+.88;
    // Local Z becomes world Y after rotating the mesh around X.
    dest.push(x,-z,offset,x+1,-z-1,offset,x+1,-z,offset,
      x,-z,offset,x,-z-1,offset,x+1,-z-1,offset);
    uv.push(0,0,1,1,1,0,0,0,0,1,1,1);
  };
  for(const chunk of loaded.keys()){
    const [cx,cz]=chunk.split(',').map(Number);
    for(let x=cx*CHUNK;x<(cx+1)*CHUNK;x++)for(let z=cz*CHUNK;z<(cz+1)*CHUNK;z++){
      if(getBlock(x,SEA,z)==='water'&&getBlock(x,SEA+1,z)===AIR)addSurface(x,SEA,z);
    }
  }
  // Most generated water is covered by the fixed sea surface. Edits can open
  // lower water layers or place water above sea level, so inspect edited columns.
  const editedColumns=new Set();
  for(const [position,id] of savedEdits){
    const [x,y,z]=position.split(',').map(Number);
    if(!loaded.has(`${Math.floor(x/CHUNK)},${Math.floor(z/CHUNK)}`))continue;
    editedColumns.add(`${x},${z}`);
    if(id==='water'&&y>SEA&&getBlock(x,y+1,z)===AIR)addSurface(x,y,z);
  }
  for(const column of editedColumns){
    const [x,z]=column.split(',').map(Number);
    // The ordinary sea tile has already been emitted above.
    for(let y=SEA-1;y>=1;y--){
      if(getBlock(x,y,z)==='water'&&getBlock(x,y+1,z)===AIR){
        addSurface(x,y,z);
      }
    }
  }
  const makeGeometry=(vertices,texcoords)=>{
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(texcoords,2));
    geometry.computeBoundingSphere();
    return geometry;
  };
  const geometry=makeGeometry(positions,uvs);
  const old=water.geometry;
  water.geometry=geometry;
  if(reflectedWater)reflectedWater.geometry=geometry;
  old.dispose();
  const oldElevated=elevatedWater.geometry;
  elevatedWater.geometry=makeGeometry(otherPositions,otherUvs);
  oldElevated.dispose();
}
function updateChunks(){
  const cx=Math.floor(location.x/CHUNK),cz=Math.floor(location.z/CHUNK);
  if(cx===lastChunkX&&cz===lastChunkZ)return;
  lastChunkX=cx;lastChunkZ=cz;
  pendingChunks=[];
  for(let a=cx-settings.renderDistance;a<=cx+settings.renderDistance;a++)for(let b=cz-settings.renderDistance;b<=cz+settings.renderDistance;b++){
    if(!loaded.has(`${a},${b}`))pendingChunks.push([a,b]);
  }
  pendingChunks.sort((a,b)=>
    (a[0]-cx)**2+(a[1]-cz)**2-(b[0]-cx)**2-(b[1]-cz)**2);
  let removedChunks=false;
  for(const [k,g] of loaded){
    const [x,z]=k.split(',').map(Number);
    if(Math.abs(x-cx)>settings.renderDistance||Math.abs(z-cz)>settings.renderDistance){
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
  const obj={version:2,worldgenVersion,id:worldId,worldName,seedString,seed,seed64,mode,difficulty,playerHealth,playerEffects,experienceTotal,foodLevel,foodSaturation,foodExhaustion,edits:[...savedEdits],blockStates:[...savedStates],slots,slotCounts,selected,storageSlots,storageCounts,craftGrid,craftingTableOpen,chestContents:[...chestContents],position:location,rotation:{yaw,pitch},spawnPosition,timeOfDay,doDaylightCycle,weather,entities:mobs.save()};
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
  if(data.difficulty!==undefined&&!DIFFICULTIES.includes(data.difficulty))return false;
  if(data.seed64!==undefined&&(typeof data.seed64!=='string'||!isSignedLong(data.seed64)))return false;
  if(data.playerHealth!==undefined&&(!Number.isInteger(data.playerHealth)||data.playerHealth<1||data.playerHealth>20))return false;
  if(data.experienceTotal!==undefined&&(!Number.isSafeInteger(data.experienceTotal)||data.experienceTotal<0||data.experienceTotal>1000000000))return false;
  if(data.playerEffects!==undefined&&(!data.playerEffects||typeof data.playerEffects!=='object'||Array.isArray(data.playerEffects)||Object.keys(data.playerEffects).length>SUPPORTED_EFFECTS.size||Object.entries(data.playerEffects).some(([id,value])=>!SUPPORTED_EFFECTS.has(id)||!value||!Number.isFinite(value.seconds)||value.seconds<=0||value.seconds>1000000||!Number.isInteger(value.amplifier)||value.amplifier<0||value.amplifier>4)))return false;
  if(data.slots!==undefined&&(!Array.isArray(data.slots)||data.slots.length!==9||!data.slots.every(id=>typeof id==='string'&&id.length<=100)))return false;
  if(data.foodLevel!==undefined&&(!Number.isInteger(data.foodLevel)||data.foodLevel<0||data.foodLevel>20))return false;
  if(data.foodSaturation!==undefined&&(!Number.isFinite(data.foodSaturation)||data.foodSaturation<0||data.foodSaturation>20))return false;
  if(data.foodExhaustion!==undefined&&(!Number.isFinite(data.foodExhaustion)||data.foodExhaustion<0||data.foodExhaustion>100))return false;
  if(data.slotCounts!==undefined&&(!Array.isArray(data.slotCounts)||data.slotCounts.length!==9||!data.slotCounts.every(count=>Number.isInteger(count)&&count>=0&&count<=64)))return false;
  if(data.selected!==undefined&&(!Number.isInteger(data.selected)||data.selected<0||data.selected>8))return false;
  if(data.storageSlots!==undefined&&(!Array.isArray(data.storageSlots)||data.storageSlots.length!==27||!data.storageSlots.every(id=>typeof id==='string'&&id.length<=100)))return false;
  if(data.storageCounts!==undefined&&(!Array.isArray(data.storageCounts)||data.storageCounts.length!==27||!data.storageCounts.every(count=>Number.isInteger(count)&&count>=0&&count<=64)))return false;
  if(data.craftGrid!==undefined&&(!Array.isArray(data.craftGrid)||![4,9].includes(data.craftGrid.length)||!data.craftGrid.every(id=>typeof id==='string'&&id.length<=100)))return false;
  if(data.craftingTableOpen!==undefined&&typeof data.craftingTableOpen!=='boolean')return false;
  if(data.chestContents!==undefined){
    if(!Array.isArray(data.chestContents)||data.chestContents.length>200000)return false;
    const seen=new Set();
    for(const entry of data.chestContents){
      if(!Array.isArray(entry)||entry.length!==2)return false;
      const [position,chest]=entry;
      if(typeof position!=='string'||!/^[-]?\d+,[-]?\d+,[-]?\d+$/.test(position)||seen.has(position))return false;
      seen.add(position);
      if(!chest||typeof chest!=='object'||!Array.isArray(chest.items)||chest.items.length!==27||
         !chest.items.every(id=>typeof id==='string'&&id.length<=100)||
         !Array.isArray(chest.counts)||chest.counts.length!==27||
         !chest.counts.every(count=>Number.isInteger(count)&&count>=0&&count<=64))return false;
    }
  }
  if(data.worldgenVersion!==undefined&&![1,2,3,4,5,6].includes(data.worldgenVersion))return false;
  if(!Array.isArray(data.edits)||data.edits.length>200000)return false;
  if(data.blockStates!==undefined&&(!Array.isArray(data.blockStates)||data.blockStates.length>200000||
    !data.blockStates.every(entry=>Array.isArray(entry)&&entry.length===2&&
      /^-?\d+,-?\d+,-?\d+$/.test(entry[0])&&
      entry[1]&&typeof entry[1]==='object'&&!Array.isArray(entry[1])&&
      Object.entries(entry[1]).length<=16&&Object.entries(entry[1]).every(([k,v])=>/^[a-z_]{1,32}$/.test(k)&&/^[a-z0-9_]{1,32}$/.test(v)))))return false;
  if(data.entities!==undefined&&(!Array.isArray(data.entities)||data.entities.length>128||!data.entities.every(entity=>entity&&typeof entity==='object'&&MobWorld.supports(entity.type)&&['x','y','z'].every(axis=>Number.isFinite(entity[axis])))))return false;
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
function lockPointer(){
  if(isTouchDevice||document.pointerLockElement===renderer.domElement||!active||paused)return;
  // Browsers may reject rapid re-lock attempts when chat commands are entered.
  const request=renderer.domElement.requestPointerLock?.();
  request?.catch?.(()=>{});
}
function newWorld(data){worldId=data.id??crypto.randomUUID();worldName=data.worldName;seedString=data.seedString;seed64=data.seed64??String(data.seed);worldgenVersion=data.worldgenVersion??1;seed=terrainSeed(BigInt(seed64),worldgenVersion);heightCache.clear();biomeCache.clear();structureCache.clear();treeCache.clear();treeColumnCache.clear();mode=data.mode;difficulty=DIFFICULTIES.includes(data.difficulty)?data.difficulty:'normal';playerHealth=Number.isInteger(data.playerHealth)?clamp(data.playerHealth,1,20):20;playerDamageCooldown=0;fallDistance=0;experienceTotal=Number.isSafeInteger(data.experienceTotal)?Math.max(0,Math.min(1000000000,data.experienceTotal)):0;playerEffects=Object.fromEntries(Object.entries(data.playerEffects??{}).filter(([id,value])=>SUPPORTED_EFFECTS.has(id)&&value.seconds>0));regenerationTimer=0;renderEffects();foodLevel=Number.isInteger(data.foodLevel)?clamp(data.foodLevel,0,20):20;foodSaturation=Number.isFinite(data.foodSaturation)?clamp(data.foodSaturation,0,foodLevel):Math.min(5,foodLevel);foodExhaustion=Number.isFinite(data.foodExhaustion)?clamp(data.foodExhaustion,0,4):0;foodTimer=0;updateHealthHud();weather=['clear','rain','thunder'].includes(data.weather)?data.weather:'clear';slots=data.slots??['grass','dirt','stone','wood','planks','glass','bricks','leaves','water'];slotCounts=Array.isArray(data.slotCounts)?[...data.slotCounts]:Array(9).fill(64);selected=Number.isInteger(data.selected)&&data.selected>=0&&data.selected<9?data.selected:0;storageSlots=Array.isArray(data.storageSlots)?[...data.storageSlots]:Array(27).fill(AIR);storageCounts=Array.isArray(data.storageCounts)?[...data.storageCounts]:Array(27).fill(0);inventorySelection=null;craftingTableOpen=mode==="survival"&&data.craftingTableOpen===true&&Array.isArray(data.craftGrid)&&data.craftGrid.length===9;craftGrid=Array.isArray(data.craftGrid)&&data.craftGrid.length===(craftingTableOpen?9:4)?data.craftGrid.map(id=>typeof id==="string"?id:AIR):Array(4).fill(AIR);inventoryOpen=false;openChestKey=null;chestContents=new Map(Array.isArray(data.chestContents)?data.chestContents:[]);$("#inventory").classList.add("hidden");savedEdits=new Map(data.edits??[]);savedStates=new Map(data.blockStates??[]);rebuildEditedChunkHeights();for(const id of savedEdits.values())if(id!==AIR)registerBlock(id);location=data.position??{x:0,y:height(0,0)+3,z:0};spawnPosition=data.spawnPosition??{x:0,y:height(0,0)+3,z:0};timeOfDay=data.timeOfDay??6000;doDaylightCycle=data.doDaylightCycle!==false;mobs.restore(data.entities);if(difficulty==='peaceful')for(const entity of [...mobs.entities])if(['zombie','creeper'].includes(entity.type))mobs.remove(entity);vy=0;fly=mode==='creative';yaw=data.rotation?.yaw??0;pitch=data.rotation?.pitch??0;camera.rotation.order='YXZ';loaded.forEach(g=>{chunkGroup.remove(g);g.traverse(o=>o.geometry?.dispose())});loaded.clear();pendingChunks=[];lastChunkX=Infinity;lastChunkZ=Infinity;active=true;paused=false;$('#menu').classList.add('hidden');$('#worldlist').classList.add('hidden');$('#hud').classList.remove('hidden');$('#pause').classList.add('hidden');$('#coords').innerHTML=`${worldName}<br>XYZ ${location.x.toFixed(1)} / ${location.y.toFixed(1)} / ${location.z.toFixed(1)}<br>地形を生成中… · Seed ${seed64}`;updateChunks();renderHotbar();updateSun();notice(`ワールド「${worldName}」 · シード ${seed64}`);saveData();if(data.migrateLegacy&&localStorage.getItem(WORLD_PREFIX+worldId))localStorage.removeItem('maincraft.world');lockPointer()}
$('#create').onclick=()=>{const seedString=$('#seed').value.trim();const longSeed=stringSeed(seedString);const seed=Number(BigInt.asIntN(32,longSeed));const survival=$('#mode').value==='survival';newWorld({worldName:$('#worldname').value.trim()||'新しいワールド',seedString:seedString||String(longSeed),seed64:String(longSeed),worldgenVersion:6,seed:terrainSeed(longSeed,6),mode:$('#mode').value,edits:[],slots:survival?Array(9).fill(AIR):['grass','dirt','stone','wood','planks','glass','bricks','leaves','water'],slotCounts:Array(9).fill(survival?0:64)})};
$('#resume').onclick=showWorlds;
function registerBlock(id, name=id.replaceAll('_',' ')){
  if(byId[id])return;
  let value=0;
  for(const char of id)value=(Math.imul(value,31)+char.charCodeAt(0))|0;
  const tint=new THREE.Color().setHSL((value>>>0)%360/360,.22,.45);
  const block={id,name,color:tint.getHex(),transparent:/glass|ice|leaves|pane|grate|bars/.test(id)};
  BLOCKS.push(block);
  byId[id]=block;
  materials[id]=materials.stone;
}
function registerItem(id, name=id.replaceAll('_',' ')){
  if(knownItem(id))return;
  const item={id,name,color:0xc4b89e};
  ITEMS.push(item);
  itemById[id]=item;
}
async function ensureJavaBlock(id,properties={}){
  if(!javaResources)return;
  try{
    const previous=javaResources.getModel(id,properties);
    const model=await javaResources.ensure(id,properties);
    if(model&&byId[id])byId[id].transparent=model.transparent;
    if(active&&model&&model!==previous){
      let changed=false;
      for(const [chunk,group] of [...loaded.entries()]){
        if(!group.userData.blockIds?.has(id))continue;
        const [cx,cz]=chunk.split(',').map(Number);
        rebuild(cx,cz,true);
        changed=true;
      }
      if(changed)updateWaterSurface();
    }
  }catch(error){notice(`Model import: ${error.message}`)}
}
let jarImportGeneration=0;
async function importJavaJar(file,persist=true){
  if(!file)return;
  const generation=++jarImportGeneration;
  const status=$('#assetstatus');
  status.textContent='Reading Java 1.21.11 resources…';
  try{
    const imported=await loadJavaResources(file,message=>status.textContent=message);
    if(generation!==jarImportGeneration){imported.dispose();return}
    for(const id of imported.blockNames)registerBlock(id, imported.displayName(id,'block'));
    for(const id of imported.itemNames)registerItem(id, imported.displayName(id));
    const old=javaResources;
    javaResources=imported;
    const guiSprites={
      '--mc-button':'sprites/widget/button',
      '--mc-button-hover':'sprites/widget/button_highlighted',
      '--mc-hotbar':'sprites/hud/hotbar',
      '--mc-hotbar-selected':'sprites/hud/hotbar_selection',
      '--mc-crosshair':'sprites/hud/crosshair',
      '--mc-inventory':'container/inventory',
      '--mc-creative':'container/creative_inventory/tab_inventory',
      '--mc-title':'title/background/panorama_0',
    };
    for(const [property,path] of Object.entries(guiSprites)){
      const url=imported.guiIcon(path);
      if(url)document.documentElement.style.setProperty(property,`url("${url}")`);
      else document.documentElement.style.removeProperty(property);
    }
    for(const id of new Set([...slots,'grass','dirt','stone','sand','wood','leaves','planks','glass','bricks','cobble','snow','gold','diamond','obsidian','bedrock','sandstone','coal_ore','iron_ore','gold_ore','diamond_ore'])){
      await javaResources.ensure(id);
    }
    for(const id of new Set([...savedEdits.values()])){
      if(id!=='air')await javaResources.ensure(id);
    }
    for(const [position,properties] of savedStates){
      const id=savedEdits.get(position)||getBlock(...position.split(',').map(Number));
      if(id!==AIR)await javaResources.ensure(id,properties);
    }
    old?.dispose();
    if(active||titlePreviewReady)for(const chunk of [...loaded.keys()]){
      const [cx,cz]=chunk.split(',').map(Number);
      rebuild(cx,cz);
    }
    renderHotbar();
    if(inventoryOpen)renderInventory($('#itemsearch').value.trim());
    status.textContent=`Java 1.21.11 loaded · ${imported.blockNames.length} blocks · ${imported.itemNames.length} items · ${imported.textureCount()} textures`;
    notice(status.textContent);
    if(persist){
      try{await rememberJavaJar(file)}
      catch{status.textContent+=' · ブラウザへのキャッシュ保存に失敗しました'}
    }
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
recallJavaJar().then(file=>{
  if(file&&jarImportGeneration===0)void importJavaJar(file,false);
}).catch(()=>{});
function renderHotbar(){$('#hotbar').innerHTML=slots.map((id,i)=>`<div class="slot ${i===selected?'selected':''}" data-slot="${i}"><em>${i+1}</em><i style="${itemStyle(id)}"></i>${mode==='survival'&&id!==AIR&&slotCounts[i]>0?`<small>${slotCounts[i]}</small>`:''}</div>`).join('');$('#selected-name').textContent=itemInfo(slots[selected])?.name??slots[selected];$$('.slot').forEach(s=>s.onclick=()=>{selected=Number(s.dataset.slot);renderHotbar()})}
function collectBlock(id){
  if(id==='air'||id==='bedrock'||id==='water')return;
  const drop=({grass:'dirt',stone:'cobble',leaves:'air'}[id]??id);
  if(drop==='air')return;
  const containers=[[slots,slotCounts],[storageSlots,storageCounts]];
  let target;
  for(const [items,counts] of containers){
    const index=items.findIndex((item,i)=>item===drop&&counts[i]>0&&counts[i]<64);
    if(index>=0){target=[items,counts,index];break}
  }
  if(!target)for(const [items,counts] of containers){
    const index=items.findIndex((item,i)=>item===AIR||counts[i]===0);
    if(index>=0){target=[items,counts,index];break}
  }
  if(!target){notice('インベントリがいっぱいです');return}
  const [items,counts,index]=target;
  if(items[index]===AIR||counts[index]===0)counts[index]=0;
  items[index]=drop;
  counts[index]++;
  renderHotbar();
}
function inventoryContainers(preferHotbar=false){return preferHotbar?[[slots,slotCounts],[storageSlots,storageCounts]]:[[storageSlots,storageCounts],[slots,slotCounts]]}
function addInventoryItem(id,quantity=1,preferHotbar=false){
  const containers=inventoryContainers(preferHotbar);
  const capacity=containers.reduce((total,[items,counts])=>total+items.reduce((sum,item,i)=>{
    if(item===id)return sum+Math.max(0,64-counts[i]);
    if(item===AIR||counts[i]===0)return sum+64;
    return sum;
  },0),0);
  if(capacity<quantity)return false;
  let remaining=quantity;
  for(const [items,counts] of containers)for(let i=0;i<items.length&&remaining>0;i++){
    if(items[i]!==id||counts[i]>=64)continue;
    const amount=Math.min(remaining,64-counts[i]);
    counts[i]+=amount;
    remaining-=amount;
  }
  for(const [items,counts] of containers)for(let i=0;i<items.length&&remaining>0;i++){
    if(items[i]!==AIR&&counts[i]!==0)continue;
    const amount=Math.min(remaining,64);
    items[i]=id;
    counts[i]=amount;
    remaining-=amount;
  }
  return remaining===0;
}
function craftingResult(){
  const width=craftingTableOpen?3:2;
  const occupied=craftGrid.map((id,index)=>id===AIR?null:[index%width,Math.floor(index/width),id]).filter(Boolean);
  if(!occupied.length)return null;
  const minX=Math.min(...occupied.map(([x])=>x));
  const minY=Math.min(...occupied.map(([,y])=>y));
  const maxX=Math.max(...occupied.map(([x])=>x));
  const maxY=Math.max(...occupied.map(([,y])=>y));
  const pattern=[];
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)pattern.push(craftGrid[y*width+x]);
  return CRAFTING_RECIPES.find(recipe=>recipe.pattern.length===pattern.length&&recipe.pattern.every((id,i)=>id===pattern[i]))??null;
}
function craftRecipe(recipe){
  if(craftingResult()!==recipe)return false;
  const nextSlots=[...slots],nextCounts=[...slotCounts],nextStorage=[...storageSlots],nextStorageCounts=[...storageCounts];
  // Reserve the recipe output before consuming inputs so a full inventory never loses materials.
  const outputFits=[...nextSlots,...nextStorage].some((id,i)=>id===AIR||id===recipe.id&&[...nextCounts,...nextStorageCounts][i]<=64-recipe.amount);
  if(!outputFits)return false;
  for(let i=0;i<craftGrid.length;i++)craftGrid[i]=AIR;
  if(!addInventoryItem(recipe.id,recipe.amount))throw Error('クラフト完成品を収納できません');
  renderHotbar();renderInventory();scheduleSave();
  return true;
}
function returnCraftGrid(){
  for(let i=0;i<craftGrid.length;i++){
    if(craftGrid[i]===AIR)continue;
    if(!addInventoryItem(craftGrid[i]))return false;
    craftGrid[i]=AIR;
  }
  return true;
}
function $$(s){return [...document.querySelectorAll(s)]}
function notice(msg){const el=$('#notice');el.textContent=msg;el.classList.add('show');clearTimeout(notice.timeout);notice.timeout=setTimeout(()=>el.classList.remove('show'),2400)}
function chestSlots(){
  if(!openChestKey)return null;
  if(!chestContents.has(openChestKey))chestContents.set(openChestKey,{items:Array(27).fill(AIR),counts:Array(27).fill(0)});
  return chestContents.get(openChestKey);
}
function collectChestContents(position){
  const chest=chestContents.get(position);
  if(!chest)return true;
  const nextSlots=[...slots],nextCounts=[...slotCounts];
  const nextStorage=[...storageSlots],nextStorageCounts=[...storageCounts];
  const containers=[[nextStorage,nextStorageCounts],[nextSlots,nextCounts]];
  for(let index=0;index<27;index++){
    const id=chest.items[index],amount=chest.counts[index];
    if(id===AIR||amount<=0)continue;
    let remaining=amount;
    for(const [items,counts] of containers)for(let i=0;i<items.length&&remaining>0;i++){
      if(items[i]!==id||counts[i]>=64)continue;
      const moved=Math.min(remaining,64-counts[i]);
      counts[i]+=moved;remaining-=moved;
    }
    for(const [items,counts] of containers)for(let i=0;i<items.length&&remaining>0;i++){
      if(items[i]!==AIR&&counts[i]!==0)continue;
      const moved=Math.min(remaining,64);
      items[i]=id;counts[i]=moved;remaining-=moved;
    }
    if(remaining>0)return false;
  }
  slots=nextSlots;slotCounts=nextCounts;
  storageSlots=nextStorage;storageCounts=nextStorageCounts;
  chestContents.delete(position);
  return true;
}
function inventorySlot(index){
  if(index<27)return [storageSlots,storageCounts,index];
  if(index<36)return [slots,slotCounts,index-27];
  const chest=chestSlots();
  return chest?[chest.items,chest.counts,index-36]:null;
}
let creativePage=0;
let creativeCarried=null;
// Nine columns by five rows matches the visible creative item grid.
const CREATIVE_PAGE_SIZE=45;
const CREATIVE_TABS=[
  ['building','建築ブロック'],['colored','色付きブロック'],['natural','自然ブロック'],
  ['functional','機能ブロック'],['redstone','レッドストーン'],['tools','道具'],
  ['combat','戦闘'],['food','食べ物'],['ingredients','材料'],
  ['spawn','スポーンエッグ'],['search','検索'],
];
let creativeTab='building';
const COLOR_PREFIX=/(?:^|_)(?:white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)(?:_|$)/;
function creativeCategory(id){
  if(id.endsWith('_spawn_egg'))return 'spawn';
  if(/(?:^|_)(?:sword|bow|crossbow|trident|mace|shield|helmet|chestplate|leggings|boots|arrow)(?:_|$)|tipped_arrow|spectral_arrow/.test(id))return 'combat';
  if(/(?:^|_)(?:pickaxe|axe|shovel|hoe|shears|fishing_rod|flint_and_steel|brush|compass|clock|spyglass|map)(?:_|$)|elytra|bucket|lead|saddle/.test(id))return 'tools';
  if(foodById[id]||/apple|bread|carrot|potato|beef|porkchop|chicken|mutton|rabbit_stew|cookie|cake|pie|melon_slice|berries|suspicious_stew|dried_kelp|cod|salmon|tropical_fish|pufferfish|golden_apple|honey_bottle|beetroot_soup/.test(id))return 'food';
  if(/redstone|repeater|comparator|piston|observer|dispenser|dropper|hopper|lever|button|pressure_plate|tripwire|daylight_detector|target|rail|detector_rail|activator_rail|lightning_rod|sculk_sensor/.test(id))return 'redstone';
  if(/crafting_table|furnace|smoker|blast_furnace|chest|barrel|enchanting_table|anvil|grindstone|smithing_table|stonecutter|loom|cartography_table|lectern|brewing_stand|beacon|bell|bed|door|trapdoor|fence_gate|ladder|scaffolding|lantern|torch|campfire|sign|banner|flower_pot|decorated_pot|shulker_box/.test(id))return 'functional';
  if(COLOR_PREFIX.test(id)&&/wool|concrete|terracotta|glass|stained_glass|carpet|banner|candle|bed|glazed_terracotta/.test(id))return 'colored';
  if(/grass|dirt|stone|sand|gravel|ore|deepslate|tuff|calcite|basalt|netherrack|end_stone|log|leaves|sapling|flower|mushroom|coral|kelp|vine|moss|root|ice|snow|water|lava|clay|mud|cactus|bamboo|azalea|dripstone|amethyst|sculk/.test(id))return 'natural';
  if(byId[id])return 'building';
  return 'ingredients';
}
function renderCreativeTabs(){
  const tabs=$('#creative-tabs');
  tabs.classList.toggle('hidden',mode!=='creative');
  if(mode!=='creative')return;
  tabs.innerHTML=CREATIVE_TABS.map(([id,label])=>`<button type="button" data-creative-tab="${id}" class="${id===creativeTab?'active':''}" aria-pressed="${id===creativeTab}" title="${label}">${label}</button>`).join('');
  tabs.querySelectorAll('button').forEach(button=>button.onclick=()=>{
    creativeTab=button.dataset.creativeTab;
    creativePage=0;
    $('#itemsearch').value='';
    $('#itemsearch').classList.toggle('hidden',creativeTab!=='search');
    renderCreativeTabs();renderInventory();
    if(creativeTab==='search'&&!isTouchDevice)$('#itemsearch').focus();
  });
}
function renderInventory(query=''){
  $('#creative-hotbar').classList.toggle('hidden',mode!=='creative');
  if(mode==='survival'){
    const cells=[...storageSlots,...slots];
    const counts=[...storageCounts,...slotCounts];
    $('#itemcount').textContent='持ち物27枠・ホットバー9枠 · 2枠を順に選択して移動';
    $('#items').innerHTML=cells.map((id,i)=>{
      const item=itemInfo(id);
      return `<button class="item-tile inventory-cell ${inventorySelection===i?'inventory-picked':''}" data-index="${i}" aria-label="${i<27?'持ち物':'ホットバー'} ${i<27?i+1:i-26} ${item?.name??'空'} ${counts[i]||0}個"><i style="${item?itemStyle(id):'background:transparent'}"></i><span>${item?.name??'空'}</span>${id!==AIR&&counts[i]>0?`<small>${counts[i]}</small>`:''}</button>`;
    }).join('');
    $$('.inventory-cell').forEach(cell=>cell.onclick=()=>{
      const index=Number(cell.dataset.index);
      if(inventorySelection===null){
        if(cells[index]===AIR||counts[index]===0)return;
        inventorySelection=index;
      }else{
        const first=inventorySelection;
        inventorySelection=null;
        if(first!==index){
          const [origin,originCounts,a]=inventorySlot(first);
          const [destination,destinationCounts,b]=inventorySlot(index);
          [origin[a],destination[b]]=[destination[b],origin[a]];
          [originCounts[a],destinationCounts[b]]=[destinationCounts[b],originCounts[a]];
          renderHotbar();
          scheduleSave();
        }
      }
      renderInventory();
    });
    const chest=chestSlots();
    const chestPanel=$('#chest-storage');
    chestPanel.classList.toggle('hidden',!chest);
    if(chest){
      chestPanel.innerHTML=`<h3>チェスト</h3><div class="chest-grid">${chest.items.map((id,i)=>{
        const item=itemInfo(id);
        return `<button class="item-tile chest-cell ${inventorySelection===i+36?'inventory-picked':''}" data-index="${i+36}" aria-label="チェスト ${i+1} ${item?.name??'空'} ${chest.counts[i]}個"><i style="${item?itemStyle(id):'background:transparent'}"></i><span>${item?.name??'空'}</span>${id!==AIR&&chest.counts[i]>0?`<small>${chest.counts[i]}</small>`:''}</button>`;
      }).join('')}</div>`;
      $$('.chest-cell').forEach(cell=>cell.onclick=()=>{
        const index=Number(cell.dataset.index);
        if(inventorySelection===null){
          if(chest.items[index-36]===AIR)return;
          inventorySelection=index;
        }else{
          const first=inventorySelection;
          inventorySelection=null;
          if(first!==index){
            const [source,sourceCounts,a]=inventorySlot(first);
            const [destination,destinationCounts,b]=inventorySlot(index);
            [source[a],destination[b]]=[destination[b],source[a]];
            [sourceCounts[a],destinationCounts[b]]=[destinationCounts[b],sourceCounts[a]];
            renderHotbar();scheduleSave();
          }
        }
        renderInventory();
      });
    }
    const crafting=$('#crafting');
    crafting.classList.toggle('hidden',!!chest);
    const result=craftingResult();
    crafting.innerHTML=`<h3>${craftingTableOpen?'3×3 作業台':'2×2 クラフト'}</h3><p>持ち物を選び、マスをタップすると材料を1個置きます。マスをもう一度タップすると戻せます。</p><div class="craft-layout"><div class="craft-grid ${craftingTableOpen?'craft-grid-large':''}">${craftGrid.map((id,i)=>{
      const item=itemInfo(id);
      return `<button class="craft-cell ${id!==AIR?'filled':''}" data-grid="${i}" aria-label="クラフト ${i+1} ${item?.name??'空'}">${item?.name??'＋'}</button>`;
    }).join('')}</div><span class="craft-arrow">→</span><button id="craft-result" ${result?'':'disabled'}>${result?.name??'完成品'}</button></div>`;
    $$('.craft-cell').forEach(button=>button.onclick=()=>{
      const index=Number(button.dataset.grid);
      if(craftGrid[index]!==AIR){
        if(!addInventoryItem(craftGrid[index])){notice('持ち物に空きがありません');return}
        craftGrid[index]=AIR;
      }else if(inventorySelection!==null){
        const from=inventorySelection<27?storageSlots:slots;
        const counts=inventorySelection<27?storageCounts:slotCounts;
        const slot=inventorySelection<27?inventorySelection:inventorySelection-27;
        if(from[slot]!==AIR&&counts[slot]>0){
          craftGrid[index]=from[slot];
          counts[slot]--;
          if(counts[slot]===0)from[slot]=AIR;
        }
      }
      inventorySelection=null;
      renderHotbar();renderInventory();scheduleSave();
    });
    $('#craft-result').onclick=()=>{
      if(!craftRecipe(craftingResult()))notice('完成品を収納できません');
    };
    return;
  }
  $('#crafting').classList.add('hidden');
  const matches=[...BLOCKS,...FOODS,...ITEMS].filter(b=>
    (creativeTab==='search'||creativeCategory(b.id)===creativeTab)&&
    (b.id.includes(query.toLowerCase())||b.name.toLowerCase().includes(query.toLowerCase())));
  const pageCount=Math.max(1,Math.ceil(matches.length/CREATIVE_PAGE_SIZE));
  creativePage=Math.min(creativePage,pageCount-1);
  const start=creativePage*CREATIVE_PAGE_SIZE;
  $('#itemcount').innerHTML=`<span>${matches.length} items · ${matches.length?start+1:0}–${Math.min(start+CREATIVE_PAGE_SIZE,matches.length)} / ${pageCount} ページ</span><div class="creative-pages"><button id="previous-items" ${creativePage===0?'disabled':''}>前へ</button><button id="next-items" ${creativePage===pageCount-1?'disabled':''}>次へ</button></div>`;
  const changePage=delta=>{
    creativePage+=delta;
    renderInventory(query);
    $('.inventory-panel').scrollTop=0;
  };
  $('#previous-items').onclick=()=>changePage(-1);
  $('#next-items').onclick=()=>changePage(1);
  $('#items').innerHTML=matches.slice(start,start+CREATIVE_PAGE_SIZE).map(b=>`<button class="item-tile" data-id="${b.id}"><i style="${itemStyle(b.id)}"></i>${b.name}</button>`).join('');
  $$('.item-tile').forEach(el=>el.onclick=async event=>{
    const id=el.dataset.id;
    creativeCarried=id;
    renderCreativeHotbar();
    if(event.shiftKey)placeCreativeItem(selected);
    if(byId[id])await ensureJavaBlock(id);
  });
  renderCreativeHotbar();
}
function placeCreativeItem(index){
  if(creativeCarried){
    slots[index]=creativeCarried;
    slotCounts[index]=64;
    selected=index;
    renderHotbar();scheduleSave();
  }else selected=index;
  renderCreativeHotbar();
}
function renderCreativeHotbar(){
  const root=$('#creative-hotbar');
  if(mode!=='creative')return;
  root.innerHTML=`<div class="creative-cursor">${creativeCarried?`選択中: ${itemInfo(creativeCarried)?.name??creativeCarried} · 配置するマスを選択`: 'アイテムを選び、下のスロットに配置'}</div><div class="creative-hotbar-row">${slots.map((id,index)=>`<button type="button" class="creative-hotbar-slot ${index===selected?'selected':''}" data-creative-slot="${index}" title="${itemInfo(id)?.name??'空'}"><i style="${id===AIR?'':itemStyle(id)}"></i><small>${index+1}</small></button>`).join('')}</div><div class="creative-hotbar-actions"><button id="creative-take" type="button" ${creativeCarried?'':'disabled'}>持ち物を解除</button><span>Shift+クリック: 現在の枠に配置</span></div>`;
  root.querySelectorAll('[data-creative-slot]').forEach(button=>button.onclick=()=>placeCreativeItem(Number(button.dataset.creativeSlot)));
  root.querySelector('#creative-take').onclick=()=>{creativeCarried=null;renderCreativeHotbar()};
}
function openInventory(useTable=false){
  if(inventoryOpen)return;
  const hadPendingMaterials=craftGrid.some(id=>id!==AIR);
  if(hadPendingMaterials&&!returnCraftGrid()){
    notice('クラフト材料を戻す空きがありません');
    return;
  }
  if(hadPendingMaterials)scheduleSave();
  craftingTableOpen=mode==='survival'&&useTable;
  openChestKey=null;
  craftGrid=Array(craftingTableOpen?9:4).fill(AIR);
  inventoryOpen=true;
  inventorySelection=null;
  document.exitPointerLock?.();
  $('#inventory').classList.remove('hidden');
  if(!$('#crafting'))$('#items').insertAdjacentHTML('afterend','<section id="crafting" class="hidden"></section>');
  if(!$('#chest-storage'))$('#items').insertAdjacentHTML('beforebegin','<section id="chest-storage" class="hidden"></section>');
  $('#inventory h2').textContent=mode==='survival'?'インベントリ':'ブロックとアイテム';
  $('#inventory p').textContent=mode==='survival'?'持ち物とホットバーのアイテムを入れ替えます。':'カテゴリからアイテムを選び、下のホットバーに配置します。';
  $('#itemsearch').classList.toggle('hidden',mode==='survival');
  $('#itemsearch').value='';
  creativePage=0;
  creativeTab='building';
  creativeCarried=null;
  renderCreativeTabs();
  $('#itemsearch').classList.toggle('hidden',mode!=='creative'||creativeTab!=='search');
  renderInventory();
}
function openChest(x,y,z){
  openInventory();
  if(!inventoryOpen)return;
  openChestKey=key(x,y,z);
  $('#inventory h2').textContent='チェスト';
  $('#inventory p').textContent='持ち物とチェストのマスを順に選ぶとアイテムを移動できます。';
  renderInventory();
}
$('#itemsearch').addEventListener('input',e=>{creativePage=0;renderInventory(e.target.value.trim())});
function closeInventory(){
  if(mode==='survival'&&!returnCraftGrid()){notice('クラフト材料を戻す空きがありません');return}
  inventoryOpen=false;
  openChestKey=null;
  craftingTableOpen=false;
  craftGrid=Array(4).fill(AIR);
  $('#inventory').classList.add('hidden');
  renderHotbar();scheduleSave();
  if(active&&!paused)lockPointer();
}
$('#closeinv').onclick=closeInventory;
const settingsOverlay=$('#settings-overlay');
let settingsReturn='title';
function applyVideoSettings(){
  renderer.toneMappingExposure=.75+settings.brightness*.007;
  renderer.shadowMap.enabled=settings.shadows;
  sun.castShadow=settings.shadows;
  renderer.shadowMap.needsUpdate=true;
  if(active)updateSun();
  camera.fov=settings.fov;camera.updateProjectionMatrix();
  scene.fog.near=settings.graphics==='fast'?38:45;
  scene.fog.far=settings.renderDistance*CHUNK+45;
  lastChunkX=Infinity;lastChunkZ=Infinity;
  if(active)updateChunks();
}
const settingsUI=createSettingsUI(settingsOverlay,{
  onApply:applyVideoSettings,
  onClose:()=>{
    settingsOverlay.classList.add('hidden');
    (settingsReturn==='pause'?$('#pause'):$('#menu')).classList.remove('hidden');
  },
});
function openSettings(from){
  settingsReturn=from;
  if(from==='pause')$('#pause').classList.add('hidden');
  else $('#menu').classList.add('hidden');
  settingsUI.render();
  settingsOverlay.classList.remove('hidden');
}
$('#pause-settings').onclick=()=>openSettings('pause');
$('#title-settings').onclick=()=>openSettings('title');
$('#title-options').onclick=()=>openSettings('title');
applyVideoSettings();
function pause(){if(!active)return;paused=true;document.exitPointerLock?.();$('#pause').classList.remove('hidden')}
function unpause(){paused=false;$('#pause').classList.add('hidden');lockPointer()}
$('#continue').onclick=unpause;$('#save').onclick=()=>{saveData();notice('保存しました');unpause()};$('#back').onclick=()=>{saveData();active=false;paused=false;$('#pause').classList.add('hidden');$('#hud').classList.add('hidden');$('#menu').classList.remove('hidden');showTitleScreen()};
document.addEventListener('pointerlockchange',()=>{if(!isTouchDevice&&!document.pointerLockElement&&active&&!inventoryOpen&&!chatOpen&&!paused)pause()});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==renderer.domElement||paused)return;const scale=.0024*settings.sensitivity/50;yaw-=e.movementX*scale;pitch=clamp(pitch-e.movementY*scale,-Math.PI/2+.01,Math.PI/2-.01)});
document.addEventListener('keydown',e=>{
  if(!settingsOverlay.classList.contains('hidden')){if(e.code==='Escape'){settingsUI.cancelKeyCapture();return}return}
  if(!active)return;
  if(chatOpen){if(e.code==='Enter'){execute($('#command').value);$('#command').value='';closeChat()}else if(e.code==='Escape')closeChat();return}
  if(inventoryOpen){if(e.code==='Escape'||e.code===settings.controls.inventory)closeInventory();return}
  if(e.code===settings.controls.pause){if(paused)unpause();else pause();return}
  if(paused)return;
  if(e.code===settings.controls.chat||e.code==='Slash'){openChat(e.code==='Slash'?'/':'');e.preventDefault();return}
  if(e.code===settings.controls.inventory){e.preventDefault();openInventory();return}
  if(e.code===settings.controls.fly){fly=!fly;vy=0;notice(fly?'飛行モード ON':'飛行モード OFF');return}
  if(/^Digit[1-9]$/.test(e.code)){selected=Number(e.code.slice(-1))-1;renderHotbar()}
  keys.add(e.code);
  if([settings.controls.jump,'ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
});
document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());renderer.domElement.addEventListener('mousedown',e=>{if(!active||paused||inventoryOpen||chatOpen||isTouchDevice)return;if(document.pointerLockElement!==renderer.domElement){lockPointer();return}if(e.button===0)interact(false);if(e.button===1)pickBlock();if(e.button===2)interact(true)});
document.addEventListener('wheel',e=>{if(!active||paused||inventoryOpen)return;selected=(selected+(e.deltaY>0?1:8))%9;renderHotbar()},{passive:true});
function pick(){
  camera.updateMatrixWorld();
  raycaster.setFromCamera(new THREE.Vector2(),camera);
  const blocks=[...loaded.values()].flatMap(group=>group.children);
  const targets=[...blocks,mobs.root];
  return raycaster.intersectObjects(targets,true).find(hit=>hit.distance<=6.5);
}
function pickBlock(){
  const hit=pick();
  if(!hit||mobs.entityForObject(hit.object))return;
  const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld).round();
  const blockPosition=hit.point.clone().addScaledVector(normal,-.025);
  const id=getBlock(blockPosition.x,blockPosition.y,blockPosition.z);
  if(id===AIR||id==='water'||!byId[id])return;
  const hotbarIndex=slots.findIndex((item,index)=>item===id&&slotCounts[index]>0);
  if(hotbarIndex>=0){
    selected=hotbarIndex;
  }else if(mode==='creative'){
    slots[selected]=id;
    slotCounts[selected]=64;
  }else{
    const storageIndex=storageSlots.findIndex((item,index)=>item===id&&storageCounts[index]>0);
    if(storageIndex<0)return;
    [slots[selected],storageSlots[storageIndex]]=[storageSlots[storageIndex],slots[selected]];
    [slotCounts[selected],storageCounts[storageIndex]]=[storageCounts[storageIndex],slotCounts[selected]];
  }
  renderHotbar();
  scheduleSave();
}
function interact(place){
  const hit=pick();
  if(!hit){if(place)eatSelectedFood();return}
  const entity=mobs.entityForObject(hit.object);
  if(entity){
    if(!place){const damage=mode==='creative'?20:Math.max(0,4-4*(effectLevel('weakness')+1));const killed=mobs.damage(entity,damage);scheduleSave();notice(killed?`${entity.type} を倒しました`:`${entity.type} HP ${entity.health}`)}
    return;
  }
  const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld).round();
  if(place&&mode==='survival'){
    const selectedPoint=hit.point.clone().addScaledVector(normal,-.025);
    const selectedBlock=getBlock(selectedPoint.x,selectedPoint.y,selectedPoint.z);
    if(selectedBlock==='crafting_table'){
      openInventory(true);
      return;
    }
    if(selectedBlock==='chest'){
      openChest(Math.floor(selectedPoint.x),Math.floor(selectedPoint.y),Math.floor(selectedPoint.z));
      return;
    }
  }
  if(place&&eatSelectedFood())return;
  if(place&&!byId[slots[selected]])return;
  const p=hit.point.clone().addScaledVector(normal,place?.025:-.025);
  if(place)p.copy(hit.point).addScaledVector(normal,.025);
  const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z);
  if(y<1||y>100)return;
  if(place){
    if(Math.abs(x-location.x)<.8&&Math.abs(z-location.z)<.8&&y<location.y+.6&&y+1>location.y-1.6)return;
    const id=slots[selected];
    if(!byId[id]||id===AIR||id==='bedrock'||(mode==='survival'&&slotCounts[selected]===0))return;
    if(getBlock(x,y,z)!==AIR&&getBlock(x,y,z)!=='water')return;
    const properties=placementProperties(id,normal,hit.point);
    setBlock(x,y,z,id,properties);
    if(properties)void ensureJavaBlock(id,properties);
    if(mode==='survival'){
      slotCounts[selected]--;
      if(slotCounts[selected]===0)slots[selected]=AIR;
      renderHotbar();
    }
  }else{
    const id=getBlock(x,y,z);
    if(id==='bedrock'||id===AIR)return;
    if(id==='chest'){
      const position=key(x,y,z);
      if(mode==='survival'&&!collectChestContents(position)){
        notice('チェストの中身を回収する空きがありません');
        return;
      }
      chestContents.delete(position);
      renderHotbar();
    }
    setBlock(x,y,z,AIR);
    if(mode==='survival')collectBlock(id);
  }
}
function openChat(prefill=''){chatOpen=true;document.exitPointerLock?.();$('#chat').classList.remove('hidden');$('#command').value=prefill;$('#command').focus()}
function closeChat(){chatOpen=false;$('#chat').classList.add('hidden');lockPointer()}
function chat(text){const log=$('#chatlog');const line=document.createElement('div');line.textContent=text;log.appendChild(line);log.scrollTop=log.scrollHeight;while(log.children.length>16)log.firstChild.remove()}
function updateBlockRegion(positions){
  blockLighting.invalidate();
  const chunks=new Set();
  for(const [x,,z] of positions){
    const cx=Math.floor(x/CHUNK),cz=Math.floor(z/CHUNK);
    const localX=((x%CHUNK)+CHUNK)%CHUNK;
    const localZ=((z%CHUNK)+CHUNK)%CHUNK;
    chunks.add(`${cx},${cz}`);
    if(localX===0)chunks.add(`${cx-1},${cz}`);
    if(localX===CHUNK-1)chunks.add(`${cx+1},${cz}`);
    if(localZ===0)chunks.add(`${cx},${cz-1}`);
    if(localZ===CHUNK-1)chunks.add(`${cx},${cz+1}`);
  }
  rebuildEditedChunkHeights();
  for(const chunk of chunks){
    if(!loaded.has(chunk))continue;
    const [cx,cz]=chunk.split(',').map(Number);
    rebuild(cx,cz,true);
  }
  if(chunks.size)updateWaterSurface();
  scheduleSave();
}
function writeBlock(x,y,z,id){
  const position=key(x,y,z);
  savedStates.delete(position);
  if(getBlock(x,y,z)==='chest'&&id!=='chest')chestContents.delete(position);
  if(id===generatedBlock(x,y,z))savedEdits.delete(position);
  else savedEdits.set(position,id);
}
function execute(raw){const input=raw.trim();if(!input)return;if(!input.startsWith('/')){chat(`<${worldName}> ${input}`);return}const parts=input.slice(1).split(/\s+/),cmd=parts.shift().toLowerCase();const xyz=(offset=0)=>parts.slice(offset,offset+3).map((v,i)=>{const base=[location.x,location.y,location.z][i];return v?.startsWith('~')?Math.floor(base)+Number(v.slice(1)||0):Number(v)});const valid=v=>v.every(Number.isFinite)&&v.every(Number.isInteger);const inWorld=v=>valid(v)&&v[1]>=1&&v[1]<=100;const volume=(a,b)=>(Math.abs(a[0]-b[0])+1)*(Math.abs(a[1]-b[1])+1)*(Math.abs(a[2]-b[2])+1);const bounds=(a,b)=>a.map((n,i)=>[Math.min(n,b[i]),Math.max(n,b[i])]);
  switch(cmd){case 'help':chat('/help /seed /tp x y z /setblock x y z block [keep|replace] /fill x1 y1 z1 x2 y2 z2 block [replace [filter]|keep|hollow|outline] /clone x1 y1 z1 x2 y2 z2 x y z [replace|masked|filtered block] [normal|force|move] /give block [count] /clear [@s] [item] [maxCount] /item replace entity @s <slot> with <item> [count] /item replace block x y z container.N with <item> [count] /summon pig|cow|sheep|zombie|creeper [x y z] /damage @s|@e amount /effect give @s <effect> [seconds] [amplifier] /effect clear @s [effect] /experience add|set @s amount points|levels /experience query @s points|levels /time set|add|query /gamerule doDaylightCycle true|false /gamemode creative|survival /difficulty peaceful|easy|normal|hard /weather clear|rain|thunder /save /spawnpoint [x y z] /setworldspawn [x y z] /kill /locate biome <biome> /locate structure desert_well');break;
  case 'effect':{
    const [action,target,idInput,secondsInput,amplifierInput]=parts;
    const id=idInput?.replace(/^minecraft:/,'');
    if(action==='clear'&&target==='@s'&&parts.length<=3&&(id===undefined||SUPPORTED_EFFECTS.has(id))){
      if(id)delete playerEffects[id];else playerEffects={};
      regenerationTimer=0;renderEffects();scheduleSave();chat(id?`${id} の効果を解除しました`:'すべての効果を解除しました');break;
    }
    const seconds=secondsInput===undefined?30:Number(secondsInput);
    const amplifier=amplifierInput===undefined?0:Number(amplifierInput);
    if(action==='give'&&target==='@s'&&SUPPORTED_EFFECTS.has(id)&&parts.length<=5&&Number.isInteger(seconds)&&seconds>=1&&seconds<=1000000&&Number.isInteger(amplifier)&&amplifier>=0&&amplifier<=4){
      playerEffects[id]={seconds,amplifier};regenerationTimer=0;renderEffects();scheduleSave();chat(`${id} ${amplifier+1} を ${seconds} 秒間付与しました`);break;
    }
    chat('使用法 /effect give @s <speed|slowness|jump_boost|regeneration|resistance|weakness> [seconds] [amplifier] または /effect clear @s [effect]');break;
  }
  case 'experience':case 'xp':{
    const [action,target,amountText,unit='points']=parts;
    if(action==='query'&&target==='@s'&&parts.length===3&&['points','levels'].includes(amountText)){
      const level=xpLevel(experienceTotal);
      chat(`経験値 ${amountText==='levels'?level:experienceTotal-xpAtLevel(level)}`);break;
    }
    const amount=Number(amountText);
    if(!['add','set'].includes(action)||target!=='@s'||parts.length<3||parts.length>4||!Number.isSafeInteger(amount)||!['points','levels'].includes(unit)||Math.abs(amount)>1000000000||(action==='set'&&amount<0)){
      chat('使用法 /experience add|set @s <amount> [points|levels] または /experience query @s points|levels');break;
    }
    const level=xpLevel(experienceTotal),progress=experienceTotal-xpAtLevel(level);
    let next=experienceTotal;
    if(unit==='levels'){
      const nextLevel=action==='add'?Math.max(0,level+amount):amount;
      next=xpAtLevel(nextLevel)+Math.min(progress,xpAtLevel(nextLevel+1)-xpAtLevel(nextLevel)-1);
    }else if(action==='add')next=Math.max(0,experienceTotal+amount);
    else{
      if(amount>=xpAtLevel(level+1)-xpAtLevel(level)){
        chat('このレベルの経験値ポイントの範囲を超えています');break;
      }
      next=xpAtLevel(level)+amount;
    }
    if(!Number.isSafeInteger(next)||next>1000000000){chat('経験値の上限を超えています');break}
    experienceTotal=next;renderExperience();scheduleSave();chat(`経験値を ${experienceTotal} に設定しました（レベル ${xpLevel(experienceTotal)}）`);break;
  }
  case 'seed':chat(`シード: ${seed64}`);break;
  case 'tp':case 'teleport':{const p=xyz();if(!valid(p)){chat('使用法 /tp x y z');break}location={x:p[0],y:p[1],z:p[2]};vy=0;fallDistance=0;grounded=false;updateChunks();chat('テレポートしました');break}
  case 'setblock':{
    const p=xyz(),spec=parts[3]?.replace(/^minecraft:/,''),action=parts[4]||'replace';
    const match=spec?.match(/^([a-z0-9_]+)(?:\[([a-z_]+=[a-z0-9_]+(?:,[a-z_]+=[a-z0-9_]+)*)\])?$/);
    const id=match?.[1];
    const properties={};
    if(match?.[2])for(const entry of match[2].split(',')){
      const [name,value]=entry.split('=');
      properties[name]=value;
    }
    const supported=Object.keys(properties).every(name=>['axis','facing','half','type','shape'].includes(name));
    if(!inWorld(p)||!(id===AIR||byId[id])||!supported||!['keep','replace','destroy'].includes(action)){
      chat('使用法 /setblock x y z block[axis=x|y|z,facing=north|south|east|west] [keep|replace|destroy]');break;
    }
    if(action==='keep'&&getBlock(...p)!==AIR){chat('変更対象が空気ではありません');break}
    setBlock(...p,id,properties);
    if(id!==AIR)void ensureJavaBlock(id,properties);
    chat(`ブロックを設置しました ${spec}`);break;
  }
  case 'fill':{
    const a=xyz(),b=xyz(3),id=parts[6]?.replace(/^minecraft:/,''),action=parts[7]||'replace';
    const filter=parts[8]?.replace(/^minecraft:/,'');
    if(!inWorld(a)||!inWorld(b)||!(id===AIR||byId[id])||!['replace','keep','hollow','outline'].includes(action)||
       (filter!==undefined&&(action!=='replace'||!(filter===AIR||byId[filter])))||parts.length>9){
      chat('使用法 /fill x1 y1 z1 x2 y2 z2 block [replace [filter]|keep|hollow|outline]');break;
    }
    if(volume(a,b)>4096){chat('一度に変更できるのは4096ブロックまでです');break}
    const [[minX,maxX],[minY,maxY],[minZ,maxZ]]=bounds(a,b),changed=[];
    for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++)for(let y=minY;y<=maxY;y++){
      const edge=x===minX||x===maxX||y===minY||y===maxY||z===minZ||z===maxZ;
      if(action==='outline'&&!edge)continue;
      if(action==='keep'&&getBlock(x,y,z)!==AIR)continue;
      if(filter!==undefined&&getBlock(x,y,z)!==filter)continue;
      const next=action==='hollow'&&!edge?AIR:id;
      if(getBlock(x,y,z)===next)continue;
      writeBlock(x,y,z,next);changed.push([x,y,z]);
    }
    updateBlockRegion(changed);
    if(id!==AIR)void ensureJavaBlock(id);
    chat(`${changed.length} ブロックを変更しました`);break;
  }
  case 'clone':{
    const a=xyz(),b=xyz(3),dest=xyz(6),mask=parts[9]||'replace';
    const filter=mask==='filtered'?parts[10]?.replace(/^minecraft:/,''):null;
    const cloneMode=parts[mask==='filtered'?11:10]||'normal';
    if(!inWorld(a)||!inWorld(b)||!inWorld(dest)||!['replace','masked','filtered'].includes(mask)||
       (mask==='filtered'&&!(filter===AIR||byId[filter]))||!['normal','force','move'].includes(cloneMode)||
       parts.length>(mask==='filtered'?12:11)){
      chat('使用法 /clone x1 y1 z1 x2 y2 z2 x y z [replace|masked|filtered block] [normal|force|move]');break;
    }
    if(volume(a,b)>4096){chat('一度に複製できるのは4096ブロックまでです');break}
    const ranges=bounds(a,b),size=ranges.map(([min,max])=>max-min+1);
    if(dest[1]+size[1]-1>100){chat('複製先がワールドの高さを超えています');break}
    const overlaps=ranges.every(([min,max],i)=>dest[i]<=max&&dest[i]+size[i]-1>=min);
    if(overlaps&&cloneMode==='normal'){chat('コピー元とコピー先が重なっています（force または move を指定してください）');break}
    const source=[];
    for(let dx=0;dx<size[0];dx++)for(let dz=0;dz<size[2];dz++)for(let dy=0;dy<size[1];dy++){
      const sourceX=ranges[0][0]+dx,sourceY=ranges[1][0]+dy,sourceZ=ranges[2][0]+dz;
      const id=getBlock(sourceX,sourceY,sourceZ);
      if(mask==='masked'&&id===AIR)continue;
      if(mask==='filtered'&&id!==filter)continue;
      const sourceKey=key(sourceX,sourceY,sourceZ);
      const chest=id==='chest'?chestContents.get(sourceKey):null;
      const properties=savedStates.get(sourceKey);
      source.push([sourceX,sourceY,sourceZ,dest[0]+dx,dest[1]+dy,dest[2]+dz,id,chest?{items:[...chest.items],counts:[...chest.counts]}:null,properties?{...properties}:null]);
    }
    const changed=[],usedBlocks=new Set();
    if(cloneMode==='move')for(const [x,y,z] of source){
      writeBlock(x,y,z,AIR);
      changed.push([x,y,z]);
    }
    for(const [, , ,x,y,z,id,chest,properties] of source){
      const destinationKey=key(x,y,z);
      const previousProperties=savedStates.get(destinationKey)||null;
      if(getBlock(x,y,z)===id&&id!=='chest'&&JSON.stringify(previousProperties)===JSON.stringify(properties))continue;
      writeBlock(x,y,z,id);
      if(properties)savedStates.set(destinationKey,properties);
      if(id==='chest'){
        if(chest)chestContents.set(destinationKey,chest);
        else chestContents.delete(destinationKey);
      }
      changed.push([x,y,z]);
      if(id!==AIR)usedBlocks.add(JSON.stringify([id,properties||{}]));
    }
    updateBlockRegion(changed);
    for(const block of usedBlocks){const [id,properties]=JSON.parse(block);void ensureJavaBlock(id,properties)}
    chat(`${changed.length} ブロックを複製しました`);break;
  }
  case 'give':{
    const tokens=parts[0]==='@s'?parts.slice(1):parts;
    const id=tokens[0]?.replace(/^minecraft:/,'');
    const count=tokens.length===2?Number(tokens[1]):1;
    if(tokens.length<1||tokens.length>2||!knownItem(id)||!Number.isInteger(count)||count<1||count>2304){
      chat('使用法 /give [@s] block|food [count]（1〜2304）');break;
    }
    if(!addInventoryItem(id,count,true)){chat('インベントリに空きがありません');break}
    renderHotbar();if(byId[id])void ensureJavaBlock(id);
    scheduleSave();chat(`${id} を ${count} 個入手しました`);break;
  }
  case 'clear':{
    const tokens=parts[0]==='@s'?parts.slice(1):parts;
    const id=tokens[0]?.replace(/^minecraft:/,'');
    const maxCount=tokens.length===2?Number(tokens[1]):-1;
    if(tokens.length>2||(id!==undefined&&!knownItem(id))||!Number.isInteger(maxCount)||maxCount < -1){
      chat('使用法 /clear [@s] [item] [maxCount]');break;
    }
    let remaining=maxCount===-1?Infinity:maxCount;
    let affected=0;
    for(const [items,counts] of inventoryContainers(true))for(let i=0;i<items.length;i++){
      if(items[i]===AIR||counts[i]<=0||(id!==undefined&&items[i]!==id))continue;
      const amount=maxCount===0?counts[i]:Math.min(counts[i],remaining);
      affected+=amount;
      if(maxCount===0)continue;
      counts[i]-=amount;
      remaining-=amount;
      if(counts[i]===0)items[i]=AIR;
      if(remaining===0)break;
    }
    if(maxCount!==0){renderHotbar();scheduleSave()}
    chat(maxCount===0?`${affected} 個のアイテムが見つかりました`:`${affected} 個のアイテムを削除しました`);
    break;
  }
  case 'item':{
    if(parts[0]==='replace'&&parts[1]==='block'){
      const coords=xyz(2);
      const slotMatch=/^container\.(\d{1,2})$/.exec(parts[5]??'');
      const index=slotMatch?Number(slotMatch[1]):-1;
      const id=parts[7]?.replace(/^minecraft:/,'');
      const count=parts[8]===undefined?1:Number(parts[8]);
      if(parts.length<8||parts.length>9||!inWorld(coords)||getBlock(...coords)!=='chest'||
        index<0||index>=27||parts[6]!=='with'||!knownItem(id)||
        !Number.isInteger(count)||count<1||count>64){
        chat('使用法 /item replace block x y z container.0 with <item> [1〜64]（チェストのみ）');break;
      }
      const position=key(...coords);
      const chest=chestContents.get(position)??{items:Array(27).fill(AIR),counts:Array(27).fill(0)};
      chest.items[index]=id;
      chest.counts[index]=count;
      chestContents.set(position,chest);
      if(openChestKey===position)renderInventory();
      if(byId[id])void ensureJavaBlock(id);
      scheduleSave();
      chat(`チェスト ${position} の container.${index} に ${id} を ${count} 個設定しました`);
      break;
    }
    const [operation,scope,target,slotName,action,rawId,rawCount]=parts;
    const id=rawId?.replace(/^minecraft:/,'');
    const count=rawCount===undefined?1:Number(rawCount);
    const hotbar=/^hotbar\.([0-8])$/.exec(slotName??'');
    const inventory=/^inventory\.(\d{1,2})$/.exec(slotName??'');
    const index=hotbar?Number(hotbar[1]):inventory?Number(inventory[1]):slotName==='weapon.mainhand'?selected:-1;
    const container=inventory?storageSlots:slots;
    const quantities=inventory?storageCounts:slotCounts;
    if(operation!=='replace'||scope!=='entity'||target!=='@s'||action!=='with'||
      parts.length<6||parts.length>7||index<0||index>=container.length||
      !knownItem(id)||!Number.isInteger(count)||count<1||count>64){
      chat('使用法 /item replace entity @s hotbar.0|inventory.0|weapon.mainhand with <item> [1〜64]');break;
    }
    container[index]=id;
    quantities[index]=count;
    renderHotbar();
    if(byId[id])void ensureJavaBlock(id);
    scheduleSave();
    chat(`${slotName} に ${id} を ${count} 個設定しました`);
    break;
  }
  case 'damage':{
    const [target,rawAmount]=parts;
    const amount=Number(rawAmount);
    if(parts.length<2||parts.length>3||!['@s','@e'].includes(target)||!Number.isFinite(amount)||amount<0||amount>100000){
      chat('使用法 /damage @s|@e amount [damage_type]');break;
    }
    if(target==='@s'){
      if(mode==='creative'){chat('クリエイティブモードではダメージを受けません');break}
      applyPlayerDamage(amount,true);
      chat(`${amount} ダメージを与えました`);
    }else{
      const targets=[...mobs.entities];
      let killed=0;
      for(const entity of targets)if(mobs.damage(entity,amount))killed++;
      scheduleSave();
      chat(`${targets.length} 体に ${amount} ダメージを与えました（${killed} 体死亡）`);
    }
    break;
  }
  case 'summon':{
    const type=parts[0]?.replace(/^minecraft:/,'');
    const p=parts.length===1?[location.x,location.y-PLAYER_EYE,location.z]:xyz(1);
    if(!MobWorld.supports(type)||![1,4].includes(parts.length)||p.length!==3||!p.every(Number.isFinite)){
      chat('使用法 /summon pig|cow|sheep|zombie|creeper [x y z]');break;
    }
    if(difficulty==='peaceful'&&['zombie','creeper'].includes(type)){
      chat('ピースフルでは敵対Mobは出現しません');break;
    }
    const entity=mobs.spawn(type,...p);
    if(!entity){chat('Mobの上限（128体）に達しました');break}
    scheduleSave();chat(`${type} を召喚しました`);break;
  }
  case 'time':{
    const [operation,argument]=parts;
    if(operation==='query'&&parts.length===2&&['daytime','day','gametime'].includes(argument)){
      chat(`時刻 ${Math.floor(timeOfDay)}`);break;
    }
    const named={day:1000,noon:6000,night:13000,midnight:18000};
    const value=Object.hasOwn(named,argument)?named[argument]:Number(argument);
    if(parts.length!==2||!['set','add'].includes(operation)||!Number.isFinite(value)||value<0){
      chat('使用法 /time set day|night|noon|midnight|ticks /time add ticks /time query daytime');break;
    }
    timeOfDay=((operation==='add'?timeOfDay:0)+value)%24000;
    updateSun();scheduleSave();chat(`時刻 ${Math.floor(timeOfDay)}`);break;
  }
  case 'gamerule':{
    if(parts[0]!=='doDaylightCycle'||parts.length>2){chat('使用法 /gamerule doDaylightCycle [true|false]');break}
    if(parts.length===1){chat(`doDaylightCycle = ${doDaylightCycle}`);break}
    if(!['true','false'].includes(parts[1])){chat('値は true または false を指定してください');break}
    doDaylightCycle=parts[1]==='true';scheduleSave();chat(`doDaylightCycle = ${doDaylightCycle}`);break;
  }
  case 'gamemode':{if(!['creative','survival'].includes(parts[0])){chat('使用法 /gamemode creative|survival');break}mode=parts[0];fly=mode==='creative';updateHealthHud();scheduleSave();chat(`ゲームモード ${mode}`);break}
  case 'difficulty':{
    if(parts.length===0){chat(`難易度 ${difficulty}`);break}
    const next=parts[0]?.toLowerCase();
    if(parts.length!==1||!DIFFICULTIES.includes(next)){chat('使用法 /difficulty peaceful|easy|normal|hard');break}
    difficulty=next;
    if(difficulty==='peaceful')for(const entity of [...mobs.entities])if(['zombie','creeper'].includes(entity.type))mobs.remove(entity);
    scheduleSave();chat(`難易度を ${difficulty} に設定しました`);break;
  }
  case 'weather':{if(!['clear','rain','thunder'].includes(parts[0])||parts.length!==1){chat('使用法 /weather clear|rain|thunder');break}weather=parts[0];updateSun();scheduleSave();chat(`天気を ${weather} に設定しました`);break}
  case 'save':saveData();chat('ワールドを保存しました');break;
  case 'spawnpoint':case 'setworldspawn':{
    const target=parts.length===0?location:xyz();
    const coordinates=Array.isArray(target)?target:[target.x,target.y,target.z];
    if((parts.length!==0&&parts.length!==3)||!coordinates.every(Number.isFinite)||coordinates[1]<1||coordinates[1]>100){chat(`使用法 /${cmd} [x y z]`);break}
    spawnPosition={x:target.x??target[0],y:target.y??target[1],z:target.z??target[2]};
    scheduleSave();
    chat(`スポーン位置を ${spawnPosition.x} ${spawnPosition.y} ${spawnPosition.z} に設定しました`);
    break;
  }
  case 'kill':{
    if(parts[0]==='@e'&&parts.length===1){
      const count=mobs.entities.length;
      mobs.clear();scheduleSave();chat(`${count} 体のMobを削除しました`);break;
    }
    if(parts.length&&parts[0]!=='@s'){chat('使用法 /kill [@s|@e]');break}
    respawn();
    chat('スポーン地点に戻りました');break;
  }
  case 'locate':{
    const target=parts[1]?.replace(/^minecraft:/,'');
    if(parts[0]==='structure'&&target==='desert_well'&&parts.length===2){
      if(worldgenVersion<5){chat('このワールドには砂漠の井戸が生成されません');break}
      const well=locateDesertWell(location.x,location.z);
      if(!well){chat('近くに砂漠の井戸が見つかりませんでした');break}
      chat(`desert_well の位置 [${well.x}, ${well.y}, ${well.z}] (${Math.round(Math.hypot(well.x-location.x,well.z-location.z))} ブロック先)`);
      break;
    }
    if(parts[0]!=='biome'||!['plains','forest','desert','snowy_plains','mountains'].includes(target)||parts.length!==2){chat('使用法 /locate biome <biome> または /locate structure desert_well');break}
    if(worldgenVersion<4&&target!=='plains'){chat('このワールドには指定したバイオームがありません');break}
    const found=locateBiome(target,location.x,location.z);
    if(!found){chat(`1024ブロック以内に ${target} が見つかりませんでした`);break}
    const distance=Math.round(Math.hypot(found.x-location.x,found.z-location.z));
    chat(`${target} の位置 [${found.x}, ~, ${found.z}] (${distance} ブロック先)`);
    break;
  }
  default:chat(`不明なコマンド: /${cmd}。/help を参照してください`)} }
function updateSun(){const a=(timeOfDay/24000)*Math.PI*2;const elevation=Math.sin(a);sun.position.set(location.x+Math.cos(a)*80,Math.max(5,elevation*85),location.z+35);sun.intensity=Math.max(.13,elevation*2.35);const daylight=clamp((elevation+.2)*1.25,0,1)*(weather==='thunder'?.52:weather==='rain'?.78:1);ambientLight.intensity=(.18+daylight*1.55)*(.7+settings.brightness*.006);sun.castShadow=settings.shadows&&daylight>.07;scene.background.setRGB(THREE.MathUtils.lerp(.035,.53,daylight),THREE.MathUtils.lerp(.06,.76,daylight),THREE.MathUtils.lerp(.16,.92,daylight));scene.fog.color.copy(scene.background);atmosphere.update(new THREE.Vector3().subVectors(sun.position,sun.target.position).normalize(),weather);waterMaterial.color.set(daylight>.4?0x3b8cbb:0x1b405e);if(reflectedWater)reflectedWater.material.uniforms.color.value.set(daylight>.4?0x3b8cbb:0x1b405e);skyClouds.visible=daylight>.25}
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
      const action=Object.keys(DEFAULT_CONTROLS).find(name=>DEFAULT_CONTROLS[name]===btn.dataset.key);
      const code=action?settings.controls[action]:btn.dataset.key;
      if(code){keys.add(code);held.set(event.pointerId,code);return}
      switch(btn.dataset.action){
        case 'break':interact(false);break;
        case 'pick':pickBlock();break;
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
let last=performance.now(),frames=0,fps=0,second=0,daylightRefresh=0,worldAutosave=0;
let titlePreviewReady=false;
function initializeTitlePreview(){
  if(active)return;
  worldgenVersion=6;
  seed=terrainSeed(328947n,6);
  // Choose a grassy valley with trees for the title preview, instead of
  // assuming the origin is an appealing biome for this seed.
  let previewPoint={x:8,z:8,score:-Infinity};
  for(let x=-96;x<=96;x+=16)for(let z=-96;z<=96;z+=16){
    const h=height(x,z),region=biome(x,z);
    if(surface(x,z)!=='grass'||h<SEA+4||h>23)continue;
    let treeCount=0;
    for(let dx=-8;dx<=8;dx+=4)for(let dz=-8;dz<=8;dz+=4)
      if(treeAt(x+dx,z+dz))treeCount++;
    const score=treeCount*8+(region==='forest'?12:0)-Math.abs(h-17)-Math.hypot(x,z)*.02;
    if(score>previewPoint.score)previewPoint={x,z,score};
  }
  location={x:previewPoint.x+.5,y:height(previewPoint.x,previewPoint.z)+9,z:previewPoint.z+.5};
  camera.position.set(location.x,location.y,location.z);
  camera.rotation.order='YXZ';
  camera.rotation.set(-.24,.65,0,'YXZ');
  timeOfDay=6500;
  updateSun();
  pendingChunks=[];
  const pcx=Math.floor(location.x/CHUNK),pcz=Math.floor(location.z/CHUNK);
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)pendingChunks.push([pcx+dx,pcz+dz]);
  pendingChunks.sort((a,b)=>(a[0]-pcx)**2+(a[1]-pcz)**2-(b[0]-pcx)**2-(b[1]-pcz)**2);
}
function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.05);last=now;
  if(!active&&pendingChunks.length){
    loadNextChunk();
    if(!titlePreviewReady&&loaded.size){titlePreviewReady=true;$('#menu').classList.add('preview-ready')}
  }
  if(!active&&titlePreviewReady){
    camera.rotation.y=.65+Math.sin(now*.00013)*.17;
    skyClouds.position.x+=dt*.22;
  }
  if(active&&!paused&&!inventoryOpen&&!chatOpen){loadNextChunk();updateEffects(dt);const forward=Number(keys.has(settings.controls.forward)||keys.has('ArrowUp'))-Number(keys.has(settings.controls.backward)||keys.has('ArrowDown'));const strafe=Number(keys.has(settings.controls.right)||keys.has('ArrowRight'))-Number(keys.has(settings.controls.left)||keys.has('ArrowLeft'));const length=Math.hypot(forward,strafe)||1;const sprinting=(keys.has(settings.controls.sprint))&&(mode==='creative'||foodLevel>6);const speed=(sprinting?10:5.4)*Math.max(.1,1+(effectLevel('speed')+1)*.2-(effectLevel('slowness')+1)*.15);const dx=(Math.sin(yaw)*forward+Math.cos(yaw)*strafe)*speed*dt/length;const dz=(-Math.cos(yaw)*forward+Math.sin(yaw)*strafe)*speed*dt/length;
    updateHunger(dt,!!(forward||strafe),sprinting);
    playerDamageCooldown=Math.max(0,playerDamageCooldown-dt);
    mobs.update(dt,now/1000,location,(amount)=>{
      if(difficulty==='peaceful')return;
      damagePlayer(difficulty==='easy'?Math.min(amount/2+1,amount):difficulty==='hard'?amount*1.5:amount);
    });
    if(doDaylightCycle){
      timeOfDay=(timeOfDay+dt*20)%24000;
      daylightRefresh+=dt;
      if(daylightRefresh>=.2){updateSun();daylightRefresh=0}
    }
    worldAutosave+=dt;
    if(worldAutosave>=30){saveData();worldAutosave=0}
    if(fly){fallDistance=0;location.x+=dx;location.z+=dz;location.y+=(Number(keys.has(settings.controls.jump))-Number(keys.has(settings.controls.sneak)))*speed*dt;vy=0}else{
      const swimming=playerInWater();
      moveHorizontal(dx*(swimming?.55:1),dz*(swimming?.55:1));
      if(swimming){
        // Drag and buoyancy make water traversal distinct from falling through air.
        vy=Math.max(-2.5,vy-5*dt);
        if(keys.has(settings.controls.jump))vy=Math.min(3.4,vy+18*dt);
        if(keys.has(settings.controls.sneak))vy=Math.max(-3.4,vy-18*dt);
        vy*=Math.pow(.82,dt*20);
      }else{
        if(keys.has(settings.controls.jump)&&grounded){vy=8.2+Math.max(0,effectLevel('jump_boost')+1)*1.3;grounded=false}
        vy-=22*dt;
      }
      const previousY=location.y;
      grounded=false;
      moveVertical(vy*dt);
      if(vy===0&&playerCollides(location.x,location.y-.025,location.z))grounded=true;
      if(swimming||vy>0){fallDistance=0}
      else if(!grounded){fallDistance+=Math.max(0,previousY-location.y)}
      else {
        fallDistance+=Math.max(0,previousY-location.y);
        const fallDamage=Math.ceil(fallDistance-3);
        fallDistance=0;
        if(fallDamage>0)damagePlayer(fallDamage);
      }
    }
    location.y=clamp(location.y,1.8,110);camera.position.set(location.x,location.y,location.z);camera.rotation.set(pitch,yaw,0,'YXZ');updateChunks();blockLighting.update(location,getBlock);updateRain(dt);skyClouds.position.x+=dt*.35;waterSurface.update(now*.001);water.material.opacity=.70+Math.sin(now*.0018)*.04;if(reflectedWater){reflectedWater.visible=location.y>SEA+.2;water.visible=!reflectedWater.visible;reflectedWater.material.uniforms.time.value=now*.001}second+=dt;frames++;if(second>.5){fps=Math.round(frames/second);second=0;frames=0;$('#coords').innerHTML=`${worldName}<br>XYZ ${location.x.toFixed(1)} / ${location.y.toFixed(1)} / ${location.z.toFixed(1)}<br>FPS ${fps} · ${mode} · Seed ${seed64}`}}renderer.render(scene,camera)}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});initializeTitlePreview();requestAnimationFrame(animate);
window.addEventListener('beforeunload',saveData);
