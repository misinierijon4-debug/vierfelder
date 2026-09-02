import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  arbeiteWarteschlangeAb,
  einreihen,
  istNetzwerkFehler,
  ladeWarteschlange,
  leereWarteschlange,
  type WarteschlangenEintrag,
} from './warteschlange'
import type { Backend } from './backend'
import type { Einheit } from './types'

class Speicher {
  private daten = new Map<string, string>()
  getItem(k: string) {
    return this.daten.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.daten.set(k, v)
  }
  removeItem(k: string) {
    this.daten.delete(k)
  }
  clear() {
    this.daten.clear()
  }
}

const speicher = new Speicher()
;(globalThis as { localStorage?: unknown }).localStorage = speicher

describe('istNetzwerkFehler', () => {
  it('erkennt Failed to fetch als Netzwerkfehler', () => {
    const err = new TypeError('Failed to fetch')
    expect(istNetzwerkFehler(err)).toBe(true)
  })

  it('erkennt NetworkError und typische Offline-Meldungen', () => {
    expect(istNetzwerkFehler(new Error('NetworkError when attempting to fetch resource.'))).toBe(true)
    expect(istNetzwerkFehler(new Error('The Internet connection appears to be offline.'))).toBe(true)
    expect(istNetzwerkFehler({ message: 'Load failed' })).toBe(true)
  })

  it('lehnt fachliche Fehler oder Validierungsfehler ab', () => {
    expect(istNetzwerkFehler(new Error('kein profil fuer dieses konto'))).toBe(false)
    expect(istNetzwerkFehler(new Error('invalid input syntax'))).toBe(false)
    expect(istNetzwerkFehler(null)).toBe(false)
  })
})

describe('Warteschlangen-Speicher', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('startet leer und serialisiert nach localStorage', () => {
    expect(ladeWarteschlange()).toEqual([])
    const eintrag: WarteschlangenEintrag = {
      typ: 'schreibeGewicht',
      tag: '2026-09-02',
      kg: 78.5,
    }
    einreihen(eintrag)
    expect(ladeWarteschlange()).toEqual([eintrag])
    leereWarteschlange()
    expect(ladeWarteschlange()).toEqual([])
  })
})

describe('arbeiteWarteschlangeAb', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('arbeitet Eintraege der Reihe nach ab und leert die Schlange', async () => {
    const e1: Einheit = {
      id: 'einheit-1',
      user: 'erijon',
      area: 'gym',
      tag: '2026-09-02',
      wert: 60,
      erfasst: '2026-09-02T18:00:00Z',
    }
    const eintrag1: WarteschlangenEintrag = { typ: 'schreibeEinheit', einheit: e1 }
    const eintrag2: WarteschlangenEintrag = { typ: 'schreibeGewicht', tag: '2026-09-02', kg: 80.2 }

    einreihen(eintrag1)
    einreihen(eintrag2)

    const mockBackend: Partial<Backend> = {
      schreibeEinheit: vi.fn().mockResolvedValue(undefined),
      schreibeGewicht: vi.fn().mockResolvedValue(undefined),
    }

    const ergebnis = await arbeiteWarteschlangeAb(mockBackend as Backend)
    expect(ergebnis.erfolg).toBe(true)
    expect(mockBackend.schreibeEinheit).toHaveBeenCalledWith(e1)
    expect(mockBackend.schreibeGewicht).toHaveBeenCalledWith('2026-09-02', 80.2)
    expect(ladeWarteschlange()).toEqual([])
  })

  it('stoppt bei erneutem Netzwerkfehler und behaelt verbleibende Eintraege', async () => {
    const e1: Einheit = {
      id: 'einheit-1',
      user: 'erijon',
      area: 'gym',
      tag: '2026-09-02',
      wert: 60,
      erfasst: '2026-09-02T18:00:00Z',
    }
    einreihen({ typ: 'schreibeEinheit', einheit: e1 })
    einreihen({ typ: 'schreibeGewicht', tag: '2026-09-02', kg: 80.2 })

    const mockBackend: Partial<Backend> = {
      schreibeEinheit: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      schreibeGewicht: vi.fn(),
    }

    const ergebnis = await arbeiteWarteschlangeAb(mockBackend as Backend)
    expect(ergebnis.erfolg).toBe(false)
    expect(ergebnis.verbleibend).toBe(2)
    expect(mockBackend.schreibeGewicht).not.toHaveBeenCalled()
    expect(ladeWarteschlange().length).toBe(2)
  })
})
