# 发布（维护者）

推 `v*` 开头的 tag 即发布，同一版本同时发到两个源。工作流：[`releases.yml`](../.github/workflows/releases.yml)。

```bash
# 1. 先把 package.json 的 version 改成新版本并提交
# 2. 打 tag 推送
git tag v0.0.3 && git push origin v0.0.3
```

## 两个源，两个包名

GitHub Packages 强制 `@owner/` 前缀，而 npm 的 `publishConfig` 不支持改 `name`。
所以 CI 在发布前用 `npm pkg set name=...` 临时改，仓库里的 `package.json` 保持无 scope：

| 源 | 包名 |
| --- | --- |
| npmjs.com | `karin-plugin-selfmsg` |
| GitHub Packages | `@ylovexln/karin-plugin-selfmsg` |

仓库里的名字、目录名、`@karinjs/<包名>` 配置目录、插件规范前缀四者一致。

## CI 分两个 job，不能合并

| job | 权限 | 认证 |
| --- | --- | --- |
| `npmjs` | `id-token: write` | Trusted Publishing（OIDC），无需 token |
| `github-packages` | `packages: write` | Actions 自带 `GITHUB_TOKEN` |

**为什么必须拆开**：npm 11 只要检测到 OIDC 能力，就对任何 registry 先尝试 token exchange。
GitHub Packages 没有该端点（`POST /-/npm/v1/oidc/token/exchange` 返回 404），npm 随后直接报
`ENEEDAUTH`，**不会回退到 `NODE_AUTH_TOKEN`**。而 `id-token` 是 job 级权限，无法按 step 关闭，
所以只能拆 job。合并回去会立刻复发。

## 幂等

发布前查目标版本是否已存在：

- npmjs：`GET https://registry.npmjs.org/<pkg>/<ver>` → 200 已发布 / 404 未发布
- GitHub Packages：读 packument，200 时比对 version；401/403/404 按未发布处理
  （该源对不存在的包返回 401 而不是 404）

已发布就跳过，所以**重跑同一个 tag 不会红**。

## dist-tag

| 版本 | dist-tag |
| --- | --- |
| `0.0.3` | `latest` |
| `0.0.3-beta.1` | `beta` |
| `0.0.3-rc.1` | `rc` |

规则：取预发布标识的第一段。预发布**必须**显式给 `--tag`，否则 npm 直接拒绝：

```
npm error You must specify a tag using --tag when publishing a prerelease version.
```

## 首次发布（只做一次）

Trusted Publisher 只能配置在已存在的包上，所以第一版必须手动发：

```bash
npm login
npm publish --access public --tag <beta|latest>    # 需要 2FA 验证码
```

然后到 https://www.npmjs.com/package/karin-plugin-selfmsg/access 绑定：

```
Organization or user:  YlovexLN
Repository:            karin-plugin-selfmsg
Workflow filename:     releases.yml
Environment:           （留空）
```

两项勾选：

- ✅ **Allow npm publish** —— 不勾的话 CI 只能做 stage publish（进暂存区等人工批准）
- ⬜ Allow npm dist-tag —— 只有需要 CI 改 dist-tag 时才勾

> **改 workflow 文件名要同步改这里。** Trusted Publisher 记的是文件名，改名后不更新会 401。

## 打本地 zip

```bash
node scripts/pack.mjs
```

产出 `dist/karin-plugin-selfmsg-<版本>.zip` 与同名展开目录，内含 11 个运行时文件
（不含文档、测试、脚本、CI 配置）。发布到 npm 的内容由 `package.json` 的 `files` 控制，
与这个白名单是同一份集合。
