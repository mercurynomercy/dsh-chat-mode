// Client half of the chat mode plugin.
//
// Adds a "聊天" entry to DSH's sidebar (sidebar.panellist) and a main-area
// panel (main, key chat-mode) with: a hero, a big "新聊天" button, search, and
// Recents. Chats are ordinary DSH sessions in the chat workspace using the
// `chat` agent preset; opening or starting one hands the main area back to
// DSH's own conversation view, so rendering, models and attachments are DSH's.
//
// Only public slots and services are used: no pixel offsets, no DOM or CSS
// tricks on DSH's own elements.
window.__ModuleLoader__.load({
  id: '@jianhengpan/dsh-chat-mode',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'chat-mode'
    const PANEL_ID = 'chat-mode'
    const CHAT_PRESET = 'chat'
    const CHAT_DIR_NAME = 'chat-mode-workspace'

    const DICT = {
      zh: {
        panel: '聊天',
        hero: '今天想聊点什么？',
        newChat: '新聊天',
        search: '搜索聊天',
        recents: '最近',
        empty: '还没有聊天',
        noMatch: '没有匹配的聊天',
        untitled: '未命名',
        loading: '加载中…',
        unavailable: '聊天工作区不可用，请完全退出并重启 DSH',
        startFailed: '无法新建聊天：{reason}',
      },
      en: {
        panel: 'Chat',
        hero: 'What would you like to talk about?',
        newChat: 'New chat',
        search: 'Search chats',
        recents: 'Recents',
        empty: 'No chats yet',
        noMatch: 'No matching chats',
        untitled: 'Untitled',
        loading: 'Loading…',
        unavailable: 'Chat workspace unavailable. Quit and restart DSH.',
        startFailed: 'Could not start a chat: {reason}',
      },
    }

    // ---------------------------------------------------------------- pure

    function findChatWorkspace(items) {
      if (!Array.isArray(items)) return undefined
      return items.find((w) => {
        const parts = String(w?.path ?? '').split(/[\\/]+/).filter(Boolean)
        return parts[parts.length - 1] === CHAT_DIR_NAME
      })
    }

    function chatSessions(sessionsSnapshot, chatWorkspace, archivedIds) {
      const byId = sessionsSnapshot?.byId
      if (!byId || !chatWorkspace) return []
      const archived = new Set(archivedIds ?? [])
      const rows = []
      for (const id of chatWorkspace.sessionIds ?? []) {
        const s = byId[id]
        if (!s || s.blank || s.origin === 'subagent' || archived.has(id)) continue
        rows.push({ id: String(id), title: s.title ?? '', updatedAt: s.updatedAt ?? 0 })
      }
      return rows.sort((a, b) => b.updatedAt - a.updatedAt)
    }

    function filterByQuery(rows, q) {
      const needle = String(q ?? '').trim().toLowerCase()
      if (!needle) return rows
      return rows.filter((r) => String(r.title ?? '').toLowerCase().includes(needle))
    }

    // ------------------------------------------------------------------ ui

    let appCtx = null

    const noopStore = { getSnapshot: () => undefined, subscribe: () => () => {} }
    function useStore(store) {
      const s = store ?? noopStore
      return React.useSyncExternalStore(s.subscribe, s.getSnapshot)
    }

    function ChatIcon({ size = 16 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z' }),
      )
    }

    const C = {
      text: 'var(--dsw-alias-label-primary, inherit)',
      sub: 'var(--dsw-alias-label-secondary, #888)',
      line: 'var(--dsw-alias-border-l1, rgba(127,127,127,.25))',
      hover: 'var(--dsw-alias-bg-hover, rgba(127,127,127,.1))',
      accent: 'var(--dsw-alias-brand-primary, #4d6bfe)',
    }

    function ChatPanel({ t }) {
      const ctx = appCtx
      const sessions = useStore(ctx?.sessions?.list)
      const workspaces = useStore(ctx?.workspaces?.list)
      const [query, setQuery] = React.useState('')
      const [error, setError] = React.useState(null)

      const loading = sessions?.phase === 'pending' || workspaces?.phase === 'pending'
      const chatWorkspace = findChatWorkspace(workspaces?.items)
      const rows = filterByQuery(chatSessions(sessions, chatWorkspace, workspaces?.archivedSessionIds), query)

      const startChat = () => {
        setError(null)
        if (!chatWorkspace) return setError(t('unavailable'))
        Promise.resolve()
          .then(() => ctx.uiWorkspace.startSession(chatWorkspace.workspaceId, { agentPreset: CHAT_PRESET }))
          .catch((reason) => setError(t('startFailed', { reason: String(reason?.message ?? reason) })))
      }
      const openChat = (id) => ctx.uiWorkspace.openSession(id)

      let list
      if (loading) list = h('div', { style: { color: C.sub, padding: '8px 12px' } }, t('loading'))
      else if (!chatWorkspace) list = h('div', { role: 'alert', style: { color: C.sub, padding: '8px 12px' } }, t('unavailable'))
      else if (rows.length === 0) list = h('div', { style: { color: C.sub, padding: '8px 12px' } }, query.trim() ? t('noMatch') : t('empty'))
      else
        list = h(
          'ul',
          { style: { listStyle: 'none', margin: 0, padding: 0 } },
          rows.map((row) =>
            h(
              'li',
              { key: row.id },
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => openChat(row.id),
                  style: { width: '100%', textAlign: 'left', padding: '8px 12px', border: 0, borderRadius: 8, background: 'transparent', color: C.text, cursor: 'pointer', font: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                  onMouseEnter: (e) => (e.currentTarget.style.background = C.hover),
                  onMouseLeave: (e) => (e.currentTarget.style.background = 'transparent'),
                },
                row.title || t('untitled'),
              ),
            ),
          ),
        )

      return h(
        'div',
        { style: { height: '100%', overflow: 'auto', boxSizing: 'border-box', color: C.text } },
        // macOS window-drag strip under the traffic lights (DSH turns data-window-drag into the drag rule).
        h('div', { 'data-window-drag': true, style: { height: 'var(--dsh-frame-top-clearance, 48px)' } }),
        h(
          'div',
          { style: { maxWidth: 640, margin: '0 auto', padding: '48px 16px', display: 'flex', flexDirection: 'column', gap: 16 } },
          h('h1', { style: { fontSize: 28, fontWeight: 600, margin: '0 0 8px', textAlign: 'center' } }, t('hero')),
          h(
            'button',
            { type: 'button', onClick: startChat, disabled: loading, style: { alignSelf: 'center', padding: '10px 22px', borderRadius: 999, border: 0, background: C.accent, color: '#fff', fontSize: 15, cursor: 'pointer', font: 'inherit' } },
            '＋ ' + t('newChat'),
          ),
          error ? h('div', { role: 'alert', style: { color: 'var(--dsw-alias-state-danger, #d93025)', textAlign: 'center' } }, error) : null,
          h('input', {
            type: 'search',
            value: query,
            placeholder: t('search'),
            'aria-label': t('search'),
            onChange: (e) => setQuery(e.target.value),
            style: { marginTop: 16, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.line}`, background: 'transparent', color: C.text, font: 'inherit' },
          }),
          h('div', { style: { color: C.sub, fontSize: 12, padding: '0 12px' } }, t('recents')),
          list,
        ),
      )
    }

    // --------------------------------------------------------------- apply

    function apply(ctx) {
      appCtx = ctx
      ctx.effect(() => ctx.locale.register(NS, DICT), 'chat-mode: dictionaries')
      const t = ctx.locale.bind(NS)
      ctx.effect(
        () => () => {
          // Leave our page only if it is the one on screen.
          try {
            const selected = ctx.layout.panelInfo?.getSnapshot?.()
            if (selected === PANEL_ID || selected?.id === PANEL_ID || selected?.selected === PANEL_ID) ctx.layout.selectPanel(null)
          } catch {
            // layout already gone
          }
          appCtx = null
        },
        'chat-mode: cleanup',
      )
      ctx.slots.inject('main', () =>
        ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS, inject: () => ({ t }) }, ChatPanel),
      )
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 5, locale: NS, label: () => t('panel') }, ChatIcon),
      )
    }

    return {
      inject: ['slots', 'layout', 'locale', 'uiWorkspace', 'sessions', 'workspaces'],
      apply,
      __test: { findChatWorkspace, chatSessions, filterByQuery, DICT, PANEL_ID, CHAT_PRESET },
    }
  },
})
