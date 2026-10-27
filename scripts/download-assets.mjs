/** Download validated upstream assets; no Python installation is needed. */
import {readFile, mkdir, writeFile, rename, rm} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import JSZip from 'jszip'

const root = fileURLToPath(new URL('../', import.meta.url))
const source = await readFile(path.join(root, 'src/util.ts'), 'utf8')
const versions = [...new Set([...source.matchAll(/vanillaDatapack: "(\w+)"/g)].map(m => m[1]))]
if (!versions.length) throw Error('No vanilla versions found in src/util.ts')
const files = versions.flatMap(v => [`vanilla_datapacks/vanilla_${v}.zip`, ...['overworld', 'nether'].map(d => `biome_parameters/minecraft_${v}/${d}.json`)])
for (const [v, pack] of [['1_19','update_1_20'],['1_20_4','update_1_21'],['1_20_6','update_1_21'],['1_21_3','winter_drop']]) files.push(`vanilla_datapacks/vanilla_${v}_${pack}.zip`)
for (const [v, preset] of [['1_19','overworld_update_1_20'],['1_21_3','overworld_winter_drop']]) files.push(`biome_parameters/minecraft_${v}/${preset}.json`)
const base = new URL(process.env.ASSET_BASE_URL || 'https://map.jacobsjo.eu/')
const concurrency = Number(process.env.ASSET_CONCURRENCY || 4)
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw Error('ASSET_CONCURRENCY must be 1–16')
async function validate(file, bytes) {
    if (file.endsWith('.zip')) {
        const zip = await JSZip.loadAsync(bytes, {checkCRC32: true})
        const meta = zip.file('pack.mcmeta')
        if (!meta) throw Error(`${file}: missing pack.mcmeta`)
        JSON.parse(await meta.async('string'))
    } else {
        const json = JSON.parse(bytes.toString())
        if (!Array.isArray(json.biomes)) throw Error(`${file}: missing biome parameters`)
    }
}
let cached = 0, downloaded = 0
async function download(file) {
    const target = path.join(root, 'public', file)
    try {await validate(file, await readFile(target)); cached++; return} catch (e) {
        if (e.code !== 'ENOENT') console.warn(`重新下载无效文件：${file}`)
    }
    for (let attempt = 0; attempt < 3; attempt++) {
        const temp = `${target}.${process.pid}.tmp`
        try {
            const response = await fetch(new URL(file, base), {signal: AbortSignal.timeout(120000)})
            if (!response.ok) throw Error(`${response.status} ${file}`)
            const bytes = Buffer.from(await response.arrayBuffer())
            await validate(file, bytes)
            await mkdir(path.dirname(target), {recursive: true})
            await writeFile(temp, bytes)
            await rename(temp, target)
            downloaded++; console.log(`已下载 ${file}`)
            return
        } catch (e) {
            await rm(temp, {force: true})
            if (attempt === 2) throw e
        }
    }
}
const queue = [...files]
await Promise.all(Array.from({length: concurrency}, async () => {while (queue.length) await download(queue.shift())}))
console.log(`原版资源就绪：${cached} 个已验证，${downloaded} 个已下载。`)
