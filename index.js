// Host half of the chat mode plugin: on startup, make sure the chat directory
// exists and is registered as the chat workspace ("聊天" / "Chat" / …) that
// chat sessions live in.
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveDshHome } from './read-attachment.js'

export const name = 'chat-mode-host'
export const inject = ['workspaceRegistry']
export const CHAT_DIR_NAME = 'chat-mode-workspace'
export const CHAT_WORKSPACE_TITLE = '聊天'

/**
 * Title for a newly created chat workspace in the system language. The Host
 * cannot see the UI language, so it goes by the OS locale.
 * @param {string | undefined} locale e.g. "zh-CN", "ja_JP.UTF-8"
 */
export function workspaceTitle(locale) {
  const lang = String(locale ?? '').toLowerCase().slice(0, 2)
  if (lang === 'zh') return '聊天'
  if (lang === 'ja') return 'チャット'
  if (lang === 'ru') return 'Чат'
  return 'Chat'
}

function systemLocale(env = process.env) {
  return env.LC_ALL || env.LC_MESSAGES || env.LANG || Intl.DateTimeFormat().resolvedOptions().locale
}

/**
 * Resolve or create the chat workspace. A newly created one gets `title`
 * unless another workspace already holds it; an existing one keeps whatever
 * title it has.
 * @param {{ resolveByPath(p: string): Promise<any>, create(p: string): Promise<any>, list(): any[] }} registry
 * @param {string} dir
 * @param {string} [title]
 */
export async function ensureChatWorkspace(registry, dir, title = CHAT_WORKSPACE_TITLE) {
  try {
    const existing = await registry.resolveByPath(dir)
    if (existing !== undefined) return existing
    const workspace = await registry.create(dir)
    const taken = registry.list().some((w) => w.id !== workspace.id && w.title === title)
    if (!taken && workspace.title !== title) await workspace.setTitle(title)
    return workspace
  } catch (error) {
    throw new Error(`chat workspace unavailable: ${error?.message ?? error}`, { cause: error })
  }
}

/**
 * Keep the chat workspace at the bottom of DSH's workspace list (DSH offers no
 * way to hide a workspace). Runs at startup; a workspace added later sits
 * below it until the next start. A failed move only logs.
 */
async function moveToEnd(registry, workspace, ctx) {
  try {
    const ids = registry.list().map((w) => w.id)
    if (ids.length === 0 || ids[ids.length - 1] === workspace.id) return
    await registry.insertBefore(workspace.id, undefined)
  } catch (error) {
    ctx.logger?.warn?.('[chat-mode] could not move the chat workspace to the end', error)
  }
}

/**
 * @param {any} ctx cordis context with `workspaceRegistry`
 * @param {{ dshHome?: string }} [options] test seam for the DSH home
 */
export async function apply(ctx, options = {}) {
  const dir = join(options.dshHome ?? resolveDshHome(), CHAT_DIR_NAME)
  try {
    await mkdir(dir, { recursive: true })
    const workspace = await ensureChatWorkspace(ctx.workspaceRegistry, dir, workspaceTitle(systemLocale()))
    await moveToEnd(ctx.workspaceRegistry, workspace, ctx)
  } catch (error) {
    // Never fail Host startup over the chat workspace; the panel reports it.
    ctx.logger?.warn?.('[chat-mode] chat workspace unavailable', error)
  }
}
