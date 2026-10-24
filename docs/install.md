# 安装

三种方式，任选其一。**装完都要重启 Karin。**

## 方式一：直接放目录（最省事）

把 `karin-plugin-selfmsg/` 整个目录放进 Karin 的插件目录：

```
<Karin 根目录>/plugins/karin-plugin-selfmsg/
├── index.js
├── dir.js
├── web.config.js
├── package.json
├── apps/
├── utils/
└── config/
```

必须**整个目录**拷，只放 `index.js` 会因为缺 `utils/`、`apps/` 而加载失败。

## 方式二：从 npmjs.com 安装

公开包，不需要 token。

```bash
cd <Karin 根目录>          # 不是 plugins/ 目录
pnpm add karin-plugin-selfmsg
# 或
npm i karin-plugin-selfmsg
```

## 方式三：从 GitHub Packages 安装

同一个版本也发布在 GitHub 的 npm 源上，包名带 scope：`@ylovexln/karin-plugin-selfmsg`。

**GitHub Packages 不支持匿名下载，即使包是公开的**（[官方文档](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)：
"You need an access token to publish, install, and delete private, internal, and public packages"）。

先准备 token（[创建](https://github.com/settings/tokens)，勾 `read:packages`），在 Karin 根目录的
`.npmrc` 写两行：

```ini
@ylovexln:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<你的 token>
```

然后：

```bash
cd <Karin 根目录>
pnpm add @ylovexln/karin-plugin-selfmsg
```

不想手改 `.npmrc`：

```bash
pnpm config set @ylovexln:registry https://npm.pkg.github.com
pnpm config set //npm.pkg.github.com/:_authToken <你的 token>
pnpm add @ylovexln/karin-plugin-selfmsg
```

## 方式四：直接从 GitHub 安装

不用等 npm 发布、也不需要任何 token，直接从仓库取：

```bash
cd <Karin 根目录>
pnpm add github:YlovexLN/karin-plugin-selfmsg
```

等价简写：

```bash
pnpm add YlovexLN/karin-plugin-selfmsg          # pnpm 支持 user/repo 简写
npm i github:YlovexLN/karin-plugin-selfmsg      # npm 用 github: 前缀
```

锁定某个版本（推荐，否则永远取默认分支最新提交）：

```bash
pnpm add github:YlovexLN/karin-plugin-selfmsg#v0.0.2-beta.1
```

三点说明：

- 装出来的包名仍是 `karin-plugin-selfmsg`（取自 `package.json`），不是仓库名
- 需要机器上有 `git`
- 这种方式拿到的是**源码**（含 `docs/`、`.agents/`、冒烟测试），更新时要重新 `pnpm add` 一次

## 装完确认

启动日志出现这行即为接管成功：

```
[selfmsg] 已接管 bot <self_id>（来源: BOT_CONNECT），message_sent 将被当作普通消息分发
```

再给机器人发 `#转发状态`（仅主人可用），能看到接管 bot 数、放行数、丢弃数、配置文件路径。

## 卸载

先看你是怎么装的，对应操作后再重启 Karin。

**方式一（目录）**——直接删目录：

```bash
rm -rf <Karin 根目录>/plugins/karin-plugin-selfmsg
```

**方式二 / 方式四（npmjs 或 GitHub 仓库）**——包名是 `karin-plugin-selfmsg`：

```bash
cd <Karin 根目录>
pnpm remove karin-plugin-selfmsg
# 或 npm uninstall karin-plugin-selfmsg
```

**方式三（GitHub Packages）**——包名带 scope：

```bash
cd <Karin 根目录>
pnpm remove @ylovexln/karin-plugin-selfmsg
```

**清理残留配置**（可选，各方式通用）：

```bash
rm -rf <Karin 根目录>/@karinjs/karin-plugin-selfmsg
```

删掉后重装会重新生成默认配置；不删则保留你原来的设置。

**确认已卸载**：重启 Karin 后日志里不再出现 `[selfmsg]`，发 `#转发状态` 也不会响应。

## 常见问题

**`ERR_PNPM_ADDING_TO_ROOT`**

Karin 根目录有 `pnpm-workspace.yaml`，pnpm 要求在 workspace 根安装时显式加 `-w`：

```bash
pnpm add -w karin-plugin-selfmsg
```

**`ERR_PNPM_FETCH_404` / `401`**

走的是方式三但没配 token 或 registry。检查：

```bash
pnpm config get @ylovexln:registry   # 应为 https://npm.pkg.github.com
```

**`pnpm add github:...` 报 git 相关错误**

机器上没装 `git`，或网络连不上 GitHub。检查 `git --version`。

**日志里没有 `[selfmsg]`**

- 目录是否在 `<karin>/plugins/` 下
- 目录名是否以 `karin-plugin-` 开头
- `package.json` 是否含 `karin` 字段
- npm 安装的话，`node_modules` 里能否看到该目录

**pnpm 提示 peer 警告**

可忽略，本插件没有运行时依赖。
