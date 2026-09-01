import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const wurzel = { style: { overflow: '', overscrollBehavior: '' } }

beforeEach(() => {
  wurzel.style.overflow = ''
  wurzel.style.overscrollBehavior = ''
  Object.defineProperty(globalThis, 'document', {
    value: { documentElement: wurzel },
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'document')
})

/** jeder test braucht den zaehler bei null, also das modul frisch */
async function frisch() {
  vi.resetModules()
  return (await import('./scrollsperre')).scrollSperre
}

describe('scrollsperre', () => {
  it('haelt die seite an und gibt sie genauso wieder frei', async () => {
    const scrollSperre = await frisch()
    const loesen = scrollSperre()
    expect(wurzel.style.overflow).toBe('hidden')
    expect(wurzel.style.overscrollBehavior).toBe('none')
    loesen()
    expect(wurzel.style.overflow).toBe('')
    expect(wurzel.style.overscrollBehavior).toBe('')
  })

  it('gibt einen vorhandenen wert zurueck, statt ihn zu leeren', async () => {
    wurzel.style.overflow = 'clip'
    const scrollSperre = await frisch()
    scrollSperre()()
    expect(wurzel.style.overflow).toBe('clip')
  })

  it('zwei gleichzeitige sperren ueberschreiben sich das vorher nicht', async () => {
    const scrollSperre = await frisch()
    const ersteLoesen = scrollSperre()
    const zweiteLoesen = scrollSperre()
    expect(wurzel.style.overflow).toBe('hidden')
    // die erste geht zuerst, die zweite haelt die sperre
    ersteLoesen()
    expect(wurzel.style.overflow).toBe('hidden')
    zweiteLoesen()
    expect(wurzel.style.overflow).toBe('')
  })

  it('laesst sich nicht doppelt loesen', async () => {
    const scrollSperre = await frisch()
    const ersteLoesen = scrollSperre()
    const zweiteLoesen = scrollSperre()
    ersteLoesen()
    ersteLoesen()
    expect(wurzel.style.overflow).toBe('hidden')
    zweiteLoesen()
    expect(wurzel.style.overflow).toBe('')
  })
})
