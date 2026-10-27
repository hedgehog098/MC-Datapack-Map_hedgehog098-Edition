import {test} from 'node:test'
import assert from 'node:assert/strict'
import {optimizeRoute, routeLength, stopKey, rememberedKeys, rememberRun, squareRing, scanLocations, distance} from '../../src/util/structureRoutes.ts'
const p=(x,z,id='village')=>({x,z,id})
test('open TSP route keeps every point, preserves input and improves a crossing route',()=>{
    const origin=p(0,0), points=[p(100,100),p(0,100),p(100,0),p(50,50),p(-100,50)]
    const before=structuredClone(points), result=optimizeRoute(origin,points)
    assert.deepEqual(points,before)
    assert.deepEqual(new Set(result.map(stopKey)),new Set(points.map(stopKey)))
    assert.ok(routeLength(origin,result)<=routeLength(origin,points))
    assert.deepEqual(optimizeRoute(origin,[]),[])
    assert.deepEqual(optimizeRoute(origin,[p(1,2)]),[p(1,2)])
})
test('keeps exactly two nonempty runs and excludes across groups only in same world',()=>{
    let memories=[]
    for(let i=0;i<3;i++) memories=rememberRun(memories,{world:'A',created:i,origin:p(0,0),stops:[p(i,0)]})
    assert.equal(memories.length,2)
    assert.deepEqual([...rememberedKeys(memories,'A')].sort(),[stopKey(p(1,0)),stopKey(p(2,0))].sort())
    assert.equal(rememberedKeys(memories,'B').size,0)
    assert.equal(rememberRun(memories,{world:'A',created:4,origin:p(0,0),stops:[]}),memories)
    memories=rememberRun(memories,{world:'B',created:5,origin:p(0,0),stops:[p(9,9)]})
    assert.equal(rememberedKeys(memories,'A').size,1)
})
test('square rings cover grid once including negative coordinates',()=>{
    const cells=[]
    for(let r=0;r<=4;r++) cells.push(...squareRing(r))
    assert.equal(cells.length,81)
    assert.equal(new Set(cells.map(String)).size,81)
    assert.ok(cells.some(([x,z])=>x===-4&&z===-4))
})
const scan=async(points,overrides={},cancelled=()=>false)=>scanLocations({origin:p(0,0),radius:3000,limit:50,minDistance:0,excluded:new Set(),...overrides},{
    *candidates(b){yield* points.filter(p=>p.x>=b.minX&&p.x<=b.maxX&&p.z>=b.minZ&&p.z<=b.maxZ)},
    locate:p=>p,cancelled,progress:()=>{}
})
test('scans circular radius across negative cell boundaries; excludes memory and duplicate hits',async()=>{
    const origin=p(-1,-1), points=[p(-2048,-1),p(0,0),p(0,0),p(2999,-1),p(3000,-1),p(-1,-3001),p(2800,2800)]
    const result=await scan(points,{origin,excluded:new Set([stopKey(p(0,0))])})
    assert.equal(result.reason,'radius')
    assert.deepEqual(new Set(result.stops.map(stopKey)),new Set([p(-2048,-1),p(2999,-1),p(-1,-3001)].map(stopKey)))
})
test('limit, minimum spacing, cancellation, empty range and invalid parameters',async()=>{
    let r=await scan([p(0,0),p(10,10),p(1000,0),p(2000,0)],{limit:2,minDistance:500})
    assert.equal(r.reason,'limit');assert.equal(r.stops.length,2)
    assert.ok(distance(...r.stops)>=500)
    r=await scan([p(0,0)],{},()=>true);assert.equal(r.reason,'cancelled');assert.equal(r.stops.length,0)
    r=await scan([]);assert.equal(r.reason,'radius')
    await assert.rejects(scan([],{radius:Infinity}))
    await assert.rejects(scan([],{limit:1.5}))
    await assert.rejects(scan([],{minDistance:4000}))
})
