import * as THREE from 'three';

const types={
  pig:{body:0xe9a1a5,head:0xefb0b1,legs:0xc9878c,height:1.1},
  cow:{body:0x55453d,head:0x625247,legs:0x40352d,height:1.4},
  sheep:{body:0xe9e9df,head:0xc5bca9,legs:0xb8afa0,height:1.25},
  zombie:{body:0x407c63,head:0x6ca87b,legs:0x374a87,height:1.8,upright:true},
  creeper:{body:0x65a844,head:0x65a844,legs:0x4d8d35,height:1.7,upright:true},
};
const maximumHealth={pig:10,cow:10,sheep:8,zombie:20,creeper:20};
const box=new THREE.BoxGeometry(1,1,1);
const materials=new Map();
function material(color){
  if(!materials.has(color))materials.set(color,new THREE.MeshLambertMaterial({color}));
  return materials.get(color);
}
function cuboid(parent,color,size,position){
  const mesh=new THREE.Mesh(box,material(color));
  mesh.scale.set(...size);
  mesh.position.set(...position);
  mesh.castShadow=true;
  mesh.receiveShadow=true;
  parent.add(mesh);
  return mesh;
}

export class MobWorld {
  constructor(scene,getBlock,isSolid){
    this.root=new THREE.Group();
    scene.add(this.root);
    this.entities=[];
    this.getBlock=getBlock;
    this.isSolid=isSolid;
  }

  static supports(type){return Object.hasOwn(types,type)}

  clear(){
    for(const mob of this.entities)this.root.remove(mob.group);
    this.entities.length=0;
  }

  spawn(type,x,y,z,id=crypto.randomUUID(),health=maximumHealth[type]){
    if(!MobWorld.supports(type)||![x,y,z].every(Number.isFinite))return null;
    if(this.entities.length>=128)return null;
    const config=types[type];
    const group=new THREE.Group();
    group.position.set(x,y,z);
    const legs=[];
    if(config.upright){
      cuboid(group,config.body,[.6,.75,.33],[0,1.05,0]);
      cuboid(group,config.head,[.55,.55,.55],[0,1.7,0]);
      for(const lx of [-.18,.18]){
        legs.push(cuboid(group,config.legs,[.26,.72,.27],[lx,.36,0]));
        cuboid(group,config.head,[.22,.68,.25],[lx*2.35,1.06,0]);
      }
      if(type==='creeper'){
        for(const lx of [-.19,.19])for(const lz of [-.21,.21]){
          legs.push(cuboid(group,config.legs,[.26,.42,.26],[lx,.21,lz]));
        }
      }
    }else{
      cuboid(group,config.body,[.9,.65,1.2],[0,config.height-.43,0]);
      cuboid(group,config.head,[.65,.65,.65],[0,config.height-.26,-.71]);
      for(const lx of [-.32,.32])for(const lz of [-.4,.4]){
        legs.push(cuboid(group,config.legs,[.24,.55,.25],[lx,.28,lz]));
      }
      if(type==='cow'){
        cuboid(group,0xd7d0bd,[.35,.18,.39],[0,config.height-.81,0]);
        cuboid(group,0xe3c9bd,[.49,.28,.2],[0,config.height-.43,-1.08]);
      }
      if(type==='pig')cuboid(group,0xf3b4b6,[.35,.27,.2],[0,config.height-.35,-1.1]);
    }
    group.userData.entityId=id;
    this.root.add(group);
    const entity={id,type,x,y,z,health:Number.isFinite(health)?Math.max(1,Math.min(health,maximumHealth[type])):maximumHealth[type],group,legs,phase:Math.random()*Math.PI*2,heading:Math.random()*Math.PI*2,decisionTime:0,walking:false,attackCooldown:0};
    this.entities.push(entity);
    return entity;
  }

  remove(entity){
    if(!entity||!this.entities.includes(entity))return;
    this.root.remove(entity.group);
    this.entities.splice(this.entities.indexOf(entity),1);
  }

  damage(entity,amount){
    if(!entity||!this.entities.includes(entity))return false;
    entity.health-=amount;
    if(entity.health<=0){this.remove(entity);return true}
    return false;
  }

  entityForObject(object){
    let current=object;
    while(current&&current!==this.root){
      if(current.userData.entityId)return this.entities.find(entity=>entity.id===current.userData.entityId);
      current=current.parent;
    }
    return null;
  }

  save(){return this.entities.map(({id,type,x,y,z,health})=>({id,type,x,y,z,health}))}

  restore(data){
    this.clear();
    if(!Array.isArray(data))return;
    for(const entry of data.slice(0,128)){
      if(entry&&typeof entry==='object')this.spawn(entry.type,entry.x,entry.y,entry.z,entry.id,entry.health);
    }
  }

  groundAt(x,z,nearY){
    const bx=Math.floor(x),bz=Math.floor(z);
    for(let y=Math.min(100,Math.floor(nearY)+1);y>=Math.max(1,Math.floor(nearY)-3);y--){
      if(this.isSolid(this.getBlock(bx,y-1,bz))&&
         !this.isSolid(this.getBlock(bx,y,bz))&&
         !this.isSolid(this.getBlock(bx,y+1,bz)))return y;
    }
    return null;
  }

  update(dt,elapsed,player,onAttack){
    for(const entity of this.entities){
      // Keep distant mobs stationary, reducing animation cost on phones.
      if(Math.hypot(entity.x-player.x,entity.z-player.z)>40)continue;
      const playerDistance=Math.hypot(entity.x-player.x,entity.z-player.z);
      const chasing=entity.type==='zombie'&&playerDistance<12&&Math.abs(entity.y-player.y)<5;
      entity.attackCooldown=Math.max(0,entity.attackCooldown-dt);
      if(chasing&&playerDistance<1.7&&entity.attackCooldown===0){
        entity.attackCooldown=1.1;
        onAttack?.(3,entity);
      }
      entity.decisionTime-=dt;
      if(chasing){
        entity.heading=Math.atan2(player.x-entity.x,-(player.z-entity.z));
        entity.walking=playerDistance>1.5;
      }else if(entity.decisionTime<=0){
        entity.decisionTime=1.5+Math.random()*3;
        entity.heading+=Math.random()*2.4-1.2;
        entity.walking=Math.random()>.3;
      }
      const speed=chasing?1.2:.65;
      const step=speed*dt;
      let moved=false;
      if(entity.walking){
        const x=entity.x+Math.sin(entity.heading)*step;
        const z=entity.z-Math.cos(entity.heading)*step;
        const ground=this.groundAt(x,z,entity.y);
        if(ground!==null&&Math.abs(ground-entity.y)<=1.01){
          entity.x=x;
          entity.z=z;
          entity.y=THREE.MathUtils.lerp(entity.y,ground,Math.min(1,dt*8));
          moved=true;
        }else if(!chasing){
          entity.walking=false;
          entity.decisionTime=0;
          entity.heading+=Math.PI*.7;
        }
      }
      const ground=this.groundAt(entity.x,entity.z,entity.y);
      if(ground!==null&&Math.abs(ground-entity.y)<3){
        entity.y=THREE.MathUtils.lerp(entity.y,ground,Math.min(1,dt*8));
      }else if(entity.y>1){
        entity.y=Math.max(1,entity.y-5*dt);
      }
      entity.group.position.set(entity.x,entity.y,entity.z);
      entity.group.rotation.y=entity.heading;
      const swing=moved?Math.sin(elapsed*7+entity.phase)*.35:0;
      entity.legs.forEach((leg,index)=>{leg.rotation.x=(index%2?1:-1)*swing});
    }
  }
}
