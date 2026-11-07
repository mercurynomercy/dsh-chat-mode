# DSH 聊天模式插件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一个 DSH 0.2.2-rc.1 插件：侧栏多一个"聊天"入口。聊天用 DSH 自己的会话、登录和模型，用专用的 `chat` preset（联网搜索 + 只读附件，没有文件和命令工具），会话落在专用的聊天工作区。

**Architecture:** 一个 npm 包，分三块。
- **Host 端**：`index.js` 在启动时确保聊天目录和聊天工作区存在；`read-attachment.js` 是一个只能读本会话附件的工具插件。
- **Bundle patch**：`presets/chat.patch.yml` 声明 `chat` preset。
- **Client 端**：`client.js` 在 `sidebar.panellist` 注册"聊天"入口，在 `main` 注册聊天面板，面板里有"新聊天"、搜索和 Recents。对话本身复用 DSH 原生会话界面，打开方式是 `uiWorkspace.openSession` / `startSession`。

**Tech Stack:** 纯 ESM JavaScript，不打包（和 Starp1ume 插件一样），Node 24 的 `node:test` 跑单测，React 通过 DSH 的 `window.__ModuleLoader__` 的 `require('react')` 取得。

**Spec:** `docs/superpowers/specs/2026-11-08-dsh-chat-mode-design.md`

## Global Constraints

- 目标：DSH 桌面端 **0.2.2-rc.1**，macOS；API 参考只认 `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar` 里的包（已解包在 `$ASAR=/private/tmp/claude-501/-Users-jianhengpan-Github-dsh-chat-mode/c1c002fe-829d-4d8e-bcce-7fbd20576aac/scratchpad/asar/app/dsh/node_modules/@deepseek-ai`）。**不要**参考 `~/.dsh/profiles/node_modules/@deepseek-ai/*`，那是指向旧开发目录的软链。
- 只用公开的 slot 和客户端/Host API。不准写死像素偏移，不准用 CSS 或 DOM 去隐藏、覆盖 DSH 元素，不准改 app.asar。
- 不弹任何额外登录，不存任何凭据。
- `chat` preset **不准**包含：`dsh-tool-fs`、`dsh-tool-fs-search`、`dsh-tool-bash*`、`dsh-tool-pwsh*`、`dsh-terminal*`、`dsh-tool-str-replace-editor`、`dsh-tool-subagent*`、`dsh-workflow*`、`dsh-tool-workflow`、`dsh-tool-jobs`、`dsh-tool-todo`、`dsh-tool-schedule`、`dsh-skill-filesystem`、`dsh-tool-skill`、`dsh-agent-instructions`（它会读工作区的 AGENTS.md）、`dsh-plan-mode`、`dsh-tool-goal`、`dsh-command-goal`。
- 唯一允许的文件读取：本插件的 `read_attachment`。路径必须真实位于 `dshHomePath('attachments','v1','objects')` 下，**并且**属于当前会话用户消息里出现过的附件。由 Host 端强制执行。
- 包名 `@jianhengpan/dsh-chat-mode`，客户端模块 id 与包名相同；面板 id `chat-mode`；preset id `chat`；聊天目录 `dshHomePath('chat-mode-workspace')`，工作区标题 `聊天`。
- 用户机器上已装了 `@starplume/dsh-chat-mode`，必须先卸载，否则两个插件会抢同一套位置。
- 卸载本插件时不删除任何会话或目录。

## Review Focus

1. **用路径逃出附件目录**（`../`、绝对路径 `~/Desktop/x`、附件目录里的软链指向外部）→ 拒绝，并返回 `Error: read_attachment: path is not an attachment of this chat`。测试见 Task 2。
2. **读另一个聊天的附件**（路径确实在 objects 目录下，但不属于本会话）→ 同样拒绝。测试见 Task 2 和 Task 3。
3. **很大的附件**（例如 10 万行的日志）→ 分页读取，单次最多 `2000` 行，footer 提示 offset。测试见 Task 3。
4. **一个聊天都还没有**（第一次用，Recents 为空）→ 面板显示空状态文案 `还没有聊天`，"新聊天"可用。测试见 Task 5。
5. **聊天工作区不存在**（Host 端创建失败，或用户在侧栏删除了"聊天"工作区）→ 点"新聊天"时 Host 重新确保工作区存在；仍失败时面板显示 `聊天工作区不可用，请完全退出并重启 DSH`，不抛异常、不白屏。测试见 Task 4 和 Task 5。

---

## File Structure

```
package.json                 包清单：exports、dsh.bundle.patch、dsh.client
cordis.patch.yml             插入 Host 插件行 chat-mode-host
presets/chat.patch.yml       声明 chat preset
index.js                     Host 插件：确保聊天目录和工作区存在，提供 ensureChatWorkspace
read-attachment.js           Host 工具插件：read_attachment
lib/attachment-guard.js      纯函数：路径判定（Host 端，可单测）
lib/read-window.js           纯函数：按行分页渲染（Host 端，可单测）
client.js                    客户端：panellist 入口 + 聊天面板 + 纯函数 __test 导出
locale/zh.json, locale/en.json
icon.svg
tests/*.test.mjs             node:test 单测
tests/fixtures/load-client.mjs  用假 __ModuleLoader__ 加载 client.js
README.md
```

---

### Task 1: 包骨架、卸载旧插件、空插件能加载

**Files:**
- Create: `package.json`, `cordis.patch.yml`, `index.js`, `client.js`, `icon.svg`, `locale/zh.json`, `locale/en.json`, `README.md`

**Interfaces:**
- Produces：`package.json` 的 `exports` 有 `"."`→`./index.js`、`"./client"`→`./client.js`、`"./read-attachment"`→`./read-attachment.js`、`"./locale/*.json"`、`"./icon"`。`dsh.bundle.patch` 是数组 `["./cordis.patch.yml", "./presets/chat.patch.yml"]`（presets 文件在 Task 4 创建，本 Task 先只放 `./cordis.patch.yml`）。`dsh.client` 为 `{ platform: "web", immediately: true, inject: ["@deepseek-ai/dsh-client-ui-layout", "@deepseek-ai/dsh-client-ui-sidebar", "@deepseek-ai/dsh-client-ui-workspace", "@deepseek-ai/dsh-client-locale"] }`。
- `cordis.patch.yml` 插入 `{ id: chat-mode-host, name: '@jianhengpan/dsh-chat-mode', config: {} }`。

- [ ] **Step 1: 卸载 Starp1ume 插件**

先完全退出 DSH，然后运行：`dsh plugin --profile desktop remove @starplume/dsh-chat-mode`
预期：`ls ~/.dsh/profiles/desktop/node_modules/@starplume` 里不再有 `dsh-chat-mode`。如果还残留，删除前先确认它是软链：`ls -la` 显示 `->` 才能 `rm`（只删链接本身，不加 `-r`）。

- [ ] **Step 2: 写骨架**

`package.json` 参照 `$REF=/private/tmp/claude-501/-Users-jianhengpan-Github-dsh-chat-mode/c1c002fe-829d-4d8e-bcce-7fbd20576aac/scratchpad/ref/dsh-chat-mode/package.json`，加上 `"scripts": { "test": "node --test tests/" }`。
`index.js` 导出 `name = 'chat-mode-host'`、`inject = []`、`apply(ctx) {}`。
`client.js` 用 `window.__ModuleLoader__.load({ id: '@jianhengpan/dsh-chat-mode', factory(require) { ...; return { inject: ['slots'], apply } } })`。此时 `apply` 只做一件事：`console.info('[chat-mode] loaded')`。

- [ ] **Step 3: 安装并验证加载**

运行：`dsh plugin --profile desktop add /Users/jianhengpan/Github/dsh-chat-mode`，完全退出 DSH 再启动。
预期：DevTools 控制台（profile 里已开启 `developerTools: true`）出现 `[chat-mode] loaded`，界面没有任何变化。

- [ ] **Step 4: Commit**

```bash
git add package.json cordis.patch.yml index.js client.js icon.svg locale README.md
git commit -m "feat: plugin skeleton that loads in DSH 0.2.2-rc.1"
```

---

### Task 2: 附件路径守卫（纯函数）

**Files:**
- Create: `lib/attachment-guard.js`
- Test: `tests/attachment-guard.test.mjs`

**Interfaces:**
- Produces：`export async function resolveAllowedAttachment(requestedPath: string, opts: { objectsRoot: string, allowedRealPaths: Set<string> }): Promise<{ ok: true, realPath: string } | { ok: false, reason: 'not-attachment' | 'not-found' }>`
- Produces：`export const DENY_MESSAGE = 'read_attachment: path is not an attachment of this chat'`

- [ ] **Step 1: 写失败的测试**

在 `os.tmpdir()` 下建临时目录：`objects/aa/file1`、`objects/bb/file2`、`outside/secret.txt`，再建一个软链 `objects/cc/link -> outside/secret.txt`。`allowedRealPaths = new Set([realpath(objects/aa/file1)])`。

```js
test('allows an attachment of this chat', async () => {
  const r = await resolveAllowedAttachment(file1, opts)
  assert.deepEqual(r, { ok: true, realPath: await realpath(file1) })
})
test('rejects attachment of another chat', async () => {
  assert.deepEqual(await resolveAllowedAttachment(file2, opts), { ok: false, reason: 'not-attachment' })
})
test('rejects traversal out of objects root', async () => {
  assert.equal((await resolveAllowedAttachment(join(objects, 'aa', '..', '..', 'outside', 'secret.txt'), opts)).ok, false)
})
test('rejects symlink pointing outside', async () => {
  assert.equal((await resolveAllowedAttachment(join(objects, 'cc', 'link'), opts)).ok, false)
})
test('rejects arbitrary home path', async () => {
  assert.equal((await resolveAllowedAttachment(join(homedir(), '.zshrc'), opts)).ok, false)
})
test('missing file is not-found only when it would be allowed', async () => {
  assert.deepEqual(await resolveAllowedAttachment(join(objects, 'zz', 'nope'), opts), { ok: false, reason: 'not-attachment' })
})
```

- [ ] **Step 2: 运行，确认失败**

运行：`node --test tests/attachment-guard.test.mjs`
预期：FAIL，`Cannot find module '../lib/attachment-guard.js'`

- [ ] **Step 3: 实现 `resolveAllowedAttachment`**

用 `fs.promises.realpath` 解析请求路径和 `objectsRoot`，失败则返回 `not-attachment`（不要泄露路径是否存在）。之后要同时满足 `realPath.startsWith(realRoot + path.sep)` 和 `allowedRealPaths.has(realPath)`。

- [ ] **Step 4: 运行，确认通过**

运行：`node --test tests/attachment-guard.test.mjs`
预期：6 个测试全部 PASS

- [ ] **Step 5: Commit**

```bash
git add lib/attachment-guard.js tests/attachment-guard.test.mjs
git commit -m "feat: attachment path guard for read_attachment"
```

---

### Task 3: `read_attachment` 工具插件

**Files:**
- Create: `read-attachment.js`, `lib/read-window.js`
- Test: `tests/read-window.test.mjs`, `tests/read-attachment.test.mjs`

**Interfaces:**
- Consumes：Task 2 的 `resolveAllowedAttachment`、`DENY_MESSAGE`。
- Produces：`lib/read-window.js` 导出 `export function renderWindow(text: string, realPath: string, offset = 1, limit = 2000): string`，`export const READ_LIMIT = 2000`。
- Produces：`read-attachment.js` 是 Cordis 插件，导出 `name = 'chat-read-attachment'`、`inject = ['tools', 'attachments']`、`apply(ctx)`，注册工具 `read_attachment`，参数为 `{ file_path: string (required), offset?: integer, limit?: integer }`。
- Produces：`export function collectSessionAttachmentPaths(events: Iterable<{type:string,data:any}>, hostPathOf: (ref) => string | undefined): Set<string>`。它从 `user/message` 事件内容里取出 `type === 'file'` 的块，用 `ctx.attachments.fileHostPath(ref)` 映射成真实路径（映射后再 `realpath`）。

- [ ] **Step 1: 写 `renderWindow` 的失败测试**

输出格式照搬 `dsh-tool-fs` README 第 207 行，模型不用学新格式：

```js
test('first window of a long file', () => {
  const text = Array.from({ length: 5000 }, (_, i) => `l${i + 1}`).join('\n')
  const out = renderWindow(text, '/x', 1, 2000)
  assert.match(out, /^<path>\/x<\/path>\n<type>file<\/type>\n<content>\n1: l1\n/)
  assert.match(out, /\(Showing lines 1-2000 of 5000\. Use offset=2001 to continue\.\)\n<\/content>$/)
})
test('limit above READ_LIMIT is clamped', () => {
  assert.throws(() => renderWindow('a', '/x', 1, 2001), /limit must be less than or equal to 2000/)
})
test('last window has no continue hint', () => {
  assert.doesNotMatch(renderWindow('a\nb', '/x', 1, 2000), /Use offset=/)
})
```

- [ ] **Step 2: 运行，确认失败**

运行：`node --test tests/read-window.test.mjs`，预期 FAIL（找不到模块）。

- [ ] **Step 3: 实现 `renderWindow`**

最后一个窗口的 footer 是 `(Showing lines <s>-<e> of <total>.)`。

- [ ] **Step 4: 写工具层的失败测试**

`tests/read-attachment.test.mjs`：
- 用假 `ctx`（`tools.register` 记下 definition；`attachments.fileHostPath` 返回临时 objects 目录下的路径）调用 `apply(fakeCtx)`。
- 取出 `definition.execute`。
- 构造假的 `exec.agent.session`，其事件里有一条 `user/message`，内容带 `{ type: 'file', ref: {...} }`。

断言：
- 读本会话附件：返回值以 `<path>` 开头；
- 读另一个 objects 文件：抛出 `Error(DENY_MESSAGE)`；
- `exec.agent` 为空：抛出 `Error('read_attachment requires an owning chat session')`；
- `collectSessionAttachmentPaths` 跳过非 `user/message` 事件和非 `file` 块。

- [ ] **Step 5: 运行，确认失败**

运行：`node --test tests/read-attachment.test.mjs`，预期 FAIL。

- [ ] **Step 6: 实现 `read-attachment.js`**

- 结构照 `$ASAR/dsh-tool-todo/lib/index.js`：`defineTool` 来自 `@deepseek-ai/dsh-tools`，`execute(args, exec)`，再加 `presentCall: () => ({ card: 'generic', title: 'Read attachment', kind: 'read' })`。
- 会话事件的读取方法以 `$ASAR/dsh-session/lib` 里 Session 类公开的方法为准：搜 `events(` / `entries(` / `read(`，用同步或异步迭代全部事件。
- `FileBlock` 的结构以 `$ASAR/dsh-llm/lib` 里的 `FileBlock` / `FileAttachmentRef` 为准。
- `objectsRoot = dshHomePath('attachments', 'v1', 'objects')`，`dshHomePath` 来自 `@deepseek-ai/dsh-home-paths`。
- 工具描述：`Read a file the user attached to this chat. Only paths given in the user's attachment lines are readable; every other path is refused.`

- [ ] **Step 7: 运行全部测试**

运行：`npm test`，预期全部 PASS。

- [ ] **Step 8: Commit**

```bash
git add read-attachment.js lib/read-window.js tests/read-window.test.mjs tests/read-attachment.test.mjs
git commit -m "feat: read_attachment tool scoped to this chat's attachments"
```

---

### Task 4: `chat` preset + Host 确保聊天工作区

**Files:**
- Create: `presets/chat.patch.yml`
- Modify: `package.json`（`dsh.bundle.patch` 加入 `./presets/chat.patch.yml`），`index.js`
- Test: `tests/preset.test.mjs`, `tests/host.test.mjs`

**Interfaces:**
- Consumes：Task 3 的插件，在 preset 里以 `name: '@jianhengpan/dsh-chat-mode/read-attachment'` 引用（DSH 支持子路径插件名，例如 `@deepseek-ai/dsh-tool-cordis/host`）。
- Produces：`index.js` 导出 `export async function ensureChatWorkspace(registry: { resolveByPath(p): Promise<W|undefined>, create(p): Promise<{workspace: W}|W>, rename?(...) }, dir: string): Promise<W>`，`export const CHAT_DIR_NAME = 'chat-mode-workspace'`，`export const CHAT_WORKSPACE_TITLE = '聊天'`。`apply(ctx)` 的 `inject = ['workspaceRegistry']`，启动时调用 `ensureChatWorkspace(ctx.workspaceRegistry, dshHomePath(CHAT_DIR_NAME))`。

- [ ] **Step 1: 写 preset 的失败测试**

用 `yaml` 包（或 `js-yaml`，dev 依赖）解析 `presets/chat.patch.yml`，递归收集所有 `name` 字段：

```js
test('chat preset is declared', () => {
  assert.equal(row.name, '@deepseek-ai/dsh-agent-preset'); assert.equal(row.config.id, 'chat')
})
test('chat preset has no forbidden plugins', () => {
  const forbidden = [/dsh-tool-fs(-search)?$/, /dsh-tool-bash/, /dsh-tool-pwsh/, /dsh-terminal/, /str-replace-editor/,
    /dsh-tool-subagent/, /dsh-workflow/, /dsh-tool-workflow/, /dsh-tool-jobs/, /dsh-tool-todo/, /dsh-tool-schedule/,
    /dsh-skill-filesystem/, /dsh-tool-skill/, /dsh-agent-instructions/, /dsh-plan-mode/, /dsh-tool-goal/, /dsh-command-goal/]
  for (const n of names) for (const re of forbidden) assert.doesNotMatch(n, re)
})
test('chat preset has web and read_attachment', () => {
  assert.ok(names.includes('@deepseek-ai/dsh-tool-web'))
  assert.ok(names.includes('@jianhengpan/dsh-chat-mode/read-attachment'))
})
```

- [ ] **Step 2: 运行，确认失败**

运行：`node --test tests/preset.test.mjs`，预期 FAIL（文件不存在）。

- [ ] **Step 3: 写 `presets/chat.patch.yml`**

照 `$ASAR/dsh-web-app/presets/minimal.patch.yml` 的结构写：`insert` 一行 `{ id: preset-chat, name: '@deepseek-ai/dsh-agent-preset', config: { id: chat, order: 5, plugins: [...] } }`。plugins 依次为：
1. `persona`：`prefix: You are DeepSeek, a helpful assistant chatting with the user. You cannot access the user's computer except files they attach to this chat.`，`includeRuntimeContext: false`；
2. `time-context`；
3. `tool-web`：`config: { fetch: true, searchTimeoutMs: 60000 }`；
4. `chat-read-attachment`：`name: '@jianhengpan/dsh-chat-mode/read-attachment'`；
5. `compaction` 组，照抄 minimal 的写法。

先在 standard preset 里核对 tool-web 旁边有没有依赖的 present/web-search 行。如果有，一并带上，并在 commit message 里写明。

- [ ] **Step 4: 写 `ensureChatWorkspace` 的失败测试**

用假 registry：
- `resolveByPath` 返回 undefined 时 → 调用 `create(dir)` 一次，并以标题 `聊天` 改名；
- 已存在时 → 不调用 `create`；
- `create` 抛错时 → `ensureChatWorkspace` 抛错，错误信息带 `chat workspace unavailable`；
- 在测试临时目录上跑时，`apply` 会 `mkdir -p` 这个目录。

改名的方法名和参数以 `$ASAR/dsh-api-workspace-controller/lib/types/commands.js` 第 40 行的 `rename(request)` 所调用的 registry 方法为准。

- [ ] **Step 5: 实现 `ensureChatWorkspace` 和 `apply`**

`apply` 里的 `ensureChatWorkspace` 失败时只记 `ctx.logger?.warn`，不能让 Host 启动失败。

- [ ] **Step 6: 运行测试**

运行：`npm test`，预期全部 PASS。

- [ ] **Step 7: 在 DSH 里验证**

完全退出并重启 DSH。预期：
- 侧栏工作区列表多出 `聊天`；
- 设置 → Agent 模式里出现 `chat` 卡片，"查看配置"能看到上面的插件列表；
- 在"聊天"工作区新建会话并切到 `chat` 模式，问"今天有什么科技新闻"，能看到 web_search 调用；
- 让它"运行 ls"，它说做不到。

- [ ] **Step 8: Commit**

```bash
git add presets/chat.patch.yml package.json index.js tests/preset.test.mjs tests/host.test.mjs
git commit -m "feat: chat preset and host-managed chat workspace"
```

---

### Task 5: 客户端聊天面板

**Files:**
- Modify: `client.js`, `locale/zh.json`, `locale/en.json`
- Create: `tests/fixtures/load-client.mjs`
- Test: `tests/client.test.mjs`

**Interfaces:**
- Consumes：preset id `chat`；聊天工作区通过 `basename(workspace.path) === 'chat-mode-workspace'` 识别（不按标题识别，因为用户可能改名）。
- Produces：`client.js` 的 factory 返回 `{ inject: ['slots', 'layout'], apply, __test: { findChatWorkspace, chatSessions, filterByQuery } }`，其中：
  - `findChatWorkspace(workspaces: Array<{id, path}>) => {id, path} | undefined`
  - `chatSessions(sessions: Array<{id, workspaceId, title?, updatedAt, origin?}>, chatWorkspaceId: string) => sorted desc by updatedAt, 排除 origin === 'subagent'`
  - `filterByQuery(rows, q: string) => 按标题做不区分大小写的子串匹配，q 为空白时原样返回`

UI 决定（这是我替你做的决定，见交接说明）：面板本身**不**内嵌对话区。面板 = 居中的欢迎语 `今天想聊点什么？` + 一个大按钮 `＋ 新聊天` + 搜索框 + Recents 列表。
- 点"新聊天"：`ctx.get('uiWorkspace').startSession(chatWorkspaceId, { agentPreset: 'chat' })`；
- 点某个聊天：`uiWorkspace.openSession(sessionId)`；
- 两种操作都会让主区域回到 DSH 原生对话界面，对话、模型切换、附件、流式输出全部复用原生实现。

- [ ] **Step 1: 写 fixture 和失败测试**

`load-client.mjs`：把 `globalThis.window = { __ModuleLoader__: { load(def) { captured = def } } }` 设好，然后 `await import('../client.js')`，再调用 `captured.factory(name => name === 'react' ? fakeReact : undefined)`，返回 `__test`。

```js
test('findChatWorkspace matches by directory name', () => {
  assert.equal(findChatWorkspace([{ id: 'a', path: '/Users/x/Movie' }, { id: 'c', path: '/Users/x/.dsh/chat-mode-workspace' }]).id, 'c')
  assert.equal(findChatWorkspace([]), undefined)
})
test('chatSessions keeps only chat workspace, newest first, no subagents', () => {
  const rows = chatSessions([
    { id: '1', workspaceId: 'c', updatedAt: 1 }, { id: '2', workspaceId: 'm', updatedAt: 9 },
    { id: '3', workspaceId: 'c', updatedAt: 5 }, { id: '4', workspaceId: 'c', updatedAt: 7, origin: 'subagent' }], 'c')
  assert.deepEqual(rows.map(r => r.id), ['3', '1'])
})
test('filterByQuery', () => {
  const rows = [{ title: '周末去哪' }, { title: 'MoE 架构' }]
  assert.equal(filterByQuery(rows, 'moe').length, 1)
  assert.equal(filterByQuery(rows, '  ').length, 2)
})
```

- [ ] **Step 2: 运行，确认失败**

运行：`node --test tests/client.test.mjs`，预期 FAIL（`__test` 未定义）。

- [ ] **Step 3: 实现纯函数与面板**

- **入口**：`ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'chat-mode', order: 5, label: { zh: '聊天', en: 'Chat' } }, ChatIcon))`。
- **面板**：`ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', id: 'chat-mode' }, ChatPanel))`。
- **注册写法核对**：label 的 locale-aware 写法和 keyed slot 的注册字段，以 `$ASAR/dsh-client-ui-sidebar/lib` 和 `$ASAR/dsh-client-ui-settings-plugins/lib`（Plugins 页就是一个全局面板）的实际写法为准。
- **数据来源**：`ChatPanel` 读工作区和会话列表，使用 ui-workspace 和 ui-sidebar 用的同一套 hook 或服务。以 `$ASAR/dsh-client-ui-sidebar/lib` 里 `useSessions`、`useWorkspaces` 的来源为准；拿不到 hook 时，用 `ctx.get('uiWorkspace')` 暴露的快照和订阅。
- **样式**：只用 DSH 的 CSS 变量（`--dsw-alias-*`），顶部内边距用 `var(--dsh-frame-top-clearance)`。
- **状态文案**（写进两个 locale 文件）：
  - 空状态：`还没有聊天` / `No chats yet`
  - 找不到聊天工作区：`聊天工作区不可用，请完全退出并重启 DSH` / `Chat workspace unavailable. Quit and restart DSH.`
  - `startSession` 被拒绝：用 `ctx.get('toast')`（如果存在）显示原因，否则在面板内联显示。

- [ ] **Step 4: 运行测试**

运行：`npm test`，预期全部 PASS。

- [ ] **Step 5: 在 DSH 里验证**

重启 DSH，侧栏出现"聊天"。点进去：
- 能看到欢迎语、新聊天按钮和 Recents；
- 点新聊天，进入原生对话界面，模式标签是 `chat`；发"你好"，收到回复，全程没有登录提示；
- 回到"聊天"面板，Recents 里出现这条聊天，点它能继续；
- 搜索"你好"能过滤出来。

- [ ] **Step 6: Commit**

```bash
git add client.js locale tests/fixtures/load-client.mjs tests/client.test.mjs
git commit -m "feat: chat panel with new chat, search and recents"
```

---

### Task 6: 端到端验收 + README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 按 spec §8 逐条验收，并记录结果**

在用户的 Mac 上，DSH 0.2.2-rc.1，逐条跑 spec §8 的 1–8。第 4 条要专门测三个请求：
- "列出我桌面上的文件"
- "读 ~/.zshrc"
- 拖一个 PDF 或 txt 进来让它总结

预期：前两个拒绝或做不到，第三个能读。第 6 条记录实际表现：工作区列表里有一个"聊天"分组，这是 spec §7 允许的退一步方案。

- [ ] **Step 2: 写 README**

内容：安装、卸载命令（`dsh plugin --profile desktop add/remove`）；聊天能做什么、不能做什么；卸载后聊天记录保留在"聊天"工作区。

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README with install, scope and acceptance notes"
```
