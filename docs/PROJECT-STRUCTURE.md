# 项目结构

## 入口与配置

| 路径 | 职责 |
| --- | --- |
| `setup.command` | 一键配置；顶部统一设置 Node 备用版本、是否使用项目专用 Node、浏览器安装、检查开关、资源地址及下载并发数 |
| `启动地图.command` | 日常启动已构建地图；环境缺失时调用统一配置入口 |
| `package.json` / `package-lock.json` | 开发命令、依赖声明及精确锁定版本 |
| `vite.config.ts` | Vue、翻译、生产构建和离线缓存设置 |
| `README.md` | GitHub 首页：简明配置、使用方法与声明 |
| `readme_detail_CN.md` / `readme_detail_EN.md` | 中文使用说明、功能与性能边界 |
| `LICENSE.txt` / `NOTICE.md` | 原作者许可证及改版与第三方权利声明 |

## 运行时代码

- `src/components/`：界面与地图交互；`dropdown/` 和 `modrinth/` 分别放菜单与数据包下载界面。
- `src/stores/`：世界、数据包、视图、结构筛选与路线搜索状态。
- `src/MapLayers/`：地图瓦片和网格图层。
- `src/webworker/`：后台地形与群系计算。
- `src/util/structures.ts`：结构解析兼容处理与结构支持范围，统一放置。
- `src/util/structureRoutes.ts`：扫描、路线优化和两次记忆规则。
- `src/util/preferences.ts` / `datapackPersistence.ts`：小型设置与大体积数据包分别保存在 localStorage / IndexedDB，保留不同存储策略。
- `src/util.ts`：上游共享算法辅助函数与 Minecraft 版本表；资源下载从这里读取版本，避免维护第二份版本列表。
- `locales/`：翻译；`public/`：静态资源和下载的原版数据。

计算线程、图层、状态与存储各有独立生命周期，不合并成单一大文件。此次整理保留瓦片缓存、transferable buffer、分时扫描与取消机制。

## 工具、测试与生成文件

- `scripts/download-assets.mjs`：并发下载并校验 ZIP/JSON；有效文件复用，无效文件重新下载，校验通过后原子替换。
- `scripts/test-browser.mjs`：统一浏览器回归入口，负责启动与关闭服务。
- `scripts/createVanillaZips.py` / `scripts/requirements.txt`：上游高级资源生成工具，仅自行重建原版资源时需要 Python 与 `pip install -r scripts/requirements.txt`；常规安装不执行。
- `tests/unit/`：纯逻辑回归测试。
- `tests/browser/`：地图、界面、路线、加载状态、持久化和 Terralith 验证；共用 `helpers.mjs` 启动浏览器。
- `tests/fixtures/`：可复用的自制测试素材，不包含用户数据包。
- `tests/results/`：自动生成的 JSON 与截图，已忽略；历史记录保留在本地。
- `docs/terralith-report.md`：四季空岛法师塔的人工可读验证记录。
- `.tools/`：必要时下载的项目专用 Node；`node_modules/`：依赖；`dist/`：构建结果。均不提交。

## 一键配置选项

在 `setup.command` 顶部修改，或通过同名环境变量覆盖。日常使用无需调整默认值。

| 选项 | 默认值 | 行为 |
| --- | --- | --- |
| `NODE_VERSION` | `22.22.0` | 需要下载 Node 时使用的版本；不会把已有兼容运行环境强制切换到该版本 |
| `USE_PROJECT_NODE` | `0` | 设为 `1` 时确保存在项目专用 Node；项目专用 Node 存在时始终优先使用 |
| `INSTALL_BROWSER` | `1` | 安装 Playwright 使用的 Chromium；设为 `0` 可跳过，之后浏览器测试需自备浏览器 |
| `RUN_CHECKS` | `1` | 运行单元测试；设为 `0` 不跳过构建阶段的类型检查 |
| `START_DEV` | `0` | 配置完成后是否启动开发服务；`--dev` 会启用 |
| `ASSET_BASE_URL` | `https://map.jacobsjo.eu/` | 原版资源下载地址，使用以 `/` 结尾的资源根 URL |
| `ASSET_CONCURRENCY` | `4` | 下载并发，允许 1–16 |

示例：`INSTALL_BROWSER=0 bash setup.command`。默认会重装锁定依赖、校验全部原版资源、运行单元测试并生成生产版本，不自动运行全部浏览器回归。

缺少兼容 Node 时，会下载官方归档并核对 SHA-256，再放进 `.tools/node`，不修改全局环境。终端手动使用项目专用 Node：在根目录执行 `export PATH="$PWD/.tools/node/bin:$PATH"`。双击两个入口文件会自动设置本次进程的 PATH。

## 浏览器验证配置

`npm run test:browser` 使用 5174 / 4174，不占用日常 5173 / 4173。它运行地图、路线、加载状态、界面、生产持久化、生产路线六组测试，并在结束时关闭所启动的服务。先执行 `npm run build` 确保生产测试使用最新代码。

- `TEST_DEV_PORT` / `TEST_PREVIEW_PORT`：统一测试入口的两个端口，需不同且未被占用。
- `MAP_URL` / `PREVIEW_URL`：单独运行浏览器脚本时使用的页面地址；统一入口会为子测试设置这两个值。
- `PLAYWRIGHT_PATH`：可选的自备 Playwright 包路径；默认使用项目依赖。
- `BROWSER_CHANNEL`：可选的已安装浏览器通道，例如 `chrome`；默认使用配置入口安装的 Chromium。
- `DATAPACK_DIR`：Terralith 专项验证读取的本地 ZIP 文件夹，不属于常规六组回归。

第三方 Terralith 复现需要自行提供数据包：先启动开发服务，再执行 `DATAPACK_DIR='/数据包目录' npm run test:terralith`。不会把这些数据包复制进仓库；输出位于 `tests/results/terralith-results.json`。

已移除没有引用的旧 Footer、TipMessage 组件及其打赏图标；语言切换和实际使用的提示组件仍保留。开发文件监听忽略 `tests/results/` 和 `.tools/`，避免测试结果或运行环境文件触发页面刷新。

返回：[中文使用说明](../readme_detail_CN.md) · [English README](../readme_detail_EN.md)
