import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, realpath } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { resolveAllowedAttachment } from '../lib/attachment-guard.js'

let objects, file1, file2, opts

before(async () => {
  const root = await mkdtemp(join(tmpdir(), 'chat-guard-'))
  objects = join(root, 'objects')
  await mkdir(join(objects, 'aa'), { recursive: true })
  await mkdir(join(objects, 'bb'), { recursive: true })
  await mkdir(join(objects, 'cc'), { recursive: true })
  await mkdir(join(root, 'outside'))
  file1 = join(objects, 'aa', 'file1')
  file2 = join(objects, 'bb', 'file2')
  await writeFile(file1, 'one')
  await writeFile(file2, 'two')
  await writeFile(join(root, 'outside', 'secret.txt'), 'secret')
  await symlink(join(root, 'outside', 'secret.txt'), join(objects, 'cc', 'link'))
  opts = { objectsRoot: objects, allowedRealPaths: new Set([await realpath(file1)]) }
})

test('allows an attachment of this chat', async () => {
  assert.deepEqual(await resolveAllowedAttachment(file1, opts), { ok: true, realPath: await realpath(file1) })
})
test('rejects attachment of another chat', async () => {
  assert.deepEqual(await resolveAllowedAttachment(file2, opts), { ok: false, reason: 'not-attachment' })
})
test('rejects traversal out of objects root', async () => {
  assert.equal((await resolveAllowedAttachment(join(objects, 'aa', '..', '..', 'outside', 'secret.txt'), opts)).ok, false)
})
test('rejects symlink pointing outside', async () => {
  const withLink = { ...opts, allowedRealPaths: new Set([...opts.allowedRealPaths, join(objects, 'cc', 'link')]) }
  assert.equal((await resolveAllowedAttachment(join(objects, 'cc', 'link'), withLink)).ok, false)
})
test('rejects arbitrary home path', async () => {
  assert.equal((await resolveAllowedAttachment(join(homedir(), '.zshrc'), opts)).ok, false)
})
test('missing file under root is reported as not-attachment', async () => {
  assert.deepEqual(await resolveAllowedAttachment(join(objects, 'zz', 'nope'), opts), { ok: false, reason: 'not-attachment' })
})
test('relative path is rejected', async () => {
  assert.equal((await resolveAllowedAttachment('aa/file1', opts)).ok, false)
})
