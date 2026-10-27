import { get, set } from 'idb-keyval'
export type DatapackSource = {kind: 'zip', file: File} | {kind: 'folder', handle: FileSystemDirectoryHandle} | {kind: 'files', files: File[]} | {kind: 'url', url: string} | {kind: 'modrinth', slug: string}
export let restoredDatapacks: DatapackSource[] = []
export async function restoreDatapackSources() {
    try {
        const sources = await get('active-datapacks-v1')
        if (Array.isArray(sources)) {
            for (const source of sources) {
                if (!source || !['zip', 'folder', 'files', 'url', 'modrinth'].includes(source.kind)) continue
                if (source.kind === 'folder' && await source.handle.queryPermission({mode: 'read'}) !== 'granted') {
                    console.warn('Folder permission expired; reselect this datapack folder:', source.handle.name)
                    continue
                }
                restoredDatapacks.push(source)
            }
        }
    } catch (error) { console.warn('Could not restore datapacks', error) }
}
export async function saveDatapackSources(sources: DatapackSource[]) {
    try { await set('active-datapacks-v1', sources) }
    catch (error) { console.warn('Could not save active datapacks', error) }
}
