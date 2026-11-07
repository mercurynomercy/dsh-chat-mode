import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureChatWorkspace, CHAT_DIR_NAME, CHAT_WORKSPACE_TITLE, apply, inject, name } from '../index.js'

function fakeRegistry({ existing, createFails, titles = [] } = {}) {
  const calls = { create: 0 }
  const mk = (path, title) => ({ id: 'w1', path, title, async setTitle(t) { this.title = t } })
  let ws = existing
  return {
    calls,
    list: () => [...titles.map((t, i) => ({ id: `o${i}`, title: t })), ...(ws ? [ws] : [])],
    async resolveByPath() { return ws },
    async create(path) { calls.create++; if (createFails) throw new Error('boom'); ws = mk(path, 'chat-mode-workspace'); return ws },
  }
}

test('constants', () => {
  assert.equal(CHAT_DIR_NAME, 'chat-mode-workspace')
  assert.equal(CHAT_WORKSPACE_TITLE, '聊天')
  assert.equal(name, 'chat-mode-host')
  assert.deepEqual(inject, ['workspaceRegistry'])
})
test('creates and titles the chat workspace when missing', async () => {
  const reg = fakeRegistry()
  const ws = await ensureChatWorkspace(reg, '/d/chat-mode-workspace')
  assert.equal(reg.calls.create, 1)
  assert.equal(ws.title, '聊天')
})
test('reuses an existing chat workspace without renaming a user title', async () => {
  const reg = fakeRegistry({ existing: { id: 'w1', path: '/d', title: '我的闲聊', async setTitle() { throw new Error('should not rename') } } })
  const ws = await ensureChatWorkspace(reg, '/d')
  assert.equal(reg.calls.create, 0)
  assert.equal(ws.title, '我的闲聊')
})
test('keeps the directory title when 聊天 is already taken', async () => {
  const reg = fakeRegistry({ titles: ['聊天'] })
  const ws = await ensureChatWorkspace(reg, '/d/chat-mode-workspace')
  assert.equal(ws.title, 'chat-mode-workspace')
})
test('create failure surfaces as chat workspace unavailable', async () => {
  await assert.rejects(ensureChatWorkspace(fakeRegistry({ createFails: true }), '/d'), /chat workspace unavailable/)
})
test('apply makes the directory and never throws', async () => {
  const home = await mkdtemp(join(tmpdir(), 'chat-host-'))
  const warnings = []
  await apply({ workspaceRegistry: fakeRegistry({ createFails: true }), logger: { warn: (...a) => warnings.push(a) } }, { dshHome: home })
  assert.ok((await stat(join(home, CHAT_DIR_NAME))).isDirectory())
  assert.equal(warnings.length, 1)
})

function orderedRegistry(ids, chatId) {
  const state = { ids: [...ids], moves: [] }
  const chat = { id: chatId, path: '/d', title: '聊天', async setTitle() {} }
  return {
    state,
    list: () => state.ids.map((id) => (id === chatId ? chat : { id, title: id })),
    async resolveByPath() { return chat },
    async create() { throw new Error('unused') },
    async insertBefore(id, beforeId) {
      state.moves.push([id, beforeId])
      state.ids = [...state.ids.filter((x) => x !== id), id]
      return state.ids
    },
  }
}
test('apply moves the chat workspace to the end of the list', async () => {
  const home = await mkdtemp(join(tmpdir(), 'chat-order-'))
  const reg = orderedRegistry(['chat', 'movie', 'cut'], 'chat')
  await apply({ workspaceRegistry: reg }, { dshHome: home })
  assert.deepEqual(reg.state.ids, ['movie', 'cut', 'chat'])
  assert.deepEqual(reg.state.moves, [['chat', undefined]])
})
test('apply does not reorder when the chat workspace is already last', async () => {
  const home = await mkdtemp(join(tmpdir(), 'chat-order-'))
  const reg = orderedRegistry(['movie', 'chat'], 'chat')
  await apply({ workspaceRegistry: reg }, { dshHome: home })
  assert.deepEqual(reg.state.moves, [])
})
test('a failed reorder does not fail startup', async () => {
  const home = await mkdtemp(join(tmpdir(), 'chat-order-'))
  const reg = orderedRegistry(['chat', 'movie'], 'chat')
  reg.insertBefore = async () => { throw new Error('order invalid') }
  await apply({ workspaceRegistry: reg }, { dshHome: home })
})
