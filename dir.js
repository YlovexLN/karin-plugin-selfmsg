// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 YlovexLN

/** 插件自身的路径常量。 */
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 插件根目录（package.json 所在目录） */
export const PluginDir = dirname(fileURLToPath(import.meta.url))

/** 插件包名，需与 package.json 的 name 及目录名保持一致 */
export const PluginName = 'karin-plugin-selfmsg'
