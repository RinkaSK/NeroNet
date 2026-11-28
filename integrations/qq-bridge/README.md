# NeroNet × qq-bridge 接入指南

qq-bridge 项目主页：[GitHub](https://github.com/Derpyu520/qq-bridge)。

本文说明如何让公开项目 qq-bridge 通过 NeroNet 收发 QQ 消息，并由 DeepSeek Harness（DSH）提供模型回合。DSH 可以是命令行启动的 **DSH Web**（固定端口），也可以是 **DSH 桌面客户端**（每次启动端口不同）。

qq-bridge 是第三方项目，作者已声明停止维护。下面的适配由 NeroNet 项目独立完成，不代表 qq-bridge 作者，也未获其背书。

本目录的文件：

| 文件 | 用途 |
|---|---|
| `README.md` | 本指南 |
| `adapter\` | 适配器：`apply-adapter.mjs`、修改后的 qq-bridge 文件（`files\`）、来源和哈希记录（`UPSTREAM.json`）、上游的许可全文（`LICENSE`） |
| `Connect-QQBridge.ps1`、`connect-qqbridge.mjs` | 写好 NeroNet 和 qq-bridge 两边连接配置的脚本 |
| `config.neronet.example.json` | qq-bridge 的配置示例 |

## 1. 适配状态

| 项目 | 测试所用的版本 |
|---|---|
| qq-bridge | `v0.2.2-rc1`，提交 `5fe6d3e1aee014a34047103edfc8aaafc8322176` |
| NeroNet 适配器 | 1.1.0 和 1.2.0。本包附带的是 **1.2.1**，见下面的说明 |
| DSH Web | `@deepseek-ai/dsh@0.2.2-rc.3`，固定端口 |
| DSH 桌面客户端 | DeepSeek Harness 0.2.1-rc.2（Windows） |
| Node.js | 24.22.1，自带 npm 11.19.1（qq-bridge 需要 Node.js 22 或更高版本） |

适配器 1.2.0 改为整文件替换，并把配置段和 MCP 服务统一命名为 `onebot`。1.2.1 在它的基础上只改了 `scripts\setup-dsh.mjs`：安装结果按最终状态检查，提示更明确（见第 5、6 节）。

下面的内容先在适配器 1.1.0 上做过在线测试；之后在适配器 1.2.0、NeroNet 1.5.1、QQ 9.9.37 上按“全新安装”重新测试了其中的对话、引用、@、识图、三种聊天模式、三种重启恢复、DSH 桌面客户端的自动发现和恢复、令牌错误和 NeroNet 未启动的提示、与 AstrBot 共存。1.5.2 和适配器 1.2.1 上回归了适配器升级、`setup-dsh.mjs web`、一步配置、私聊对话和大图识别；DSH 桌面客户端没有在 1.5.2 上重测。

在真实 QQ 私聊和测试群中测试通过的内容：

- 对话：私聊、群聊关键词唤醒、群聊 @ 唤醒。
- 消息元素：引用、@、QQ 系统表情、识图、主动消息、机器人发送收藏表情。
- 三种聊天模式：`chat`、`reserved`、`reserved2`。
- 恢复：Bridge、NeroNet、DSH 分别重启后恢复；DSH 不可用期间收到的消息在恢复后补发一次。
- DSH 桌面客户端：自动找到正确的实例；关闭、重启、端口变化后自动恢复；不会连到别的数据目录的 DSH。
- 错误提示：令牌错误、NeroNet 未启动、动作未开放、图片不可取得、DSH 不可用。
- 与 AstrBot 同时连接，按第 9 节的配置分工。

以下内容没有测试：

- 语音转文字、发送语音。
- `closed-agent` 模式下的主机命令执行。
- 长时间运行。
- Windows 以外的系统（桌面客户端的端口发现只在 Windows 上实现）。

## 2. 工作方式

- qq-bridge 用 OneBot v11 的两种通道连接 NeroNet，两者使用各自的令牌：
  - 正向 WebSocket（默认 `ws://127.0.0.1:3001/`）：收事件、发消息。
  - HTTP（默认 `http://127.0.0.1:3000`）：部分动作和 MCP 工具。
- qq-bridge 通过本机 HTTP 调用 DSH 来运行模型回合。
- NeroNet 实现的动作默认全部开放，qq-bridge 用到的动作都在其中，不需要再开放；2.0 及更早版本使用的 `qqbridge`、`qqbridge-stickers` 档案已经不需要。群管理、群文件管理、好友和加群请求、群公告和读取凭据需要手动开启，qq-bridge 不调用它们，也不需要为它开启。

## 3. 准备

1. 登录机器人 QQ，用 `start.bat` 启动一次 NeroNet。这一步会在数据目录（NeroNet 文件夹里的 `data`）生成 `config\onebot_<机器人QQ>.json`。
2. 准备 Node.js 24.22.1（自带 npm 11.19.1）。这个版本的 npm 对依赖包的安装脚本有新的默认行为，见第 4 节末尾的“npm 跳过安装脚本”。
3. 准备一个 DeepSeek 账号或 DeepSeek API Key，供 DSH 使用。
4. 决定 DSH 的运行方式和数据目录（下文记作 `DSH_HOME`）：

   | 方式 | 数据目录 | 适合 |
   |---|---|---|
   | DSH Web（第 5 节） | 单独准备，例如 `D:\qqbridge\dsh-home` | 服务器、不需要界面、想要固定地址 |
   | DSH 桌面客户端（第 6 节） | 桌面客户端自己的目录（默认 `%USERPROFILE%\.dsh`），或单独的目录 | 想在桌面客户端里看到 QQ 会话 |

   **不要让两个用途共用一个 `DSH_HOME`。** qq-bridge 的安装脚本会在 `DSH_HOME\plugins` 下创建同名插件链接，并修改该目录下 profile 的配置；共用会覆盖另一个用途的插件链接。Bridge 也是靠 `DSH_HOME` 里的签名密钥来认出“自己的” DSH 的（见第 6 节）。

## 4. 安装 qq-bridge

下文中的 `<NeroNet>` 指 NeroNet 安装目录，`<qq-bridge>` 指 qq-bridge 的源码目录。

1. **下载源码。** 用 git 获取 `v0.2.2-rc1` 版本：

   ```powershell
   git clone --branch v0.2.2-rc1 https://github.com/Derpyu520/qq-bridge.git D:\qqbridge\qq-bridge
   ```

   不建议下载 zip 后用 Windows PowerShell 5.1 的 `Expand-Archive` 解压。上游有三个中文文件名：`roles\小鲸鱼.md`、`roles\傲娇助手.md`、`assets\deepseek娘.png`。用这种方式解压时，这些文件名会变成乱码，其中一个角色卡还会丢失。

2. **检查后应用适配。** 先停止正在运行的 qq-bridge 和 DSH。

   ```powershell
   node <NeroNet>\integrations\qq-bridge\adapter\apply-adapter.mjs <qq-bridge> --check
   node <NeroNet>\integrations\qq-bridge\adapter\apply-adapter.mjs <qq-bridge>
   ```

   适配器的规则：
   - 按 SHA-256 核对每个要替换的文件，只接受 `v0.2.2-rc1` 的原始内容或已经适配好的内容。遇到不认识的本地修改时拒绝执行，不写入任何文件。
   - `--check` 只检查不写入：逐个文件列出 `replace`、`add` 或 `already-adapted`，最后一行是 `state: adapted` 或 `state: upstream or older adaptation (apply to adapt)`。
   - 重复执行不会改变结果（输出 `nothing to change`）。
   - 修改之前，把原文件保存到 `<qq-bridge>\.neronet-adapter-backup\`，供回退使用（见第 11 节）。
   - 目录是用更早版本的适配器适配的：先用当时那一版适配器执行 `--revert` 回到上游，再用本版安装。

   适配的内容：
   - 配置使用 `onebot` 段；DSH 中的 MCP 服务名为 `onebot` 和 `onebot-host`。
   - 工具守卫按 DSH 实际拥有的工具来隐藏（见第 10 节“DSH 日志中的 restrict”）。
   - 可选的媒体下载代理（见第 8 节）和与 AstrBot 共存的开关（见第 9 节）。
   - 写入 `NERONET_ADAPTATION.json`，记录适配器版本和上游来源。

   适配之后需要执行第 5 或第 6 节的 `setup-dsh.mjs`，让 DSH 加载适配后的预设。已有的 DSH 会话不会被改写，重启后请新建会话。

3. **按锁文件安装依赖。**

   ```powershell
   cd <qq-bridge>
   npm ci
   ```

4. **创建配置文件。** 把 `<NeroNet>\integrations\qq-bridge\config.neronet.example.json` 复制为 `<qq-bridge>\config.json`，然后填写以下字段（`dsh` 的地址相关字段见第 5 或第 6 节）：

   | 字段 | 填写 |
   |---|---|
   | `dsh.provider` | 用 DeepSeek 账号时填 `deepseek-account`；用 API Key 时填 `deepseek-official` |
   | `dsh.model` | 例如 `deepseek-flash` |
   | `ownerQQ` | 管理员 QQ |
   | `allow.private` / `allow.groups` | 允许对话的 QQ 号和群号。保持 `allowAllWhenEmpty: false` 时，列表为空就是全部不允许 |
   | `consolePort` | Bridge 控制台端口，不要与其他程序冲突 |

   `onebot` 段的地址和令牌由第 7 节的配置工具填写。

### npm 跳过安装脚本

Node.js 24.22.1 自带的 npm 11.19.1 默认**不运行依赖包自己的安装脚本**，安装结束时会列出被跳过的包（提示 `packages have install scripts not yet covered by allowScripts`）。这不是报错，安装命令的退出码仍然是 0。

| 安装的内容 | 被跳过安装脚本的包（测试时的版本） |
|---|---|
| qq-bridge（`npm ci`） | 没有 |
| DSH（`npm install @deepseek-ai/dsh@0.2.2-rc.3`） | `node-pty@1.2.0-beta.15`、`koffi@3.1.1`、`@deepseek-ai/dsh-subprocess-local@0.2.2-rc.3`、`protobufjs@7.6.6`、`@google/genai@2.21.0` |

测试时没有批准任何安装脚本：`node-pty` 和 `koffi` 自带 Windows x64 的预编译文件，实测可以加载；DSH Web 的对话、识图和三种聊天模式都正常。`@deepseek-ai/dsh-subprocess-local` 的安装脚本（准备子进程辅助程序）没有单独验证，它与 `closed-agent` 模式下执行主机命令有关，这部分本来就没有测试。

安装后可以这样确认两个原生模块能加载（在 DSH 的安装目录里执行，两行都应输出 `ok`）：

```powershell
node -e "require('node-pty'); console.log('ok')"
node -e "require('koffi'); console.log('ok')"
```

如果某个模块加载失败，或者确实需要某个包的安装脚本：先用 `npm install-scripts ls` 查看被跳过的包，只对你核对过的包执行 `npm install-scripts approve <包名>`，然后重新执行安装命令。不建议用 `--all` 一次全部批准。

## 5. 方式一：DSH Web（固定地址）

1. **安装 DSH。** 在单独的目录安装固定版本：

   ```powershell
   mkdir D:\qqbridge\dsh; cd D:\qqbridge\dsh
   npm install @deepseek-ai/dsh@0.2.2-rc.3
   ```

2. **首次启动并登录。**

   ```powershell
   $env:DSH_HOME = 'D:\qqbridge\dsh-home'
   node D:\qqbridge\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js web --port 3080 --no-open
   ```

   打开 `http://127.0.0.1:3080`，登录 DeepSeek 账号，或填写 API Key。然后按 Ctrl+C 停止 DSH。

3. **安装 qq-bridge 的 preset 和工具。** `web` 是 DSH Web 模式使用的 profile。

   ```powershell
   $env:DSH_HOME = 'D:\qqbridge\dsh-home'
   cd <qq-bridge>
   node scripts\setup-dsh.mjs web
   ```

   脚本结束时会检查最终状态，并用下面两种方式之一结束：

   - `检查通过：profile web 的 bundle 链接、package.json、preset 和 MCP 条目都已就位`：安装完成（退出码 0）。
   - `缺失：…` 加上 `profile web 的安装不完整`：真实的安装失败（退出码 1），按列出的缺失项修正后重新运行。

   按本节的方法把 DSH 装在单独目录时，`PATH` 里没有 `dsh` 命令，脚本会提示“已跳过 dsh plugin install”。这是正常的：DSH 加载 bundle 需要的链接由脚本自己建好，不依赖这条命令。

   检查通过只说明文件就位。最终请在第 5 步启动后确认：DSH 的输出里没有 `cannot resolve profile bundle`，Bridge 日志出现 `DSH 已就绪`，并在 QQ 里实际发一条消息看到回复。

4. **填写 `config.json` 的 DSH 地址。**

   | 字段 | 填写 |
   |---|---|
   | `dsh.baseUrl` | `http://127.0.0.1:3080`，与启动 DSH 时的端口一致 |
   | `dsh.autoDiscoverPort` | `false` |

5. **启动顺序。** 先启动 DSH，再启动 qq-bridge。两者都要设置同一个 `DSH_HOME`：

   ```powershell
   $env:DSH_HOME = 'D:\qqbridge\dsh-home'
   node D:\qqbridge\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js web --port 3080 --no-open
   ```

   ```powershell
   $env:DSH_HOME = 'D:\qqbridge\dsh-home'
   cd <qq-bridge>
   npm start
   ```

## 6. 方式二：DSH 桌面客户端

在 Windows 上的 DeepSeek Harness 0.2.1-rc.2 测试通过。

### 桌面客户端的特点

- 桌面客户端的后端只监听本机 `127.0.0.1`，**端口由系统分配，每次启动都不同**（三次启动分别是 60419、64657、56736）。
- 它使用 profile `desktop`，数据目录默认是 `%USERPROFILE%\.dsh`；启动前设置环境变量 `DSH_HOME` 可以换成别的目录。
- 它没有命令行的 `dsh` 命令。

### Bridge 怎样找到并认出桌面客户端

- `dsh.autoDiscoverPort: true` 时，Bridge 在配置的地址连不上的情况下，列出本机属于 DeepSeek Harness（以及 node）进程的监听端口，逐个尝试。
- **认出实例靠的是签名密钥，不是端口。** Bridge 用自己 `DSH_HOME` 里的签名密钥生成会话凭据；只有使用**同一个数据目录**的 DSH 才会接受。本机同时开着别的 DSH（别的数据目录）时，它们会拒绝这个凭据，Bridge 不会连过去。测试中同时运行另一个桌面实例和另一个 Web 实例，Bridge 报告“试过 10 个候选地址，没有一个响应”，保持等待。
- 因此 Bridge 的 `DSH_HOME` 必须与桌面客户端的数据目录相同。桌面客户端用默认目录时，启动 Bridge 不需要设置 `DSH_HOME`。
- 限制：两个 DSH 进程使用**同一个**数据目录时（例如同一目录上既开桌面客户端又开 DSH Web），Bridge 无法区分它们。不要这样运行。
- 端口发现只在 Windows 上实现。其他系统需要手动填写地址（见本节末尾）。

### 步骤

1. **安装并登录桌面客户端。** 启动一次 DeepSeek Harness，在界面中登录 DeepSeek 账号，然后退出。

   如果这台电脑的桌面客户端还有别的用途，建议为 QQ 单独开一个实例，使用自己的数据目录和窗口数据目录（两个参数缺一不可，否则第二个实例不会启动）：

   ```powershell
   $env:DSH_HOME = 'D:\qqbridge\dsh-desktop-home'
   & "$env:LOCALAPPDATA\Programs\DeepSeek Harness\DeepSeek Harness.exe" --user-data-dir=D:\qqbridge\dsh-desktop-userdata
   ```

   这个实例需要在自己的界面里再登录一次。之后每次都用这条命令启动它。

2. **安装 qq-bridge 的 preset 和工具到 `desktop` profile。** 先退出桌面客户端，再执行（使用默认数据目录时不设置 `DSH_HOME`）：

   ```powershell
   $env:DSH_HOME = 'D:\qqbridge\dsh-desktop-home'
   cd <qq-bridge>
   node scripts\setup-dsh.mjs desktop
   ```

   桌面客户端没有 `dsh` 命令，脚本会提示“已跳过 dsh plugin install”，然后和 DSH Web 一样检查最终状态：显示 `检查通过：profile desktop …` 就是安装完成；显示 `缺失：…` 和“安装不完整”是真实的失败，需要修正后重新运行（见第 5 节第 3 步）。

3. **填写 `config.json` 的 DSH 字段。**

   | 字段 | 填写 |
   |---|---|
   | `dsh.autoDiscoverPort` | `true` |
   | `dsh.baseUrl` | 保留示例值即可。它只是第一个尝试的地址，连不上时自动发现 |
   | `dsh.authToken` | 留空（`""`）。填了固定令牌就不会使用数据目录里的签名密钥 |

4. **启动顺序。** 先启动桌面客户端，再启动 qq-bridge（`DSH_HOME` 与桌面客户端相同）：

   ```powershell
   $env:DSH_HOME = 'D:\qqbridge\dsh-desktop-home'   # 使用默认数据目录时去掉这一行
   cd <qq-bridge>
   npm start
   ```

   日志中出现下面的内容，说明找到了桌面客户端：

   ```
   DSH 端点已自愈：http://127.0.0.1:3080 → http://127.0.0.1:64657（桌面版每次启动端口随机）
   DSH 已就绪（模式: reserved2）
   ```

### 关闭、重启和端口变化

| 情况 | Bridge 的行为 |
|---|---|
| 桌面客户端没有启动 | 日志「⚠️ DSH 不可用（重启中？），QQ 消息将入队等待」；控制台状态 `dshReady: false`；每 30 秒左右记录一次「试过 N 个候选地址，没有一个响应」 |
| 这期间有人发消息 | 日志「唤醒已入队 …，等待 DSH 恢复后补投」。消息保存在内存里，每个会话最多 50 条 |
| 桌面客户端启动（新端口） | 约 20–30 秒内日志「DSH 端点已自愈：旧地址 → 新地址」「已补投 …: 成功 1 条」。补投一次，没有重复回复 |
| Bridge 自己重启 | 排队中的消息会丢失（只在内存里） |

桌面客户端重启不需要重启 Bridge，也不需要修改 `config.json`。

### 手动指定地址

自动发现不可用时（非 Windows，或不想让 Bridge 查看本机端口），可以手动填写。下面用到的 `dsh-endpoint.js` 是上游自带的工具，这一步没有单独测试：

1. 桌面客户端运行时，在 `<qq-bridge>` 目录执行 `node src\dsh-endpoint.js`（`DSH_HOME` 同上），它打印当前地址。
2. 把地址写入 `dsh.baseUrl`，`dsh.autoDiscoverPort` 设为 `false`，重启 Bridge。

桌面客户端每次重启端口都会变，所以手动方式每次都要重填。需要固定地址时请用 DSH Web。

## 7. 连接 NeroNet

先检查，再写入：

```powershell
cd <NeroNet>
.\integrations\qq-bridge\Connect-QQBridge.ps1 -BridgeDirectory <qq-bridge> -Check
.\integrations\qq-bridge\Connect-QQBridge.ps1 -BridgeDirectory <qq-bridge>
```

配置脚本默认使用 NeroNet 文件夹里的 `node.exe`（没有时用系统中安装的 Node.js）和 `data` 目录；数据目录在别处时加 `-HomeDirectory <数据目录>`，要用别的 Node.js 时加 `-NodePath <node.exe>`。

配置工具会做以下修改：
- **NeroNet 一侧：** 在 `onebot_<QQ>.json` 中找一个 Bridge 能用的正向 WebSocket 服务和 HTTP 服务，没有时创建专用的 `qqbridge-ws` / `qqbridge-http`。2.1 起脚本不再修改动作配置：qq-bridge 用到的动作默认开放。
- **qq-bridge 一侧：** 只写入 `config.json` 的 `onebot` 段的地址和两个令牌，其他字段（包括 `mediaProxy`、`ignoreSlashCommands`）保持不变。

“能用”的条件：服务已启用、绑定在本机地址上、消息格式为数组；WebSocket 服务的角色必须是 Universal（Bridge 在同一条连接上收事件和发动作）。不满足条件的服务**不会被选用，也不会被修改**（别的客户端可能正在用它），输出里会说明原因。如果已有名为 `qqbridge-ws` / `qqbridge-http` 的服务但不满足条件，工具会报错，请修正或删除它后重试。

配置工具的其他行为：
- 被修改的文件会先备份为 `*.bak-qqbridge-<时间>`。
- 重复执行时，没有变化就不写入。
- 输出的提示是中文，字段名保持英文（方便脚本读取）。
- 输出中的令牌只显示长度。需要查看令牌原文时加 `-ShowToken`（直接用 `node connect-qqbridge.mjs` 运行时是 `--show-token`，提示里写的是你实际使用的那一种）。
- 输出的 `media` 一项是识图的预检：有没有找到 ffmpeg，以及没有时哪些图片不能识别（见第 8 节）。
- 配置工具不会启动或重启任何程序。

完成后正常停止并重新启动 NeroNet，使新的服务配置生效。

Bridge 启动后，日志中出现下面这一行说明 DSH 已连接。NeroNet 一侧可以在管理界面「运行总览 → 连接与服务」中看到 Bridge 使用的服务有客户端连接。

```
DSH 已就绪（模式: reserved2）
```

## 8. 图片和收藏表情的网络要求

- **收图（识图）：** Bridge 通过 NeroNet 的 `get_image` 取得图片内容，不需要自己访问外网。大图和动图需要 ffmpeg，见下面的“大图、动图和 ffmpeg”。
- **机器人发送收藏表情：** Bridge 自己从 QQ 的图片服务器（`p.qpic.cn` 等）下载表情，再交给 NeroNet 发送。默认做法是本机解析域名并直连，逐一检查解析出的地址不是内网地址。

  电脑只能通过 HTTP 代理上网（没有可用的 DNS 或直连路由）时，这一步会失败：「图片下载失败 … 域名解析失败」。这时可以在 `config.json` 的 `onebot` 段配置媒体代理：

  ```json
  "onebot": {
    "mediaProxy": "http://127.0.0.1:7890"
  }
  ```

  - 只支持 `http://` 代理（HTTP CONNECT），不支持在地址里写用户名和密码。
  - **只有 QQ 媒体域名走代理**：`qpic.cn`、`gtimg.cn`、`qlogo.cn`、`idqqimg.com`、`nt.qq.com.cn` 及其子域名。`onebot.mediaProxyHosts`（域名后缀数组）可以替换这个列表。其他地址仍按原来的方式直连并检查。
  - 仍然保留的检查：只允许 http/https、端口限制、每次重定向重新检查（最多 5 次，跳到列表外的域名就回到直连检查）、大小限制、必须是图片、总时限 20 秒；https 仍然端到端校验证书。
  - 不配置 `mediaProxy` 时，行为与上游完全相同。
  - 配置错误（例如写成 `https://`）时 Bridge 启动失败并说明原因。启动日志会有一行「QQ 媒体下载经代理 …」。

- **新增或修改账号收藏**（`add_custom_face` / `modify_custom_face`）2.1 起默认开放，会修改机器人账号的收藏表情。

### 大图、动图和 ffmpeg

NeroNet 接收图片没有 1 MiB 的限制；下面的限制是 qq-bridge 把图片交给模型之前自己做的处理（上游的默认值）。

| 图片 | Bridge 的处理 | 需要 ffmpeg |
|---|---|---|
| 静态图，不超过 1 MiB **并且**长边不超过 1280 像素 | 原样交给模型 | 不需要 |
| 静态图，超过 1 MiB 或长边超过 1280 像素 | 先缩小、重新编码，再交给模型 | 需要 |
| 动图（GIF 等） | 抽取若干帧拼成一张图，再交给模型 | 需要 |

没有 ffmpeg 时，后两种图片不会交给模型。Bridge 日志里有一行 `[media] 图片1 不提供：… 压不到 1024KB 以内（找不到 ffmpeg（设置 FFMPEG_PATH 或 config.json 的 socialV2.voice.ffmpegPath））`，模型通常会回答“图没打开”之类的话。从剪贴板粘贴的截图、手机原图很容易超过这两个限制。

配置 ffmpeg（任选一种，然后重启 Bridge）：

- 启动 Bridge 之前设置环境变量：`$env:FFMPEG_PATH = 'D:\tools\ffmpeg\bin\ffmpeg.exe'`。
- 在 `config.json` 里填写（这一项只能在本机的配置文件里设置，不能从控制台修改）：

  ```json
  "socialV2": { "voice": { "ffmpegPath": "D:\\tools\\ffmpeg\\bin\\ffmpeg.exe" } }
  ```

- 或者把 ffmpeg 所在目录加进 `PATH`。

预检：第 7 节的 `Connect-QQBridge.ps1`（加 `-Check` 不写入任何文件）输出里的 `media` 一项会说明是否找到了 ffmpeg、是从哪里找到的。上面的 1 MiB 和 1280 像素可以用 `config.json` 的 `socialV2.media.maxModelBytes`、`socialV2.media.maxLongEdge` 调整（上游的设置，没有单独测试）。

这里的 ffmpeg 是 qq-bridge 用的，和 NeroNet 自己用的 `NERONET_FFMPEG`（发送 MP3 等音频、生成视频封面）是两处独立的设置，可以指向同一个 `ffmpeg.exe`。

测试情况：在 QQ 9.9.37、DSH Web 0.2.2-rc.3 上发送一张 1920×1200、约 1.7 MB 的图片。没有 ffmpeg 时，Bridge 记录“不提供”，机器人回答取不到图；设置 `FFMPEG_PATH` 并重启 Bridge 后，日志为 `原图 1920×1200 1758KB → 1280×800 136KB`，识别正常。480×300 的小图不需要 ffmpeg。动图没有测试。

## 9. 模式、唤醒和与 AstrBot 共存

### 模式

模式在 Bridge 控制台中切换。

| 模式 | 行为 | 测试情况 |
|---|---|---|
| `reserved2`（默认） | 模型通过工具自行决定何时说话 | 已测试：关键词唤醒、@ 唤醒、引用、等待后主动发言、发送收藏表情 |
| `reserved` | 模型回复自动分条发送 | 已测试 |
| `chat` | 模型的最终回答直接转发到 QQ | 已测试 |
| `closed-agent` | 管理员私聊使用完整 DSH 工具 | 只测试了管理员私聊回合，以及 `reserved2` 专属工具在此模式下被拒绝；没有测试主机命令执行 |

### reserved2 的唤醒规则

- 关键词唤醒：消息中出现配置的关键词，例如 DeepSeek。普通的问候语（例如“在吗”）不是关键词，消息只会记为未读。
- @ 唤醒：消息中 @ 了机器人。
- 私聊：每条消息都会唤醒。
- 首次唤醒（bootstrap）：每个会话新建后收到的第一条消息，无论内容是什么，都会唤醒一次。切换模式或执行 `/reset` 都会新建会话。

### 与 AstrBot 共存

两者可以同时连接同一个 NeroNet。下面这套配置在测试群中互不重复：

| 输入 | 由谁处理 |
|---|---|
| 以 `/` 开头的消息（所有人，包括管理员） | 只有 AstrBot |
| 关键词、@ 机器人、引用机器人的消息、私聊中的普通消息 | 只有 qq-bridge |

需要做两处设置：

1. **qq-bridge：** 在 `config.json` 的 `onebot` 段加入 `"ignoreSlashCommands": true`，重启 Bridge。

   之后所有以 `/` 开头的消息，Bridge 都不处理、不记入未读、也不触发唤醒（包括首次唤醒），日志记为「共存配置：斜杠命令交给其他 OneBot 客户端处理，桥接忽略」。代价是 Bridge 自己的聊天命令（`/reset`、`/silent` 等）和 DSH 的斜杠命令不能再从 QQ 里发，改用 Bridge 的本地控制台管理。
2. **AstrBot：** 关闭默认的大模型聊天（`provider_settings.enable` 设为 `false`，或在管理面板中关闭），只保留命令和插件。否则在群里 @ 机器人时，AstrBot 也会用自己的模型回复。

不做这两处设置时（默认配置），以下情况会出现两边都回复：

1. 管理员（`ownerQQ`）发送的 `/` 开头消息，Bridge 会当作普通消息或 DSH 命令处理。
2. 会话的首次唤醒会响应任何消息，包括 AstrBot 命令。
3. 在群里 @ 机器人时，AstrBot 也会响应。

其他说明：

- 机器人自己发出的消息不会再推送给两个客户端（`reportSelfMessage: false`），所以两边不会互相回复成环。
- AstrBot 里**监听所有消息的插件**不受唤醒规则约束。例如某个插件收到文件消息时自动回复，这时 Bridge 也可能就同一条消息回复。共存时请只启用按命令触发的插件。
- 也可以按会话分工：两边的白名单填不同的群。
- 两边的来源可以分辨：NeroNet 的日志和管理界面的实时活动会为每次动作调用标出来源连接。例如 AstrBot 的反向 WebSocket 显示为 `astrbot`；qq-bridge 使用的正向 WebSocket 和 HTTP 服务显示为各自的服务名，默认是 `ws-default` 和 `http-default`。

## 10. 排错

| 现象 | 原因和处理 |
|---|---|
| 日志反复出现 `NERONET_ONEBOT_AUTH_REJECTED … (HTTP 401): wrong access token` | WebSocket 令牌不对。重新运行 `Connect-QQBridge.ps1`，或检查 `onebot.wsAccessToken`。修正后重启 Bridge |
| 日志出现 `NERONET_ONEBOT_UNREACHABLE … (ECONNREFUSED); is NeroNet running?` | NeroNet 没有运行，或者地址、端口不对。NeroNet 启动后，Bridge 会自动重连，不需要重启 |
| 工具调用返回 `retcode 1404`，wording 为 `NERONET_ACTION_DISABLED` | qq-bridge 自己用到的动作都默认开放。返回这个结果的动作属于需要手动开启的几组（群管理、群文件管理等），见 NeroNet 部署说明第 8 节；开启后需要重启 NeroNet |
| 发送返回 `retcode 100`，`NERONET_ACCOUNT_OR_NETWORK_UNAVAILABLE` | 机器人 QQ 未登录、掉线或断网。QQ 恢复后自动可用，这条消息不会补发 |
| 日志出现「⚠️ DSH 不可用（重启中？），QQ 消息将入队等待」 | DSH 没有运行或无法访问。恢复后自动补发，日志记为「已补投 … 成功 N 条」 |
| DSH 不可用时还出现「连续多次连上 DSH 事件流后一帧都没收到就断开：多半是 … 协议/版本不匹配」 | 这是上游的通用提示。DSH 只是没有运行时也会出现；先确认 DSH 是否在运行 |
| 日志出现「DSH 端点自愈：试过 N 个候选地址，没有一个响应」 | 没有找到使用同一个 `DSH_HOME` 的 DSH。检查：DSH 是否已启动；Bridge 的 `DSH_HOME` 是否与 DSH 的数据目录相同；`dsh.authToken` 是否留空 |
| 日志出现「会话 … 在 DSH 侧已不存在，退役本地映射并在本次调用中重建」 | 换过 DSH 的数据目录（例如从 Web 改用桌面客户端）后的正常现象，Bridge 会自动新建会话 |
| 日志出现「忽略未授权会话」 | 发消息的群或 QQ 不在 `allow` 列表中 |
| 群里发了消息，Bridge 没有反应 | reserved2 下只有关键词、@ 才会唤醒，其他消息只记为未读。见第 9 节 |
| 收藏表情发送失败：「图片下载失败 … 域名解析失败」 | 电脑不能直接解析和访问 QQ 图片服务器。见第 8 节的 `onebot.mediaProxy` |
| 收藏表情发送失败：「代理拒绝连接 …」或「无法连接媒体代理」 | `onebot.mediaProxy` 指向的代理不可用，或代理不允许访问该域名 |
| `state\tool-restrict.log` 里有 `absent=…` | 正常。它表示守卫名单里有这么多工具名在当前 DSH 里不存在，不需要隐藏。只有 `failed` 不为 0 才需要关注（见下） |
| DSH 日志中出现「restrict 失败 N 个（工具存在但无法隐藏…）」 | 有工具存在却没能从模型的工具列表里隐藏。调用时的白名单仍然会拒绝它；请带上这一行和 DSH 版本反馈问题 |
| 语音消息只显示「[语音]」 | NeroNet 2.1 实现了语音转文字（`fetch_ptt_text`），返回格式与 Bridge 使用的一致，但还没有和 qq-bridge 一起测试。转写失败或 QQ 没有给出文字时，Bridge 只显示「[语音]」 |
| 发了一张大图，模型说图片打不开或加载失败；Bridge 日志有 `[media] 图片1 不提供：…找不到 ffmpeg` | 图片超过 1 MiB 或长边超过 1280 像素，而 Bridge 没有找到 ffmpeg。见第 8 节“大图、动图和 ffmpeg” |
| `setup-dsh.mjs` 显示 `缺失：…` 和“安装不完整” | 真实的安装失败。按列出的缺失项检查 `DSH_HOME` 是否正确、是否有权限创建目录链接，然后重新运行 |
| 从剪贴板粘贴图片后，模型说“这是文件，读不到图” | QQ 客户端把粘贴的内容当作文件发出了。改用聊天窗口的「图片」按钮选择图片发送 |

## 11. 更新和回退

- **升级适配器：** 先用安装时的那一版适配器执行 `--revert`，再用新版 NeroNet 自带的 `apply-adapter.mjs` 安装，然后重新执行 `setup-dsh.mjs`，重启 DSH 和 Bridge。`config.json` 不会被修改。从 1.2.0 升到 1.2.1 也按这个顺序做。
- **回到上游 qq-bridge：**

  ```powershell
  node <NeroNet>\integrations\qq-bridge\adapter\apply-adapter.mjs <qq-bridge> --revert
  cd <qq-bridge>; npm ci
  ```

  `--revert` 用 `.neronet-adapter-backup` 中保存的原件恢复被替换的文件和文件名，删除适配器添加的文件，然后删除备份目录。恢复之前逐个核对：适配后又被手动改过的文件、与记录不符的备份都会让它拒绝执行，不做任何修改。安装中途被打断时，用同一条命令恢复。

- **回退 NeroNet 配置：** 停止 qq-bridge 和 NeroNet，把配置工具生成的 `*.bak-qqbridge-<时间>` 文件复制回原文件，再启动。
- **从 DSH 的 profile 中移除 qq-bridge：** `setup-dsh.mjs` 在修改 `cordis.patch.yml` 之前会留下带时间的备份（`cordis.patch.yml.bak-<时间>`）；`package.json` 中的 `qq-mode-console`、`qq-agent-presets` 两项和 `DSH_HOME\plugins` 下的两个同名链接可以手动删除。

## 12. 许可

qq-bridge 采用 **PolyForm Noncommercial License 1.0.0**，Required Notice：`Copyright 2026 Derpyu520 and qq-bridge contributors`。`adapter\files\` 中的文件是修改过的 qq-bridge 文件；适配后的 qq-bridge 仍受该许可证约束，只能用于非商业用途。上游的许可全文（含 Required Notice）在 `adapter\LICENSE`，每个文件的来源和哈希在 `adapter\UPSTREAM.json`；上游对其自身所含第三方组件的说明见上游仓库的 `NOTICE.md`。再分发时请一并保留许可全文和 Required Notice。
