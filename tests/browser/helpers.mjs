import {createRequire} from 'node:module'
import {mkdir} from 'node:fs/promises'
const require = createRequire(import.meta.url)

export async function launchBrowser() {
    await mkdir('tests/results', {recursive: true})
    const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright')
    return chromium.launch({headless: true, ...(process.env.BROWSER_CHANNEL ? {channel: process.env.BROWSER_CHANNEL} : {})})
}

export const DEV_URL = process.env.MAP_URL || 'http://127.0.0.1:5173/'
export const PREVIEW_URL = process.env.PREVIEW_URL || 'http://127.0.0.1:4173/'
