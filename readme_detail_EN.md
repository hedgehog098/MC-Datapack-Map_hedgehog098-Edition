# MC Datapack Map — hedgehog098 Edition

[首页 / Home](README.md)
Optimized and modified by hedgehog098.

A local Minecraft biome and structure map for vanilla worlds and world-generation datapacks, based on [MC Datapack Map by Jochen Jacobs (jacobsjo)](https://github.com/jacobsjo/mc-datapack-map).

[中文使用说明](readme_detail_CN.md) · [Project structure (中文)](docs/PROJECT-STRUCTURE.md) · [Modification notice](NOTICE.md) · [MIT License](LICENSE.txt)

## Features

- Set structure icon priorities and see which priority levels are hidden at the current zoom.
- See structure calculation progress and pending or failed icon downloads.
- Enter X/Z coordinates to move the map center.
- Restore settings, map position, and imported datapacks in the same browser and origin.
- Search multiple structure types as one group, with a default limit of 50 results or a 70,000-block radius. Configure limits and optional minimum spacing in the sidebar.
- Generate an approximate open travel route, copy its X/Z list, and exclude results from the last two nonempty searches in the same world.
- Collapse the datapack list and use a simplified desktop/mobile interface.
- Reclaim off-screen markers and tiles, transfer typed tile buffers between workers, and cancel obsolete work.
- Correctly parse single-biome structure definitions, including Terralith's four seasonal skyland mage towers.

## Setup dev environment

Download or clone this repository, open its directory, and run one file:

```sh
bash setup.command
```

On macOS, you can also double-click **`setup.command`**. Initial setup requires internet access.

The script prepares a compatible Node.js runtime, installs dependencies from the lockfile, validates/downloads vanilla assets, installs Chromium for browser tests, runs unit tests, and builds the production map. Python is not required. Setup options are centralized at the top of [setup.command](setup.command); see the [configuration reference](docs/PROJECT-STRUCTURE.md#一键配置选项).

An existing project-local Node takes precedence, followed by a compatible system Node (>=22.18). If needed, the script downloads a checksum-verified runtime into `.tools/node` without changing system Node or shell profiles. Re-running setup reinstalls locked dependencies, reuses valid assets, and rebuilds the site.

To finish setup and immediately start development:

```sh
bash setup.command --dev
```

The development page is at http://127.0.0.1:5173/. Keep the terminal open; press Control+C to stop.

Automatic runtime installation supports macOS and Linux on arm64/x64. The macOS setup uses the system shell, curl, tar, and checksum tools. Linux may additionally need Chromium system libraries; Playwright reports missing packages. Native Windows setup is not provided; use a suitable WSL environment. The graphical `.command` launcher is for macOS.

## Daily use

After setup, double-click **`启动地图.command`** on macOS to open http://127.0.0.1:4173/. It invokes setup if required dependencies, the default vanilla pack, or the build are missing.

From a terminal, run `npm run preview` after setup. If Node was installed only inside this project, first run this in the repository root:

```sh
export PATH="$PWD/.tools/node/bin:$PATH"
```

Use the same browser and address to retain settings: ports 4173 and 5173 have separate browser storage, as do `localhost` and `127.0.0.1`. Clearing site data or using a private browsing session can remove saved settings and packs.

After changing source files, run `npm run build` and refresh the production page. The daily launcher does not automatically rebuild an existing build. Development mode updates as source files change.

## Development and validation

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Type-check and build `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run unit regressions |
| `npm run test:browser` | Run six browser suites with temporary servers on ports 5174/4174 |
| `npm run assets` | Validate cached vanilla resources and download missing or invalid files |
| `npm run test:terralith` | Run the optional local Terralith regression; requires `DATAPACK_DIR` and a running dev server |

Build before running browser regressions against changed source. Setup runs unit tests, not the full browser suite. Test output is written to the ignored `tests/results/` directory. The browser runner uses isolated browser contexts and separate ports from the daily map.

The upstream Python generator remains available via `npm run createZips` for advanced asset rebuilding; it requires Python and `pip install -r scripts/requirements.txt`. It is not part of normal setup.

## Accuracy and performance

Structure checks sample biomes at the structure generation point's height, independently of the map display height. The map does not fully simulate every block-placement rule or support every structure type. Use matching Minecraft versions, seeds, datapacks, and world-generation settings when checking predictions in-game. See the [Terralith verification record](docs/terralith-report.md).

Routes use nearest-neighbor and 2-opt heuristics on X/Z straight-line distances. They are not guaranteed optimal, do not account for terrain or portals, and do not guarantee the nearest set of results when a limit is reached. The last two nonempty searches are excluded only within the same saved world identity.

High-priority icons remain visible farther out and can increase computation. Complex datapacks may take longer to search. Browser regressions check cache and marker cleanup, not a universal memory or speed improvement. Setup downloads assets; structure icons and Modrinth features can still require network access.

## Credits and sharing

The original copyright notice and MIT License are retained in [LICENSE.txt](LICENSE.txt). See [NOTICE.md](NOTICE.md) for modification credits and third-party material conditions. The upstream [map](https://map.jacobsjo.eu/) and [translation project](https://weblate.catter.dev/projects/jacobsjo/mc-datapack-map/) belong to the original project; this edition is not an official upstream release.

Do not include local runtime installations, generated assets, browser results, or private datapacks in a source upload. The relevant generated directories are ignored by Git; review staged files before sharing.

NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
