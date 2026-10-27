import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readPreference, writePreference, finiteNumber, parseCoordinates, priorityMinZoom, stringList} from '../../src/util/preferences.ts'
test('coordinate validation accepts signed X/Z and rejects blank, non-finite and out-of-world inputs', () => {
    assert.deepEqual(parseCoordinates('12345', '-6789'), [12345, -6789])
    for (const x of ['', ' ', 'NaN', 'Infinity', '30000001', '-30000001']) assert.equal(parseCoordinates(x, '0'), undefined)
    assert.deepEqual(parseCoordinates('-30000000', '30000000'), [-30000000, 30000000])
})
test('higher priority is visible further out, with automatic density preserved', () => {
    assert.equal(priorityMinZoom('auto', -2.6), -2.6)
    assert.equal(priorityMinZoom('high', 0), -6)
    assert.equal(priorityMinZoom('medium', 0), -3)
    assert.equal(priorityMinZoom('low', 0), -1)
    assert.equal(priorityMinZoom('invalid', -2), -2)
})
test('storage writes only changes and survives corrupt or denied storage', () => {
    const values = new Map(); let writes = 0
    globalThis.localStorage = {getItem: k=>values.get(k)??null, setItem: (k,v)=>{writes++;values.set(k,v)}}
    writePreference('view', {x: 1,z: -2})
    writePreference('view', {x: 1,z: -2})
    assert.equal(writes, 1)
    assert.deepEqual(readPreference('view', {}), {x:1,z:-2})
    values.set('mc-datapack-map:v1:view', '{broken')
    assert.deepEqual(readPreference('view', {}), {})
    globalThis.localStorage = {getItem(){throw new Error('denied')}}
    assert.equal(readPreference('view', 'fallback'), 'fallback')
})
test('restored values are bounded and selected lists sanitized', () => {
    assert.equal(finiteNumber(Infinity, -2, -6, 1), -2)
    assert.equal(finiteNumber(-7, -2, -6, 1), -2)
    assert.equal(finiteNumber(-3, -2, -6, 1), -3)
    assert.deepEqual(stringList(['minecraft:village', null, 3]), ['minecraft:village'])
})
