# 常用命令

在仓库根目录执行。

## 语法检查

```bash
node --check index.js dir.js web.config.js apps/*.js utils/*.js scripts/*.mjs
```

## 冒烟测试

```bash
node scripts/test.mjs
```

## Lint

```bash
pnpm install && pnpm lint
```

## 打发布包

```bash
node scripts/pack.mjs
```

产出一份运行时包，zip 与展开目录内容一致：

- `dist/karin-plugin-selfmsg-0.0.1.zip` —— 分发 / 存档
- `dist/karin-plugin-selfmsg/` —— 已展开，可直接放进 Karin 的 `plugins/`

只含 11 个运行时文件：`package.json`、`index.js`、`dir.js`、`web.config.js`、`LICENSE`、
`apps/`、`utils/`、`config/default.json`。文档、测试、脚本、CI 配置都不进包。

白名单在脚本顶部的 `CORE`（目录写成 `apps/` 这种前缀，新增 util 会自动带上），
必填项在 `REQUIRED`，缺一个就直接构建失败，不会静默打出半个包。
`LICENSE` 必须保留——AGPL 分发要求。
版本号读自 `package.json`，只用 Node 内置模块，不依赖 Python 或任何第三方包。

## 部署后的自检

部署由使用者自行完成。插件装好后，在 Karin 日志里找 `selfmsg`，或给机器人发 `#转发状态`
核对接管数与放行数。详见 [verify.md](../workflows/verify.md) 第三步。

