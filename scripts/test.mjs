// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 YlovexLN

/**
 * 冒烟测试：不需要安装任何依赖。
 *
 * 通过就地创建 `node_modules/node-karin` 桩件来模拟宿主环境
 * （node_modules 已在 .gitignore 中，不会被提交）。
 *
 * 运行：node scripts/test.mjs
 * 退出码 0 表示全部通过。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const stubDir = join(root, 'node_modules', 'node-karin')

const STUB_PKG = JSON.stringify(
  { name: 'node-karin', version: '0.0.0', type: 'module', main: 'index.js' },
  null,
  2
)

const STUB_JS = `
export const logger = {
  info: () => {},
  warn: () => {},
  error: (...a) => console.error('[stub]', ...a),
  debug: () => {}
}
export const BOT_CONNECT = 'bot.connect'
export const karin = { on: () => {}, getAllBot: () => [], getBot: () => null }

const comp = (type) => (key, opts = {}) => ({ key, componentType: type, ...opts })
export const components = {
  input: { string: comp('input'), number: comp('input'), create: comp('input') },
  switch: { create: comp('switch') },
  divider: { create: comp('divider') },
  accordion: { create: comp('accordion'), createItem: comp('accordionItem') }
}
export const defineConfig = (config) => config
`

/**
 * 只在"没有 node-karin"或"已有的是本脚本生成的桩件"时写入，
 * 这样既能让旧桩件跟着脚本更新，也不会覆盖真正的 node-karin。
 */
const isOurStub = () => {
  try {
    return JSON.parse(readFileSync(join(stubDir, 'package.json'), 'utf8')).version === '0.0.0'
  } catch {
    return false
  }
}

if (!existsSync(stubDir) || isOurStub()) {
  mkdirSync(stubDir, { recursive: true })
  writeFileSync(join(stubDir, 'package.json'), STUB_PKG)
  writeFileSync(join(stubDir, 'index.js'), STUB_JS)
}

/**
 * 把工作目录挪到临时目录再加载模块。
 *
 * `utils/config.js` 在没有 `karinPathBase` 时，会用 `process.cwd()/@karinjs` 兜底，
 * 测试里若不换目录，生成的配置就会落在仓库里，留下 `@karinjs/` 空壳。
 */
const tmpRoot = mkdtempSync(join(tmpdir(), 'selfmsg-'))
process.chdir(tmpRoot)

const { getStatus, patchBot } = await import('../utils/relay.js')

const results = []
const check = (name, ok, extra = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
}

/** 记录所有被投递出去的事件 */
const delivered = []
const ob = {
  emit: (name, data) => {
    delivered.push({
      postType: data.post_type,
      subType: data.sub_type,
      userId: data.sender?.user_id,
      text: data.message?.[0]?.data?.text ?? ''
    })
    return true
  }
}

const bot = { selfId: '869835619', _onebot: ob }
const emit = (extra) => ob.emit('message', { message_id: 1, sender: { nickname: 'bot' }, ...extra })
const seg = (text) => [{ type: 'text', data: { text } }]
const BILI = 'https://b23.tv/BV1RJ4m1V74g'
const BILI2 = 'https://b23.tv/BV14w4m1e7E5'

check('接管 emit 成功', patchBot(bot, '869835619') === true)

/** 1. 私聊 B站链接应放行，并改写成 message 事件 */
{
  const before = delivered.length
  emit({
    post_type: 'message_sent',
    message_type: 'private',
    target_id: 1001,
    message: seg(`看这个 ${BILI}`),
    raw_message: `看这个 ${BILI}`
  })
  const last = delivered.at(-1)
  check('私聊链接被放行', delivered.length === before + 1)
  check('post_type 改写为 message', last?.postType === 'message', last?.postType)
  check('sender.user_id 改为对话方', last?.userId === 1001, String(last?.userId))
  check('sub_type 补齐为 friend', last?.subType === 'friend', last?.subType)
}

/** 2. 同一 target 紧接第二条应被静默窗口拦下 */
{
  const before = delivered.length
  emit({
    post_type: 'message_sent',
    message_type: 'private',
    target_id: 1001,
    message: seg(`再来 ${BILI2}`),
    raw_message: BILI2
  })
  check('静默窗口拦截连续消息', delivered.length === before)
}

/** 3. 不含链接的普通回复应被白名单拦下 */
{
  const before = delivered.length
  emit({
    post_type: 'message_sent',
    message_type: 'private',
    target_id: 1002,
    message: seg('哈哈哈好的'),
    raw_message: '哈哈哈好的'
  })
  check('白名单拦截无链接消息', delivered.length === before)
}

/** 4. 图片消息是插件产物，必须拦下，否则出图会再次触发解析形成循环 */
{
  const before = delivered.length
  emit({
    post_type: 'message_sent',
    message_type: 'private',
    target_id: 1003,
    message: [{ type: 'image', data: { file: 'base64://xxx' } }],
    raw_message: ''
  })
  check('产物过滤拦截图片（防循环）', delivered.length === before)
}

/** 5. 群消息应放行，且发送者被伪造成配置的成员号 */
{
  const before = delivered.length
  emit({
    post_type: 'message_sent',
    message_type: 'group',
    group_id: 555,
    message: seg(`群里的 ${BILI}`),
    raw_message: BILI
  })
  const last = delivered.at(-1)
  check('群消息被放行', delivered.length === before + 1)
  check('群发送者被伪造', String(last?.userId) === '10000', String(last?.userId))
  check('群 sub_type 为 normal', last?.subType === 'normal', last?.subType)
}

/** 6. 一条消息多个链接应拆成多条分别投递 */
{
  const before = delivered.length
  emit({
    post_type: 'message_sent',
    message_type: 'private',
    target_id: 1004,
    message: seg(`A ${BILI}\nB ${BILI2}`),
    raw_message: BILI
  })
  check('多链接首条立即投递', delivered.length === before + 1)

  await new Promise((resolve) => setTimeout(resolve, 1800))
  check('多链接第二条延迟投递', delivered.length === before + 2)

  const texts = delivered.slice(-2).map((x) => x.text)
  check('拆分后每条只含一个链接', texts[0] === BILI && texts[1] === BILI2, texts.join(' | '))
}

/** 7. 状态快照应与实际行为一致 */
{
  const status = getStatus()
  check('状态记录了已接管的 bot', status.bots.includes('869835619'), status.bots.join(','))
  check('状态统计了放行条数', status.stats.relayed === 3, String(status.stats.relayed))
  check('状态统计了拆分条数', status.stats.split === 2, String(status.stats.split))
}

/** 8. WebUI 配置：save() 应写入 JSON，且把前端传来的字符串规范化 */
{
  const { existsSync, readFileSync, rmSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { ConfigDir } = await import('../utils/config.js')
  const { default: webConfig } = await import('../web.config.js')

  check('WebUI 定义了组件', Array.isArray(webConfig.components()) && webConfig.components().length > 0)

  const res = webConfig.save({
    enable: true,
    group: 'false',
    splitDelayMs: '2500',
    match: 'b23\\.tv'
  })
  check('save 返回成功', res?.success === true, res?.message)

  const file = join(ConfigDir, 'config.json')
  const saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
  check('配置文件已写入', saved !== null)
  check('字符串 "false" 转为布尔', saved?.group === false, String(saved?.group))
  check('数字字符串转为数字', saved?.splitDelayMs === 2500, String(saved?.splitDelayMs))
  check('未提供项落默认值', saved?.cooldownMs === 8000, String(saved?.cooldownMs))

  /** 清理，避免写入的配置影响后续运行 */
  rmSync(ConfigDir, { recursive: true, force: true })
  check('测试后已清理配置目录', !existsSync(file))
}

/** 9. 临时目录不应残留 */
process.chdir(root)
rmSync(tmpRoot, { recursive: true, force: true })
check('测试不污染仓库', !existsSync(join(root, '@karinjs')))

const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} 通过`)
process.exit(failed === 0 ? 0 : 1)