# 架构与数据流

## 问题边界

Karin 的 OneBot 适配器只分发四类事件：`message` / `notice` / `request` / `meta_event`。
`message_sent` 会落到 `init()` 最后的兜底分支，被记为"收到未知事件"后丢弃。

所以这不是"插件优先级不够"的问题——事件根本到不了插件分发阶段，用 `karin.command`、
`karin.accept` 都拦不住。框架也没有提供"事件进入分发前"的扩展点，因此只能在适配器
接收事件的入口（OneBot 客户端的 `emit`）上做运行时改写。

## 数据流

```
LLBot（OneBot11 后端）
  │  WebSocket，按连接各自推送
  ├──────────────────────────────► Karin      ob.emit('message', data)
  └──────────────────────────────► AstrBot    (与本插件无关)

                              ┌─ 本插件在这里拦截 ─┐
                              ▼
                  data.post_type === 'message_sent' ?
                    │是                          │否
                    ▼                            ▼
              五道闸门过滤                   原样放行 rawEmit
                    │通过
                    ▼
              normalize() 改写为 message 事件
                    │
                    ├─ 多链接 → 拆成 N 条，依次 rawEmit（间隔 1.5s）
                    └─ 单链接 → rawEmit 一条
                                 │
                                 ▼
                       Karin 分发器 createMessage()
                                 │
                                 ▼
                    command / accept 匹配 → kkk 解析 → 出卡
```

关键点：改写后的事件**不再经过本插件的闸门**（走 `rawEmit` 直投），否则拆分出来的
第 2 条会被自己刚设置的静默窗口吃掉。

## 字段归一化对照

Karin 的 `createMessage` 会读 `event.sender.user_id`、`sender.nickname`、`message_type`、
`sub_type`、`message_id`、`message`、`time`。`message_sent` 缺少其中一部分，且语义不同：

| 字段 | `message_sent` 原值 | 私聊改写后 | 群聊改写后 | 为什么必须改 |
| --- | --- | --- | --- | --- |
| `post_type` | `message_sent` | `message` | `message` | 适配器靠它决定是否分发 |
| `user_id` | bot 自己 | 对话方（`target_id`） | `groupSender` | 插件普遍有 `user_id === self_id` 的自过滤 |
| `sender.user_id` | bot 自己 | 同上 | 同上 | `createMessage` 以它作为消息发送者 |
| `sender.nickname` | bot 昵称 | 保留（拿不到对方昵称） | `groupSenderName` | 展示用 |
| `sub_type` | 无 | `friend` | `normal` | `createMessage` 按子类型构造事件 |
| `message_type` | `private` / `group` | 不变 | 不变 | 分发与上下文构造 |
| `target_id` | 对话方 QQ | 保持不变 | 不存在 | 私聊上下文 |

**群聊的先天缺陷**：协议层没有"这条群消息是群里哪个人发的"这个信息——bot 自己发的消息，
发送者只能是 bot。因此群聊必须伪造一个成员身份，`groupSender` 就是为此存在。
代价是 kkk 的解析统计会记到这个 id 上。但不要为此填主人或管理员的号：Karin 的权限判断看 `sender.userId`，伪装成他们会让注入的消息通过 `perm: master` 检查。默认值 10000 最安全。

## 五道闸门

顺序不是随意的，按"越便宜、越不可能误放"的原则从前往后：

| # | 闸门 | 条件 | 挡什么 | 如果去掉 |
| --- | --- | --- | --- | --- |
| 1 | 群开关 | `group` 为 `false` 时丢弃群消息 | 群内不可归因的自发消息 | 群里所有 bot 发言都会进插件层 |
| 2 | 静默窗口 | 同一 target 放行后 8s 内全部丢弃 | 放行后的连锁反应 | 出图慢于冷却时会回流 |
| 3 | 产物过滤 | 含 `image` / `json` / `xml` 段即丢弃 | **kkk 自己发出的卡片和图** | `图 → 解析 → 图` 无限循环 |
| 4 | 白名单 | 内容不匹配 `match` 即丢弃 | 其它插件收到的普通聊天回复 | AstrBot 的每句话都会触发 Karin 插件匹配 |
| 5 | 冷却 | 同一 target 8s 内第二次 | 协议端重复上报、多段消息 | 同一条消息被解析多次 |

第 3 道是最容易误删的一道：kkk 渲染出来的是 `image` 段，不是 json 卡片。曾经因为只过滤
`json`/`xml` 而差点 loop——当时是靠冷却窗口侥幸挡住的。详见
[rules/invariants.md](../rules/invariants.md) 的 I1。

## 配置来源

**只有一个来源**：`@karinjs/<包名>/config/config.json`。

```
包内 config/default.json  ──(首次启动复制)──►  @karinjs/<包名>/config/config.json
                                                      ▲            ▲
                                                  WebUI 保存    手工编辑
```

- 首次启动时若运行配置不存在，`utils/config.js` 会用包内默认值生成一份并打日志
- 之后所有读取都只看运行配置；缺项、类型不对、空串一律逐项回落到包内默认值
- **不读环境变量**（开发阶段已移除）：配置待在该待的地方，避免"compose 里写死一份、
  面板里又改了一份"的排查困境
- 放在 `@karinjs/` 而非插件目录内，是因为插件目录在更新时会被整体覆盖

路径依赖框架导出的 `karinPathBase`（= `<karin根>/@karinjs`），
桩件或旧版本没有该导出时退化为 `process.cwd()/@karinjs`。

> npm 包名是 `@ylovexln/karin-plugin-selfmsg`（GitHub Packages 要求 scoped），
> 但 `<包名>` 这一级固定用 `dir.js` 里的 `PluginName`（不带 scope），
> 所以配置始终落在 `@karinjs/karin-plugin-selfmsg/config/config.json`，换源或换所有者都不用迁移。
> 目录由 `seedConfig()` 自己 `mkdirSync` 创建，不依赖 `karin.files`。

## 状态设计

运行时状态（`patched` / `inited` / 冷却表 / 统计）全部挂在 `globalThis`，用
`Symbol.for('karin-plugin-selfmsg:state')` 取用。

原因：Karin 有热重载机制，改文件后模块会被重新求值。模块级变量会重置，但旧包装器仍挂在
`emit` 链上，新实例看到空的 `WeakSet` 就会再包一层；同时 `apps/status.js` 与 `index.js`
在热重载后可能是两个模块实例，需要共享同一份统计。

## 上游源码依据

排查问题时可以对照这几处：

| 位置 | 内容 |
| --- | --- |
| Karin `packages/core/src/adapter/onebot/core/core.ts` | `init()` 的事件分发与"收到未知事件"兜底 |
| Karin `packages/core/src/adapter/onebot/create/message.ts` | `createMessage` 读取的字段清单与 `sub_type` 取值 |
| Karin `packages/core/src/root.ts` | 各类路径常量，`karinPathBase` 即 `@karinjs` 根目录 |
| kkk `packages/core/src/apps/tools.ts` | `karin.command(reg.bilibili, handleBilibili, { name: 'kkk-视频功能-B站' })`；**只按链接正则匹配，无身份校验**，所以伪造发送者不影响解析 |

kkk 的 B站正则为：

```
/(bilibili\.com|b23\.tv|t\.bilibili\.com|bili2233\.cn|\bBV[1-9a-zA-Z]{10}\b|\bav\d+\b)/i
```

注意它**一次只处理消息里的第一个链接**，这是本插件要做多链接拆分的原因。
