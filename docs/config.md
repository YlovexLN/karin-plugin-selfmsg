# 配置

## 唯一来源

```
@karinjs/karin-plugin-selfmsg/config/config.json
```

首次启动由插件自动生成，内容取自带在包里的 `config/default.json`。**不读任何环境变量。**

修改方式两种，效果完全一样：

1. Karin WebUI 的插件配置页（可视化，分四组：基础 / 内容过滤 / 投递行为 / 调试）
2. 直接编辑上面那个 JSON 文件

> ⚠️ 改完必须**重启 Karin**。本插件在框架启动早期就要接管事件，无法热应用。

删掉 `config.json` 重启即恢复默认值。

## 全量配置项

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enable` | `true` | 总开关，关闭后不再接管任何事件 |
| `group` | `true` | 是否处理群内自发消息 |
| `groupSender` | `"10000"` | 群消息伪造的发送者 QQ 号，**保持默认**，见下方说明 |
| `groupSenderName` | `"群成员"` | 该发送者昵称，仅出现在事件数据里 |
| `match` | B站链接正则 | 内容白名单，不区分大小写 |
| `matchAll` | `false` | 设 `true` 关闭白名单，放行全部自发消息（慎用） |
| `split` | `true` | 一条消息含多个链接时拆成多条分别投递 |
| `splitDelayMs` | `1500` | 拆分投递间隔（毫秒） |
| `cooldownMs` | `8000` | 同一目标的冷却窗口（毫秒） |
| `quietMs` | `8000` | 放行一条后的静默窗口（毫秒），设 `0` 关闭 |
| `filterCard` | `true` | 丢弃含图片 / 卡片的自发消息，设 `false` 会**死循环** |
| `debug` | `false` | 打印每条消息被放行 / 丢弃的原因 |

默认白名单正则：

```
b23\.tv|bilibili\.com|bili2233|BV[0-9A-Za-z]{10}
```

要支持抖音 / 快手 / 小红书，往 `match` 里追加对应域名即可。

## `groupSender` 是什么

群内 bot 自己发出的消息，协议上报的 `sender.user_id` **永远是 bot 自己**。Karin 侧插件普遍有
"忽略自身消息"的过滤（`sender.user_id === self_id` 就 return），不改写的话消息进去就被丢掉，
kkk 这类插件永远收不到。

所以本插件把发送者伪造成一个固定身份，`groupSender` 就是那个 QQ 号。它**只存在于事件对象里**：

- 群友看不到，实际发出的消息发送者仍是 bot
- 不改变任何真实权限

**为什么不填真实成员**：Karin 判断 `perm: master` 看的就是 `e.sender.userId`。把 `groupSender`
填成主人或管理员的 QQ，注入的消息会被当成他们发的，可能绕过权限判断。默认 `10000`
（腾讯客服/群号段）不会撞到真人，是安全值。

## `filterCard` 为什么不能关

kkk 的产物是 `image` 消息段。这条图片会作为 bot 的自发消息再次回流：

```
图 → 解析 → 图 → 解析 → ...
```

`filterCard` 丢弃含 `image` / `json` / `xml` 的自发消息，是防循环的关键一环。关掉等于手动制造死循环。

## 白名单与 `matchAll`

白名单按**消息内容**匹配，无法区分来源——协议层没有"这条是哪个框架发的"这种信息。

`matchAll: true` 会放行全部自发消息，结果是 AstrBot 的每句话都会进入 Karin 插件层，容易误触
其它插件。除非你明确知道后果，否则保持 `false`。
