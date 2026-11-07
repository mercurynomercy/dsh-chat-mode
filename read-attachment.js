// read_attachment: the chat preset's only file access. It reads a file the
// user attached to *this* chat and refuses every other path. The scope is
// enforced here on the Host, not by asking the model to behave.
//
// This file imports no @deepseek-ai package: the plugin is installed by
// linking this repo into the DSH profile, so Node resolves imports from the
// repo directory, where those packages do not exist. The tool object below is
// the shape dsh-tools' defineTool() produces (JSON Schema parameters,
// output.schema + output.render, execute).
import { readFile, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveAllowedAttachment, DENY_MESSAGE } from './lib/attachment-guard.js'
import { renderWindow, READ_LIMIT } from './lib/read-window.js'

export const name = 'chat-read-attachment'
export const inject = ['tools', 'attachments']

/**
 * Same precedence as @deepseek-ai/dsh-home-paths resolveDshHome: a non-blank
 * $DSH_HOME, else ~/.dsh.
 */
export function resolveDshHome(env = process.env, home = homedir()) {
  const configured = env.DSH_HOME?.trim()
  return configured ? configured : join(home, '.dsh')
}

/**
 * Host paths of every file block in the chat's user messages.
 * @param {Iterable<{ role: string, content: Array<{ type: string, attachment?: any }> }>} messages
 * @param {(ref: any) => string | undefined} hostPathOf
 * @returns {Set<string>}
 */
export function collectSessionAttachmentPaths(messages, hostPathOf) {
  const paths = new Set()
  for (const message of messages) {
    if (message?.role !== 'user' || !Array.isArray(message.content)) continue
    for (const block of message.content) {
      if (block?.type !== 'file' || !block.attachment) continue
      const hostPath = hostPathOf(block.attachment)
      if (hostPath) paths.add(hostPath)
    }
  }
  return paths
}

async function realPaths(paths) {
  const out = new Set()
  for (const p of paths) {
    try {
      out.add(await realpath(p))
    } catch {
      // A missing stored object simply is not readable.
    }
  }
  return out
}

/**
 * @param {any} ctx cordis context with `tools` and `attachments`
 * @param {{ dshHome?: string }} [options] test seam for the DSH home
 */
export function apply(ctx, options = {}) {
  // DSH's attachment root: images live in objects/, other files in files/ (hard links into file-objects/).
  const attachmentsRoot = join(options.dshHome ?? resolveDshHome(), 'attachments', 'v1')
  const hostPathOf = (ref) => {
    try {
      return ctx.attachments.fileHostPath(ref)
    } catch {
      return undefined
    }
  }

  ctx.tools.register({
    name: 'read_attachment',
    description:
      "Read a file the user attached to this chat. Only paths given in the user's attachment lines are readable; every other path is refused. " +
      `Returns numbered lines, at most ${READ_LIMIT} per call; use offset to continue.`,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['file_path'],
      properties: {
        file_path: { type: 'string', description: 'Absolute saved path from the attachment line.' },
        offset: { type: 'integer', minimum: 1, description: '1-based first line. Defaults to 1.' },
        limit: { type: 'integer', minimum: 1, maximum: READ_LIMIT, description: `Max lines. Defaults to ${READ_LIMIT}.` },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['text'],
        properties: { text: { type: 'string' } },
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if (typeof args?.file_path !== 'string' || args.file_path.trim() === '') {
        throw new Error('file_path must be a non-empty string')
      }
      const session = exec?.agent?.session
      if (!session) throw new Error('read_attachment requires an owning chat session')
      const allowedRealPaths = await realPaths(collectSessionAttachmentPaths(session.deriveMessages(), hostPathOf))
      const verdict = await resolveAllowedAttachment(args.file_path, { objectsRoot: attachmentsRoot, allowedRealPaths })
      if (!verdict.ok) throw new Error(DENY_MESSAGE)
      const text = await readFile(verdict.realPath, 'utf8')
      return { text: renderWindow(text, verdict.realPath, args.offset ?? 1, args.limit ?? READ_LIMIT) }
    },
    presentCall: (args) => ({ card: 'generic', title: 'Read attachment', kind: 'read', rawInput: args }),
  })
}
