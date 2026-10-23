// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 YlovexLN

/**
 * 核心：接管 OneBot 客户端的 `emit`，把 `message_sent` 改写为原生 `message` 事件。
 *
 * 为什么不改 node_modules：镜像更新会覆盖；为什么不注册 command：
 * `message_sent` 在适配器层就被丢弃，根本到不了插件分发阶段，
 * 框架也没有提供"事件进入分发前"的扩展点。
 */
import * as nk from 'node-karin'

import { ENV, MATCH_RE, TAG } from './config.js'
import { buildSingleLinkEvent, extractLinks } from './links.js'
import { isPluginOutput, normalize, textOf } from './message.js'

const { karin, logger, BOT_CONNECT } = nk

/**
 * 跨模块实例共享的运行时状态。
 *
 * 热重载会重新执行模块，模块级变量随之重置，但旧包装器仍挂在 emit 链上。
 * 用 `Symbol.for` 挂到 globalThis，保证：
 *   1. emit 只被包装一次；
 *   2. `apps/` 里的状态命令与入口读到的是同一份计数。
 * @type {{
 *   inited: boolean,
 *   patched: WeakSet<object>,
 *   bots: Set<string>,
 *   lastPass: Map<string, number>,
 *   lastRelay: Map<string, number>,
 *   stats: { relayed: number, split: number, dropped: number, lastAt: number, lastTarget: string }
 * }}
 */
const STATE = Symbol.for('karin-plugin-selfmsg:state')
const state = (globalThis[STATE] ??= {
  inited: false,
  patched: new WeakSet(),
  bots: new Set(),
  lastPass: new Map(),
  lastRelay: new Map(),
  stats: { relayed: 0, split: 0, dropped: 0, lastAt: 0, lastTarget: '' }
})

/**
 * 接管一个 bot 实例的 OneBot 客户端。
 * @param {any} bot Karin 适配器实例
 * @param {string} selfId bot 自身 QQ 号，仅用于状态展示
 * @returns {boolean} 是否接管成功
 */
export const patchBot = (bot, selfId = '?') => {
  const ob = bot?._onebot
  if (!ob || typeof ob.emit !== 'function') return false
  if (state.patched.has(ob)) {
    state.bots.add(String(selfId))
    return true
  }

  const rawEmit = ob.emit.bind(ob)

  ob.emit = function (name, data, ...rest) {
    /** 统计+按需打日志，返回 true 表示事件已消费 */
    const drop = (reason) => {
      state.stats.dropped += 1
      if (ENV.debug) logger.info(`${TAG} 丢弃（${reason}）`)
      return true
    }

    try {
      if (!data || typeof data !== 'object' || data.post_type !== 'message_sent') {
        return rawEmit(name, data, ...rest)
      }

      if (data.message_type === 'group' && !ENV.group) return drop('群聊未启用')

      const key = String(data.target_id ?? data.group_id ?? data.user_id ?? 'unknown')
      const now = Date.now()

      /** 静默窗口：刚放行过一条，之后一段时间内该 target 的自发消息一律丢弃 */
      if (now - (state.lastRelay.get(key) || 0) < ENV.quietMs) return drop('静默窗口')

      /** 插件产物回流保护：图片 / json / xml 都不是用户发的链接 */
      if (ENV.filterCard && isPluginOutput(data.message)) return drop('插件产物')

      const text = textOf(data)

      /** 白名单：只放行命中内容规则的自发消息，避免干扰 Karin 其它插件 */
      if (MATCH_RE && !MATCH_RE.test(text)) return drop(`未命中白名单 ${text.slice(0, 60)}`)

      if (now - (state.lastPass.get(key) || 0) < ENV.cooldownMs) return drop('冷却中')

      state.lastPass.set(key, now)
      state.lastRelay.set(key, now)
      state.stats.relayed += 1
      state.stats.lastAt = now
      state.stats.lastTarget = key

      const fixed = normalize(data)
      if (ENV.debug) {
        logger.info(`${TAG} 归一化 message_sent -> message: ${JSON.stringify(fixed).slice(0, 300)}`)
      }

      /**
       * 多链接拆分：kkk 一条消息只解析第一个链接，有几个就拆成几条分别投递。
       * 后续几条直接用 rawEmit 投递，不再经过本插件的闸门，否则会被静默窗口挡住。
       */
      const links = ENV.split ? extractLinks(text) : []
      if (links.length > 1) {
        logger.info(`${TAG} 检测到 ${links.length} 个链接，拆成 ${links.length} 条分别投递`)
        links.forEach((link, index) => {
          const deliver = () => {
            try {
              rawEmit(name, buildSingleLinkEvent(fixed, link, index), ...rest)
              state.stats.split += 1
            } catch (error) {
              logger.error(`${TAG} 投递第 ${index + 1} 个链接失败: ${error}`)
            }
          }
          if (index === 0) deliver()
          else setTimeout(deliver, index * ENV.splitDelayMs)
        })
        return true
      }

      /** 只投递归一化后的事件，原始 message_sent 不再下传，避免多一条「收到未知事件」警告 */
      return rawEmit(name, fixed, ...rest)
    } catch (error) {
      logger.error(`${TAG} 处理 message_sent 失败: ${error}`)
    }
    return rawEmit(name, data, ...rest)
  }

  state.patched.add(ob)
  state.bots.add(String(selfId))
  return true
}

/**
 * 尝试接管，并输出结果日志。
 * @param {any} bot
 * @param {string} from 触发来源，用于排查
 * @returns {boolean}
 */
export const tryPatch = (bot, from) => {
  const selfId = bot?.selfId ?? bot?.self_id ?? '?'
  const target = (() => {
    try {
      return karin.getBot?.(selfId) || bot
    } catch {
      return bot
    }
  })()

  if (patchBot(target, selfId)) {
    logger.info(`${TAG} 已接管 bot ${selfId}（来源: ${from}），message_sent 将被当作普通消息分发`)
    return true
  }

  logger.warn(`${TAG} bot ${selfId} 上没有找到 _onebot，接管失败（来源: ${from}）`)
  return false
}

/** 插件初始化；重复调用安全。 */
export const init = async () => {
  if (state.inited) return
  state.inited = true

  if (!ENV.enable) {
    logger.warn(`${TAG} 配置中 enable=false，插件已禁用`)
    return
  }

  karin.on(BOT_CONNECT, (bot) => tryPatch(bot, 'BOT_CONNECT'))

  /** 插件可能晚于适配器加载（热重载场景），补一次存量 bot */
  try {
    const all = karin.getAllBot?.()
    const list = Array.isArray(all) ? all : Object.values(all || {})
    for (const b of list) tryPatch(b, 'startup')
  } catch (error) {
    logger.debug?.(`${TAG} 扫描存量 bot 失败: ${error}`)
  }
}

/** 供状态命令读取的快照。 */
export const getStatus = () => ({
  enabled: ENV.enable,
  group: ENV.group,
  split: ENV.split,
  match: ENV.matchAll ? '全部放行（matchAll=true）' : ENV.match,
  bots: [...state.bots],
  stats: { ...state.stats }
})
