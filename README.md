# MC Datapack Map — hedgehog098 Edition

MC 数据包地图，由hedgehog098优化修改。

[中文详细说明](readme_detail_CN.md) · [English details](readme_detail_EN.md)

# 配置

## 一键配置

下载项目并解压，双击 **`setup.command`**，或在项目目录执行：

```sh
bash setup.command
```

自动准备 Node、安装依赖、下载原版资源、测试并构建。首次需要联网，无需 Python。

## Config

设置集中在 `setup.command` 顶部，通常保持默认即可。

| 变量 | 默认值 | 用途 |
| :--- | :---: | :--- |
| `USE_PROJECT_NODE` | `0` | 设为 `1` 使用项目专用 Node |
| `INSTALL_BROWSER` | `1` | 安装测试浏览器 |
| `RUN_CHECKS` | `1` | 执行单元测试 |
| `START_DEV` | `0` | 配置完成后启动开发页面 |
| `ASSET_CONCURRENCY` | `4` | 资源下载并发数 |

双击启动适用于 macOS；Linux / WSL 说明及全部选项见[详细文档](readme_detail_CN.md#一键配置)。

# 使用方法

1. 双击 **`启动地图.command`**，打开 http://127.0.0.1:4173/ 。
2. 设置 Minecraft 版本与种子，导入数据包。
3. 选择结构并设置图标优先级；输入 X/Z 可定位地图。
4. 在“远距离结构搜索 / 路线”选择一个或多个结构，默认搜寻 **50 个或 7 万格半径**，生成 X/Z 路线。
5. 设置、地图中心和数据包自动保存；最近两次非空搜索结果不重复搜寻。

数据包列表可折叠，地图显示隐藏等级与加载进度。已优化缓存回收，并修复 Terralith 四季空岛法师塔漏查。

开发：`bash setup.command --dev`。更新源码后重新运行配置文件或执行 `npm run build`。

# 声明

基于 [jacobsjo/mc-datapack-map](https://github.com/jacobsjo/mc-datapack-map)，保留原作者版权与 [MIT 许可证](LICENSE.txt)，详见 [NOTICE.md](NOTICE.md)。

结构坐标为算法预测；路线为近似优化，不保证最短。第三方数据包与 Minecraft 素材遵循各自授权。

非 Minecraft 官方产品，未经 Mojang 或 Microsoft 批准或关联。
