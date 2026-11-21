const {chromium}=require('playwright-core');

(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-webgl','--use-angle=swiftshader']});
  try{
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:4181/',{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='test-jar';document.body.append(input)});
    await page.locator('#test-jar').setInputFiles(process.env.APPDATA+'/.minecraft/versions/1.21.11/1.21.11.jar');
    const result=await page.evaluate(async()=>{
      const {loadJavaResources}=await import('/src/javaAssets.js');
      const resources=await loadJavaResources(document.querySelector('#test-jar').files[0]);
      const result={
        furnace:resources.validBlockProperties('furnace',{facing:'north',lit:'true'}),
        furnaceInvalid:resources.validBlockProperties('furnace',{lit:'bogus'}),
        furnaceUnknown:resources.validBlockProperties('furnace',{invented:'true'}),
        wheatAge:resources.validBlockProperties('wheat',{age:'7'}),
        wheatInvalid:resources.validBlockProperties('wheat',{age:'8'}),
        stoneAxis:resources.validBlockProperties('stone',{axis:'x'}),
        stoneDefault:resources.validBlockProperties('stone',{}),
        wire:resources.validBlockProperties('redstone_wire',{north:'side',power:'15'}),
      };
      resources.dispose();return result;
    });
    console.log(result);
    const expected={furnace:true,furnaceInvalid:false,furnaceUnknown:false,wheatAge:true,wheatInvalid:false,stoneAxis:false,stoneDefault:true,wire:true};
    for(const [key,value] of Object.entries(expected))if(result[key]!==value)throw new Error(`${key}: expected ${value}, got ${result[key]}`);
  }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exitCode=1});
