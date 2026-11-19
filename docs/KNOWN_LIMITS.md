# NeroNet 已知限制

适用版本：1.6.0。

## 1. QQ 版本

- 只支持 Windows x64 版 QQ。
- NeroNet 不再限定 QQ 版本。遇到没见过的 QQ 版本，第一次启动时会先识别（通常几秒，最长几分钟），识别结果保存下来，之后直接使用。
- 识别成功说明这个版本可以接入，不代表这个版本上的每项功能都单独测试过。
- QQ 以后的版本如果改动了内部结构，可能识别不了。这时 NeroNet 会显示原因和错误编号，不会接入；可以先更新 NeroNet 再试，或者提交 issue，附上启动窗口显示的内容。
- 识别结果保存在当前 Windows 用户的 `%LOCALAPPDATA%\NeroNet\binding-cache` 里，换电脑或换 Windows 用户后第一次会重新识别。

## 2. 测试范围

- 1.6.0 在 QQ 9.9.35、9.9.36、9.9.37 上做了在线测试，内容包括：启动和停止；私聊和群聊的收发；引用、@、图片、合并转发、文件、戳一戳、撤回、历史消息；机器人 QQ 重启后自动接回；断网约一分钟后的恢复；从旧版本更新；标记已读；AstrBot 的指令和对话；qq-bridge（DSH Web）的私聊和群聊对话。全部自动化测试通过。
- QQ 空间功能在 QQ 9.9.36 上用真实账号做了测试：发表文字和 1、3、9 张图片的说说，读取列表和详情，修改查看权限，删除；并用 AstrBot v4.29.4 和未修改的 `astrbot_plugin_qzone_bridge` v2.1.0 插件测试了发表和删除。查看权限测试了 4、16、64、128，并用另一个账号的空间页面核对了可见范围；没有用公开权限（1）发表过测试内容。
- 表情、语音的收发，以及 qq-bridge 的大图识别和 DSH 桌面客户端，在 1.5.x 上测试过，1.6.0 没有重测。
- 视频收发和 AstrBot 插件市场的测试是在 1.5.0 之前的版本上做的，之后没有重做。
- 没有做过长时间连续运行的专门测试。开发和测试期间没有出现过被强制下线的情况，但这不代表使用时没有风险。
- 测试在有限的群和账号中进行，不能代表所有群、所有消息类型的表现。

## 3. 没有实现的功能

下面这些动作即使写进动作配置的 `extraActions`，也会返回 `retcode 1404`：

- 群管理：踢人、禁言、设置管理员、改群名片、改群名等。
- 好友和群的加入请求：NeroNet 不推送请求事件，也不能审批。
- 语音转文字（`fetch_ptt_text`）。
- 读取 Cookie、凭据等账号信息的动作（`get_cookies`、`get_credentials`、`get_csrf_token`）。QQ 空间功能自己取得并使用登录态，不向客户端提供。
- QQ 空间的评论、点赞、好友动态、相册管理和黑名单。

另外：

- 不推送机器人在线状态变化的 `bot_status` 事件；在线状态可以从心跳和 `get_status` 读取。
- 机器人上线后不会自动补拉离线期间的消息；需要时用 `get_group_msg_history`、`get_friend_msg_history` 手动查询。
- 不支持发送 `mface`（商城表情）、`markdown` 消息段，以及把 `poke` 作为消息段发送，返回 `retcode 1400`。戳一戳请用 `send_poke`、`group_poke`、`friend_poke`。
- `get_group_msg_history` 不支持 `reverse_order = false`。
- 不支持对所有账号生效的全局配置文件 `onebot.json`。

## 4. 功能说明

- 默认只开放 7 个基础动作，接入的客户端用对应的动作档案开放更多：`astrbot`、`qqbridge`、`message-read`（标记已读）、`qzone`（QQ 空间）。
- 标记已读（`mark_msg_as_read`、`mark_group_msg_as_read`、`mark_private_msg_as_read`）要在动作配置的 `profiles` 中加入 `message-read` 才能用。只对消息库里已有的消息所在的会话生效，服务器确认后才返回成功；没有“全部标记已读”。
- QQ 空间的 5 个动作（`send_qzone_msg`、`delete_qzone_msg`、`get_qzone_msg_list`、`get_qzone_msg_detail`、`set_qzone_msg_right`）要在动作配置的 `profiles` 中加入 `qzone` 才能用，`astrbot` 和 `qqbridge` 档案都不包含它们。用法见 [DEPLOY.md](DEPLOY.md) 第 10 节。
- 消息中的文件只有在开放了上传动作（`upload_group_file` 或 `upload_private_file`）时才接受，否则返回 `retcode 1400`。`astrbot` 档案开放了这两个动作，`qqbridge` 档案没有。
- `get_record` 可以转成多种格式：转成 wav 不需要额外程序，转成其他格式需要 ffmpeg，没有时返回 `NERONET_RECORD_CONVERTER_MISSING`。
- `get_friend_list` 只返回真实好友，不含“我的设备”。
- 合并转发最多嵌套 3 层；私聊转发每个节点最多 1 个文件；转发中不能包含戳一戳；引用已有消息的节点只能引用 NeroNet 收到或发出过的消息。
- 机器人刚发出的转发里的图片，短时间内回读时可能拿不到图片地址；QQ 中显示正常。
- 部分 QQ 版本会把机器人自己发出的图片显示为空白，对方收到的图片正常。
- 多个客户端同时连接时，每个客户端都会收到同一条消息，需要自己避免重复回复。

## 5. 运行时的表现

- **接入失败时**：NeroNet 不会退出，启动窗口和状态页 `http://127.0.0.1:5100/status` 会显示原因、错误编号和处理办法。QQ 还没准备好时会自己再试；需要处理的问题，处理后再运行一次 `start.bat` 就会重新接入。
- **接入结果不能确认时**：NeroNet 会暂停使用这个 QQ 进程，直到它退出。这时需要正常退出并重新登录机器人 QQ（只关闭窗口或退出账号不够），不需要删除任何文件。
- **连接中断后**：NeroNet 会自动重新接入，10 分钟内最多 3 次。恢复期间管理界面和 OneBot 服务暂时不可用，中断时正在发送的消息不会自动重发。
- **断网时**：发送会被立即拒绝，网络恢复后自动回到在线，不会补发。曾观察到一次：QQ 刚显示在线时网络其实还没稳定，第一条消息发送失败，随后恢复正常。
- **停止时**：已经收到、还在等待图片等媒体的消息最多再等 2 秒，未完成的存进消息库，但不再推送给客户端。NeroNet 停止期间到达的消息不会补推。
- **组件卸载**：NeroNet 停止后，加载进 QQ 的组件会留到 QQ 退出为止。更换 NeroNet 版本时需要正常退出并重新登录机器人 QQ。

## 6. 部署

- 同一台电脑上运行多个 QQ 时，需要用 `-BotPid` 或 `-AdminPid` 指定，见 [DEPLOY.md](DEPLOY.md) 第 3 节。
- 只支持完整包手动更新，没有在线更新。
- 部署配置或动作配置改动后，需要重新启动 NeroNet 才生效。
- 管理界面默认只允许本机访问，登录认证不能关闭。
- 包内不含 QQ 和 ffmpeg。Node.js 只在带 Node 的下载包里附带。
- `SHA256SUMS.txt` 只能证明文件完整，不是发布者签名；程序文件没有数字签名，安全软件可能提示。
- 运行记录 `gateway-metadata.jsonl`、`supervisor-metadata.jsonl` 各自最多保留约 24 MiB。

## 7. 接入的客户端

- **AstrBot**：动作档案按 AstrBot 核心和热门插件的实际调用确定，不保证插件市场里的每个插件都兼容。需要自己读取 Cookie 的空间类插件（例如自动点赞）不能使用。见 [integrations/astrbot/README.md](../integrations/astrbot/README.md) 第 10 节。
- **qq-bridge**：第三方项目，作者已停止维护，只能用于非商业用途。NeroNet 只适配 `v0.2.2-rc1`。见 [integrations/qq-bridge/README.md](../integrations/qq-bridge/README.md) 第 1 节。
