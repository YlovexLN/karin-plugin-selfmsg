// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 YlovexLN

/**
 * 打包发布：只产出一套运行时文件，不含文档、测试、开发配置。
 *
 *   dist/<包名>-<版本>.zip   分发 / 存档
 *   dist/<包名>/             已展开，直接 docker cp
 *
 * 只用 Node 内置模块（node:zlib 做 deflate，zip 结构手写）。
 * 用法：node scripts/pack.mjs
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'dist')
const SKIP_DIRS = new Set(['node_modules', '@karinjs', 'dist', '.git'])
const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db'])

/**
 * 打包白名单：只保留 Karin 运行时真正会读到的文件。
 * 目录用 `xxx/` 前缀，新增 util 会自动带上；LICENSE 必须留（AGPL 分发要求）。
 */
const CORE = [
  'package.json',
  'index.js',
  'dir.js',
  'web.config.js',
  'LICENSE',
  'apps/',
  'utils/',
  'config/default.json'
]

/** 少一个就跑不起来，缺了直接报错而不是静默打出半个包 */
const REQUIRED = ['package.json', 'index.js', 'dir.js', 'web.config.js', 'config/default.json']

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

/** 收集文件，目录与文件名都排序，保证同样输入产出同样字节 */
const collect = (dir = ROOT, out = []) => {
  const entries = readdirSync(dir, { withFileTypes: true })
  entries.sort((a, b) => (a.name < b.name ? -1 : 1))
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(full, out)
    } else if (!SKIP_FILES.has(entry.name)) {
      out.push({ full, rel: relative(ROOT, full).split('\\').join('/') })
    }
  }
  return out
}

const isCore = (rel) => CORE.some((p) => (p.endsWith('/') ? rel.startsWith(p) : rel === p))

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

const crc32 = (buf) => {
  let c = -1
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

/** DOS 时间格式：秒只有 2 秒精度，1980 年起算 */
const dosTime = (mtime) => {
  const d = new Date(mtime)
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

/** 把一组文件编码成 zip 字节流 */
const zipBuffer = (list) => {
  const chunks = []
  const central = []
  let offset = 0

  for (const { full, rel } of list) {
    const name = Buffer.from(`${pkg.name}/${rel}`, 'utf8')
    const raw = readFileSync(full)
    const data = deflateRawSync(raw, { level: 9 })
    const { time, date } = dosTime(statSync(full).mtimeMs)
    const crc = crc32(raw)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0) // 本地文件头签名
    local.writeUInt16LE(20, 4) // 解压所需版本
    local.writeUInt16LE(0x0800, 6) // 文件名 UTF-8
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28) // extra 长度

    chunks.push(local, name, data)

    const head = Buffer.alloc(46)
    head.writeUInt32LE(0x02014b50, 0) // 中央目录签名
    head.writeUInt16LE(20, 4) // 创建版本
    head.writeUInt16LE(20, 6) // 解压所需版本
    head.writeUInt16LE(0x0800, 8)
    head.writeUInt16LE(8, 10)
    head.writeUInt16LE(time, 12)
    head.writeUInt16LE(date, 14)
    head.writeUInt32LE(crc, 16)
    head.writeUInt32LE(data.length, 20)
    head.writeUInt32LE(raw.length, 24)
    head.writeUInt16LE(name.length, 28)
    head.writeUInt16LE(0, 30) // extra
    head.writeUInt16LE(0, 32) // comment
    head.writeUInt16LE(0, 34) // 起始磁盘
    head.writeUInt16LE(0, 36) // 内部属性
    head.writeUInt32LE((0o100644 << 16) >>> 0, 38) // 外部属性：普通文件 644
    head.writeUInt32LE(offset, 42) // 本地头偏移

    central.push(head, name)
    offset += local.length + name.length + data.length
  }

  const centralBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0) // 中央目录结束签名
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(list.length, 8)
  eocd.writeUInt16LE(list.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20) // 注释长度

  return Buffer.concat([...chunks, centralBuf, eocd])
}

const files = collect(ROOT)
  .filter(({ rel }) => isCore(rel))
  .sort((a, b) => (a.rel < b.rel ? -1 : 1))

const missing = REQUIRED.filter((f) => !files.some(({ rel }) => rel === f))
if (missing.length) throw new Error(`构建中止，缺少必需文件: ${missing.join(', ')}`)

const zipPath = join(OUT_DIR, `${pkg.name}-${pkg.version}.zip`)
const dirPath = join(OUT_DIR, pkg.name)

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(zipPath, zipBuffer(files))

/** 同一份文件展开成目录：不用解压，直接 docker cp */
rmSync(dirPath, { recursive: true, force: true })
for (const { full, rel } of files) {
  const dest = join(dirPath, rel)
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(full, dest)
}

const size = statSync(zipPath).size
const sha = createHash('sha256').update(readFileSync(zipPath)).digest('hex')
console.log(`文件数: ${files.length}`)
console.log(`大小:   ${(size / 1024).toFixed(1)} KB`)
console.log(`sha256: ${sha}`)
console.log(`压缩包: ${relative(ROOT, zipPath)}`)
console.log(`文件夹: ${relative(ROOT, dirPath)}`)
