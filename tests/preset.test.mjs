import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'

const doc = parse(await readFile(new URL('../presets/chat.patch.yml', import.meta.url), 'utf8'), { customTags: [{ tag: '!!js', resolve: (s) => ({ js: s }) }] })
const row = doc[0].insert[0]
const names = []
const walk = (plugins) => { for (const p of plugins ?? []) { names.push(p.name); if (p.group) walk(p.config) } }
walk(row.config.plugins)

test('chat preset is declared', () => {
  assert.equal(row.name, '@deepseek-ai/dsh-agent-preset')
  assert.equal(row.config.id, 'chat')
})
test('chat preset has no forbidden plugins', () => {
  const forbidden = [/dsh-tool-fs(-search)?$/, /dsh-tool-bash/, /dsh-tool-pwsh/, /dsh-terminal/, /str-replace-editor/,
    /dsh-tool-subagent/, /dsh-workflow/, /dsh-tool-workflow/, /dsh-tool-jobs/, /dsh-tool-todo/, /dsh-tool-schedule/,
    /dsh-skill-filesystem/, /dsh-tool-skill/, /dsh-agent-instructions/, /dsh-plan-mode/, /dsh-tool-goal/, /dsh-command-goal/,
    /dsh-plugin-manager/, /dsh-plugin-market/]
  for (const n of names) for (const re of forbidden) assert.doesNotMatch(n, re)
})
test('chat preset has web and read_attachment', () => {
  assert.ok(names.includes('@deepseek-ai/dsh-tool-web'))
  assert.ok(names.includes('@mercurynomercy/dsh-chat-mode/read-attachment'))
})
test('bundle patch list includes the preset', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.deepEqual(pkg.dsh.bundle.patch, ['./cordis.patch.yml', './presets/chat.patch.yml'])
})

test('chat preset has a readable name and description', () => {
  assert.equal(row.config.name, '聊天模式 Chat')
  assert.match(row.config.description, /联网搜索/)
  assert.match(row.config.description, /web search/i)
})
