# NeroNet × AstrBot 接入指南

适用版本：NeroNet 2.1.0（Windows 版；Linux 版的说明在 Linux 包里）；AstrBot 4.x（测试使用 AstrBot v4.29.4 和 v4.30.0-alpha.1）。

本目录的文件：本指南、`Connect-AstrBot.ps1`（一步配置脚本）和它调用的 `connect-astrbot.mjs`。

AstrBot 项目主页：[GitHub](https://github.com/AstrBotDevs/AstrBot) · [官网](https://astrbot.app) · [文档](https://docs.astrbot.app)。

NeroNet 让已登录的 QQ 作为 OneBot v11 实现端运行。AstrBot 通过自带的 `aiocqhttp`（OneBot v11）平台适配器接入 NeroNet 后，可以在 QQ 群聊和私聊中使用 AstrBot 的大模型对话、指令和插件市场里的插件。

## 1. 适配状态

以下项目都在真实 QQ 群聊和私聊中测试通过（测试所用的 NeroNet 构建和 QQ 版本见第 10 节）：

| 类别 | 测试内容 |
|---|---|
| 连接 | 反向 WebSocket、令牌鉴权、AstrBot 或 NeroNet 重启后自动重连、与其他 OneBot 客户端同时在线 |
| 大模型对话 | 群聊用唤醒前缀或 @ 机器人唤醒、私聊直接对话，回复正常送达 |
| 消息 | 文字、@、引用回复、读取被引用的消息、撤回、戳一戳、表情回应、延迟主动消息、合并转发 |
| 媒体 | 群聊和私聊中发送和接收图片、语音、视频、文件，接收到的文件与原文件大小一致 |
| 信息读取 | 登录号、版本、状态、好友列表、群列表、群信息、群成员、陌生人信息、群聊和私聊历史消息 |
| 跨机器路径 | 连接非回环的局域网地址；文件和视频通过 `callback_api_base` 链接下载 |
| 插件市场 | 9 个市场插件实际安装测试，见第 9 节 |
| 一步配置 | `Connect-AstrBot.ps1` 同时写好 NeroNet 和 AstrBot 两侧配置 |

尚未覆盖的范围见第 10 节。

## 2. 工作方式

```
QQ（已登录） ⇄ NeroNet ──反向 WebSocket──▶ AstrBot（aiocqhttp，默认端口 6199）
```

- AstrBot 是 WebSocket **服务端**，在 `ws://<地址>:6199/ws` 等待连接；NeroNet 是**客户端**，主动连过去，断开后每 5 秒重连。
- 双方使用同一个访问令牌（Bearer Token）。消息格式为数组（array）。
- AstrBot 和插件通过 OneBot 动作操作 QQ。AstrBot 和插件用到的动作在 NeroNet 中默认开放（见第 6 节）。

## 3. 准备

1. 登录机器人 QQ，用 `start.bat` **至少启动一次 NeroNet**（见 `README.md`）。首次启动会生成数据目录下的 `config\onebot_<机器人QQ>.json`。
2. 安装 AstrBot（官方安装方式任选：源码 / uv、Docker、桌面启动器），**至少启动一次**，让它生成 `data` 目录，并在 AstrBot 管理界面配置好大模型提供商。
以下示例路径请换成实际路径：

```powershell
$astrData = 'C:\AstrBot\data'            # AstrBot 的 data 目录
```

下面的命令都在 NeroNet 文件夹中打开 PowerShell 执行。配置脚本默认使用 NeroNet 文件夹里的 `node.exe`（没有时用系统中安装的 Node.js）和 `data` 目录；数据目录在别处时加 `-HomeDirectory <数据目录>`，要用别的 Node.js 时加 `-NodePath <node.exe>`。

## 4. 方案 A：AstrBot 与 NeroNet 在同一台 Windows 电脑（推荐）

1. 停止 AstrBot。
2. 先预览，确认要改什么（不写入）：

   ```powershell
   .\integrations\astrbot\Connect-AstrBot.ps1 -AstrBotData $astrData -Check
   ```

3. 正式写入：

   ```powershell
   .\integrations\astrbot\Connect-AstrBot.ps1 -AstrBotData $astrData
   ```

   脚本会：
   - 在 NeroNet 中添加名为 `astrbot` 的 WebSocket 客户端（`ws://127.0.0.1:6199/ws`，Universal，array 格式）。
   - 在 AstrBot 的 `cmd_config.json` 中添加 `aiocqhttp` 平台 `neronet`，只监听 `127.0.0.1:6199`。
   - 两边使用同一个随机令牌。已有令牌时沿用；令牌不会显示在屏幕上。
   - 修改前，每个文件都备份为 `*.bak-astrbot-<时间>`。

4. 正常重启 NeroNet（服务配置只在启动时读取）：先运行 `stop.bat`，再运行 `start.bat`。

5. 启动 AstrBot。AstrBot 先启动还是后启动都可以。
6. 检查连接：
   - NeroNet 管理界面「运行总览 → 连接与服务」中，`astrbot` 显示「WebSocket 客户端 · 已连接」。
   - 在 QQ 里向机器人发送 `/help`，应收到 AstrBot 的帮助。

## 5. 方案 B：AstrBot 在另一台电脑或 Docker 中

### AstrBot 一侧

在 AstrBot 管理界面「平台」中新增 `OneBot v11（aiocqhttp）`：

| 字段 | 值 |
|---|---|
| 反向 WebSocket 主机 `ws_reverse_host` | `0.0.0.0`（Docker 中必须是 0.0.0.0） |
| 端口 `ws_reverse_port` | `6199` |
| 令牌 `ws_reverse_token` | 一段随机字符串，至少 16 个字符 |

Docker 部署时，把 6199 端口映射出来。AstrBot 官方 `compose.yml` 已包含这一项：

```yaml
    ports:
      - "6185:6185" # AstrBot WebUI
      - "6199:6199" # OneBot v11 反向 WebSocket
```

需要发送**文件或视频**时，还要在 AstrBot 配置中设置 `callback_api_base`，例如 `http://<AstrBot 地址>:6185`。这个地址必须能从 NeroNet 所在电脑访问。原因：AstrBot 发送文件和视频时，默认只给出它自己机器上的本地路径；设置了 `callback_api_base` 后改为给出下载链接，NeroNet 从链接下载。图片和语音以内容本身发送，不需要这一项。

### NeroNet 一侧

```powershell
.\integrations\astrbot\Connect-AstrBot.ps1 -Url 'ws://<AstrBot 地址>:6199/ws' -Token '<与 AstrBot 相同的令牌>'
```

不带 `-AstrBotData` 时，脚本只修改 NeroNet 一侧。没有现成令牌时，可以去掉 `-Token`、加上 `-ShowToken`：脚本会生成令牌并显示一次，再把它填进 AstrBot。然后正常重启 NeroNet。

AstrBot 用 Docker 跑在同一台电脑上时，地址写 `ws://127.0.0.1:6199/ws`。这种情况**不要**使用 `-AstrBotData`：该参数会把监听地址写成 127.0.0.1，容器内无法接受连接。

### 网络安全

- 只在 AstrBot 所在电脑的防火墙上对 NeroNet 那台电脑开放 TCP 6199，不要对公网开放。
- 令牌是唯一的鉴权手段。跨不可信网络时，在 AstrBot 前加 TLS 反向代理，NeroNet 使用 `wss://` 地址。
- NeroNet 的管理界面仍然只在本机访问，与 AstrBot 的部署位置无关。

## 6. 动作权限

2.1 起，NeroNet 实现的动作默认全部开放，AstrBot 和插件不需要额外配置。2.0 及更早版本使用的 `astrbot` 动作档案已经不需要；旧的动作配置文件里写着它也能正常读取，只是不再起作用。

只有下面几组需要手动开启：群管理（`group-admin`：踢人、禁言、设置管理员、改群名片等）、群文件管理（`group-files`：删除、移动、重命名群文件等）、好友和加群申请（`requests`）、群公告（`group-notice`）、Cookie 和凭据（`web-credentials`，拿到的等同于账号的网页登录态，只在确实需要时开启）。插件需要它们时，在管理界面「管理 → 动作权限」中勾选，或写进数据目录的 `config\neronet-actions.json`，然后重启 NeroNet：

```json
{"profiles":["group-admin"]}
```

只需要其中个别动作时，写在 `extraActions` 里，例如 `{"extraActions":["set_group_ban"]}`。每组包含哪些动作，见 [部署说明第 8 节](../../docs/DEPLOY.md)。删好友没有实现。

QQ 空间的动作（`send_qzone_msg`、`delete_qzone_msg`、`get_qzone_msg_list`、`get_qzone_msg_detail`、`set_qzone_msg_right`）也默认开放，不需要填写 Cookie。参数和错误编号见 [部署说明第 10 节](../../docs/DEPLOY.md)。

调用没有开启的动作时，NeroNet 返回 `retcode 1404`（wording 为 `NERONET_ACTION_DISABLED`；插件请按 retcode 判断），插件里表现为 `ActionFailed`。NeroNet 日志会记一条 `actionRejected` 警告（同一个动作 10 分钟内只记一次），管理界面「API 终端 → 实时活动」也会显示这次调用。按这些记录判断是否要开启该动作。

## 7. 语音、视频和 ffmpeg

- 语音：内置 SILK 编码（WebAssembly），**不需要 ffmpeg**。WAV 和 SILK 可以直接发送。发送 MP3、OGG、AMR 等其他格式时需要 ffmpeg。如果 AstrBot 的语音合成（TTS）输出 MP3 等格式，需要安装 ffmpeg。
- 视频：可以直接发送。生成视频封面需要 ffmpeg；没有 ffmpeg 时使用默认封面，视频本身不受影响。
- 安装 ffmpeg 后，把它放在 PATH 中，或在启动 NeroNet 前设置环境变量 `NERONET_FFMPEG` 指向 `ffmpeg.exe`。

## 8. 检查和排查

接入后可以这样逐项确认：

1. NeroNet 管理界面「运行总览 → 连接与服务」中 `astrbot` 显示已连接。
2. 在 QQ 里向机器人发送 `/help`，收到 AstrBot 的帮助，说明收发正常。
3. 用唤醒前缀或 @ 机器人发一句话，收到大模型的回复。
4. 需要单独检查某个动作时，在 NeroNet 管理界面的「API 终端」中直接调用它并查看返回。「实时活动」会显示每个客户端调用了哪些动作、结果如何。

| 现象 | 处理 |
|---|---|
| `astrbot` 一直显示重连中 | 确认 AstrBot 已启动、端口和地址一致、两边令牌相同；跨机器时检查防火墙。连接失败时，NeroNet 每分钟最多记录一条警告 |
| 插件报 `ActionFailed`，retcode 1404 | 动作需要手动开启（群管理、群文件管理等），见第 6 节 |
| 发送语音或视频返回 `NERONET_HIGHWAY_PROXY_REJECTED_403` | 你配置的上传代理（`NERONET_HIGHWAY_PROXY` 或 `HTTP_PROXY`）拒绝了 QQ 媒体服务器：在代理上放行 QQ 媒体上传地址，或改为直连 |
| 调用返回 `NERONET_NATIVE_REJECTED: NERONET_COMMAND_NOT_IN_RELEASE_POLICY` | 这项功能需要的 QQ 内部命令不在当前 NeroNet 版本的白名单中。请升级 NeroNet，或带上日志里出现的命令名反馈问题 |
| AstrBot 下载图片失败（没有 DNS 或需要代理的网络） | 在 AstrBot 自己的配置中设置 `http_proxy`。AstrBot 启动时会清除系统代理环境变量 |
| 跨机器时发文件或视频失败 | 设置 `callback_api_base`，见第 5 节 |
| 机器人和另一个 OneBot 客户端同时回复 | 每个客户端都会收到同一条消息。给 AstrBot 设置唤醒前缀，并开启「私聊也需要唤醒前缀」，避免触发词重叠 |

## 9. 测试过的市场插件

在真实 QQ 中安装并运行：

| 插件 | 结果 |
|---|---|
| `astrbot_plugin_qq_group_daily_analysis`（群分析） | 通过：读取群历史消息、调用大模型分析、生成图片报告并发送 |
| `astrbot_plugin_help`（帮助图） | 通过 |
| `astrbot_plugin_essential`（今天吃什么等） | 不依赖外网的功能通过；需要外网的功能在测试环境中因没有 DNS 返回了插件自己的错误提示，NeroNet 侧正常 |
| `astrbot_plugin_meme_generator`（表情包） | 通过（模板列表图片） |
| `astrbot_plugin_meting`（点歌） | NeroNet 侧正常；搜歌需要外网，测试环境中返回插件的错误提示 |
| `astrbot_plugin_qq_tools`（大模型工具） | 已加载；能否调用撤回等工具取决于所用模型的工具调用能力 |
| `astrbot_plugin_anti_revoke`、`astrbot_plugin_link_resolver` | 已加载；用到的动作都默认开放 |
| `astrbot_plugin_qzone_bridge` v2.1.0（QQ 空间桥接，未修改） | 通过（当时需要开启 `qzone` 档案，2.1 起默认开放）：在插件的管理页面发表文字、图片、指定好友可见的说说并删除；图片不合格时插件显示 NeroNet 返回的原因。NeroNet 1.6.0、AstrBot v4.29.4、QQ 9.9.36 |
| `astrbot_plugin_meme_manager` | 已加载；与 AstrBot 测试版本的人格功能存在兼容问题，属插件与 AstrBot 之间的问题 |

插件只调用默认开放的动作时，不需要额外配置。群分析插件会在 `get_stranger_info` 之后再尝试非标准动作 `get_user_info` 来获取头像。NeroNet 不提供 `get_user_info`，返回 1404，不影响报告生成。

## 10. 已知限制

- **测试所用版本**：本指南的测试在 NeroNet 1.3.0 至 1.4.x 的构建和 QQ 9.9.25 上完成。之后在 NeroNet 1.5.1、AstrBot v4.29.4 和 QQ 9.9.37 上按“全新安装”重新测试了：一步配置、`astrbot` 档案的动作、私聊和群聊对话（指令、唤醒前缀、@ 机器人）、收图、两边各自重启后的自动重连；1.5.2 上回归了一步配置和私聊指令；1.6.0 上回归了指令和对话。插件市场的测试没有重做。NeroNet 支持的 QQ 版本见 `docs\KNOWN_LIMITS.md`。
- **2.1**：动作默认开放和 2.1 新增的动作还没有用 AstrBot 和插件重新测试。
- **长时间运行**：没有做过长时间连续运行的专门测试。在开发和测试过程中，没有出现过因 QQ 风控或其他原因被强制下线的情况。
- **插件**：AstrBot 插件市场有一千多个插件，不可能逐个保证。2.0 及更早版本的动作范围按 AstrBot 核心和 61 个热门插件的实际调用确定，并对 9 个插件做了实装测试；2.1 起动作默认开放。需要管理动作或非标准动作的插件，按第 6 节处理。
- **管理动作**：2.0 起群管理、请求处理和群公告已经实现，开启 `group-admin`、`requests`、`group-notice` 档案后可供插件使用；这些动作通过 OneBot 逐项测试过，用插件市场里的管理类插件做的测试还没有。
- **QQ 空间插件**：只测试了上表中的 `astrbot_plugin_qzone_bridge`，它通过 NeroNet 的空间动作工作。自己读取 Cookie（`get_cookies`、`get_credentials`）再访问空间的插件，例如自动点赞类插件，需要开启 `web-credentials` 档案，没有测试过。该插件由大模型自动发说说的功能没有测试。
- **大模型工具调用**：「撤回」「戳一戳」这类由大模型自己决定调用的工具，是否真的执行取决于所用模型。小模型可能只用文字回答「已撤回」而没有实际调用；这与 NeroNet 无关，对应的动作本身已测试通过。
- **跨机器部署**：AstrBot 在其他电脑或 Docker 中时，NeroNet 走的代码路径与同机部署相同，区别只在连接地址。测试环境中两台机器之间不能直接连接，因此跨机器场景是用两项测试来确认的：NeroNet 连接 AstrBot 的局域网地址（非回环地址）且 AstrBot 监听 0.0.0.0；文件和视频经 `callback_api_base` 链接下载。没有在两台真实的机器之间测试。
- **合并转发**：
  - 嵌套最多 3 层；私聊转发每个节点最多 1 个文件；转发中不能包含戳一戳。
  - 引用已有消息的节点（`id`）只能引用 NeroNet 收到或发出过的消息。
  - `send_forward_msg` 不指定目标、只上传时，不能包含图片、语音、视频。
  - 机器人刚发出的转发里的图片，短时间内用 `get_forward_msg` 或 `get_image` 回读时拿不到图片地址；QQ 中显示正常。
- **媒体显示**：部分 QQ 客户端版本会把机器人自己发出的图片显示为空白，这是 QQ 客户端的显示问题；对方收到的图片正常。
