// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 YlovexLN

/**
 * karin-plugin-selfmsg
 *
 * 让 Karin 接受 OneBot11 的 `message_sent`（上报自身消息）事件，
 * 使其进入插件层，供 kkk 等插件解析其它框架（如 AstrBot）发出的链接。
 *
 * 本文件只做两件事：接入框架生命周期、转发到 utils/relay.js。
 * 具体实现见 utils/ 目录。
 */
import { logger } from 'node-karin'

import { TAG } from './utils/config.js'
import { init } from './utils/relay.js'

/**
 * Karin 1.9.10+ 的加载顺序：main 入口 -> KARIN_PLUGIN_INIT -> apps。
 * 把接管动作放在这个导出函数里，符合框架生命周期。
 */
export const KARIN_PLUGIN_INIT = async () => {
  await init()
}

/** 兼容不调用 KARIN_PLUGIN_INIT 的旧版本框架（init 内部有幂等保护） */
init().catch((error) => {
  logger.error(`${TAG} 初始化失败: ${error}`)
})
