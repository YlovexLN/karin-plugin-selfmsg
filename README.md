# karin-plugin-selfmsg

让 Karin 接受 OneBot11 的 `message_sent`（上报自身消息）事件，使其进入插件层。

[GitHub](https://github.com/YlovexLN/karin-plugin-selfmsg) · [问题反馈](https://github.com/YlovexLN/karin-plugin-selfmsg/issues) · npm `karin-plugin-selfmsg` · AGPL-3.0

## 解决什么问题

同一个 QQ 号接入多个框架时（如 AstrBot + Karin 共用一个 LLBot），协议端会把「bot 自己发出的消息」
以 `message_sent` 上报。Karin 的 OneBot 适配器只分发 `message` / `notice` / `request` /
`meta_event`，`message_sent` 被当作未知事件丢弃——于是 kkk 这类插件永远收不到另一个框架
发出的链接。

本插件在运行时接管 OneBot 客户端的 `emit`，把 `message_sent` 就地改写成等价的 `message` 事件
再交回 Karin 分发器。后续完全走原生路径，其它插件无感知。

## 安装

把目录放进 Karin 的插件目录，然后重启：

```bash
git clone https://github.com/YlovexLN/karin-plugin-selfmsg.git
cp -r karin-plugin-selfmsg <Karin 根目录>/plugins/
```

也可以从 npm 装（公开包，不需要 token）：

```bash
cd <Karin 根目录>
pnpm add karin-plugin-selfmsg
```

不想经过 npm 源，也可以直接从仓库装：

```bash
cd <Karin 根目录>
pnpm add github:YlovexLN/karin-plugin-selfmsg
```

日志出现这行即为接管成功，之后发 `#转发状态`（仅主人）可查看统计：

```
[selfmsg] 已接管 bot <self_id>（来源: BOT_CONNECT），message_sent 将被当作普通消息分发
```

GitHub Packages 安装、token 配置、安装期报错、各方式对应的卸载命令 → [安装文档](https://github.com/YlovexLN/karin-plugin-selfmsg/blob/main/docs/install.md)

## 配置

唯一来源 `@karinjs/karin-plugin-selfmsg/config/config.json`，首次启动自动生成。
WebUI 插件配置页或直接编辑该文件，**改完需重启 Karin**（启动早期就要接管事件，无法热应用）。

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enable` | `true` | 总开关 |
| `group` | `true` | 是否处理群内自发消息 |
| `match` | B站链接正则 | 内容白名单 |
| `filterCard` | `true` | 丢弃图片 / 卡片回流，**关掉会死循环** |

全量配置项、`groupSender` 的作用与风险 → [配置文档](https://github.com/YlovexLN/karin-plugin-selfmsg/blob/main/docs/config.md)

## 已知限制

- **白名单按内容匹配**，协议层无法区分消息是哪个框架发出的。
- **注入后 `user_id` 不再是 bot 自己**，Karin 侧插件的「忽略自发消息」过滤拦不住它，控制点只能在发送侧。
- **群消息的发送者必须伪造**：自发消息的 `sender` 永远是 bot。默认 `10000` 是安全值；填主人或管理员会因 `perm: master` 看的就是该字段而被误判。
- **依赖未文档化的内部符号**（`bot._onebot`、`karin.getBot()`、`BOT_CONNECT`）。日志出现「没有找到 _onebot，接管失败」即说明框架升级改了字段名。

## 免责声明

- 按 **AGPL-3.0** 原样提供，**不附带任何担保**，使用风险自负。
- 依赖 Karin 未公开的内部符号，**框架升级后可能失效**。
- 只在本机进程内改写事件对象，**不联网、不上传、不收集数据**，不写数据库，不改框架源码。
- 因使用本插件导致的账号风控、消息异常、群内刷屏等后果由使用者承担；与腾讯、Bilibili、AstrBot、Karin 官方均无隶属关系。

## 开发

```bash
pnpm test     # 冒烟测试 25 项，零依赖（自带 node-karin 桩件）
pnpm lint     # 需要先 pnpm install
```

架构、约束、排障、决策记录见 [`AGENTS.md`](./AGENTS.md) 与 [`.agents/`](./.agents/)；
发布流程（双源、OIDC、dist-tag）见 [发布文档](https://github.com/YlovexLN/karin-plugin-selfmsg/blob/main/docs/publish.md)。

## 卸载

按安装方式对应处理，然后重启 Karin：

```bash
# 目录安装
rm -rf <Karin 根目录>/plugins/karin-plugin-selfmsg

# npm / GitHub 源安装
cd <Karin 根目录> && pnpm remove karin-plugin-selfmsg

# GitHub Packages 安装（包名带 scope）
cd <Karin 根目录> && pnpm remove @ylovexln/karin-plugin-selfmsg
```

想连配置一起清掉，再删 `@karinjs/karin-plugin-selfmsg/`（不删则保留原设置）。
本插件不改框架源码、不写数据库，删完即彻底还原。

## 作者

YlovexLN · [GitHub](https://github.com/YlovexLN) · [ylovexln@foxmail.com](mailto:ylovexln@foxmail.com)

出问题请到 [Issues](https://github.com/YlovexLN/karin-plugin-selfmsg/issues) 提，附上 Karin 版本、
日志里的 `[selfmsg]` 行、以及复现步骤。

## 致谢

代码与文档由 **DeepSeek Harness** 配合 **DeepSeek-V4.1-Flash** 模型编写；需求、部署与实测由作者完成。

## License

[GNU Affero General Public License v3.0](./LICENSE)（`AGPL-3.0-only`）

自己部署使用无需公开任何代码；修改后分发、或修改后对外提供服务时才需要开源。
