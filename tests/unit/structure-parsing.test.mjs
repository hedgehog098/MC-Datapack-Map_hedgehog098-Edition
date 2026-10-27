import test from 'node:test'
import assert from 'node:assert/strict'
import {Identifier, WorldgenRegistries, HolderSet, Holder, WorldgenStructure} from 'deepslate'
import {parseWorldgenStructure} from '../../src/util/structures.ts'

test('single biome, array and biome tag preserve valid structure biomes', () => {
 const id=Identifier.parse('regression:skylands')
 WorldgenRegistries.BIOME.register(id,{})
 WorldgenRegistries.BIOME.getTagRegistry().register(id,new HolderSet([Holder.reference(WorldgenRegistries.BIOME,id)]))
 for(const biomes of [id.toString(),[id.toString()],'#'+id]) {
  const s=parseWorldgenStructure({type:'minecraft:buried_treasure',biomes})
  assert.deepEqual([...s.settings.validBiomes.getEntries()].map(h=>h.key().toString()),[id.toString()])
 }
})

test('fixed-height skyland structures sample their own altitude, not surface biomes', () => {
 for(const y of [194,224,243,264]) {
  const id=Identifier.parse('regression:skylands')
  WorldgenRegistries.BIOME.register(id,{})
  const input={type:'minecraft:jigsaw',biomes:id.toString(),start_height:{absolute:y},start_pool:'regression:pool'}
  const s=parseWorldgenStructure(input)
  assert.equal(input.biomes,id.toString())
  assert.equal(s.projectStartToHeightmap,undefined)
  // Isolate the biome gate from pool geometry; the real pack is covered in the browser test.
  s.findGenerationPoint=()=>[8,y,8]
  const calls=[]
  const context={seed:1n,randomState:{sampler:{}},biomeSource:{getBiome(x,qy,z){calls.push([x,qy,z]);return qy===(y>>2)?id:Identifier.create('plains')}}}
  assert.deepEqual(s.tryGenerate(0,0,context),[8,y,8])
  assert.deepEqual(calls,[[2,y>>2,2]])
 }
})
