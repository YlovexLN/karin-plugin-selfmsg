// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 YlovexLN

/** 插件自身的路径常量。 */
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 插件根目录（package.json 所在目录） */
export const PluginDir = dirname(fileURLToPath(import.meta.url))

/**
 * 配置目录名，**不带 scope**。
 *
 * package.json 的 `name` 是 `@ylovexln/karin-plugin-selfmsg`（GitHub Packages 要求 scoped），
 * 但配置目录固定用这个名字，好处是路径干净（`@karinjs/karin-plugin-selfmsg/config`），
 * 将来换 npm 源或换所有者也不用迁移用户配置。
 */
export const PluginName = 'karin-plugin-selfmsg'
