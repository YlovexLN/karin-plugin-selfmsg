# AGENTS.md

面向 AI 编码助手与新维护者。**改代码前先读 [`.agents/rules/invariants.md`](./.agents/rules/invariants.md)。**

## 是什么

Karin 的 OneBot 适配器只分发 `message` / `notice` / `request` / `meta_event`，
`message_sent` 会在兜底分支被当作未知事件丢弃。本插件在运行时接管 OneBot 客户端的 `emit`，
把 `message_sent` 改写成原生 `message` 事件，让 kkk 这类下游插件能收到另一个框架发出的链接。
不改框架源码，不碰 `node_modules`。

## 目录

| 路径 | 作用 |
| --- | --- |
| `index.js` | 入口，只做生命周期接入 |
| `utils/relay.js` | 接管 `emit`、五道闸门、投递、统计 |
| `utils/message.js` | 事件归一化、产物识别 |
| `utils/links.js` | 链接提取、拆分投递 |
| `utils/config.js` | 配置读取与回落 |
| `config/default.json` | 默认配置，首次启动复制到 `@karinjs/` |
| `apps/status.js` | `#转发状态` 命令 |
| `web.config.js` | WebUI 配置面板 |
| `scripts/test.mjs` | 冒烟测试，零依赖 |
| `scripts/pack.mjs` | 打包发布 zip 到 `dist/`（纯 Node，无依赖） |
| `.agents/` | `rules/` 约束 · `memory/` 背景与决策 · `workflows/` 流程 · `skills/` 操作说明 · `commands/` 命令 |

## 改完必跑

```bash
node --check index.js dir.js web.config.js apps/*.js utils/*.js scripts/*.mjs
node scripts/test.mjs
```

25 项断言全绿才算完。验证流程见 [`.agents/workflows/verify.md`](./.agents/workflows/verify.md)。

## 硬约束

1. **`image` 产物过滤不能删**——kkk 出图是图片，回流会形成 `图 → 解析 → 图` 无限循环。
2. **别用 `karin.command` 拦 `message_sent`**——事件到不了插件分发阶段。
3. **拆分投递必须走 `rawEmit`**，否则第 2 条会被自己刚设的静默窗口吃掉。
4. **状态挂 `globalThis`**（`Symbol.for`），模块级变量在热重载后会重置。
5. **群消息的 `user_id` 必须伪造**，用 bot 自己会被自身消息过滤挡掉。
6. **配置只有一个来源**（`@karinjs/<包名>/config/config.json`），不要重新引入环境变量。
7. **WebUI 的 `save()` 必须做类型转换**——前端对 `number` 组件也回传字符串。
8. **一切文件操作不越界**——创建、编辑、删除、执行只在仓库内；一次性产物用完即删，可复用的中间产物（如 `node_modules/` 桩件）放在 `.gitignore` 覆盖的位置即可保留。
9. **构建与提交等指令**——不自行打包、不自行 `git init/commit/push`、不改版本号、不部署。

前七条的细节见 [`rules/invariants.md`](./.agents/rules/invariants.md)，第八、九条见 [`rules/workspace.md`](./.agents/rules/workspace.md)。

## 影响面

| 改动 | 风险 |
| --- | --- |
| 日志、注释、文档 | 无 |
| 冷却 / 静默 / 白名单默认值 | 中：放宽误伤正常对话，收窄漏转发 |
| `normalize()` 字段、闸门顺序 | **高**：可能死循环或群里刷屏 |
| `_onebot` 访问方式 | **高**：取不到就整体失效 |

## 不可控因素

- `bot._onebot`、`karin.getBot()`、`BOT_CONNECT` 都是未文档化内部符号，框架升级可能改名。
- 群内自发消息没有"谁发的"字段，只能伪造。
- 协议层无法区分消息来源，白名单只能按内容匹配。

## 提交

- 中文提交信息，一句话说清"改了什么 + 为什么"。
- 新增配置项同步四处：`config/default.json`、`utils/config.js`、`README.md`、`web.config.js`。
