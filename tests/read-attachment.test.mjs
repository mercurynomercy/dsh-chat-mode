import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, inject, name, collectSessionAttachmentPaths, resolveDshHome } from '../read-attachment.js'
import { DENY_MESSAGE } from '../lib/attachment-guard.js'

let home, objects, tool
const mine = { attachmentId: 'aa1', name: 'notes.txt', bytes: 11 }
const other = { attachmentId: 'bb2', name: 'other.txt', bytes: 5 }

before(async () => {
  home = await mkdtemp(join(tmpdir(), 'chat-home-'))
  objects = join(home, 'attachments', 'v1', 'objects')
  await mkdir(join(objects, 'aa'), { recursive: true })
  await mkdir(join(objects, 'bb'), { recursive: true })
  await writeFile(join(objects, 'aa', 'aa1'), 'hello\nworld')
  await writeFile(join(objects, 'bb', 'bb2'), 'other')
  // Real DSH layout for non-image files: v1/files/<xx>/<sha>/<display name> (a hard link).
  await mkdir(join(home, 'attachments', 'v1', 'files', 'cc'), { recursive: true })
  await mkdir(join(home, 'attachments', 'v1', 'files', 'cc', 'cc3'))
  await writeFile(join(home, 'attachments', 'v1', 'files', 'cc', 'cc3', 'report.txt'), 'real layout')
  const registered = []
  const ctx = {
    tools: { register: (t) => registered.push(t) },
    attachments: {
      fileHostPath: (ref) =>
        ref.attachmentId === 'cc3'
          ? join(home, 'attachments', 'v1', 'files', 'cc', 'cc3', ref.name)
          : join(objects, ref.attachmentId.slice(0, 2), ref.attachmentId),
    },
  }
  apply(ctx, { dshHome: home })
  tool = registered[0]
})

const sessionWith = (...refs) => ({
  agent: { session: { deriveMessages: () => [
    { role: 'system', content: [{ type: 'file', attachment: other }] },
    { role: 'user', content: [{ type: 'text', text: 'hi' }, ...refs.map((attachment) => ({ type: 'file', attachment }))] },
    { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
  ] } },
})

test('plugin identity', () => {
  assert.equal(name, 'chat-read-attachment')
  assert.deepEqual(inject, ['tools', 'attachments'])
  assert.equal(tool.name, 'read_attachment')
  assert.deepEqual(tool.parameters.required, ['file_path'])
})
test('reads an attachment of this chat', async () => {
  const value = await tool.execute({ file_path: join(objects, 'aa', 'aa1') }, sessionWith(mine))
  const [block] = tool.output.render({}, value)
  assert.match(block.text, /^<path>.*aa1<\/path>\n<type>file<\/type>\n<content>\n1: hello\n2: world\n/)
})
test('reads a file attachment stored under v1/files', async () => {
  const ref = { attachmentId: 'cc3', name: 'report.txt', bytes: 11 }
  const value = await tool.execute({ file_path: join(home, 'attachments', 'v1', 'files', 'cc', 'cc3', 'report.txt') }, sessionWith(ref))
  assert.match(tool.output.render({}, value)[0].text, /1: real layout/)
})
test('refuses an attachment of another chat', async () => {
  await assert.rejects(tool.execute({ file_path: join(objects, 'bb', 'bb2') }, sessionWith(mine)), { message: DENY_MESSAGE })
})
test('refuses arbitrary paths', async () => {
  await assert.rejects(tool.execute({ file_path: '/etc/hosts' }, sessionWith(mine)), { message: DENY_MESSAGE })
})
test('requires an owning chat session', async () => {
  await assert.rejects(tool.execute({ file_path: join(objects, 'aa', 'aa1') }, {}), { message: 'read_attachment requires an owning chat session' })
})
test('rejects missing file_path', async () => {
  await assert.rejects(tool.execute({}, sessionWith(mine)), /file_path must be a non-empty string/)
})
test('collectSessionAttachmentPaths only takes user file blocks', () => {
  const paths = collectSessionAttachmentPaths(sessionWith(mine).agent.session.deriveMessages(), (r) => `/p/${r.attachmentId}`)
  assert.deepEqual([...paths], ['/p/aa1'])
})
test('resolveDshHome precedence', () => {
  assert.equal(resolveDshHome({ DSH_HOME: '/custom' }, '/h'), '/custom')
  assert.equal(resolveDshHome({ DSH_HOME: '  ' }, '/h'), '/h/.dsh')
  assert.equal(resolveDshHome({}, '/h'), '/h/.dsh')
})
