#!/bin/zsh
set -e
cd "${0:A:h}"
export PATH="$PWD/.tools/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if [[ ! -d node_modules || ! -f public/vanilla_datapacks/vanilla_26_2.zip || ! -f dist/index.html ]] || ! command -v npm >/dev/null; then
    bash setup.command
fi
if curl --silent --fail http://127.0.0.1:4173/manifest.webmanifest | /usr/bin/grep -q 'MC Datapack Map'; then
    open http://127.0.0.1:4173/
    exit 0
fi
(sleep 2; open http://127.0.0.1:4173/) &
echo '地图地址：http://127.0.0.1:4173/；停止服务请按 Control+C。'
npm run preview
