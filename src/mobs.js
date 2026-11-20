import * as THREE from 'three';

const types={
  pig:{body:0xe9a1a5,head:0xefb0b1,legs:0xc9878c,height:1.1},
  cow:{body:0x55453d,head:0x625247,legs:0x40352d,height:1.4},
  sheep:{body:0xe9e9df,head:0xc5bca9,legs:0xb8afa0,height:1.25},
  zombie:{body:0x407c63,head:0x6ca87b,legs:0x374a87,height:1.8,upright:true},
  creeper:{body:0x65a844,head:0x65a844,legs:0x4d8d35,height:1.7,upright:true},
};
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
  constructor(scene,groundHeight){
    this.root=new THREE.Group();
    scene.add(this.root);
    this.entities=[];
    this.groundHeight=groundHeight;
  }

  static supports(type){return Object.hasOwn(types,type)}

  clear(){
    for(const mob of this.entities)this.root.remove(mob.group);
    this.entities.length=0;
  }

  spawn(type,x,y,z,id=crypto.randomUUID()){
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
    const entity={id,type,x,y,z,group,legs,phase:Math.random()*Math.PI*2,heading:Math.random()*Math.PI*2};
    this.entities.push(entity);
    return entity;
  }

  remove(entity){
    this.root.remove(entity.group);
    this.entities.splice(this.entities.indexOf(entity),1);
  }

  save(){return this.entities.map(({id,type,x,y,z})=>({id,type,x,y,z}))}

  restore(data){
    this.clear();
    if(!Array.isArray(data))return;
    for(const entry of data.slice(0,128)){
      if(entry&&typeof entry==='object')this.spawn(entry.type,entry.x,entry.y,entry.z,entry.id);
    }
  }

  update(dt,elapsed,player){
    for(const entity of this.entities){
      // Keep distant mobs stationary, reducing animation cost on phones.
      if(Math.hypot(entity.x-player.x,entity.z-player.z)>40)continue;
      const step=Math.sin(elapsed*.55+entity.phase);
      entity.group.rotation.y=entity.heading+step*.3;
      const swing=Math.sin(elapsed*4+entity.phase)*.16;
      entity.legs.forEach((leg,index)=>{leg.rotation.x=(index%2?1:-1)*swing});
    }
  }
}
