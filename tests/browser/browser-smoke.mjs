import {launchBrowser, DEV_URL, PREVIEW_URL} from './helpers.mjs'
import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
const browser = await launchBrowser()
try {
const page = await browser.newPage({viewport: {width: 1440, height: 900}})
const errors=[]
page.on('pageerror', e => errors.push(e.message))
await page.goto(DEV_URL)
await page.locator('.coordinate-jump').waitFor({timeout: 60000})
const state = fn => page.locator('#map').evaluate((el, code) => new Function('s', `return (${code})(s)`)(el.__vueParentComponent.setupState), fn.toString())
const settle = async () => {
    try { await page.waitForFunction(() => {
        const s=document.querySelector('#map')?.__vueParentComponent.setupState
        if(!s?.biomeLayer) return false
        const tiles=Object.values(s.biomeLayer.Tiles)
        return tiles.length && tiles.every(t=>t.surfaceValues) && [...s.marker_map.values()].every(m=>!m.pending)
    }, null, {timeout:60000}) } catch(error) { console.log('DIAGNOSTIC', await state(s=>({generation:s.biomeLayer.generationVersion, tiles:Object.entries(s.biomeLayer.Tiles).map(([key,t])=>({key,id:t.requestId,loaded:!!t.surfaceValues})), pending:[...s.marker_map.values()].filter(m=>m.pending).length})), errors); throw error }
    await page.waitForTimeout(150)
}
await settle(); console.log("settled")
await page.getByRole('textbox', {name: 'X', exact:true}).fill('12345')
await page.getByRole('textbox', {name: 'Z', exact:true}).fill('-6789')
await page.getByRole('button', {name:'确定', exact:true}).click()
assert.deepEqual(await state(s=>[s.map.getCenter().lng,-s.map.getCenter().lat]), [12345,-6789])
await page.getByRole('textbox', {name: 'X', exact:true}).fill('Infinity')
await page.getByRole('button', {name:'确定', exact:true}).click()
await page.getByRole('alert').waitFor()
assert.deepEqual(await state(s=>[s.map.getCenter().lng,-s.map.getCenter().lat]), [12345,-6789])
await state(s=>{s.searchStore.structures.add('minecraft:village_plains');s.searchStore.priorities['minecraft:village_plains']='high';s.show_graticule=true;s.do_hillshade=false})
await page.locator('summary').filter({hasText:'结构图标优先级'}).click()
await page.getByRole('combobox', {name:'结构图标优先级 minecraft:village_plains'}).selectOption('low')
await page.waitForTimeout(250)
assert.equal(await state(s=>s.markers.getLayers().length),0)
await page.getByRole('combobox', {name:'结构图标优先级 minecraft:village_plains'}).selectOption('high')
await state(s=>{s.map.setView([0,0],-3,{animate:false})})
await settle(); console.log("settled")
assert.ok(await state(s=>s.markers.getLayers().length)>0, 'high priority structures should be visible')
const stats=[]
for(let i=0;i<8;i++) {
    await state(s=>{s.map.panBy([700,300],{animate:false})})
    await settle(); console.log("settled")
    const snapshot=await state(s=>({tiles:Object.keys(s.biomeLayer.Tiles).length, leafletTiles:Object.keys(s.biomeLayer._tiles).length, markers:s.markers.getLayers().length, records:s.marker_map.size, referencedMarkers:[...s.marker_map.values()].filter(m=>m.marker).length, workers:s.biomeLayer.workers.length}))
    assert.equal(snapshot.markers,snapshot.referencedMarkers,'offscreen marker retained by layer group')
    assert.equal(snapshot.tiles,snapshot.leafletTiles,'orphan tile retained')
    assert.ok(snapshot.tiles<100,'tile cache must stay bounded')
    stats.push(snapshot); console.log("pan",i,snapshot)
}
const expected=await state(s=>({x:s.map.getCenter().lng,z:-s.map.getCenter().lat,zoom:s.map.getZoom()}))
await page.reload()
await page.locator('.coordinate-jump').waitFor({timeout:60000})
await settle(); console.log("settled")
assert.deepEqual(await state(s=>({x:s.map.getCenter().lng,z:-s.map.getCenter().lat,zoom:s.map.getZoom()})),expected)
assert.equal(await state(s=>s.searchStore.priorities['minecraft:village_plains']),'high')
assert.equal(await state(s=>s.show_graticule),true)
assert.equal(await state(s=>s.do_hillshade),false)
assert.ok(await state(s=>s.searchStore.structures.has('minecraft:village_plains')))
// Exercise rapid setting changes while tiles are queued.
await state(s=>{for(let i=0;i<10;i++){s.y=64+i;s.map.panBy([100,0],{animate:false})}s.project_down=false})
await settle(); console.log("settled")
assert.ok(await state(s=>Object.values(s.biomeLayer.Tiles).every(t=>t.surfaceValues instanceof Float64Array && t.biomeValues instanceof Uint16Array)))
const payloadBytes=await state(s=>{const t=Object.values(s.biomeLayer.Tiles)[0];return t.surfaceValues.byteLength+t.terrainValues.byteLength+t.biomeValues.byteLength})
await page.screenshot({path:'tests/results/map-smoke.png'})
assert.deepEqual(errors,[])
await writeFile('tests/results/browser-results.json',JSON.stringify({passed:true,checks:['coordinate jump','invalid coordinates','priority visibility','marker and tile cleanup over 8 pans','reload persistence','rapid updates','typed transferable arrays'],stats,payloadBytes,errors},null,2))
console.log(JSON.stringify({passed:true,stats,payloadBytes,errors},null,2))
} finally { await browser.close() }
