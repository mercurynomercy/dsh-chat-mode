// Decides whether read_attachment may read a path. A path is readable only when
// its real location (symlinks resolved) is inside the DSH attachment object
// store AND it is one of the attachments the user sent in this chat.
import { realpath } from 'node:fs/promises'
import { isAbsolute, sep } from 'node:path'

export const DENY_MESSAGE = 'read_attachment: path is not an attachment of this chat'

/**
 * @param {string} requestedPath absolute path the model asked for
 * @param {{ objectsRoot: string, allowedRealPaths: Set<string> }} opts
 * @returns {Promise<{ ok: true, realPath: string } | { ok: false, reason: 'not-attachment' }>}
 */
export async function resolveAllowedAttachment(requestedPath, { objectsRoot, allowedRealPaths }) {
  const deny = { ok: false, reason: 'not-attachment' }
  if (typeof requestedPath !== 'string' || !isAbsolute(requestedPath)) return deny
  let realPath, realRoot
  try {
    realPath = await realpath(requestedPath)
    realRoot = await realpath(objectsRoot)
  } catch {
    // Do not reveal whether an arbitrary path exists.
    return deny
  }
  if (!realPath.startsWith(realRoot + sep)) return deny
  if (!allowedRealPaths.has(realPath)) return deny
  return { ok: true, realPath }
}
