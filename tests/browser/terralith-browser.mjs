import {launchBrowser, DEV_URL, PREVIEW_URL} from './helpers.mjs'
import {readdir,writeFile,readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const folder=process.env.DATAPACK_DIR
if(!folder) throw Error('Set DATAPACK_DIR to the local ZIP folder')
const browser = await launchBrowser()
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>{delete window.showOpenFilePicker})
 await page.goto(DEV_URL + '?seed=471480205331863603')
 await page.locator('.coordinate-jump').waitFor({timeout:60000})
 const state=fn=>page.locator('#map').evaluate((el,code)=>new Function('s',`return (${code})(s)`)(el.__vueParentComponent.setupState),fn.toString())
 const files=(await readdir(folder)).filter(f=>f.endsWith('.zip')).sort((a,b)=>Number(b.includes('Terralith'))-Number(a.includes('Terralith')))
 for(const file of files){
  await page.evaluate(async ({name,base64})=>{
   const {Datapack}=await import('/node_modules/.vite/deps/mc-datapack-loader.js')
   const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0))
   const file=new File([bytes],name)
   const store=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('datapacks')
   store.addDatapack(Datapack.fromZipFile(file,107))
  },{name:file,base64:(await readFile(folder+'/'+file)).toString('base64')})
  await page.waitForTimeout(1500)
  await page.waitForFunction(()=>{const s=document.querySelector('#map')?.__vueParentComponent?.setupState;return s&&!s.loadedDimensionStore.loading},null,{timeout:120000})
  console.log('Loaded',file)
 }
 console.log('Loaded',files)
 await state(s=>{s.routeStore.selected=['spring','summer','autumn','winter'].map(v=>'terralith:mage_tower_'+v);s.routeStore.limit=50;s.routeStore.radius=70000;void s.routeStore.start()})
 await page.waitForFunction(()=>!document.querySelector('#map').__vueParentComponent.setupState.routeStore.running,null,{timeout:600000})
 const result=await state(s=>({seed:s.settingsStore.seed.toString(),status:s.routeStore.status,error:s.routeStore.error,results:s.routeStore.results.map(p=>({...p}))}))
 console.log('Search result',JSON.stringify(result))
 await writeFile('tests/results/terralith-results.json',JSON.stringify({files,...result},null,2))
 assert.equal(result.error,'');assert.ok(result.results.length>0)
 // Independently re-check real template generation and compare surface vs structure-height biomes.
 const evidence=await page.evaluate(async points=>{
  const source=await (await fetch('/src/util/structures.ts')).text()
  const moduleUrl=source.match(/from "([^"]*deepslate[^"]*)"/)[1]
  const {WorldgenStructure,Identifier}=await import(moduleUrl)
  const s=document.querySelector('#map').__vueParentComponent.setupState,d=s.loadedDimensionStore
  const context=new WorldgenStructure.GenerationContext(s.settingsStore.seed,d.getBiomeSource(),d.noise_generator_settings,d.loaded_dimension.level_height)
  return points.map(p=>{
   const structure=WorldgenStructure.REGISTRY.get(Identifier.parse(p.id))
   for(let cx=Math.floor(p.x/16)-3;cx<=Math.floor(p.x/16)+3;cx++)for(let cz=Math.floor(p.z/16)-3;cz<=Math.floor(p.z/16)+3;cz++){
    const pos=structure.tryGenerate(cx,cz,context)
    if(pos&&pos[0]===p.x&&pos[2]===p.z)return {...p,y:pos[1],biome:d.getBiomeSource().getBiome(pos[0]>>2,pos[1]>>2,pos[2]>>2,context.randomState.sampler).toString(),biomeAtY64:d.getBiomeSource().getBiome(pos[0]>>2,16,pos[2]>>2,context.randomState.sampler).toString()}
   }
   throw Error('Could not revalidate '+JSON.stringify(p))
  })
 },result.results)
 assert.deepEqual(errors,[])
 const report={files,...result,evidence,errors}
 await writeFile('tests/results/terralith-results.json',JSON.stringify(report,null,2))
 console.log(JSON.stringify(report))
}finally{await browser.close()}
