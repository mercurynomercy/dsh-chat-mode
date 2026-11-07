import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadClient } from './fixtures/load-client.mjs'

const { id, mod, findChatWorkspace, chatSessions, filterByQuery, DICT, PANEL_ID, CHAT_PRESET } = await loadClient()

test('module identity', () => {
  assert.equal(id, '@mercurynomercy/dsh-chat-mode')
  assert.equal(PANEL_ID, 'chat-mode')
  assert.equal(CHAT_PRESET, 'chat')
  assert.ok(mod.inject.includes('slots') && mod.inject.includes('uiWorkspace') && mod.inject.includes('sessions') && mod.inject.includes('workspaces'))
})
test('findChatWorkspace matches by directory name', () => {
  const items = [{ workspaceId: 'a', path: '/Users/x/Movie' }, { workspaceId: 'c', path: '/Users/x/.dsh/chat-mode-workspace' }]
  assert.equal(findChatWorkspace(items).workspaceId, 'c')
  assert.equal(findChatWorkspace([{ workspaceId: 'd', path: '/x/chat-mode-workspace/' }]).workspaceId, 'd')
  assert.equal(findChatWorkspace([{ workspaceId: 'e', path: '/x/not-chat-mode-workspace' }]), undefined)
  assert.equal(findChatWorkspace([]), undefined)
  assert.equal(findChatWorkspace(undefined), undefined)
})
test('chatSessions keeps the chat workspace sessions, newest first', () => {
  const byId = {
    1: { title: 'a', updatedAt: 1 }, 3: { title: 'b', updatedAt: 5 },
    4: { title: 'sub', updatedAt: 7, origin: 'subagent' }, 5: { title: '', updatedAt: 9, blank: true },
    6: { title: 'arch', updatedAt: 8 }, 9: { title: 'other ws', updatedAt: 99 },
  }
  const rows = chatSessions({ byId }, { sessionIds: ['1', '3', '4', '5', '6', 'missing'] }, ['6'])
  assert.deepEqual(rows.map((r) => r.id), ['3', '1'])
  assert.deepEqual(rows[0], { id: '3', title: 'b', updatedAt: 5 })
})
test('chatSessions with no workspace or no sessions is empty', () => {
  assert.deepEqual(chatSessions({ byId: {} }, undefined, []), [])
  assert.deepEqual(chatSessions(undefined, { sessionIds: [] }, undefined), [])
})
test('filterByQuery', () => {
  const rows = [{ title: '周末去哪' }, { title: 'MoE 架构' }, { title: '' }]
  assert.equal(filterByQuery(rows, 'moe').length, 1)
  assert.equal(filterByQuery(rows, '周末').length, 1)
  assert.equal(filterByQuery(rows, '  ').length, 3)
})
test('copy', () => {
  assert.equal(DICT.zh.panel, '聊天')
  assert.equal(DICT.en.panel, 'Chat')
  assert.equal(DICT.zh.empty, '还没有聊天')
  assert.equal(DICT.en.empty, 'No chats yet')
  assert.equal(DICT.zh.unavailable, '聊天工作区不可用，请完全退出并重启 DSH')
  assert.equal(DICT.en.unavailable, 'Chat workspace unavailable. Quit and restart DSH.')
  assert.equal(DICT.zh.hero, '今天想聊点什么？')
  assert.equal(DICT.zh.newChat, '新聊天')
  assert.deepEqual(Object.keys(DICT.zh).sort(), Object.keys(DICT.en).sort())
})

test('main page is registered with DSH store hooks and actions', () => {
  const regs = []
  const stores = { sessions: { list: { getSnapshot() { return this.v }, subscribe() { return () => {} }, v: { byId: {} } } }, workspaces: { list: { getSnapshot() { return {} }, subscribe() { return () => {} } } } }
  const started = []
  const ctx = {
    ...stores,
    effect: () => {},
    locale: { register: () => () => {}, bind: () => (k) => k },
    layout: { selectPanel: () => {} },
    uiWorkspace: { startSession: (...a) => started.push(a), openSession: () => {} },
    slots: { inject: (_n, f) => f(), register: (opts, comp) => { regs.push({ opts, comp }); return () => {} } },
  }
  mod.apply(ctx)
  const main = regs.find((r) => r.opts.name === 'main')
  assert.equal(main.opts.key, 'chat-mode')
  assert.equal(main.opts.locale, 'chat-mode')
  const props = main.opts.inject()
  assert.equal(props.hooks.sessions, stores.sessions.list)
  assert.equal(props.hooks.workspaces, stores.workspaces.list)
  props.startChat('w1')
  assert.deepEqual(started, [['w1', { agentPreset: 'chat' }]])
  assert.equal(typeof main.comp, 'function')
  assert.equal(main.comp.name, 'ChatPanelBoundary')
})
test('panelModel derives rows and state', () => {
  const { panelModel } = mod.__test
  const ws = { items: [{ workspaceId: 'c', path: '/h/.dsh/chat-mode-workspace', sessionIds: ['1'] }], archivedSessionIds: [] }
  assert.equal(panelModel({ phase: 'pending' }, ws, '').state, 'loading')
  assert.equal(panelModel({ byId: {} }, { items: [] }, '').state, 'unavailable')
  assert.equal(panelModel({ byId: {} }, ws, '').state, 'empty')
  const m = panelModel({ byId: { 1: { title: 'hi', updatedAt: 1 } } }, ws, '')
  assert.equal(m.state, 'list')
  assert.equal(m.workspaceId, 'c')
  assert.equal(panelModel({ byId: { 1: { title: 'hi', updatedAt: 1 } } }, ws, 'zzz').state, 'noMatch')
})

test('every DSH UI language has the full dictionary', () => {
  // The languages DSH's own sidebar registers.
  const dshLocales = ['zh', 'en', 'ja', 'es', 'fr', 'de', 'ru', 'pt']
  const keys = Object.keys(DICT.zh).sort()
  for (const lang of dshLocales) {
    assert.ok(DICT[lang], `missing ${lang}`)
    assert.deepEqual(Object.keys(DICT[lang]).sort(), keys, `${lang} keys`)
    for (const k of keys) assert.ok(DICT[lang][k].trim(), `${lang}.${k} empty`)
    assert.match(DICT[lang].startFailed, /\{reason\}/, `${lang}.startFailed keeps {reason}`)
  }
})
