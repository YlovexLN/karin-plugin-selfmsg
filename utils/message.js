// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 YlovexLN

/** 消息事件的读取与归一化。 */
import { ENV } from './config.js'

/**
 * 把消息段里的文本和卡片 JSON 拼成一段用于正则匹配的字符串。
 * @param {any} ev OneBot 事件
 * @returns {string}
 */
export const textOf = (ev) => {
  const parts = []
  if (Array.isArray(ev?.message)) {
    for (const seg of ev.message) {
      if (!seg) continue
      if (seg.type === 'text') parts.push(seg.data?.text || '')
      else if (seg.type === 'json' || seg.type === 'xml') {
        parts.push(typeof seg.data === 'string' ? seg.data : JSON.stringify(seg.data || ''))
      }
    }
  }
  if (ev?.raw_message) parts.push(String(ev.raw_message))
  return parts.join('\n')
}

/**
 * 插件产物识别：kkk 出图是 `image`，成品卡片是 `json` / `xml`。
 * 这些自发消息绝不能回流，否则会被当成新消息再次解析，形成循环。
 * @param {any[]} message 消息段数组
 * @returns {boolean}
 */
export const isPluginOutput = (message) =>
  Array.isArray(message) &&
  message.some((s) => s && (s.type === 'json' || s.type === 'xml' || s.type === 'image'))

/**
 * 把 `message_sent` 归一化成 `createMessage` 能消费的 `message` 事件。
 *
 * 对照 Karin 的读取字段补齐：`message_type` / `sub_type` / `sender.user_id` / `sender.nickname`。
 * @param {any} ev
 * @returns {any}
 */
export const normalize = (ev) => {
  const out = { ...ev, post_type: 'message' }

  if (ev.message_type === 'private') {
    /** 私聊自发消息：user_id 是 bot 自己，真正的对话方在 target_id */
    const peer = ev.target_id ?? ev.user_id
    out.user_id = peer
    out.sub_type = 'friend'
    out.sender = {
      ...(ev.sender || {}),
      user_id: peer,
      nickname: ev.sender?.nickname || String(peer)
    }
    out.target_id = peer
    return out
  }

  if (ev.message_type === 'group') {
    /**
     * 群内自发消息没有"哪个人发的"这个信息，user_id 只能是 bot 自己。
     * 直接用它会被自身消息过滤挡掉，因此统一伪造成一个成员身份，
     * 具体 id 由 groupSender 决定。
     */
    out.sub_type = 'normal'
    out.user_id = ENV.groupSender
    out.sender = {
      ...(ev.sender || {}),
      user_id: ENV.groupSender,
      nickname: ENV.groupSenderName,
      card: '',
      role: 'member',
      area: '',
      level: 0,
      title: ''
    }
  }

  return out
}
