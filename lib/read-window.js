// Renders one window of a text file in the same envelope dsh-tool-fs `read`
// uses, so the model sees a format it already knows.
export const READ_LIMIT = 2000

/**
 * @param {string} text full file text
 * @param {string} realPath path shown to the model
 * @param {number} [offset] 1-based first line
 * @param {number} [limit] max lines, at most READ_LIMIT
 * @returns {string}
 */
export function renderWindow(text, realPath, offset = 1, limit = READ_LIMIT) {
  if (limit > READ_LIMIT) throw new Error(`limit must be less than or equal to ${READ_LIMIT}`)
  if (!Number.isInteger(offset) || offset < 1) throw new Error('offset must be a positive integer')
  if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be a positive integer')
  const lines = text.split('\n')
  const total = lines.length
  if (offset > total) throw new Error(`offset ${offset} is past the end of the file (${total} lines)`)
  const end = Math.min(total, offset + limit - 1)
  const body = lines
    .slice(offset - 1, end)
    .map((line, i) => `${offset + i}: ${line}`)
    .join('\n')
  const footer =
    end < total
      ? `(Showing lines ${offset}-${end} of ${total}. Use offset=${end + 1} to continue.)`
      : `(Showing lines ${offset}-${end} of ${total}.)`
  return `<path>${realPath}</path>\n<type>file</type>\n<content>\n${body}\n\n${footer}\n</content>`
}
