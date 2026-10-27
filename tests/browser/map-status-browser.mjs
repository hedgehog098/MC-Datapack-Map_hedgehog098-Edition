import {launchBrowser, DEV_URL, PREVIEW_URL} from './helpers.mjs'
import assert from 'node:assert/strict'
const browser = await launchBrowser()
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/mcicons/**',async request=>{await new Promise(r=>setTimeout(r,1000));await request.abort()})
 await page.goto(DEV_URL)
 await page.locator('.coordinate-jump').waitFor({timeout:60000})
 const state=fn=>page.locator('#map').evaluate((el,code)=>new Function('s',`return (${code})(s)`)(el.__vueParentComponent.setupState),fn.toString())
 await state(s=>{s.searchStore.structures.add('minecraft:village_plains');s.searchStore.priorities['minecraft:village_plains']='high';s.map.setZoom(-3,{animate:false})})
 await page.locator('.image-loading').waitFor({timeout:30000})
 await page.waitForFunction(()=>document.querySelector('#map').__vueParentComponent.setupState.imageErrors>0)
 assert.match(await page.locator('.info.unsupported').innerText(),/图片失败/)
 await state(s=>{s.searchStore.structures.clear()})
 await page.waitForTimeout(250)
 assert.equal(await state(s=>s.imageLoading),0);assert.equal(await state(s=>s.imageErrors),0)
 // The finite concentric-ring placement also works, independent of visible icon selection.
 await state(s=>{s.routeStore.selected=['minecraft:stronghold'];s.routeStore.limit=4;s.routeStore.radius=10000;void s.routeStore.start()})
 await page.waitForFunction(()=>!document.querySelector('#map').__vueParentComponent.setupState.routeStore.running,null,{timeout:120000})
 const rare=await state(s=>({count:s.routeStore.results.length,status:s.routeStore.status,error:s.routeStore.error,stops:s.routeStore.results.map(p=>({...p}))}))
 assert.equal(rare.error,'');assert.equal(rare.count,4);assert.equal(rare.status,'limit')
 assert.ok(rare.stops.every(p=>p.id==='minecraft:stronghold'&&Math.hypot(p.x,p.z)<=10000))
 // Coalesce rapid seed reloads and publish only the final loaded registry.
 await state(s=>{s.settingsStore.seed=1n;s.settingsStore.seed=2n;s.settingsStore.seed=3n})
 await page.waitForFunction(()=>{const s=document.querySelector('#map').__vueParentComponent.setupState;return !s.loadedDimensionStore.loading&&s.loadedDimensionStore.revision>=2},null,{timeout:60000})
 await state(s=>{s.routeStore.selected=['minecraft:village_plains'];s.routeStore.limit=1;void s.routeStore.start()})
 await page.waitForFunction(()=>!document.querySelector('#map').__vueParentComponent.setupState.routeStore.running,null,{timeout:60000})
 assert.equal(await state(s=>s.routeStore.error),'')
 assert.equal(await state(s=>s.routeStore.results.length),1)
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({passed:true,checks:['pending icon image notice','failed icon image notice','removed icon status cleanup','sparse concentric-ring structures','rapid seed changes followed by valid search'],rare,errors}))
} finally {await browser.close()}
