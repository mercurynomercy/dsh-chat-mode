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
  id: '@mercurynomercy/dsh-chat-mode',
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
        archive: '归档',
        archiveFailed: '无法归档：{reason}',
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
        archive: 'Archive',
        archiveFailed: 'Could not archive: {reason}',
      },
      ja: {
        panel: 'チャット',
        hero: '今日は何について話しましょうか？',
        newChat: '新しいチャット',
        search: 'チャットを検索',
        recents: '最近',
        empty: 'まだチャットがありません',
        noMatch: '一致するチャットがありません',
        untitled: '無題',
        loading: '読み込み中…',
        unavailable: 'チャットのワークスペースを利用できません。DSH を完全に終了して再起動してください。',
        startFailed: 'チャットを開始できませんでした：{reason}',
        archive: 'アーカイブ',
        archiveFailed: 'アーカイブできませんでした：{reason}',
      },
      es: {
        panel: 'Chat',
        hero: '¿De qué te gustaría hablar?',
        newChat: 'Nuevo chat',
        search: 'Buscar chats',
        recents: 'Recientes',
        empty: 'Aún no hay chats',
        noMatch: 'Ningún chat coincide',
        untitled: 'Sin título',
        loading: 'Cargando…',
        unavailable: 'El espacio de trabajo de chat no está disponible. Cierra DSH por completo y vuelve a abrirlo.',
        startFailed: 'No se pudo iniciar el chat: {reason}',
        archive: 'Archivar',
        archiveFailed: 'No se pudo archivar: {reason}',
      },
      fr: {
        panel: 'Chat',
        hero: 'De quoi aimeriez-vous parler ?',
        newChat: 'Nouveau chat',
        search: 'Rechercher des chats',
        recents: 'Récents',
        empty: 'Aucun chat pour le moment',
        noMatch: 'Aucun chat correspondant',
        untitled: 'Sans titre',
        loading: 'Chargement…',
        unavailable: "L'espace de travail du chat est indisponible. Quittez complètement DSH puis relancez-le.",
        startFailed: 'Impossible de démarrer le chat : {reason}',
        archive: 'Archiver',
        archiveFailed: "Impossible d'archiver : {reason}",
      },
      de: {
        panel: 'Chat',
        hero: 'Worüber möchtest du sprechen?',
        newChat: 'Neuer Chat',
        search: 'Chats durchsuchen',
        recents: 'Zuletzt',
        empty: 'Noch keine Chats',
        noMatch: 'Keine passenden Chats',
        untitled: 'Ohne Titel',
        loading: 'Wird geladen…',
        unavailable: 'Chat-Arbeitsbereich nicht verfügbar. Beende DSH vollständig und starte es neu.',
        startFailed: 'Chat konnte nicht gestartet werden: {reason}',
        archive: 'Archivieren',
        archiveFailed: 'Archivieren fehlgeschlagen: {reason}',
      },
      ru: {
        panel: 'Чат',
        hero: 'О чём хотите поговорить?',
        newChat: 'Новый чат',
        search: 'Поиск чатов',
        recents: 'Недавние',
        empty: 'Чатов пока нет',
        noMatch: 'Подходящих чатов нет',
        untitled: 'Без названия',
        loading: 'Загрузка…',
        unavailable: 'Рабочая область чата недоступна. Полностью закройте DSH и запустите снова.',
        startFailed: 'Не удалось начать чат: {reason}',
        archive: 'В архив',
        archiveFailed: 'Не удалось архивировать: {reason}',
      },
      pt: {
        panel: 'Chat',
        hero: 'Sobre o que você quer conversar?',
        newChat: 'Novo chat',
        search: 'Pesquisar chats',
        recents: 'Recentes',
        empty: 'Ainda não há chats',
        noMatch: 'Nenhum chat corresponde',
        untitled: 'Sem título',
        loading: 'Carregando…',
        unavailable: 'O espaço de trabalho do chat não está disponível. Feche o DSH completamente e abra-o novamente.',
        startFailed: 'Não foi possível iniciar o chat: {reason}',
        archive: 'Arquivar',
        archiveFailed: 'Não foi possível arquivar: {reason}',
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

    // Everything the panel shows, derived from the two DSH list snapshots.
    function panelModel(sessions, workspaces, query) {
      if (sessions?.phase === 'pending' || workspaces?.phase === 'pending') return { state: 'loading', rows: [] }
      const chatWorkspace = findChatWorkspace(workspaces?.items)
      if (!chatWorkspace) return { state: 'unavailable', rows: [] }
      const all = chatSessions(sessions, chatWorkspace, workspaces?.archivedSessionIds)
      const rows = filterByQuery(all, query)
      const state = rows.length > 0 ? 'list' : all.length > 0 ? 'noMatch' : 'empty'
      return { state, rows, workspaceId: chatWorkspace.workspaceId }
    }

    // ------------------------------------------------------------------ ui

    // DSH hands a slot component one `use<Name>(selector)` prop per store in
    // `inject().hooks` (see ui-schedule's TaskManagerPage). If a host build ever
    // passes the raw store instead, read it with its methods still bound.
    function useListSnapshot(hook, store) {
      const fallback = React.useSyncExternalStore(
        (cb) => (typeof hook === 'function' || !store ? () => {} : store.subscribe(cb)),
        () => (typeof hook === 'function' || !store ? undefined : store.getSnapshot()),
      )
      return typeof hook === 'function' ? hook((snapshot) => snapshot) : fallback
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
      danger: 'var(--dsw-alias-state-danger, #d93025)',
    }

    function ChatPanel(props) {
      const t = typeof props.t === 'function' ? props.t : props.tFallback
      const sessions = useListSnapshot(props.useSessions, props.hooks?.sessions)
      const workspaces = useListSnapshot(props.useWorkspaces, props.hooks?.workspaces)
      const [query, setQuery] = React.useState('')
      const [error, setError] = React.useState(null)
      const model = panelModel(sessions, workspaces, query)

      const startChat = () => {
        setError(null)
        if (!model.workspaceId) return setError(t('unavailable'))
        Promise.resolve()
          .then(() => props.startChat(model.workspaceId))
          .catch((reason) => setError(t('startFailed', { reason: String(reason?.message ?? reason) })))
      }

      const archiveChat = (sessionId) => {
        setError(null)
        Promise.resolve()
          .then(() => props.archiveChat(sessionId))
          .catch((reason) => setError(t('archiveFailed', { reason: String(reason?.message ?? reason) })))
      }

      const note = (text, role) => h('div', { role, style: { color: C.sub, padding: '8px 12px' } }, text)
      let list
      if (model.state === 'loading') list = note(t('loading'))
      else if (model.state === 'unavailable') list = note(t('unavailable'), 'alert')
      else if (model.state === 'empty') list = note(t('empty'))
      else if (model.state === 'noMatch') list = note(t('noMatch'))
      else
        list = h(
          'ul',
          { style: { listStyle: 'none', margin: 0, padding: 0 } },
          model.rows.map((row) =>
            h(
              'li',
              {
                key: row.id,
                style: { display: 'flex', alignItems: 'center', borderRadius: 8 },
                onMouseEnter: (e) => (e.currentTarget.style.background = C.hover),
                onMouseLeave: (e) => (e.currentTarget.style.background = 'transparent'),
              },
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => props.openChat(row.id),
                  style: { flex: 1, minWidth: 0, textAlign: 'left', padding: '8px 12px', border: 0, background: 'transparent', color: C.text, cursor: 'pointer', font: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                },
                row.title || t('untitled'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  title: t('archive'),
                  'aria-label': `${t('archive')}: ${row.title || t('untitled')}`,
                  onClick: () => archiveChat(row.id),
                  style: { flex: 'none', padding: '6px 10px', border: 0, background: 'transparent', color: C.sub, cursor: 'pointer', font: 'inherit', fontSize: 12 },
                },
                t('archive'),
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
            { type: 'button', onClick: startChat, disabled: model.state === 'loading', style: { alignSelf: 'center', padding: '10px 22px', borderRadius: 999, border: 0, background: C.accent, color: '#fff', fontSize: 15, cursor: 'pointer', font: 'inherit' } },
            '＋ ' + t('newChat'),
          ),
          error ? h('div', { role: 'alert', style: { color: C.danger, textAlign: 'center' } }, error) : null,
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

    // A render error shows its message on the page instead of a blank panel.
    class ChatPanelBoundary extends (React.Component ?? class {}) {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }
      static getDerivedStateFromError(error) {
        return { error }
      }
      componentDidCatch(error) {
        console.error('[chat-mode] panel render failed', error)
      }
      render() {
        if (this.state.error) {
          return h(
            'div',
            { role: 'alert', style: { padding: 'calc(var(--dsh-frame-top-clearance, 48px) + 24px) 24px', color: C.danger, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', fontSize: 12 } },
            '[chat-mode] ' + String(this.state.error?.stack ?? this.state.error),
          )
        }
        return h(ChatPanel, this.props)
      }
    }

    // --------------------------------------------------------------- apply

    function apply(ctx) {
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
        },
        'chat-mode: cleanup',
      )
      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
            locale: NS,
            inject: () => ({
              tFallback: t,
              hooks: { sessions: ctx.sessions.list, workspaces: ctx.workspaces.list },
              startChat: (workspaceId) => ctx.uiWorkspace.startSession(workspaceId, { agentPreset: CHAT_PRESET }),
              openChat: (sessionId) => ctx.uiWorkspace.openSession(sessionId),
              // DSH has no session delete; archiving hides the chat and is reversible
              // from the sidebar's archived-sessions filter.
              archiveChat: (sessionId) => ctx.uiWorkspace.archiveSession(sessionId),
            }),
          },
          ChatPanelBoundary,
        ),
      )
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 5, locale: NS, label: () => t('panel') }, ChatIcon),
      )
    }

    return {
      inject: ['slots', 'layout', 'locale', 'uiWorkspace', 'sessions', 'workspaces'],
      apply,
      __test: { findChatWorkspace, chatSessions, filterByQuery, panelModel, DICT, PANEL_ID, CHAT_PRESET },
    }
  },
})
