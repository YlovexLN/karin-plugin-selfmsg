# 排障

先开调试日志，绝大多数问题能直接看出被哪道闸门拦了——把配置里的 `debug` 改成 `true`：

```json
{ "debug": true }
```

每条自发消息都会打印 `丢弃（原因）` 或 `归一化 message_sent -> message: ...`。

排查前建议先发一条 `#转发状态`，确认插件是否接管成功、以及实际读的是哪个配置文件。

---

## 一、插件根本没加载

**现象**：日志里搜不到任何 `selfmsg` 字样，`#转发状态` 无响应。

| 检查 | 说明 |
| --- | --- |
| 目录是否在 `<karin>/plugins/` 下 | 放到别处不会被扫描 |
| 目录名是否以 `karin-plugin-` 开头 | 否则不识别 |
| `package.json` 是否含 `karin` 字段 | 插件包判定条件 |
| `package.json` 的 `name` 是否与目录名一致 | 不一致时部分版本会跳过 |
| 是否只拷了 `index.js` | 现在依赖 `utils/*`、`apps/*`、`web.config.js`，**必须整目录拷** |

**处理**：删掉 `<karin>/plugins/karin-plugin-selfmsg` 整个目录，重新放一份完整副本，再重启。

---

## 二、`无法导入 node-karin`

插件不在 Karin 的运行环境里（例如被别的进程直接 `node index.js`）。放回 `plugins` 目录即可。

---

## 三、`没有找到 _onebot，接管失败`

`bot._onebot` 是未文档化的内部字段，Karin 大版本升级后可能改名或改结构。

**排查**：

```js
logger.info(Object.keys(bot))
logger.info(bot._onebot ? 'has _onebot' : 'no _onebot')
```

**处理**：把实际字段名告诉我（或自行修改 `utils/relay.js` 中 `patchBot()` 的取值），
必要时做多候选探测：

```js
const ob = bot?._onebot ?? bot?._ob ?? bot?.adapter?.onebot
```

**兜底方案**：直接改 `packages/core/src/adapter/onebot/core/core.ts` 的 `init()` 分发分支。
缺点是要改框架源码，镜像更新后会丢失。

---

## 四、接管成功，但 kkk 不出卡

依次确认：

1. **`message_sent` 有没有到 Karin**——看 LLBot 日志是否仍有 `message_sent.private` 上报。
   - 没有 → 是 LLBot 侧 `reportSelfMessage`（上报自身消息）被关了，与本插件无关。
2. **Karin 日志里有没有 `好友消息: [...]`**——有说明本插件已放行。
   - 没有 → 把 `debug` 设为 `true` 看丢弃原因：
     - `未命中白名单` → 链接形态不在正则里（如新短链域名），改 `match`
     - `冷却中` / `静默窗口` → 短时间内重复发送，等 8 秒或调小 `quietMs`
3. **有 `好友消息` 但没出卡**——问题在 kkk：
   - kkk 的 B站解析开关是否关闭
   - `videoTool` 模式下优先级为 `-Infinity`，检查是否有其它插件抢在前面 `stop`
   - 视频是否需要登录/大会员，渲染是否报错（看 `@karinjs/plugin-puppeteer` 日志）

---

## 五、私聊正常，群里没反应

| 可能原因 | 确认方式 | 处理 |
| --- | --- | --- |
| `group` 为 `false` | 日志无 `群消息:` 行 | 改回 `true` |
| 事件缺 `group_id` | `debug=true` 看归一化输出 | 把原始 JSON 提供给维护者 |
| kkk 侧群聊解析未开启 | 手动在群里发同样链接测试 | 在 kkk 配置里开启 |
| 群被 kkk 黑名单排除 | 同上 | 检查 kkk 配置 |

---

## 六、一张卡变两张 / 卡片刷屏

**先判断是不是循环**：如果卡片持续不断出现，说明产物回流失控。

| 检查 | 处理 |
| --- | --- |
| `filterCard` 是否为 `false` | 改回 `true` |
| WebUI 里该项是否被"关闭" | 见第八节，可能是字符串 `"false"` 被误判 |
| 是否有其它插件也在改写 bot 自发消息 | 逐个停用验证 |

**如果是"两个链接出两张卡"**，那是预期行为（多链接拆分）。

---

## 七、第二个链接没有卡

| 检查 | 处理 |
| --- | --- |
| `split` 为 `false` | 改回 `true` |
| 两条投递间隔太短，渲染并发失败 | 调大 `splitDelayMs`（默认 1500ms） |
| 两个链接指向同一视频 | kkk 侧可能去重，属正常 |

同一个 target 在 8 秒静默窗口内只放行一条——如果两次提问间隔太短，表现也是"只回一张卡"。
调小 `quietMs`，或设 `0` 关闭（关闭后靠产物过滤兜底，风险略高）。

---

## 八、改了配置但不生效

三条可能，按顺序排除：

1. **没重启**——本插件在框架启动早期接管事件，配置无法热应用，改完必须重启 Karin。
2. **改的不是那个文件**——`#转发状态` 会打印实际使用的配置文件绝对路径，
   核对它是不是你改的那个（应为 `<karin根>/@karinjs/<包名>/config/config.json`）。
   宿主上改插件目录里的 `config/default.json` 是无效的，那只是首次生成的模板。
3. **键名写错**——JSON 里的键是 `enable`、`match` 这类短名，不是旧版的 `MSR_*` 形式；
   写错会被当成未知键忽略，逐项回落到默认值。

---

## 九、`收到未知事件` 仍然出现

如果日志里仍有 `post_type: "message_sent"` 的未知事件，说明接管没生效（回到第三节）。

如果只是其它类型的私有上报，与本插件无关。

---

## 十、从旧版本升级上来的配置没人读

开发阶段曾把配置写在环境变量（`MSR_*`，更早是 `KKK_RELAY_*`），现在只读配置文件。
**旧的环境变量会被完全忽略，不会报错也不会告警**——这是那版升级最容易忽略的一点。

处理：删掉 compose 里的 `environment` 段，改在 WebUI 面板或
`@karinjs/<包名>/config/config.json` 里设置。删掉该文件重启可恢复到默认值。
