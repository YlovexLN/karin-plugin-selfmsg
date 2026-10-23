# karin-plugin-selfmsg

让 Karin 接受 OneBot11 的 `message_sent`（上报自身消息）事件，使其进入插件层。

## 解决什么问题

同一个 QQ 号接入多个框架时（如 AstrBot + Karin 共用一个 LLBot），协议端会把"bot 自己发出的
消息"以 `message_sent` 上报。Karin 的 OneBot 适配器只分发 `message` / `notice` / `request` /
`meta_event`，`message_sent` 被当作未知事件丢弃——于是 kkk 这类插件永远收不到另一个框架
发出的链接。

本插件在运行时接管 OneBot 客户端的 `emit`，把它就地改写成等价的 `message` 事件再交回 Karin
分发器。后续流程完全走原生路径，其它插件无感知。

## 目录结构

```
karin-plugin-selfmsg/
├── apps/status.js        #转发状态 命令
├── config/default.json   默认配置，首次启动复制到 @karinjs/
├── utils/
│   ├── config.js         配置读取、白名单正则
│   ├── links.js          链接提取、拆分投递
│   ├── message.js        事件归一化、产物识别
│   └── relay.js          核心：接管 emit、过滤、投递
├── index.js              入口，导出 KARIN_PLUGIN_INIT
├── web.config.js         WebUI 配置面板
├── dir.js                路径常量
├── scripts/
│   ├── test.mjs          冒烟测试（零依赖）
│   └── pack.mjs          打包发布 zip 到 dist/
└── package.json
```

## 安装

### 方式一：直接放目录（推荐）

把整个 `karin-plugin-selfmsg/` 目录放进 Karin 的插件目录，然后重启 Karin：

```
<Karin 根目录>/plugins/karin-plugin-selfmsg/
├── index.js
├── package.json
└── ...
```

### 方式二：从 GitHub Packages 安装

包名为 `@ylovexln/karin-plugin-selfmsg`，发布在 GitHub 的 npm 源上，**拉取需要 GitHub Token**：

```bash
# ~/.npmrc
@ylovexln:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<你的 GitHub Token，需 read:packages 权限>
```

```bash
npm i @ylovexln/karin-plugin-selfmsg
```

GitHub Packages 不允许匿名下载，所以每个使用者都得配自己的 token——这也是为什么方式一更适合分享给别人。

### 确认接管成功

启动日志出现这行即可：

```
[selfmsg] 已接管 bot <self_id>（来源: BOT_CONNECT），message_sent 将被当作普通消息分发
```

之后发 `#转发状态`（仅机器人主人可用）可查看接管数与统计。

## 配置

唯一来源是 `@karinjs/karin-plugin-selfmsg/config/config.json`，首次启动自动生成，
内容取自包内的 [`config/default.json`](./config/default.json)。**不读环境变量。**

改配置有两种方式，效果一样：Karin WebUI 的插件配置页，或直接编辑该文件。

> 改完必须**重启 Karin**——本插件在框架启动早期就要接管事件，无法热应用。

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enable` | `true` | 总开关 |
| `group` | `true` | 是否处理群内自发消息 |
| `groupSender` | `"10000"` | 群消息伪造的发送者 QQ 号，保持默认即可，别填自己 / 群主 / 管理员 |
| `groupSenderName` | `"群成员"` | 该发送者昵称 |
| `match` | B站链接正则 | 内容白名单，不区分大小写 |
| `matchAll` | `false` | 设 `true` 关闭白名单，放行全部自发消息（慎用） |
| `split` | `true` | 一条消息含多个链接时拆成多条分别投递 |
| `splitDelayMs` | `1500` | 拆分投递间隔（毫秒） |
| `cooldownMs` | `8000` | 同一目标消息的冷却窗口（毫秒） |
| `quietMs` | `8000` | 放行一条后的静默窗口（毫秒），设 `0` 关闭 |
| `filterCard` | `true` | 丢弃含图片 / 卡片的自发消息，设 `false` 会**死循环** |
| `debug` | `false` | 打印每条消息被放行 / 丢弃的原因 |

删掉 `config.json` 重启即可恢复默认。

## 已知限制

- **白名单按内容匹配**，无法区分消息是哪个框架发出的。
- **注入后 `user_id` 不再是 bot 自己**，Karin 侧插件的"忽略自发消息"过滤拦不住它，控制点只能在发送侧。
- **群消息的发送者必须伪造**：协议里自发消息的 `sender` 永远是 bot。默认 `10000` 是安全值，填主人或管理员会因为 `perm: master` 看的就是这个字段而被误判。
- **依赖未文档化的内部符号**（`bot._onebot`、`karin.getBot()`、`BOT_CONNECT`）。若日志出现「没有找到 _onebot，接管失败」，说明框架升级改了字段名。

## 开发

```bash
pnpm test     # 冒烟测试，零依赖（自带 node-karin 桩件）
pnpm lint     # 需要先 pnpm install
```

25 项断言覆盖：私聊 / 群聊放行、静默窗口、白名单、产物过滤、多链接拆分、WebUI 保存。

维护者文档见 [`AGENTS.md`](./AGENTS.md) 与 [`.agents/`](./.agents/)。

## 发布

推到 `main` 只跑检查，**打 Release 才会发到 GitHub Packages**（[`publish.yml`](./.github/workflows/publish.yml)）。
版本号改 `package.json` 的 `version`，然后：

```bash
git tag v0.0.2 && git push origin v0.0.2
```

再到 GitHub 上基于该 tag 创建 Release，Actions 会自动运行冒烟测试并发布。也可以在 Actions 页面手动触发。

## 卸载与回退

删除插件目录并重启 Karin 即可还原。本插件不改框架源码、不写数据库；配置文件在
`@karinjs/karin-plugin-selfmsg/config/config.json`，删掉后重启即恢复默认。

## 致谢

本项目代码与文档由 **DeepSeek Harness** 配合 **DeepSeek-V4.1-Flash** 模型编写；需求、部署与实测由作者完成。

## License

[GNU Affero General Public License v3.0](./LICENSE)（`AGPL-3.0-only`）

自己部署使用无需公开任何代码；修改后分发、或修改后对外提供服务时才需要开源。
