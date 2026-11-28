<p align="center">
  <img src="docs/images/cover.webp" alt="NeroNet" width="100%">
</p>

<h1 align="center">NeroNet</h1>

<p align="center">
  让已登录的 QQ（Windows、Linux）作为 OneBot v11 实现端运行<br>
  只管收发，机器人交给你喜欢的框架
</p>

<p align="center">
  <a href="../../releases/latest">下载</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#linux-和-docker">Linux / Docker</a> ·
  <a href="docs/DEPLOY.md">部署说明</a> ·
  <a href="docs/KNOWN_LIMITS.md">已知限制</a> ·
  <a href="#接入机器人框架">接入 AstrBot / qq-bridge</a> ·
  <a href="#许可">许可</a>
</p>

<p align="center">
  <img alt="版本" src="https://img.shields.io/badge/version-2.1.0-a83650">
  <img alt="平台" src="https://img.shields.io/badge/platform-Windows%20x64%20%7C%20Linux%20x64%20%7C%20Linux%20ARM64-555">
  <img alt="协议" src="https://img.shields.io/badge/OneBot-v11-555">
  <img alt="许可" src="https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-555">
</p>

---

## 简介

NeroNet 让一个已登录的 QQ 作为 **OneBot v11** 实现端运行：QQ 消息作为 OneBot 事件推送，OneBot 动作由这个 QQ 执行。它只负责收发，聊天和插件交给 [AstrBot](https://github.com/AstrBotDevs/AstrBot)、[qq-bridge](https://github.com/Derpyu520/qq-bridge) 等 OneBot 客户端。支持 Windows x64、Linux x64、Linux ARM64 和 Docker。

- **解压即用**：带 Node 的包解压后运行 `start.bat`，不用安装，不用写配置。
- **标准协议**：HTTP、正向 WebSocket、反向 WebSocket、HTTP POST，可同时开启多个。
- **不挑 QQ 版本**：遇到新的 QQ 版本，首次启动时自动识别。
- **功能齐全**：消息收发、群管理、好友和加群申请、群公告、群文件、精华消息、表情回应、QQ 空间等，也可以用脚本添加自定义动作。
- **默认可用**：动作默认开放，群管理、凭据等敏感操作需要手动开启。
- **自动恢复**：QQ 重新登录或连接中断后自动重新接入；失败时写明原因和处理办法。
- **管理界面**：在浏览器里查看状态、配置服务、看日志、调试动作，默认只允许本机访问。

## 下载

在 [Releases](../../releases/latest) 页面下载：

| 文件 | 大小 | 适合 |
|---|---|---|
| `NeroNet-2.1.0-win-x64-with-node.zip` | 约 37 MB | Windows，**推荐**。附带官方 Node.js 24.22.1，解压即可使用 |
| `NeroNet-2.1.0-win-x64.zip` | 约 4 MB | Windows，已经安装了 Node.js 24（x64）的电脑 |
| `NeroNet-2.1.0-linux-x64-with-node.tar.gz` | 约 48 MB | Linux x64，**推荐**。附带 Node.js 24.22.1 |
| `NeroNet-2.1.0-linux-x64.tar.gz` | 约 5 MB | Linux x64，已经安装了 Node.js 24 的机器 |
| `NeroNet-2.1.0-linux-arm64-with-node.tar.gz` | 约 47 MB | Linux ARM64，**推荐**。附带 Node.js 24.22.1 |
| `NeroNet-2.1.0-linux-arm64.tar.gz` | 约 5 MB | Linux ARM64，已经安装了 Node.js 24 的机器 |
| `NeroNet-2.1.0-docker.zip` | 很小 | Docker 构建文件（x86-64 和 ARM64 通用），不含镜像 |

同一平台的两个包只差一个 Node.js。Releases 页面列出了每个压缩包的 SHA-256；解压后包内每个文件的 SHA-256 在 `SHA256SUMS.txt` 里，启动时会自动核对。

## 运行要求

| 项目 | 要求 |
|---|---|
| 系统 | Windows 10 或 Windows 11（64 位）。Windows Server 2016 及以上应该可以使用，但没有测试过。Windows 7、8.1 和 Windows Server 2012 及更早的版本不支持，Node.js 24 不能在这些系统上运行 |
| QQ | Windows 版 QQ，需要先登录机器人账号。不随包附带 |
| Node.js | 24（x64），本版本用 24.22.1 构建和测试。带 Node 的下载包已附带 |
| ffmpeg | 可选。只在发送 MP3、OGG 等非 WAV/SILK 音频、生成视频封面、语音转码时需要 |

## 快速开始

1. 下载 `NeroNet-2.1.0-win-x64-with-node.zip`，解压到一个文件夹，例如 `D:\NeroNet`。
2. 登录机器人 QQ。
3. 双击 `start.bat`。窗口里会显示接入的 QQ 进程、当前状态和管理界面地址：

   ```
   NeroNet 已启动。状态：已就绪
     机器人 QQ 进程：1234（电脑上唯一运行的 QQ）
     管理界面：http://127.0.0.1:5099
     初始密码：D:\NeroNet\data\webui-initial-password.txt（首次登录后请修改，修改后这个文件会自动删除）
     数据目录：D:\NeroNet\data
     停止：运行 stop.bat
   ```

4. 打开 `http://127.0.0.1:5099`，用初始密码登录，阅读并确认使用须知和数据说明，然后在「安全与访问」里修改密码。
5. 首次启动已经自动建好两个只监听本机的 OneBot 服务：HTTP `127.0.0.1:3000` 和正向 WebSocket `127.0.0.1:3001`，访问令牌在管理界面「OneBot 配置」里查看。把你的机器人框架连上去即可。

停止时双击 `stop.bat`。配置、消息库和日志都保存在 NeroNet 文件夹的 `data` 目录里，窗口关掉后 NeroNet 仍在后台运行。

### 电脑上有多个 QQ

NeroNet 不会在多个 QQ 之间自己挑选，启动时会报错并列出进程号。这时在 NeroNet 文件夹里打开 PowerShell，指定机器人：

```powershell
.\start.bat -BotPid 1234            # 指定机器人 QQ 的进程号
.\start.bat -AdminPid 5678          # 或者指定一个永远不接入的 QQ（例如你自己的账号）
```

同一台电脑上登录过多个账号时，建议总是带上 `-AdminPid`：这样机器人 QQ 重启后，NeroNet 也能准确地自动接回。详见 [部署说明第 3 节](docs/DEPLOY.md)。

### 机器人 QQ 重启或掉线

机器人 QQ 退出后重新登录，NeroNet 会自动重新接入，不需要重启 NeroNet。接入后会核对账号，登录的不是绑定的机器人账号时不会使用。

NeroNet 与 QQ 之间的连接意外中断时，也会在几秒到十几秒内自动恢复，期间管理界面和 OneBot 服务暂时不可用。中断那一刻正在发送的消息不会自动重发。

## Linux 和 Docker

Linux 版与 Windows 版是同一个应用：OneBot 服务、动作、管理界面、AstrBot 和 qq-bridge 的接入工具都相同，只是 QQ 侧的组件和启动方式不同。每个 Linux 包里都有自己的 README 和部署说明，下面只列要点。

| | Linux（x64 / ARM64） | Docker |
|---|---|---|
| 系统 | glibc 2.35 或更新（Ubuntu 22.04、Debian 12 及以后）；用 `uname -m` 区分：`x86_64` 用 x64 的包，`aarch64` 用 arm64 的包 | x86-64 或 ARM64 的 Docker，在哪种机器上构建就得到哪种镜像 |
| QQ | 官方 Linux QQ，架构与系统相同（x64 用 `amd64` 的 deb，ARM64 用 `arm64` 的 deb） | 构建时自备官方 Linux QQ deb 包 |
| 显示 | 桌面会话，或服务器上的 Xvfb | 镜像内置 Xvfb，第一次通过 VNC 扫码登录 |
| 启动 | 解压后运行 `./start.sh`：NeroNet 带着自己的组件启动 QQ（QQ 已在运行时会正常重启一次），在 QQ 窗口里登录机器人账号即可 | `docker build` 后 `docker run`；**登录前先勾选“自动登录”**，以后重启容器不用再扫码 |
| 停止 | `./stop.sh`，QQ 继续运行，下次启动直接接入 | `docker stop`，先正常停止 NeroNet，再退出 QQ |
| 接入 | `integrations/astrbot/connect-astrbot.sh`、`integrations/qq-bridge/connect-qqbridge.sh` | 容器里的 OneBot 服务默认只监听容器自己的 `127.0.0.1`；从容器外接入时，先在管理界面把监听地址改成 `0.0.0.0` 并保留访问令牌 |

和 Windows 版相比，Linux 版的不同之处：

- QQ 退出（包括“退出账号”）后，NeroNet 会自己重新启动 QQ，不限次数；登录后自动接回。
- 一个 Linux 用户只管理一个机器人 QQ；多个机器人请用不同的 Linux 用户。
- 组件在 QQ 启动时加载，所以接入一个已在运行的 QQ 需要把它重启一次（NeroNet 会自动进行，也可以关闭）。
- 识别 QQ 的结果保存在 `~/.cache/NeroNet/binding-cache`。

Docker 镜像不直接提供，需要用 `NeroNet-2.1.0-docker.zip` 里的构建文件自己构建，用法见其中的 README。

## 接入机器人框架

| 框架 | 项目主页 | 接入指南 |
|---|---|---|
| AstrBot | [GitHub](https://github.com/AstrBotDevs/AstrBot) · [官网](https://astrbot.app) · [文档](https://docs.astrbot.app) | [integrations/astrbot](integrations/astrbot/README.md)：一条命令写好 NeroNet 和 AstrBot 两边的配置，支持同机、跨机器和 Docker |
| qq-bridge + DeepSeek Harness | [GitHub](https://github.com/Derpyu520/qq-bridge) | [integrations/qq-bridge](integrations/qq-bridge/README.md)：附带适配器和配置脚本，支持 DSH Web 和桌面客户端 |
| 其他 OneBot v11 客户端 | | 连接 NeroNet 的 HTTP 或 WebSocket 服务即可；需要群管理等手动开启的动作时，见 [部署说明第 8 节](docs/DEPLOY.md) |

AstrBot 和 qq-bridge 都是独立的第三方项目，与 NeroNet 没有关联，各自按自己的许可提供。

## 测试情况

- **QQ 版本**：NeroNet 不限定 QQ 版本，遇到新版本会先识别再接入。QQ 以后的版本如果改动了内部结构，可能识别不了，这时会显示原因，不会带着问题运行；可以先把 NeroNet 更新到最新版本再试，或者[提交 issue](../../issues)。
- **Windows**：2.0.0 的发行包测试了全部动作（消息、媒体、文件、转发、互动、QQ 空间、群管理、群公告、网页凭据）、好友申请和加群申请的推送与审批、入站消息和回复、多个 QQ 时用 `-BotPid` 指定机器人、停止后重新接入。AstrBot 和 qq-bridge 的接入沿用 1.6.0 的测试。
- **Linux x64 和 ARM64**：两种架构的发行包分别在 Ubuntu 24.04 和 Linux QQ 3.2.35 上完整测试：全部动作（消息、媒体、文件、转发、互动、QQ 空间、群管理、群公告、好友和加群请求）、入站消息和回复、断网恢复、QQ 退出或被挤下线后的自动重新接入、更新换版本、管理界面、AstrBot 和 qq-bridge 的接入，消息走向在 QQ 的两种内部通道上都测过。x64 还在 Linux QQ 3.2.33、3.2.34 上测试了识别、接入和消息收发。
- **Docker**：x86-64 和 ARM64 镜像都测试了构建、扫码登录、自动登录、重启和停止，以及容器内的动作。
- **稳定性**：没有做过长时间连续运行的专门测试。在开发和测试过程中，没有出现过因 QQ 风控或其他原因被强制下线的情况。
- 不支持的消息类型、未测试的场景等细节见 [已知限制](docs/KNOWN_LIMITS.md)。

## 常见问题

| 现象 | 处理 |
|---|---|
| 提示“找不到 Node.js” | 下载带 Node 的包，或者安装 Node.js 24（x64），或者把 `node.exe` 放进 NeroNet 文件夹 |
| 提示“没有找到正在运行的 QQ” | 先登录机器人 QQ 再启动。QQ 以管理员身份运行时，请右键 `start.bat` 选择“以管理员身份运行” |
| 提示“电脑上运行着多个 QQ” | 用 `-BotPid` 或 `-AdminPid` 指定，见上面的“电脑上有多个 QQ” |
| 提示“NeroNet 已经在运行” | 已经在后台运行了，直接打开管理界面即可；要重启，先运行 `stop.bat` |
| 状态一直是“等待 QQ 完成登录” | 在 QQ 窗口里完成登录；NeroNet 会在登录后自动就绪 |
| 第一次启动时显示“正在识别当前 QQ” | 遇到新的 QQ 版本时会先识别，通常几秒，最长几分钟，等它完成即可 |
| 接入 QQ 失败 | 启动窗口和状态页 `http://127.0.0.1:5100/status` 会显示原因、错误编号和处理办法。处理后再运行一次 `start.bat` 即可重新接入，见 [部署说明第 2 节](docs/DEPLOY.md) |
| 提示“这个 QQ 里还留着另一个版本的 NeroNet 组件” | 换了 NeroNet 版本后没有退出过 QQ。正常退出机器人 QQ 再重新登录，NeroNet 会自动接入，不需要重新启动 NeroNet |
| 管理界面和 OneBot 服务断开了几秒到十几秒，然后自己恢复 | NeroNet 与 QQ 之间的连接中断后会自动恢复。中断时正在发送的消息不会自动重发，见 [部署说明第 2 节](docs/DEPLOY.md) |
| 忘记管理界面密码 | 停止 NeroNet，删除 `data\config\webui.json` 后重新启动，会生成新的初始密码（写在 `data\webui-initial-password.txt`） |
| 客户端调用动作返回 `retcode 1404` | 看返回的 wording：`NERONET_ACTION_DISABLED` 表示动作没有开放，在管理界面「动作权限」中勾选对应的档案或动作（或者编辑 `data\config\neronet-actions.json`），然后重启 NeroNet；`NERONET_ACTION_NOT_SUPPORTED` 表示 NeroNet 还没有实现这个动作，见 [已知限制第 3 节](docs/KNOWN_LIMITS.md)。调用 `get_supported_actions` 可以查看当前可用的动作 |

## 更新

1. 运行旧版本的 `stop.bat`。
2. **正常退出机器人 QQ 再重新登录**。旧版本的组件留在 QQ 进程里，不退出 QQ 就换不成新版本。
3. 把新版本解压到一个新文件夹，把旧文件夹里的 `data` 目录整个复制过去，然后双击新版本的 `start.bat`。

不要把新版本覆盖到旧文件夹上。回退时用同样的方法回到旧文件夹。

## 文档

| 文档 | 内容 |
|---|---|
| [部署说明](docs/DEPLOY.md) | 启动和停止、多个 QQ、数据目录、更新和回退、环境变量、ffmpeg、固定目录部署 |
| [已知限制](docs/KNOWN_LIMITS.md) | QQ 版本、测试范围、没有实现的功能、运行时的表现 |
| [AstrBot 接入](integrations/astrbot/README.md) | 同机、跨机器、Docker，测试过的插件 |
| [qq-bridge 接入](integrations/qq-bridge/README.md) | 适配器、DSH Web 和桌面客户端、与 AstrBot 共存 |
| [使用须知](EULA.md)、[数据说明](PRIVACY.md) | 首次登录管理界面时需要确认 |
| Linux 包内的 `README.md`、`docs/`；`NeroNet-2.1.0-docker.zip` 内的 `README.md` | Linux（x64 / ARM64）和 Docker 的安装、运行、部署和已知限制 |

## 目录

| 路径 | 内容 |
|---|---|
| `start.bat`、`stop.bat` | 启动、停止 |
| `node.exe` | Node.js 运行时（只在带 Node 的下载包里有） |
| `app\` | 应用程序（单文件） |
| `webui\` | 管理界面 |
| `native\` | 在 QQ 进程内工作的组件（编译产物）及其校验清单 |
| `integrations\` | AstrBot、qq-bridge 的接入说明和工具 |
| `docs\` | 部署说明、已知限制、部署配置示例 |
| `scripts\` | 启动、停止、校验、安装的 PowerShell 脚本，带参数使用时直接运行它们 |
| `data\` | 运行后生成：配置、消息库、日志（识别 QQ 的结果另存于 `%LOCALAPPDATA%\NeroNet\binding-cache`） |
| `LICENSE`、`LICENSE.zh-CN.md` | 许可证（英文原文）和中文参考译文 |
| `THIRD_PARTY_NOTICES.md` | 第三方组件的许可 |
| `SHA256SUMS.txt` | 包内全部文件的 SHA-256 |

## 安全提示

- 管理界面默认只监听 `127.0.0.1`，不要把它直接暴露到公网。
- 每个 OneBot 服务都应设置访问令牌。拿到令牌的程序可以用机器人账号收发消息。
- NeroNet 不保存 QQ 密码，也没有遥测。`data` 目录里有消息库、媒体缓存和令牌，请按敏感数据保管。
- NeroNet 不是腾讯的产品，与腾讯没有关联。用非官方方式接入 QQ 可能违反 QQ 的服务条款，并可能导致账号受限，请自行评估并承担风险。

## 许可

NeroNet 按 **PolyForm Noncommercial License 1.0.0** 提供，许可全文见 [LICENSE](LICENSE)，中文参考译文见 [LICENSE.zh-CN.md](LICENSE.zh-CN.md)（两者不一致时以英文原文为准）。

- 可以使用、修改和再分发，但只能用于**非商业用途**。个人、学习、研究和兴趣项目，以及学校、公益组织等都属于非商业用途。
- 再分发（无论原样还是修改后）时，必须附上许可证全文或其链接，并保留这一行：`Required Notice: Copyright 2026 NeroNet 项目组`。
- 本许可适用于 NeroNet 自身，包括 `native\` 中的编译产物。Native 组件只以编译产物形式提供。
- 需要商业使用的，请联系 NeroNet 项目组另行授权。

第三方组件按各自的许可提供，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。`integrations\qq-bridge\adapter\` 中包含修改过的 qq-bridge 文件，受其上游许可（PolyForm Noncommercial 1.0.0）约束，详见该目录的 `LICENSE`。
