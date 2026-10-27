/** Start isolated app servers, run browser regressions, and clean up on failure. */
import {spawn} from 'node:child_process'
const servers = []
const devPort = Number(process.env.TEST_DEV_PORT || 5174)
const previewPort = Number(process.env.TEST_PREVIEW_PORT || 4174)
async function start(args, port) {
    const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...args, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {stdio: 'inherit'})
    servers.push(child)
    for (let i = 0; i < 120; i++) {
        if (child.exitCode !== null) throw Error(`Server ${port} exited; check for a port conflict`)
        try {if ((await fetch(`http://127.0.0.1:${port}/`, {signal: AbortSignal.timeout(500)})).ok) return} catch {}
        await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw Error(`Server ${port} did not start`)
}
try {
    // Refuse to run against another server, which might serve an older build.
    for (const port of [devPort, previewPort]) {
        let busy = false
        try {await fetch(`http://127.0.0.1:${port}/`, {signal: AbortSignal.timeout(500)}); busy = true} catch {}
        if (busy) throw Error(`请先关闭端口 ${port} 上的地图服务，再运行浏览器回归测试。`)
    }
    await start([], devPort)
    await start(['preview'], previewPort)
    for (const name of ['browser-smoke', 'route-browser', 'map-status-browser', 'ui-browser', 'production-smoke', 'route-production']) {
        console.log(`\n验证：${name}`)
        await new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [`tests/browser/${name}.mjs`], {stdio: 'inherit', env: {...process.env, MAP_URL: `http://127.0.0.1:${devPort}/`, PREVIEW_URL: `http://127.0.0.1:${previewPort}/`}})
            child.once('error', reject)
            child.once('exit', code => code === 0 ? resolve() : reject(Error(`${name}: exit ${code}`)))
        })
    }
} finally {for (const server of servers) server.kill('SIGTERM')}
