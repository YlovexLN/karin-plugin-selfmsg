// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 YlovexLN

/**
 * WebUI 配置面板。
 *
 * Karin 通过 `package.json` 的 `karin.web` 找到本文件，渲染成插件配置页；
 * 用户点击保存后调用 `save()`，把配置写到
 * `@karinjs/<包名>/config/config.json`——也就是插件唯一的配置来源。
 *
 * 注意：本插件在框架启动早期就要接管事件，配置无法热应用，保存后需重启 Karin。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import * as nk from 'node-karin'

import { PluginName } from './dir.js'
import { ConfigFile, ENV, TAG } from './utils/config.js'

const { logger } = nk

/** 兼容不存在 defineConfig / components 的旧版本框架，避免整页配置崩掉 */
const defineConfig = nk.defineConfig ?? ((config) => config)
const { components } = nk

/** 复选框等组件可能返回字符串，统一成布尔 */
const toBool = (value) => value === true || value === 'true'

const toInt = (value, def) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : def
}

/** 文本：去空白，空值回落默认 */
const toText = (value, def) => {
  const text = String(value ?? '').trim()
  return text || def
}

/**
 * 保存逻辑：把前端表单值规范化后写入 JSON。
 * 文档明确说明"就算是 number 类型，返回的也是 string 类型"，所以这里显式转换。
 * @param {Record<string, any>} config
 */
const save = (config) => {
  try {
    const payload = {
      enable: toBool(config.enable),
      group: toBool(config.group),
      groupSender: toText(config.groupSender, '10000'),
      groupSenderName: toText(config.groupSenderName, '群成员'),
      cooldownMs: toInt(config.cooldownMs, 8000),
      quietMs: toInt(config.quietMs, 8000),
      split: toBool(config.split),
      splitDelayMs: toInt(config.splitDelayMs, 1500),
      filterCard: toBool(config.filterCard),
      match: toText(config.match, 'b23\\.tv|bilibili\\.com|bili2233|BV[0-9A-Za-z]{10}'),
      matchAll: toBool(config.matchAll),
      debug: toBool(config.debug)
    }

    mkdirSync(dirname(ConfigFile), { recursive: true })
    writeFileSync(ConfigFile, JSON.stringify(payload, null, 2) + '\n', 'utf8')
    logger.info(`${TAG} WebUI 配置已保存到 ${ConfigFile}`)

    return {
      success: true,
      message: `已保存到 @karinjs/${PluginName}/config/config.json，重启 Karin 后生效`
    }
  } catch (error) {
    logger.error(`${TAG} 保存 WebUI 配置失败: ${error}`)
    return { success: false, message: `保存失败: ${error.message}` }
  }
}

/** 组件树；兼容旧版本框架时退化为空列表 */
const buildComponents = () => {
  if (!components) return []

  return [
    components.accordion.create('acc-basic', {
      label: '基础',
      children: [
        components.accordion.createItem('item-basic', {
          title: '开关',
          subtitle: '总开关与群聊处理',
          children: [
            components.switch.create('enable', {
              description: '插件总开关，关闭后不再接管任何事件',
              defaultSelected: ENV.enable,
              startText: '启用',
              endText: '停用'
            }),
            components.switch.create('group', {
              description: '是否处理群内自发消息（AstrBot 在群里发的链接）',
              defaultSelected: ENV.group,
              startText: '处理',
              endText: '跳过'
            })
          ]
        }),
        components.accordion.createItem('item-group-sender', {
          title: '群消息发送者',
          subtitle: '群内自发消息没有真实发送者，插件用一个固定身份代替它',
          children: [
            components.input.string('groupSender', {
              label: '发送者 QQ 号',
              placeholder: '10000',
              defaultValue: ENV.groupSender,
              description:
                '群内 bot 自发消息的发送者永远是 bot 自己，不改写会被插件「忽略自身消息」的过滤挡掉，kkk 就不会出卡。' +
                '这里填的是一个替身号，只存在于事件数据里，群友看不到。' +
                '建议保持 10000：不要填自己、群主或管理员——Karin 判断 perm: master 看的就是这个字段，' +
                '填了他们，注入的消息可能被当成他们发的。'
            }),
            components.input.string('groupSenderName', {
              label: '发送者昵称',
              placeholder: '群成员',
              defaultValue: ENV.groupSenderName,
              description: '仅用于事件数据，卡片上可能显示这个名字'
            })
          ]
        })
      ]
    }),

    components.divider.create('div-basic'),

    components.accordion.create('acc-filter', {
      label: '内容过滤',
      children: [
        components.accordion.createItem('item-whitelist', {
          title: '白名单',
          subtitle: '只有匹配的自发消息才会进入 Karin 插件层',
          children: [
            components.input.string('match', {
              label: '正则表达式',
              placeholder: 'b23\\.tv|bilibili\\.com|bili2233|BV[0-9A-Za-z]{10}',
              defaultValue: ENV.match,
              description: '不区分大小写。想支持抖音/快手/小红书就追加对应域名'
            }),
            components.switch.create('matchAll', {
              description: '开启则放行全部自发消息（慎用，会让 AstrBot 的每句话都进入插件层）',
              defaultSelected: ENV.matchAll,
              startText: '关闭白名单',
              endText: '按正则过滤'
            })
          ]
        }),
        components.accordion.createItem('item-output', {
          title: '回流保护',
          subtitle: '防止 kkk 自己的产物被当成新消息再次解析',
          children: [
            components.switch.create('filterCard', {
              description: '丢弃含图片 / 卡片的自发消息。关闭会导致「图 → 解析 → 图」无限循环',
              defaultSelected: ENV.filterCard,
              startText: '开启',
              endText: '关闭（危险）'
            })
          ]
        })
      ]
    }),

    components.divider.create('div-filter'),

    components.accordion.create('acc-delivery', {
      label: '投递行为',
      children: [
        components.accordion.createItem('item-split', {
          title: '多链接',
          subtitle: 'kkk 一条消息只解析第一个链接',
          children: [
            components.switch.create('split', {
              description: '一条消息含多个链接时，拆成多条分别投递',
              defaultSelected: ENV.split,
              startText: '拆分',
              endText: '不拆分'
            }),
            components.input.number('splitDelayMs', {
              label: '拆分间隔（毫秒）',
              placeholder: '1500',
              defaultValue: String(ENV.splitDelayMs),
              description: '给截图渲染留时间，太快会让 puppeteer 并发压力过大'
            })
          ]
        }),
        components.accordion.createItem('item-window', {
          title: '防抖窗口',
          subtitle: '避免同一用户的连续触发',
          children: [
            components.input.number('cooldownMs', {
              label: '冷却（毫秒）',
              placeholder: '8000',
              defaultValue: String(ENV.cooldownMs)
            }),
            components.input.number('quietMs', {
              label: '静默窗口（毫秒）',
              placeholder: '8000',
              defaultValue: String(ENV.quietMs),
              description: '放行一条后，该用户在此期间的自发消息全部丢弃；设 0 关闭'
            })
          ]
        })
      ]
    }),

    components.divider.create('div-delivery'),

    components.switch.create('debug', {
      description: '打印每条自发消息被放行或丢弃的原因，排障用',
      defaultSelected: ENV.debug,
      startText: '开',
      endText: '关'
    })
  ]
}

export default defineConfig({
  info: {
    id: PluginName,
    name: PluginName,
    author: {
      name: 'YlovexLN',
      home: 'https://github.com/YlovexLN/karin-plugin-selfmsg',
      avatar: 'https://github.com/YlovexLN.png'
    },
    icon: {
      name: 'sync_alt',
      size: 24,
      color: '#4F8EF7'
    },
    version: '0.0.2-beta.1',
    description: '把 OneBot11 的 message_sent 改写成消息事件，让下游解析插件（如 kkk）收到其它框架发出的链接'
  },
  components: buildComponents,
  save
})
