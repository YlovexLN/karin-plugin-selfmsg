// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 YlovexLN

/** 插件自身的路径常量。 */
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 插件根目录（package.json 所在目录） */
export const PluginDir = dirname(fileURLToPath(import.meta.url))

/**
 * 包名 / 配置目录名，与 package.json 的 `name`、仓库目录名一致。
 *
 * 配置路径为 `@karinjs/karin-plugin-selfmsg/config`。
 * 发到 GitHub Packages 时 CI 会临时改成 `@ylovexln/karin-plugin-selfmsg`，
 * 但那只影响注册表上的包名，不影响这里——换源或换所有者都不用迁移用户配置。
 */
export const PluginName = 'karin-plugin-selfmsg'
