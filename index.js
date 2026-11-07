// Host half of the chat mode plugin: on startup, make sure the chat directory
// exists and is registered as the "聊天" workspace that chat sessions live in.
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveDshHome } from './read-attachment.js'

export const name = 'chat-mode-host'
export const inject = ['workspaceRegistry']
export const CHAT_DIR_NAME = 'chat-mode-workspace'
export const CHAT_WORKSPACE_TITLE = '聊天'

/**
 * Resolve or create the chat workspace. A newly created one is titled 聊天
 * unless another workspace already holds that title; an existing one keeps
 * whatever title the user gave it.
 * @param {{ resolveByPath(p: string): Promise<any>, create(p: string): Promise<any>, list(): any[] }} registry
 * @param {string} dir
 */
export async function ensureChatWorkspace(registry, dir) {
  try {
    const existing = await registry.resolveByPath(dir)
    if (existing !== undefined) return existing
    const workspace = await registry.create(dir)
    const taken = registry.list().some((w) => w.id !== workspace.id && w.title === CHAT_WORKSPACE_TITLE)
    if (!taken && workspace.title !== CHAT_WORKSPACE_TITLE) await workspace.setTitle(CHAT_WORKSPACE_TITLE)
    return workspace
  } catch (error) {
    throw new Error(`chat workspace unavailable: ${error?.message ?? error}`, { cause: error })
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
    await ensureChatWorkspace(ctx.workspaceRegistry, dir)
  } catch (error) {
    // Never fail Host startup over the chat workspace; the panel reports it.
    ctx.logger?.warn?.('[chat-mode] chat workspace unavailable', error)
  }
}
