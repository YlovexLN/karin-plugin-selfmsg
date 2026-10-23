# 验证流程

改完代码到线上确认的完整路径。命令见 [commands/common.md](../commands/common.md)，
这里只写每一步该看到什么。

## 1. 静态检查

跑「语法检查」，预期**无输出**。语法错误会让插件在加载时直接崩掉，而 Karin 的加载错误未必显眼。

同时确认 `package.json` 合法：

```bash
node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8'));console.log(p.karin.apps, p.karin.web, p.main)"
```

CI（`.github/workflows/check.yml`）会跑这两步，推之前本地跑一遍能省一次往返。

## 2. 冒烟测试

跑「冒烟测试」，预期末行 `25/25 通过`、退出码 0。

它用一个自动生成的 `node-karin` 桩件（在 `node_modules/`，已 gitignore）跑完整数据流：

| 组 | 断言 |
| --- | --- |
| 接管 | `emit` 被替换 |
| 私聊 | 放行、`post_type` 改写、`sender.user_id` 改写、`sub_type` 补齐 |
| 防抖 | 静默窗口拦截连续消息 |
| 过滤 | 白名单拦无链接消息、产物过滤拦图片 |
| 群聊 | 放行、发送者伪造、`sub_type=normal` |
| 拆分 | 首条立即、第二条延迟、每条只含一个链接 |
| 状态 | 接管数、放行数、拆分条数 |
| WebUI | 组件非空、`save()` 成功、文件落盘、三种类型转换 |

桩件只在"没有 `node-karin`"或"已有桩件版本号为 `0.0.0`"时写入，所以升级脚本里的桩件不会被
旧文件挡住，也不会覆盖真正的 `node-karin`。

## 3. 部署后确认

部署由使用者自行完成，本仓库不提供部署命令。装好并重启 Karin 后，按顺序确认三件事：

1. **接管日志**必须出现：

   ```
   [selfmsg] 已接管 bot <self_id>（来源: BOT_CONNECT），message_sent 将被当作普通消息分发
   ```

   若出现 `没有找到 _onebot，接管失败`，见 [troubleshooting.md](../skills/troubleshooting.md) 第三节。

2. **真实链路**：让另一个框架（AstrBot）发一条带 B站链接的消息，Karin 日志应出现
   `好友消息: [...]` 而不是 `收到未知事件`，随后 kkk 出卡。

3. **状态命令**：给机器人发 `#转发状态`（需主人权限），核对接管数与放行数在增长。
   丢弃数 > 0 说明闸门在工作，属正常。

## 回归重点

改动涉及以下部分时，务必额外手工验证对应场景：

| 改动位置 | 额外验证 |
| --- | --- |
| `isPluginOutput()` 或闸门顺序 | 连续发两条链接，确认不出循环卡片 |
| 拆分投递逻辑 | 发一条含两个链接的消息，确认出两张卡 |
| 群聊分支 | 在群里让 AstrBot 发链接，确认卡片发到群里 |
| 配置层 / WebUI | 删掉运行配置重启，确认自动重新生成且行为恢复默认 |

## 收尾：作用域自检

收工前跑一次，**应无输出**（`node_modules/`、`dist/` 是可保留的中间产物，不在此列）：

```bash
find . -maxdepth 2 \( -name '_*' -o -name '*.tmp' -o -name '*.bak' -o -name '*.orig' \) -print
```

有输出说明临时产物没清干净，或测试污染了仓库。规则见 [rules/workspace.md](../rules/workspace.md)。

