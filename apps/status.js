// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 YlovexLN

/** 状态查询命令，用于确认插件是否真的接管到了 bot。 */
import { karin } from 'node-karin'

import { ConfigFile } from '../utils/config.js'
import { getStatus } from '../utils/relay.js'

const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '无')

/**
 * `#转发状态`：查看接管情况与统计。
 * 仅机器人主人可用，避免在群里被随意触发。
 */
export const status = karin.command(/^#?转发状态$/i, async (e) => {
  const { enabled, group, split, match, bots, stats } = getStatus()

  const lines = [
    'selfmsg 状态',
    `启用: ${enabled ? '是' : '否（配置中 enable=false）'}`,
    `群聊: ${group ? '处理' : '跳过'} / 多链接拆分: ${split ? '开' : '关'}`,
    `已接管 bot: ${bots.length ? bots.join('、') : '无（检查日志是否有「接管失败」）'}`,
    `白名单: ${match}`,
    `配置文件: ${ConfigFile}`,
    `已放行: ${stats.relayed} 条（其中拆分投递 ${stats.split} 条）`,
    `已丢弃: ${stats.dropped} 条`,
    `最近放行: ${fmtTime(stats.lastAt)}${stats.lastTarget ? ` → ${stats.lastTarget}` : ''}`
  ]

  await e.reply(lines.join('\n'))
  return true
}, {
  name: 'selfmsg-状态',
  perm: 'master',
  log: false
})
