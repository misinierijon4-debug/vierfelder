import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackendEreignis } from './backend'
import { lokalesBackend } from './lokal'
import { tickKey } from './types'

/** localStorage gibt es im knoten nicht, und mehr als das braucht der prototyp nicht */
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

describe('altbestand aus dem alten format', () => {
  beforeEach(() => {
    speicher.clear()
  })

  it('übernimmt ticks und werte verlustfrei in einheiten', async () => {
    speicher.setItem(
      'vierfelder.ticks.v2',
      JSON.stringify({
        'erijon|gym|2026-08-26': true,
        'erijon|lesen|2026-08-25': true,
        'koray|boxen|2026-08-26': true,
      })
    )
    speicher.setItem(
      'vierfelder.werte.v2',
      JSON.stringify({ erijon: { 'gym|2026-08-26': 93 }, koray: { 'boxen|2026-08-26': 40 } })
    )

    const { einheiten, einheitVonVerfuegbar } = await lokalesBackend().laden()

    const gym = einheiten[tickKey('erijon', 'gym', '2026-08-26')]!
    expect(gym).toHaveLength(1)
    expect(gym[0]!.wert).toBe(93)
    // kein wert gespeichert heißt kein wert erfunden
    expect(einheiten[tickKey('erijon', 'lesen', '2026-08-25')]![0]!.wert).toBeNull()
    // der haken des anderen geht nicht verloren
    expect(einheiten[tickKey('koray', 'boxen', '2026-08-26')]![0]!.wert).toBe(40)
    expect(einheitVonVerfuegbar).toBe(true)
  })

  it('läuft nur einmal und legt beim zweiten laden nichts doppelt an', async () => {
    speicher.setItem('vierfelder.ticks.v2', JSON.stringify({ 'erijon|gym|2026-08-26': true }))

    const backend = lokalesBackend()
    await backend.laden()
    const { einheiten } = await backend.laden()

    expect(einheiten[tickKey('erijon', 'gym', '2026-08-26')]).toHaveLength(1)
  })

  it('legt eine zweite einheit neben die übernommene, ohne sie zu ersetzen', async () => {
    speicher.setItem('vierfelder.ticks.v2', JSON.stringify({ 'erijon|gym|2026-08-26': true }))
    speicher.setItem('vierfelder.werte.v2', JSON.stringify({ erijon: { 'gym|2026-08-26': 65 } }))

    const backend = lokalesBackend()
    const erst = await backend.laden()
    const alt = erst.einheiten[tickKey('erijon', 'gym', '2026-08-26')]![0]!

    await backend.schreibeEinheit({
      id: 'zweite',
      user: 'erijon',
      area: 'gym',
      tag: '2026-08-26',
      wert: 28,
      erfasst: new Date(2026, 7, 26, 18, 30).toISOString(),
    })

    const { einheiten } = await backend.laden()
    const liste = einheiten[tickKey('erijon', 'gym', '2026-08-26')]!
    expect(liste).toHaveLength(2)
    expect(liste.map((e) => e.wert)).toEqual([65, 28])
    expect(liste[0]!.id).toBe(alt.id)
  })

  it('behaelt die erste wochenabrechnung unveraendert', async () => {
    const backend = lokalesBackend()
    const basis = {
      woche: '2020-01-06', sieger: 'erijon' as const, grund: 'punkte' as const,
      differenz: 2, belegErijon: 3, belegKoray: 1, wette: null, abgeschlossen: '2026-08-30T18:00:00Z',
    }
    const zuerst = await backend.schreibeAbrechnung(basis)
    const bestaetigt = await backend.schreibeAbrechnung({ ...basis, sieger: 'koray', differenz: -2 })

    const { abrechnungen } = await backend.laden()
    expect(zuerst).toEqual(basis)
    expect(bestaetigt).toEqual(basis)
    expect(abrechnungen.find((a) => a.woche === basis.woche)).toMatchObject({ sieger: 'erijon', differenz: 2 })
  })
})

describe('lokale Schlafverlaeufe', () => {
  beforeEach(() => {
    speicher.clear()
  })

  it('liefert nur fuer eine vorhandene Nacht deren echten lokalen Verlauf', async () => {
    const backend = lokalesBackend()
    const anfang = await backend.laden()
    const nacht = anfang.schlaf[0]!

    await expect(
      backend.ladePhasen(nacht.user, nacht.nacht, new AbortController().signal)
    ).resolves.toEqual(nacht.phasen)
    await expect(
      backend.ladePhasen(nacht.user, '1900-01-01', new AbortController().signal)
    ).rejects.toThrow('schlafnacht wurde nicht gefunden')
  })

  it('deutet lokal nicht geladene Phasen nicht als bestaetigten Leerzustand', async () => {
    const beispiel = (await lokalesBackend().laden()).schlaf[0]!
    speicher.setItem('vierfelder.schlaf.v2', JSON.stringify([{ ...beispiel, phasen: null }]))

    await expect(
      lokalesBackend().ladePhasen(beispiel.user, beispiel.nacht, new AbortController().signal)
    ).rejects.toThrow('schlafphasen sind lokal nicht verfuegbar')
  })

  it('beachtet ein bereits abgebrochenes Signal', async () => {
    const controller = new AbortController()
    controller.abort()
    const backend = lokalesBackend()

    await expect(backend.ladePhasen('erijon', '2026-09-03', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})

describe('lokale Pruefungsfachwahl', () => {
  beforeEach(() => {
    speicher.clear()
  })

  it('wechselt das vierte Fach in einem einzigen gespeicherten Stand', async () => {
    const backend = lokalesBackend()
    const vorher = await backend.laden()
    const aktuell = vorher.noten.faecher.find(
      (fach) => fach.user === vorher.me && fach.pruefungsfach === 4
    )!
    const ziel = vorher.noten.faecher.find(
      (fach) => fach.user === vorher.me && fach.kursart === 'gk' && fach.name === 'deutsch'
    )!

    await expect(backend.setzePruefungsfach(ziel.id, aktuell.id)).resolves.toBe(ziel.id)

    const nachher = await backend.laden()
    expect(nachher.noten.faecher.filter(
      (fach) => fach.user === nachher.me && fach.pruefungsfach === 4
    )).toEqual([expect.objectContaining({ id: ziel.id })])
  })

  it('weist einen veralteten Ausgangsstand und Sport als Ziel ab', async () => {
    const backend = lokalesBackend()
    const anfang = await backend.laden()
    const ziel = anfang.noten.faecher.find(
      (fach) => fach.user === anfang.me && fach.kursart === 'gk' && fach.name === 'deutsch'
    )!
    const sport = anfang.noten.faecher.find(
      (fach) => fach.user === anfang.me && fach.name === 'sport'
    )!

    await expect(backend.setzePruefungsfach(ziel.id, 'veraltet')).rejects.toMatchObject({
      code: '40001',
    })
    await expect(backend.setzePruefungsfach(sport.id, 'veraltet')).rejects.toThrow(
      'ungueltiges pruefungsfach'
    )
  })

  it('serialisiert Faecher und Noten zwischen lokalen Tabs ueber Web Locks', async () => {
    const vorher = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    const namen: string[] = []
    let kette = Promise.resolve<unknown>(undefined)
    const locks = {
      request<T>(name: string, _optionen: LockOptions, aktion: () => T | Promise<T>) {
        namen.push(name)
        const ergebnis = kette.then(aktion)
        kette = ergebnis.then(() => undefined, () => undefined)
        return ergebnis
      },
    }

    try {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { locks },
      })
      const tabA = lokalesBackend()
      const tabB = lokalesBackend()
      const anfang = await tabA.laden()
      const aktuell = anfang.noten.faecher.find(
        (fach) => fach.user === anfang.me && fach.pruefungsfach === 4
      )!
      const ziele = anfang.noten.faecher.filter(
        (fach) => fach.user === anfang.me && fach.kursart === 'gk' && !['sport', aktuell.name].includes(fach.name)
      )

      const ergebnisse = await Promise.allSettled([
        tabA.setzePruefungsfach(ziele[0]!.id, aktuell.id),
        tabB.setzePruefungsfach(ziele[1]!.id, aktuell.id),
      ])

      expect(ergebnisse.filter((ergebnis) => ergebnis.status === 'fulfilled')).toHaveLength(1)
      expect(ergebnisse.filter((ergebnis) => ergebnis.status === 'rejected')).toHaveLength(1)
      const noteA = {
        id: 'd0000000-0000-4000-8000-000000000001', user: anfang.me,
        fachId: ziele[0]!.id, art: 'klausur' as const, punkte: 12,
        gewicht: 10, datum: '2026-09-06', titel: 'tab a',
      }
      const noteB = {
        ...noteA,
        id: 'd0000000-0000-4000-8000-000000000002',
        fachId: ziele[1]!.id,
        titel: 'tab b',
      }
      await Promise.all([tabA.schreibeNote(noteA), tabB.schreibeNote(noteB)])

      expect(namen).toEqual([
        'vierfelder.storage.vierfelder.faecher.v2',
        'vierfelder.storage.vierfelder.faecher.v2',
        'vierfelder.storage.vierfelder.noten.v2',
        'vierfelder.storage.vierfelder.noten.v2',
      ])
      const nachher = await tabA.laden()
      expect(nachher.noten.faecher.filter(
        (fach) => fach.user === nachher.me && fach.pruefungsfach === 4
      )).toHaveLength(1)
      expect(nachher.noten.noten).toEqual(expect.arrayContaining([noteA, noteB]))
    } finally {
      if (vorher) Object.defineProperty(globalThis, 'navigator', vorher)
      else Reflect.deleteProperty(globalThis, 'navigator')
    }
  })
})

describe('lokaler Zwei-Tab-Kanal', () => {
  it('meldet Aenderungen und haelt Delete-Nachrichten fuer alte Tabs lesbar', async () => {
    const vorher = globalThis.BroadcastChannel
    class TestKanal {
      static alle: TestKanal[] = []
      private listener = new Set<(e: MessageEvent) => void>()

      constructor(_name: string) {
        TestKanal.alle.push(this)
      }

      postMessage(data: unknown) {
        for (const kanal of TestKanal.alle) {
          if (kanal === this) continue
          for (const cb of kanal.listener) cb({ data } as MessageEvent)
        }
      }

      addEventListener(_typ: string, cb: (e: MessageEvent) => void) {
        this.listener.add(cb)
      }

      removeEventListener(_typ: string, cb: (e: MessageEvent) => void) {
        this.listener.delete(cb)
      }
    }

    try {
      ;(globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = TestKanal
      vi.resetModules()
      const tabA = (await import('./lokal')).lokalesBackend()
      vi.resetModules()
      const tabB = (await import('./lokal')).lokalesBackend()
      const ereignisse: BackendEreignis[] = []
      const roheNachrichten: unknown[] = []
      const monitor = new TestKanal('vierfelder')
      monitor.addEventListener('message', (e) => roheNachrichten.push(e.data))
      const abmelden = tabB.abonniere((e) => ereignisse.push(e))

      await tabA.schreibeGewicht('2026-09-05', 81.4)
      await tabA.schreibeGewicht('2026-09-05', 0)

      expect(ereignisse).toEqual([
        {
          typ: 'gewicht', user: 'erijon', tag: '2026-09-05',
          kg: 81.4, quelle: 'getippt',
        },
        {
          typ: 'gewicht', user: 'erijon', tag: '2026-09-05',
          kg: null, quelle: 'getippt',
        },
      ])

      const einheit = {
        id: 'tab-einheit', user: 'erijon' as const, area: 'gym' as const,
        tag: '2026-09-05', wert: 60, erfasst: null,
      }
      const note = {
        id: 'tab-note', user: 'erijon' as const,
        fachId: 'a0000000-0000-4000-8000-000000000004',
        art: 'klausur' as const, punkte: 12, gewicht: 10,
        datum: '2026-09-05', titel: 'arbeit',
      }
      await tabA.schreibeEinheit(einheit)
      await tabA.loescheEinheit(einheit)
      await tabA.schreibeNote(note)
      await tabA.loescheNote(note.id)

      expect(ereignisse).toContainEqual({ typ: 'einheit', art: 'weg', id: einheit.id })
      expect(ereignisse).toContainEqual({ typ: 'note', art: 'weg', id: note.id })
      expect(roheNachrichten).toContainEqual(expect.objectContaining({
        typ: 'einheit', art: 'weg', id: einheit.id, einheit,
      }))
      expect(roheNachrichten).toContainEqual(expect.objectContaining({
        typ: 'note', art: 'weg', id: note.id, note,
      }))
      abmelden()
    } finally {
      ;(globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = vorher
      vi.resetModules()
    }
  })
})
