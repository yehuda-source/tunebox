export {}

// Browser shims for UI tests. Only acts in jsdom; node-environment tests skip it.
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest')
  window.matchMedia ??= ((query: string) => ({
    matches: query.includes('dark'),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia
  const noop = (): void => undefined
  globalThis.ResizeObserver ??= class {
    observe = noop
    unobserve = noop
    disconnect = noop
  } as unknown as typeof ResizeObserver
  Element.prototype.scrollTo ??= noop
  Element.prototype.scrollIntoView ??= noop
  HTMLMediaElement.prototype.play = () => Promise.resolve()
  HTMLMediaElement.prototype.pause = noop
  HTMLMediaElement.prototype.load = noop
  URL.createObjectURL ??= () => 'blob:mock'
  // The fake backend reads ?scenario= from the URL when it is imported. A test file picks one with
  // // @vitest-environment-options {"url": "http://localhost/?scenario=errors"}
  await import('../../src/renderer/src/mock/install')
}
