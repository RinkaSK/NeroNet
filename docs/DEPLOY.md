# NeroNet 部署与更新

适用版本：1.6.0。示例中的路径和进程号请换成实际值。

## 1. 准备

- Windows x64。
- Node.js 24（x64）。带 Node 的下载包（`-with-node`）已附带，不用另装。用不带 Node 的下载包时，安装 Node.js 后 `node` 在 PATH 中即可；也可以把 `node.exe` 放进 NeroNet 文件夹，或用 `-NodePath` 指定。NeroNet 优先使用文件夹里的 `node.exe`。
- 已安装的 Windows 版 QQ，版本在 [KNOWN_LIMITS.md](KNOWN_LIMITS.md) 第 1 条列出的范围内。
- 已登录的机器人 QQ。电脑上只运行这一个 QQ 即可（例如云服务器）。

## 2. 直接使用

1. 把压缩包解压到一个文件夹（不要直接解压到磁盘根目录）。
2. 登录机器人 QQ。
3. 双击 `start.bat`。

启动时 NeroNet 依次做这些事，任何一步不符都不会启动：

- 找到正在运行的 QQ。恰好一个时接入它；一个都没有时提示先登录；有多个时不会自己挑选，见第 3 节。
- 在 `data` 目录里写好运行配置 `data\deployment.json`（每次启动都会按当前位置和 QQ 路径刷新）。
- 核对包内文件与 `SHA256SUMS.txt` 一致、Native 组件与 `native\native-manifest.json` 一致。

启动后窗口里显示：

```
NeroNet 已启动。状态：已就绪
  机器人 QQ 进程：1234（电脑上唯一运行的 QQ）
  管理界面：http://127.0.0.1:5099
  初始密码：D:\NeroNet\data\webui-initial-password.txt（首次登录后请修改，修改后这个文件会自动删除）
  数据目录：D:\NeroNet\data
  停止：运行 stop.bat
```

- 状态不是“已就绪”时（例如 QQ 还没登录完），NeroNet 在后台继续等待，窗口可以关掉。
- `http://127.0.0.1:5100` 返回就绪状态（JSON），可用于脚本检查。
- 第一次打开管理界面：用初始密码登录，阅读并确认使用须知和数据说明，然后在「安全与访问」里修改密码。修改成功后，`webui-initial-password.txt` 会自动删除，启动时也不再提示初始密码；如果文件没能删除，界面会提示手动删除它。
- 首次启动会自动建好两个只监听本机的 OneBot 服务：HTTP `127.0.0.1:3000` 和正向 WebSocket `127.0.0.1:3001`，访问令牌在管理界面「OneBot 配置」里查看。

停止：双击 `stop.bat`。它请求正常关闭并等待最多 40 秒，不会强行结束进程。NeroNet 停止后，已经加载进 QQ 的组件会留在 QQ 进程里，直到 QQ 退出。

其他说明：

- 启动需要有权限访问 QQ 进程。QQ 以管理员身份运行时，请右键 `start.bat` 选择“以管理员身份运行”。不需要关闭系统的安全防护。
- 机器人 QQ 退出后重新登录，NeroNet 会自动重新接入，不需要重启 NeroNet（多个 QQ 时的条件见第 3 节）。接入后会核对账号：登录的不是 `data` 目录绑定的机器人账号时，NeroNet 不使用这个 QQ，继续等待机器人账号登录。
- 同一个 QQ 程序登录过多个账号时，重新打开 QQ 可能会自动登录上次用过的另一个账号。这时 NeroNet 会短暂接入它、发现账号不符后放开；它加载的组件会留在那个 QQ 进程里，直到它退出。在这样的电脑上请用 `-AdminPid` 指明另一个账号的 QQ（见第 3 节），并在重启机器人 QQ 时确认登录的是机器人账号。
- 想换一个机器人账号：停止 NeroNet，换一个新的 NeroNet 文件夹（或清空 `data` 目录）再启动。

连接中断后的自动恢复：

- NeroNet 与 QQ 里的组件之间的连接意外中断时，NeroNet 会自动恢复：先确认旧的连接已经清理干净，再重新核对 QQ 进程、账号和登录状态，然后重新接入。正常情况下几秒到十几秒完成。
- 恢复期间管理界面和 OneBot 服务不可用，恢复后自动可用，客户端按自己的重连方式重新连接即可。
- **中断时正在发送的消息不会自动重发。** 这些请求会收到失败的回应，但消息有可能已经送达，是否重发由客户端自己决定。
- 10 分钟内最多自动恢复 3 次，每次之前的等待依次是 2 秒、5 秒、15 秒。超过次数，或者无法确认旧的连接已经清理干净时，NeroNet 会停止，并在 `supervisor-metadata.jsonl` 里记录原因（`recoveryExhausted` 或 `recoveryBlocked`）。这时请正常退出并重新登录机器人 QQ，再启动 NeroNet。
- 用 `stop.bat` 停止的 NeroNet 不会自动恢复；恢复过程中运行 `stop.bat` 也会立即停止。
- 恢复时如果登录的不是绑定的机器人账号，或者 QQ 还没登录完，NeroNet 按第 2、3 节的规则保持等待。

接入 QQ 失败时：

- 启动窗口会显示这次失败的原因、QQ 的版本、组件返回的原始结果和处理建议。组件没有给出具体原因时，窗口会如实写“原因尚未确认”。
- 一次接入的结果不能确认时（例如组件没有确认已经清理完成），NeroNet 会对这个 QQ 进程启用保护，在它退出之前不再接入。保护记录是 `data` 目录里的 `native-startup-unresolved.json`，其中也保存了当时的原因。
- 解除保护的方法是正常退出这个 QQ 进程：在 QQ 主菜单里选“退出”，只关闭窗口或只退出账号时进程可能还在。QQ 进程退出后保护自动解除，不需要手动删除文件。如果失败的原因没有处理，重新登录后会再次得到同样的结果。
- 反馈问题时，请提供启动窗口显示的内容，以及 `data\supervisor-metadata.jsonl` 里这次启动的记录（同一次启动的记录带有相同的 `runId`）。不要发送密码、令牌、数据库和聊天内容。

## 3. 电脑上有多个 QQ

NeroNet 不会在多个 QQ 之间自己挑选，启动会报错并列出进程号。这时用参数启动（在 NeroNet 文件夹里打开 PowerShell）：

```powershell
.\scripts\Start-NeroNet.ps1 -BotPid 1234 -AdminPid 5678
```

- `-BotPid <进程号>`：指定机器人 QQ。
- `-AdminPid <进程号>`：指定一个永远不接入的 QQ（例如你自己的账号）。只有两个 QQ 时，只给 `-AdminPid` 也可以，剩下的那个就是机器人。

启动后的提示会说明机器人 QQ 是怎么确定的：“由 -BotPid 指定”“电脑上唯一运行的 QQ”，或者“排除 -AdminPid 指定的 QQ 后，剩下的唯一一个 QQ”。

电脑上同时运行着两个安装位置的 QQ（例如新旧两个版本）时，也用 `-BotPid` 指定：NeroNet 使用该进程所属的那个 QQ。

下面的命令列出可以接入的 QQ 主进程（每个登录的账号一个）；哪个进程属于哪个账号，可以按启动时间或在任务管理器中辨认：

```powershell
Get-Process QQ | Where-Object { try { $_.Modules.ModuleName -contains 'wrapper.node' } catch { $false } } | Select-Object Id, StartTime
```

机器人 QQ 重启后的自动接入，只在能确定哪个进程是机器人时进行：

- 没有指定 `-AdminPid`：电脑上只有一个 QQ 进程时接入它；有两个或更多时保持等待。
- 指定了 `-AdminPid`：接入除它以外唯一的那个 QQ 进程。被指定的进程自己也重启过的话，无法再区分，保持等待。
- 保持等待时，停止 NeroNet 后带上新的进程号重新启动。

这些参数也可以直接跟在 `start.bat` 后面：`start.bat -BotPid 1234`。

## 4. 数据目录

直接使用时，数据目录是 NeroNet 文件夹里的 `data`。

| 路径 | 内容 |
|---|---|
| `deployment.json` | 运行配置（自动生成） |
| `webui-initial-password.txt` | 管理界面的初始密码。只在还没有修改密码时存在，修改密码后自动删除 |
| `config\runtime.json` | 管理界面的监听地址、端口和日志保留设置 |
| `config\local-token` | 默认的 OneBot 访问令牌（首次启动时生成，默认的两个服务使用它） |
| `config\onebot_<机器人QQ>.json` | OneBot 服务配置（含访问令牌） |
| `config\neronet-actions.json` | 动作配置（开放哪些动作） |
| `config\webui.json` | 管理界面的密码哈希 |
| `data\upper\messages.sqlite` | 消息库 |
| `data\neronet-images\` | 图片缓存 |
| `logs\neronet-<日期>.log` | 日志 |
| `supervisor-metadata.jsonl`、`gateway-metadata.jsonl` | 启动和关闭记录，各自最多保留约 24 MiB |

备份时备份整个数据目录。其中有令牌和聊天内容，请按敏感数据保管。

数据目录之外，NeroNet 还会把识别 QQ 程序文件的结果保存在当前 Windows 用户的 `%LOCALAPPDATA%\NeroNet\binding-cache` 里（不含账号和聊天数据）。删除它只会让下次接入时重新识别一次。

## 5. 更新和回退

NeroNet 只支持完整包更新，没有在线更新。

1. 双击旧版本的 `stop.bat`。
2. **正常退出机器人 QQ**，再重新登录。旧版本的组件留在 QQ 进程里，不退出 QQ 就无法换成新版本。电脑上的其他 QQ 不需要退出。
3. 把新版本解压到一个**新文件夹**，把旧文件夹里的 `data` 目录整个复制过去。
4. 双击新版本的 `start.bat`。

不要把新版本的文件覆盖到旧文件夹上，也不要把不同版本的文件混在一起使用（例如新的 `app` 配旧的 `native`）。

如果跳过了第 2 步（没有退出 QQ 就启动了新版本），NeroNet 不会接入这个 QQ，并提示“这个 QQ 里还留着另一个版本的 NeroNet 组件”。这时不需要停止 NeroNet：正常退出机器人 QQ 再重新登录，NeroNet 会自动接入。

回退：停止新版本，正常退出并重新登录机器人 QQ，回到旧文件夹启动。更新前请保留旧文件夹；消息库和图片引用不保证跨版本通用，回退时使用更新前的那份 `data`。

QQ 自身更新后，NeroNet 第一次接入新版本时会先识别（通常几秒，最长几分钟，启动窗口会显示“正在识别当前 QQ”），识别成功就照常接入。识别不了时会显示原因，这时 NeroNet 不会接入这个 QQ。用于正式服务的机器人，建议关闭 QQ 的自动更新，先在测试环境确认新版本可用再更新。

## 6. 环境变量

都在启动 NeroNet 之前设置，全部可选。

| 变量 | 作用 |
|---|---|
| `NERONET_FFMPEG` | `ffmpeg.exe` 的完整路径 |
| `NERONET_HIGHWAY_PROXY` | 上传图片、语音、视频时使用的 HTTP 代理 |
| `NERONET_LOG_LEVEL` | 日志级别 |
| `NERONET_WEBUI_BOOTSTRAP_PASSWORD` | 第一次启动时使用的管理界面密码（至少 8 个字符），代替随机初始密码。使用它时不会生成 `webui-initial-password.txt` |
| `NERONET_DEPLOYMENT_PROFILE` | 部署配置文件路径（第 9 节）；与 `-DeploymentProfile` 作用相同 |

## 7. 可选：ffmpeg

发送 WAV、SILK 语音和发送视频都不需要 ffmpeg。以下情况需要：

- 发送 MP3、OGG、AMR 等其他格式的音频。
- 生成视频封面（没有 ffmpeg 时使用默认封面，视频本身不受影响）。
- `get_record` 的 `out_format` 转码：转成 wav 不需要；转成 mp3、amr、wma、m4a、spx、ogg、flac 需要，并且 ffmpeg 要带有相应的编码器。

把 `ffmpeg.exe` 放在 PATH 中，或设置 `NERONET_FFMPEG`。没有 ffmpeg 时，需要它的调用返回 `NERONET_RECORD_CONVERTER_MISSING` 之类的明确错误，不会返回伪造的结果。

## 8. 接入 OneBot 客户端

- AstrBot：见 [integrations/astrbot/README.md](../integrations/astrbot/README.md)。
- qq-bridge：见 [integrations/qq-bridge/README.md](../integrations/qq-bridge/README.md)。
- 其他客户端：在管理界面「OneBot 配置」中添加 HTTP 或 WebSocket 服务并设置令牌，再在数据目录的 `config\neronet-actions.json` 中开放客户端需要的动作，例如：

  ```json
  {"profiles":[],"extraActions":["get_group_list","get_friend_list"]}
  ```

  动作配置只在启动时读取，修改后需要正常重启 NeroNet。调用未开放的动作返回 `retcode 1404`。

## 9. 固定目录部署（可选）

需要把程序和数据分开放、限定只能在指定目录和指定电脑上运行，或者在一台电脑上运行多个机器人时，使用部署配置。

1. 把 `docs\deployment.example.json` 复制到 NeroNet 文件夹之外，例如 `C:\NeroNet-config\deployment.json`，然后修改：

   | 字段 | 含义 |
   |---|---|
   | `qqExecutable` | `QQ.exe` 的完整路径。只有这个程序的进程会被接入 |
   | `installRoot` | 安装目录的上级目录，例如 `C:\NeroNet`。NeroNet 只能从这个目录内启动 |
   | `homeRoot` | 数据目录的上级目录，例如 `C:\NeroNet-data` |
   | `mode` | 填 `portable` |
   | `allowedComputerName` | 填电脑名时，这份配置只能在该电脑上使用；不限制时填 `null` |
   | `managementHosts` | 管理界面允许监听的地址，默认只有本机。只接受本机地址和内网地址 |
   | `nativeRoot`（可选） | 允许使用的 Native 组件目录的上级目录，默认与 `installRoot` 相同 |

   这个文件里不要写密码或令牌。NeroNet 会检查真实路径（包括目录链接）；使用部署配置时，安装目录和数据目录不能互相包含。

2. 校验并安装到新目录（可选；也可以直接把包解压到 `installRoot` 下的一个目录）：

   ```powershell
   $node    = 'C:\Tools\node-v24.22.1-win-x64\node.exe'
   $profile = 'C:\NeroNet-config\deployment.json'
   .\scripts\Test-NeroNet.ps1 -NodePath $node
   .\scripts\Install-NeroNet.ps1 -NodePath $node -DeploymentProfile $profile -Destination 'C:\NeroNet\1.6.0'
   ```

   安装脚本把文件复制到一个新目录并再次核对。目标目录已存在时拒绝执行，不会覆盖旧版本。

3. 启动和停止：

   ```powershell
   Set-Location 'C:\NeroNet\1.6.0'
   .\scripts\Start-NeroNet.ps1 -NodePath $node -DeploymentProfile $profile -HomeDirectory 'C:\NeroNet-data\bot'
   .\scripts\Stop-NeroNet.ps1 -HomeDirectory 'C:\NeroNet-data\bot'
   ```

   每个机器人使用自己的数据目录。`-BotPid`、`-AdminPid` 的用法与第 3 节相同。更新时把新版本安装到新目录，用同一份部署配置和数据目录启动；`-NativeDirectory` 只能指向与当前包的清单完全一致的 Native 组件。

`scripts\Test-NeroNet.ps1` 证明文件完整，不是发布者签名。

## 10. QQ 空间

QQ 空间的动作默认不开放。在数据目录的 `config\neronet-actions.json` 的 `profiles` 中加入 `qzone`，然后正常重启 NeroNet：

```json
{"profiles":["astrbot","qzone"]}
```

不需要填写 Cookie，NeroNet 用已登录的机器人 QQ 取得空间的登录态。

| 动作 | 参数 | 返回 |
|---|---|---|
| `send_qzone_msg` | `content` 正文（必填）；`images` 图片数组，最多 9 张，可以是 `base64://`、`http(s)://`、`file://` 或本地路径；`ugc_right` 查看权限，默认 1；`target_uins` QQ 号数组，权限为 16 或 128 时必填 | `{tid, time}` |
| `delete_qzone_msg` | `tid` | 无 |
| `get_qzone_msg_list` | `target_uin`（省略为机器人自己）、`pos`（默认 0）、`num`（1 到 40，默认 20） | `{total, pos, num, msglist}` |
| `get_qzone_msg_detail` | `tid`、`target_uin`、`pos`、`num`（评论分页） | `{tid, uin, content, time, images, comment_num, comments, ugc_right}` |
| `set_qzone_msg_right` | `tid`、`ugc_right`、`target_uins` | `{tid, ugc_right, target_uins, confirmed}` |

查看权限 `ugc_right`：1 所有人可见，4 好友可见，16 只有 `target_uins` 中的好友可见，64 仅自己可见，128 `target_uins` 中的好友不可见。

**注意：`send_qzone_msg` 不传 `ugc_right` 时是所有人可见。** 试用时建议明确传 `ugc_right: 64`（仅自己可见），确认无误后再放开。

失败时返回的 `wording` 以错误编号开头，后面是原因、出错的阶段和处理办法：

| 错误编号 | 含义 |
|---|---|
| `NERONET_QZONE_PARAM_INVALID` | 参数不正确（`retcode 1400`） |
| `NERONET_ACCOUNT_OR_NETWORK_UNAVAILABLE` | 机器人 QQ 不在线 |
| `NERONET_WEB_CREDENTIALS_UNAVAILABLE` | 没有取得空间的登录态 |
| `NERONET_QZONE_AUTH_EXPIRED` | QQ 空间不接受当前登录态（已自动刷新过一次） |
| `NERONET_QZONE_VERIFICATION_REQUIRED` | QQ 空间要求人工验证，需要用机器人账号手动完成 |
| `NERONET_QZONE_PERMISSION_DENIED` | 没有权限 |
| `NERONET_QZONE_RATE_LIMITED` | QQ 空间提示操作频繁，过一段时间再试 |
| `NERONET_QZONE_POST_NOT_FOUND` | 说说不存在或已经删除 |
| `NERONET_QZONE_DELETE_NOT_CONFIRMED` | QQ 空间接受了删除请求，但说说仍然存在；过一会儿再删一次 |
| `NERONET_QZONE_UPLOAD_FAILED` | 某一张图片读取或上传失败，说说没有发表；提示里写明是第几张 |
| `NERONET_QZONE_OUTCOME_UNKNOWN` | 请求已发出但没有收到结果，可能已经生效；NeroNet 不会自动重发，请先到空间核对 |
| `NERONET_QZONE_NETWORK_FAILED` | 连接 QQ 空间失败 |
| `NERONET_QZONE_RESPONSE_INVALID` | QQ 空间的响应无法识别 |
| `NERONET_QZONE_REMOTE_ERROR` | QQ 空间返回的其他错误，提示里带有原始的 code 和 subcode |
| `NERONET_QZONE_BUSY` | 同时等待处理的空间请求太多 |
| `NERONET_SESSION_CHANGED` | NeroNet 正在停止或账号会话已变化，结果没有交付 |

使用时注意：

- 每条说说最多 9 张图片，单张不超过 10 MiB，合计不超过 40 MiB，正文不超过 10000 字。这些是 NeroNet 自己的限制，不是 QQ 空间公布的上限。
- 任何一张图片失败，整条说说都不会发表；这时已经上传的图片会留在机器人账号的空间相册里，NeroNet 不能代为删除。
- 发表、删除、修改权限的请求发出后如果没有收到结果（超时、断线），会返回 `NERONET_QZONE_OUTCOME_UNKNOWN`，NeroNet 不会自动重发，请先到空间核对。
- 删除后 NeroNet 会读回确认。测试中遇到过一次：带图说说发表 4 秒后删除，QQ 空间返回成功但说说还在。遇到这种情况 NeroNet 会等一下再删一次，仍然存在时返回 `NERONET_QZONE_DELETE_NOT_CONFIRMED`。
- 修改权限时 QQ 空间要求重新提交整条说说，NeroNet 会先读取原文再提交，并在修改后读回确认。
- 说说列表每页最多 40 条。测试账号上，列表的第一条线路一直返回“使用人数过多”，NeroNet 会改用第二条线路；两条线路都不可用时返回 `NERONET_QZONE_RATE_LIMITED`。
- QQ 空间要求人工验证时，NeroNet 会返回 `NERONET_QZONE_VERIFICATION_REQUIRED`，不会绕过验证。
- QQ 空间的登录态只保存在内存里，停止、掉线后作废，不写入日志、运行记录和备份。
- NeroNet 访问 QQ 空间时使用和下载图片相同的网络设置（包括代理）。
