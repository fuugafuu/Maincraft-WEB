const {chromium}=require('playwright-core');

(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-webgl','--use-angle=swiftshader']});
  try{
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:4190/',{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='test-jar';document.body.append(input)});
    await page.locator('#test-jar').setInputFiles(process.env.APPDATA+'/.minecraft/versions/1.21.11/1.21.11.jar');
    const result=await page.evaluate(async()=>{
      const {loadJavaResources}=await import('/src/javaAssets.js');
      const assets=await loadJavaResources(document.querySelector('#test-jar').files[0]);
      const stone=await assets.ensure('stone');
      const dirt=await assets.ensure('dirt');
      const signatures=new Set();
      const count=[];
      for(let x=0;x<32;x++){
        const out={pos:[],uv:[],color:[]};
        assets.addBlock(out,stone,x,12,7,()=> 'air','stone');
        signatures.add(JSON.stringify(out.uv));
        count.push(out.pos.length/3);
      }
      const output={stoneChoices:stone.weights?.length,dirtChoices:dirt.weights?.length,fullCube:stone.fullCube,uniqueUv:signatures.size,minVertices:Math.min(...count),maxVertices:Math.max(...count)};
      assets.dispose();return output;
    });
    console.log(result);
    if(result.stoneChoices!==4||result.dirtChoices!==4||!result.fullCube||result.uniqueUv<2||result.minVertices!==36||result.maxVertices!==36){
      throw new Error('Java weighted block variants were not rendered consistently');
    }
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
