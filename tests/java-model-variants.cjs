const {chromium}=require('playwright-core');

(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-webgl','--use-angle=swiftshader']});
  try{
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:4190/',{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='test-jar';document.body.append(input)});
    await page.locator('#test-jar').setInputFiles(process.env.APPDATA+'/.minecraft/versions/1.21.11/1.21.11.jar');
    const models=await page.evaluate(async()=>{
      const {loadJavaResources}=await import('/src/javaAssets.js');
      const resources=await loadJavaResources(document.querySelector('#test-jar').files[0]);
      const get=async(id,state)=>{
        const model=await resources.ensure(id,state);
        return model?.elements.map(element=>({x:element.x,y:element.y,from:element.from,to:element.to,tiles:Object.values(element.faces).map(face=>`${face.tile.col},${face.tile.row}`)}));
      };
      const result={
        northDoor:await get('oak_door',{facing:'north'}),
        southDoor:await get('oak_door',{facing:'south'}),
        upperDoor:await get('oak_door',{facing:'north',half:'upper'}),
        northFurnace:await get('furnace',{facing:'north'}),
        southFurnace:await get('furnace',{facing:'south'}),
        oakLogX:await get('oak_log',{axis:'x'}),
        oakLogY:await get('oak_log',{axis:'y'}),
      };
      resources.dispose();return result;
    });
    const rotation=name=>models[name]?.[0]?.y;
    const expected=Object.entries(models).every(([,geometry])=>geometry?.length);
    const facingDiff=rotation('northDoor')!==rotation('southDoor')&&rotation('northFurnace')!==rotation('southFurnace');
    const halfDiff=JSON.stringify(models.upperDoor)!==JSON.stringify(models.northDoor);
    const axisDiff=JSON.stringify(models.oakLogX)!==JSON.stringify(models.oakLogY);
    console.log(JSON.stringify({rotations:Object.fromEntries(Object.keys(models).map(name=>[name,rotation(name)])),expected,facingDiff,halfDiff,axisDiff}));
    if(!expected||!facingDiff||!halfDiff||!axisDiff)throw Error('Java model variants do not match requested states');
  } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
