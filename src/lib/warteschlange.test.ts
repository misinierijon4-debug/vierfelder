import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  arbeiteWarteschlangeAb,
  einreihen,
  istNetzwerkFehler,
  ladeWarteschlange,
  leereWarteschlange,
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

function einheit(id: string, user: 'erijon' | 'koray' = 'erijon'): Einheit {
  return {
    id,
    user,
    area: 'gym',
    tag: '2026-09-02',
    wert: 60,
    erfasst: '2026-09-02T18:00:00Z',
  }
}

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
    const eintrag = einreihen({ typ: 'schreibeGewicht', tag: '2026-09-02', kg: 78.5 }, 'erijon')
    expect(ladeWarteschlange()).toEqual([eintrag])
    expect(eintrag.user).toBe('erijon')
    expect(eintrag.id.length).toBeGreaterThan(0)
    leereWarteschlange()
    expect(ladeWarteschlange()).toEqual([])
  })

  it('gibt jedem eintrag eine eigene id', () => {
    const a = einreihen({ typ: 'schreibeGewicht', tag: '2026-09-02', kg: 78.5 }, 'erijon')
    const b = einreihen({ typ: 'schreibeGewicht', tag: '2026-09-03', kg: 78.4 }, 'erijon')
    expect(a.id).not.toBe(b.id)
  })

  it('verwirft eintraege ohne id oder person aus einer aelteren fassung', () => {
    localStorage.setItem(
      'vierfelder.warteschlange',
      JSON.stringify([{ typ: 'schreibeGewicht', tag: '2026-09-02', kg: 78.5 }])
    )
    expect(ladeWarteschlange()).toEqual([])
  })
})

describe('arbeiteWarteschlangeAb', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('arbeitet Eintraege der Reihe nach ab und leert die Schlange', async () => {
    const e1 = einheit('einheit-1')
    einreihen({ typ: 'schreibeEinheit', einheit: e1 }, 'erijon')
    einreihen({ typ: 'schreibeGewicht', tag: '2026-09-02', kg: 80.2 }, 'erijon')

    const backend: Partial<Backend> = {
      schreibeEinheit: vi.fn().mockResolvedValue(undefined),
      schreibeGewicht: vi.fn().mockResolvedValue(undefined),
    }

    const ergebnis = await arbeiteWarteschlangeAb(backend as Backend, 'erijon')
    expect(ergebnis.erfolg).toBe(true)
    expect(ergebnis.abgearbeitet).toBe(2)
    expect(backend.schreibeEinheit).toHaveBeenCalledWith(e1)
    expect(backend.schreibeGewicht).toHaveBeenCalledWith('2026-09-02', 80.2)
    expect(ladeWarteschlange()).toEqual([])
  })

  it('stoppt bei erneutem Netzwerkfehler und behaelt verbleibende Eintraege', async () => {
    einreihen({ typ: 'schreibeEinheit', einheit: einheit('einheit-1') }, 'erijon')
    einreihen({ typ: 'schreibeGewicht', tag: '2026-09-02', kg: 80.2 }, 'erijon')

    const backend: Partial<Backend> = {
      schreibeEinheit: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      schreibeGewicht: vi.fn(),
    }

    const ergebnis = await arbeiteWarteschlangeAb(backend as Backend, 'erijon')
    expect(ergebnis.erfolg).toBe(false)
    expect(ergebnis.verbleibend).toBe(2)
    expect(backend.schreibeGewicht).not.toHaveBeenCalled()
    expect(ladeWarteschlange().length).toBe(2)
  })

  it('verwirft einen eintrag, den die datenbank fachlich ablehnt, und macht weiter', async () => {
    einreihen({ typ: 'schreibeEinheit', einheit: einheit('einheit-1') }, 'erijon')
    einreihen({ typ: 'schreibeGewicht', tag: '2026-09-02', kg: 80.2 }, 'erijon')

    const backend: Partial<Backend> = {
      schreibeEinheit: vi.fn().mockRejectedValue(new Error('invalid input syntax')),
      schreibeGewicht: vi.fn().mockResolvedValue(undefined),
    }

    const ergebnis = await arbeiteWarteschlangeAb(backend as Backend, 'erijon')
    expect(ergebnis.erfolg).toBe(true)
    expect(backend.schreibeGewicht).toHaveBeenCalled()
    expect(ladeWarteschlange()).toEqual([])
  })

  /**
   * der teure fall: waehrend ein schreibvorgang unterwegs ist, tippt jemand
   * weiter. eine zurueckgeschriebene alte liste haette den neuen tap gelöscht —
   * genau der datenverlust, den die schlange verhindern soll.
   */
  it('behaelt einen tap, der waehrend der abarbeitung dazukommt', async () => {
    einreihen({ typ: 'schreibeEinheit', einheit: einheit('einheit-1') }, 'erijon')

    let loese: () => void = () => {}
    const unterwegs = new Promise<void>((r) => {
      loese = r
    })
    const backend: Partial<Backend> = {
      schreibeEinheit: vi.fn().mockReturnValue(unterwegs),
      schreibeGewicht: vi.fn().mockResolvedValue(undefined),
    }

    const lauf = arbeiteWarteschlangeAb(backend as Backend, 'erijon')
    einreihen({ typ: 'schreibeGewicht', tag: '2026-09-02', kg: 80.2 }, 'erijon')
    loese()
    const ergebnis = await lauf

    expect(ergebnis.abgearbeitet).toBe(2)
    expect(backend.schreibeGewicht).toHaveBeenCalledWith('2026-09-02', 80.2)
    expect(ladeWarteschlange()).toEqual([])
  })

  /**
   * beim laden und beim `online`-ereignis startet je ein durchlauf. ohne sperre
   * ginge derselbe eintrag zweimal raus.
   */
  it('laesst nur einen durchlauf gleichzeitig zu', async () => {
    einreihen({ typ: 'schreibeEinheit', einheit: einheit('einheit-1') }, 'erijon')

    let loese: () => void = () => {}
    const unterwegs = new Promise<void>((r) => {
      loese = r
    })
    const backend: Partial<Backend> = {
      schreibeEinheit: vi.fn().mockReturnValue(unterwegs),
    }

    const erster = arbeiteWarteschlangeAb(backend as Backend, 'erijon')
    const zweiter = await arbeiteWarteschlangeAb(backend as Backend, 'erijon')
    loese()
    await erster

    expect(zweiter.abgearbeitet).toBe(0)
    expect(backend.schreibeEinheit).toHaveBeenCalledTimes(1)
  })

  /**
   * `schreibeGewicht` und `schreibeWette` kennen keinen benutzer: sie landen
   * auf dem konto, das gerade angemeldet ist. der eintrag des anderen muss
   * deshalb liegen bleiben, bis dieser wieder angemeldet ist.
   */
  it('ruehrt eintraege der anderen person nicht an', async () => {
    einreihen({ typ: 'schreibeGewicht', tag: '2026-09-02', kg: 80.2 }, 'koray')
    einreihen({ typ: 'schreibeEinheit', einheit: einheit('einheit-1') }, 'erijon')

    const backend: Partial<Backend> = {
      schreibeEinheit: vi.fn().mockResolvedValue(undefined),
      schreibeGewicht: vi.fn().mockResolvedValue(undefined),
    }

    const ergebnis = await arbeiteWarteschlangeAb(backend as Backend, 'erijon')
    expect(backend.schreibeGewicht).not.toHaveBeenCalled()
    expect(ergebnis.abgearbeitet).toBe(1)
    expect(ladeWarteschlange().map((e) => e.user)).toEqual(['koray'])
  })
})
