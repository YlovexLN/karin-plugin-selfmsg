// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 YlovexLN

/** 链接提取与拆分投递用的消息构造。 */

/** 可解析的平台短链 / 长链 */
export const LINK_RE =
  /https?:\/\/(?:b23\.tv|bili2233\.cn|bili\.tv|bilibili\.com|www\.bilibili\.com|m\.bilibili\.com)\/[A-Za-z0-9\-_/?.=&%#:~+]*/gi

/**
 * 从文本里抽出链接，保序去重。
 * @param {string} text
 * @returns {string[]}
 */
export const extractLinks = (text) => {
  if (!text) return []
  const out = []
  for (const m of String(text).matchAll(LINK_RE)) {
    /** 去掉紧跟在 URL 后面的收尾标点，避免把 `，` 这类字符带进链接 */
    const url = m[0].replace(/[)"'`）,.;:!?]+$/, '')
    if (!out.includes(url)) out.push(url)
  }
  return out
}

/**
 * 用单个链接构造一条可投递的消息事件。
 *
 * `message_id` 递增，避免 Karin 生成重复的 `eventId`（`message:<id>`）导致事件被合并。
 * @param {any} base 已归一化的基础事件
 * @param {string} link 单个链接
 * @param {number} index 序号
 * @returns {any}
 */
export const buildSingleLinkEvent = (base, link, index) => {
  const mid = base.message_id
  const messageId = typeof mid === 'number' ? mid + index : `${mid ?? Date.now()}${index}`
  return {
    ...base,
    message_id: messageId,
    raw_message: link,
    message: [{ type: 'text', data: { text: link } }]
  }
}
