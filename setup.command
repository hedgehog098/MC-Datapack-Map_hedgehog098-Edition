#!/bin/bash
# One entry point for macOS development setup. All setup options live here.
set -euo pipefail
cd "$(dirname "$0")"

# Configuration (environment variables can override these defaults).
NODE_VERSION="${NODE_VERSION:-22.22.0}"
USE_PROJECT_NODE="${USE_PROJECT_NODE:-0}"
INSTALL_BROWSER="${INSTALL_BROWSER:-1}"
RUN_CHECKS="${RUN_CHECKS:-1}"
START_DEV="${START_DEV:-0}"
export ASSET_BASE_URL="${ASSET_BASE_URL:-https://map.jacobsjo.eu/}"
export ASSET_CONCURRENCY="${ASSET_CONCURRENCY:-4}"
export PATH="$PWD/.tools/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

trap 'echo "配置未完成，请检查上方错误后重新运行。" >&2' ERR
case "${1:-}" in
  --dev) START_DEV=1 ;;
  --help) echo '用法：bash setup.command [--dev]；默认配置并构建，--dev 完成后启动开发服务。'; exit 0 ;;
  '') ;;
  *) echo "未知参数：$1" >&2; exit 2 ;;
esac
for option in "$USE_PROJECT_NODE" "$INSTALL_BROWSER" "$RUN_CHECKS" "$START_DEV"; do
  [[ "$option" == 0 || "$option" == 1 ]] || { echo '开关选项必须为 0 或 1。' >&2; exit 2; }
done

# Install Node only into this project if no compatible runtime is available.
if [[ "$USE_PROJECT_NODE" == 1 && ! -x .tools/node/bin/node ]] || ! command -v node >/dev/null || ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22 || a===22&&b>=18 ? 0 : 1)'; then
  case "$(uname -s)" in Darwin) platform=darwin ;; Linux) platform=linux ;; *) echo '请在 macOS 或 Linux 终端运行。' >&2; exit 1 ;; esac
  case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64) arch=x64 ;; *) echo '不支持当前处理器架构。' >&2; exit 1 ;; esac
  [[ "$NODE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'NODE_VERSION 格式无效。' >&2; exit 2; }
  archive="node-v${NODE_VERSION}-${platform}-${arch}.tar.gz"
  mkdir -p .tools
  staging=$(mktemp -d "$PWD/.tools/node-install.XXXXXX")
  trap 'rm -rf "$staging"' EXIT
  echo "安装项目专用 Node.js ${NODE_VERSION}……"
  curl --fail --location --retry 2 --max-time 300 "https://nodejs.org/dist/v${NODE_VERSION}/${archive}" -o "$staging/$archive"
  curl --fail --location --retry 2 --max-time 60 "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o "$staging/checksums"
  expected=$(awk -v name="$archive" '$2 == name { print $1 }' "$staging/checksums")
  if command -v shasum >/dev/null; then actual=$(shasum -a 256 "$staging/$archive" | awk '{print $1}'); else actual=$(sha256sum "$staging/$archive" | awk '{print $1}'); fi
  [[ -n "$expected" && "$actual" == "$expected" ]] || { echo 'Node 下载校验失败。' >&2; exit 1; }
  tar -xzf "$staging/$archive" -C "$staging"
  # Preserve any previous local runtime until the new archive passes validation.
  if [[ -d .tools/node ]]; then mv .tools/node "$staging/previous-node"; fi
  mv "$staging/node-v${NODE_VERSION}-${platform}-${arch}" .tools/node
fi
command -v npm >/dev/null || { echo '当前 Node 安装缺少 npm，请安装完整 Node.js 后重试。' >&2; exit 1; }
echo "使用 Node $(node --version)；安装锁定依赖……"
npm ci --no-fund --no-audit
npm run assets
if [[ "$INSTALL_BROWSER" == 1 ]]; then ./node_modules/.bin/playwright install chromium; fi
if [[ "$RUN_CHECKS" == 1 ]]; then npm test; fi
npm run build
echo '配置完成。日常使用：双击 启动地图.command；开发：bash setup.command --dev。'
if [[ "$START_DEV" == 1 ]]; then npm run dev; fi
