// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 YlovexLN

/**
 * 配置读取。
 *
 * **配置只有一个来源：`@karinjs/<包名>/config/config.json`。**
 * 不读取环境变量——插件的配置就该待在插件自己的配置文件里，改起来有迹可循，
 * 也不会出现"compose 里写死一份、面板里又改了一份，到底哪个生效"的问题。
 *
 * 该文件在首次启动时由插件自动生成，内容来自包内的 `config/default.json`。
 * 之后可以：
 *   - 在 Karin WebUI 的插件配置页可视化修改（推荐）
 *   - 直接编辑 `@karinjs/karin-plugin-selfmsg/config/config.json`
 * 改完都需要重启 Karin —— 本插件在框架启动早期就要接管事件，无法热应用。
 *
 * 文件放在 `@karinjs/` 而不是插件目录内：插件目录在更新时会被整体替换，
 * 配置放里面会丢。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as nk from 'node-karin'

import { PluginDir, PluginName } from '../dir.js'

/** 日志前缀 */
export const TAG = '[selfmsg]'

const { logger } = nk

/** `@karinjs` 根目录；桩件或旧版本框架下退化为 cwd */
const KarinBase = nk.karinPathBase ?? join(process.cwd(), '@karinjs')

/** 运行时配置目录与文件 */
export const ConfigDir = join(KarinBase, PluginName, 'config')
export const ConfigFile = join(ConfigDir, 'config.json')

/** 包内自带的默认配置 */
const DefaultFile = join(PluginDir, 'config', 'default.json')

/**
 * 读 JSON；失败返回 null。
 * @param {string} file
 */
const readJson = (file) => {
  try {
    if (!existsSync(file)) return null
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    logger.warn(`${TAG} 读取配置失败 ${file}: ${error}`)
    return null
  }
}

/** 默认配置：优先读包内文件，异常时用内置兜底 */
const defaults = readJson(DefaultFile) ?? {
  enable: true,
  group: true,
  groupSender: '10000',
  groupSenderName: '群成员',
  cooldownMs: 8000,
  quietMs: 8000,
  split: true,
  splitDelayMs: 1500,
  filterCard: true,
  match: 'b23\\.tv|bilibili\\.com|bili2233|BV[0-9A-Za-z]{10}',
  matchAll: false,
  debug: false
}

/** 首次运行时把默认配置写到 `@karinjs` 下；已存在则不动 */
const seedConfig = () => {
  if (existsSync(ConfigFile)) return
  try {
    mkdirSync(ConfigDir, { recursive: true })
    writeFileSync(ConfigFile, JSON.stringify(defaults, null, 2) + '\n', 'utf8')
    logger.info(`${TAG} 已生成默认配置文件: ${ConfigFile}`)
  } catch (error) {
    logger.warn(`${TAG} 生成配置文件失败，本次使用内置默认值: ${error}`)
  }
}

seedConfig()

/** 用户实际保存的内容；缺失或损坏时为 {}，逐项回落默认值 */
const stored = readJson(ConfigFile) ?? {}

/** 布尔：类型不对就回落默认值 */
const bool = (key) => (typeof stored[key] === 'boolean' ? stored[key] : Boolean(defaults[key]))

/** 数字：非有限数回落默认值 */
const num = (key) => {
  const value = Number(stored[key])
  return Number.isFinite(value) ? value : Number(defaults[key])
}

/** 字符串：空串视为未设置，回落默认值 */
const str = (key) => {
  const value = stored[key]
  return typeof value === 'string' && value.trim() ? value : String(defaults[key])
}

export const ENV = {
  /** 总开关 */
  enable: bool('enable'),

  /** 群聊：是否处理群内自发消息 */
  group: bool('group'),

  /**
   * 群消息的"发送者"用谁。
   *
   * 群内自发消息没有"哪个人发的"这个信息，user_id 只能是 bot 自己，
   * 会被框架/插件的自身消息过滤挡掉，因此伪造成一个成员身份。
   * 不要填主人或管理员的号：Karin 的 perm 判断看的就是 sender.userId。
   */
  groupSender: str('groupSender'),
  groupSenderName: str('groupSenderName'),

  /** 同一 target 的冷却窗口（毫秒） */
  cooldownMs: num('cooldownMs'),

  /** 放行一条后对该 target 的静默窗口（毫秒），期间所有自发消息一律丢弃 */
  quietMs: num('quietMs'),

  /** 一条消息里有多个链接时，拆成多条分别投递（kkk 只解析一条消息里的第一个链接） */
  split: bool('split'),

  /** 拆分投递的间隔（毫秒），给渲染留时间，避免 puppeteer 并发压力 */
  splitDelayMs: num('splitDelayMs'),

  /** 是否丢弃含图片 / json / xml 的自发消息（插件产物回流保护） */
  filterCard: bool('filterCard'),

  /** 内容白名单正则：只有命中的自发消息才放行进插件层 */
  match: str('match'),

  /** 设真则不筛内容，所有自发消息全部放行（慎用） */
  matchAll: bool('matchAll'),

  /** 打印每条消息的放行 / 丢弃原因 */
  debug: bool('debug')
}

/**
 * 白名单正则实例。
 * `matchAll` 时置为 null，表示不做内容过滤。
 */
export const MATCH_RE = (() => {
  if (ENV.matchAll) return null
  try {
    return new RegExp(ENV.match, 'i')
  } catch (error) {
    logger.warn(`${TAG} 白名单正则非法，已退化为全量放行: ${error}`)
    return null
  }
})()
