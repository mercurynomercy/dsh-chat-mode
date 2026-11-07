// Loads client.js through a fake DSH module loader and returns its __test exports.
export async function loadClient() {
  let captured
  globalThis.window = { __ModuleLoader__: { load(def) { captured = def } } }
  await import(`../../client.js?${Date.now()}`)
  const fakeReact = { createElement: () => null, useSyncExternalStore: () => undefined, useState: (v) => [v, () => {}] }
  const mod = captured.factory((name) => (name === 'react' ? fakeReact : undefined))
  return { id: captured.id, mod, ...mod.__test }
}
