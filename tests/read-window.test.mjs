import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderWindow, READ_LIMIT } from '../lib/read-window.js'

test('READ_LIMIT is 2000', () => assert.equal(READ_LIMIT, 2000))
test('first window of a long file', () => {
  const text = Array.from({ length: 5000 }, (_, i) => `l${i + 1}`).join('\n')
  const out = renderWindow(text, '/x', 1, 2000)
  assert.match(out, /^<path>\/x<\/path>\n<type>file<\/type>\n<content>\n1: l1\n/)
  assert.match(out, /\n2000: l2000\n\n\(Showing lines 1-2000 of 5000\. Use offset=2001 to continue\.\)\n<\/content>$/)
  assert.doesNotMatch(out, /2001: /)
})
test('offset continues from the given line', () => {
  const text = Array.from({ length: 5000 }, (_, i) => `l${i + 1}`).join('\n')
  assert.match(renderWindow(text, '/x', 4001, 2000), /\n4001: l4001\n[\s\S]*\(Showing lines 4001-5000 of 5000\.\)\n<\/content>$/)
})
test('limit above READ_LIMIT is rejected', () => {
  assert.throws(() => renderWindow('a', '/x', 1, 2001), /limit must be less than or equal to 2000/)
})
test('last window has no continue hint', () => {
  const out = renderWindow('a\nb', '/x', 1, 2000)
  assert.doesNotMatch(out, /Use offset=/)
  assert.match(out, /\(Showing lines 1-2 of 2\.\)/)
})
test('offset past end is rejected', () => {
  assert.throws(() => renderWindow('a\nb', '/x', 5, 10), /offset 5 is past the end of the file \(2 lines\)/)
})
