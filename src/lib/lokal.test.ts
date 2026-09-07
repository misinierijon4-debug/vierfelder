import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackendEreignis } from './backend'
import { lokalesBackend } from './lokal'
import { tickKey } from './types'
import type { Einheit } from './types'

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

  it('entfernt einen laufenden Wetteinsatz, ohne ein Wochenarchiv zu veraendern', async () => {
    speicher.setItem('vierfelder.abrechnung.v1', '[]')
    const backend = lokalesBackend()
    const gesetzt = await backend.schreibeWette('2026-08-31', 'verlierer kocht', '0')
    const geloescht = await backend.schreibeWette('2026-08-31', '', gesetzt.version)

    const stand = await backend.laden()
    expect(stand.wetten).not.toHaveProperty('2026-08-31')
    expect(stand.wettenMeta['2026-08-31']?.version).toBe(geloescht.version)
  })

  it('friert die Wette unter demselben Lock mit dem Wochenarchiv ein', async () => {
    speicher.setItem('vierfelder.abrechnung.v1', '[]')
    const backend = lokalesBackend()
    const gesetzt = await backend.schreibeWette('2026-09-07', 'kanonisch', '0')
    const archiv = await backend.schreibeAbrechnung({
      woche: '2026-09-07', sieger: 'erijon', grund: 'punkte', differenz: 1,
      belegErijon: 1, belegKoray: 0, wette: 'stale clientwert',
      abgeschlossen: '2026-09-13T16:00:00.000Z',
    })
    expect(archiv.wette).toBe('kanonisch')
    await expect(
      backend.schreibeWette('2026-09-07', '', gesetzt.version)
    ).rejects.toMatchObject({ code: '23514' })
    expect((await backend.laden()).wetten['2026-09-07']).toBe('kanonisch')
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
        'vierfelder.storage.vierfelder.einheiten.v1',
        'vierfelder.storage.vierfelder.wetten.v1',
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

  it('verliert bei parallelen lokalen Tabs keine Einheiten und bindet Gewichte an die Backend-Person', async () => {
    const vorher = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    let kette = Promise.resolve<unknown>(undefined)
    const locks = {
      request<T>(_name: string, _optionen: LockOptions, aktion: () => T | Promise<T>) {
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
      speicher.setItem('vierfelder.me.v2', 'erijon')
      const tabA = lokalesBackend()
      speicher.setItem('vierfelder.me.v2', 'koray')
      const tabB = lokalesBackend()
      const einheitA = {
        id: 'tab-a', user: 'erijon' as const, area: 'gym' as const,
        tag: '2026-09-06', wert: 50, erfasst: null,
      }
      const einheitB = {
        id: 'tab-b', user: 'koray' as const, area: 'boxen' as const,
        tag: '2026-09-06', wert: 40, erfasst: null,
      }

      await Promise.all([
        tabA.schreibeEinheit(einheitA),
        tabB.schreibeEinheit(einheitB),
        tabA.schreibeGewicht('2026-09-06', 81.2),
        tabB.schreibeGewicht('2026-09-06', 90.4),
      ])

      const standA = await tabA.laden()
      const standB = await tabB.laden()
      expect(standA.me).toBe('erijon')
      expect(standB.me).toBe('koray')
      expect(Object.values(standA.einheiten).flat()).toEqual(
        expect.arrayContaining([einheitA, einheitB])
      )
      expect(standA.gewichte).toMatchObject({
        'erijon|2026-09-06': 81.2,
        'koray|2026-09-06': 90.4,
      })
    } finally {
      if (vorher) Object.defineProperty(globalThis, 'navigator', vorher)
      else Reflect.deleteProperty(globalThis, 'navigator')
    }
  })

  it('prueft Einheiten-Wert und -Zeit unter dem Web Lock gegen den erwarteten Altstand', async () => {
    const vorher = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    let kette = Promise.resolve<unknown>(undefined)
    const locks = {
      request<T>(_name: string, _optionen: LockOptions, aktion: () => T | Promise<T>) {
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
      const schreibkette = {
        id: 'cas-kette', user: 'erijon' as const, area: 'gym' as const,
        tag: '2026-09-06', wert: 50, erfasst: null, von: null,
      }

      await tabA.schreibeEinheit(schreibkette)
      await tabA.schreibeEinheitWert(schreibkette, 60)
      await tabA.schreibeEinheitWert({ ...schreibkette, wert: 60 }, 70)

      const konkurrenz = {
        ...schreibkette,
        id: 'cas-konkurrenz',
      }
      await tabA.schreibeEinheit(konkurrenz)
      const wertErgebnisse = await Promise.allSettled([
        tabA.schreibeEinheitWert(konkurrenz, 60),
        tabB.schreibeEinheitWert(konkurrenz, 70),
      ])
      expect(wertErgebnisse.filter((ergebnis) => ergebnis.status === 'fulfilled')).toHaveLength(1)
      expect(wertErgebnisse.find((ergebnis) => ergebnis.status === 'rejected')).toMatchObject({
        reason: expect.objectContaining({ code: '40001' }),
      })

      const zeitErgebnisse = await Promise.allSettled([
        tabA.schreibeEinheitVon(konkurrenz, '2026-09-06T18:00:00.000Z'),
        tabB.schreibeEinheitVon(konkurrenz, '2026-09-06T19:00:00.000Z'),
      ])
      expect(zeitErgebnisse.filter((ergebnis) => ergebnis.status === 'fulfilled')).toHaveLength(1)
      expect(zeitErgebnisse.find((ergebnis) => ergebnis.status === 'rejected')).toMatchObject({
        reason: expect.objectContaining({ code: '40001' }),
      })

      const einheiten = Object.values((await tabA.laden()).einheiten).flat()
      expect(einheiten.find((einheit) => einheit.id === schreibkette.id)?.wert).toBe(70)
      expect([60, 70]).toContain(einheiten.find((einheit) => einheit.id === konkurrenz.id)?.wert)
      expect([
        '2026-09-06T18:00:00.000Z',
        '2026-09-06T19:00:00.000Z',
      ]).toContain(einheiten.find((einheit) => einheit.id === konkurrenz.id)?.von)
    } finally {
      if (vorher) Object.defineProperty(globalThis, 'navigator', vorher)
      else Reflect.deleteProperty(globalThis, 'navigator')
    }
  })

  it('entscheidet konkurrierende gleiche IDs und Wochen unter derselben Sperre deterministisch', async () => {
    const vorher = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    let kette = Promise.resolve<unknown>(undefined)
    const locks = {
      request<T>(_name: string, _optionen: LockOptions, aktion: () => T | Promise<T>) {
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
      const zuerst = {
        id: 'gleich', user: 'erijon' as const, area: 'gym' as const,
        tag: '2026-09-06', wert: 50, erfasst: null,
      }

      await Promise.all([
        tabA.schreibeEinheit(zuerst),
        tabB.schreibeEinheit({ ...zuerst, wert: 99 }),
      ])
      speicher.setItem('vierfelder.abrechnung.v1', '[]')
      const ergebnisse = await Promise.allSettled([
        tabA.schreibeWette('2026-09-07', 'zuerst', '0'),
        tabB.schreibeWette('2026-09-07', 'danach', '0'),
      ])

      const stand = await tabA.laden()
      expect(Object.values(stand.einheiten).flat().filter((e) => e.id === 'gleich')).toEqual([zuerst])
      expect(ergebnisse.filter((ergebnis) => ergebnis.status === 'fulfilled')).toHaveLength(1)
      expect(ergebnisse.find((ergebnis) => ergebnis.status === 'rejected')).toMatchObject({
        reason: expect.objectContaining({ code: '40001' }),
      })
      expect(['zuerst', 'danach']).toContain(stand.wetten['2026-09-07'])
    } finally {
      if (vorher) Object.defineProperty(globalThis, 'navigator', vorher)
      else Reflect.deleteProperty(globalThis, 'navigator')
    }
  })

  it('versioniert Altbestand deterministisch und schliesst Set/Delete/Undo-ABA aus', async () => {
    const vorher = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    let kette = Promise.resolve<unknown>(undefined)
    const locks = {
      request<T>(_name: string, _optionen: LockOptions, aktion: () => T | Promise<T>) {
        const ergebnis = kette.then(aktion)
        kette = ergebnis.then(() => undefined, () => undefined)
        return ergebnis
      },
    }
    try {
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks } })
      speicher.setItem('vierfelder.abrechnung.v1', '[]')
      speicher.setItem('vierfelder.wetten.v1', JSON.stringify({
        '2026-09-14': 'spaeter',
        '2026-09-07': 'zuerst',
      }))
      const backend = lokalesBackend()
      const alt = await backend.laden()
      expect(alt.wettenMeta['2026-09-07']?.version).toBe('1')
      expect(alt.wettenMeta['2026-09-14']?.version).toBe('2')

      const gesetzt = await backend.schreibeWette('2026-09-07', 'neu', '1')
      const geloescht = await backend.schreibeWette('2026-09-07', '', gesetzt.version)
      const undo = await backend.schreibeWette('2026-09-07', 'neu', geloescht.version)
      await expect(
        backend.schreibeWette('2026-09-07', 'stale', gesetzt.version)
      ).rejects.toMatchObject({ code: '40001' })
      expect(undo.version).toBe('5')
      expect((await backend.laden()).wetten['2026-09-07']).toBe('neu')
    } finally {
      if (vorher) Object.defineProperty(globalThis, 'navigator', vorher)
      else Reflect.deleteProperty(globalThis, 'navigator')
    }
  })

  it('importiert den Wert eines noch offenen alten Tabs als neue Version', async () => {
    speicher.setItem('vierfelder.abrechnung.v1', '[]')
    const backend = lokalesBackend()
    const gesetzt = await backend.schreibeWette('2026-09-07', 'neuer tab', '0')

    // Alte Builds schreiben nur den historischen Nutzwert-Key und kennen die
    // CAS-Metadaten nicht.
    speicher.setItem('vierfelder.wetten.v1', JSON.stringify({
      '2026-09-07': 'alter tab gewinnt spaeter',
    }))

    const importiert = await backend.laden()
    expect(importiert.wetten['2026-09-07']).toBe('alter tab gewinnt spaeter')
    expect(BigInt(importiert.wettenMeta['2026-09-07']!.version)).toBeGreaterThan(
      BigInt(gesetzt.version)
    )
    await expect(
      backend.schreibeWette('2026-09-07', 'staler overwrite', gesetzt.version)
    ).rejects.toMatchObject({ code: '40001' })
  })

  it('versioniert auch ein Legacy-Loeschen als Tombstone', async () => {
    speicher.setItem('vierfelder.abrechnung.v1', '[]')
    const backend = lokalesBackend()
    const gesetzt = await backend.schreibeWette('2026-09-07', 'wird entfernt', '0')

    speicher.setItem('vierfelder.wetten.v1', '{}')
    const importiert = await backend.laden()

    expect(importiert.wetten).not.toHaveProperty('2026-09-07')
    expect(BigInt(importiert.wettenMeta['2026-09-07']!.version)).toBeGreaterThan(
      BigInt(gesetzt.version)
    )
    const meta = JSON.parse(speicher.getItem('vierfelder.wetten.meta.v1')!)
    expect(meta.wochen['2026-09-07'].inhalt).toBeNull()
  })

  it('meldet einen lokalen Speicherfehler, statt eine erfolgreiche Wette vorzutäuschen', async () => {
    const vorher = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    const locks = {
      request<T>(_name: string, _optionen: LockOptions, aktion: () => T | Promise<T>) {
        return Promise.resolve(aktion())
      },
    }
    const setItem = vi.spyOn(speicher, 'setItem')

    try {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { locks },
      })
      setItem.mockImplementationOnce(() => {
        throw new Error('speicher voll')
      })

      await expect(lokalesBackend().schreibeWette('2026-09-07', 'abendessen', '0')).rejects.toThrow(
        'speicher voll'
      )
      expect(speicher.getItem('vierfelder.wetten.v1')).toBeNull()
    } finally {
      setItem.mockRestore()
      if (vorher) Object.defineProperty(globalThis, 'navigator', vorher)
      else Reflect.deleteProperty(globalThis, 'navigator')
    }
  })
})

describe('lokale atomare Einheiten-Wiederherstellung', () => {
  const key = 'vierfelder.einheiten.v1'
  const erste: Einheit = {
    id: '11111111-1111-4111-8111-111111111111',
    user: 'erijon',
    area: 'gym',
    tag: '2026-09-06',
    wert: 45,
    erfasst: '2026-09-06T15:00:00.000Z',
    von: null,
  }
  const zweite: Einheit = {
    ...erste,
    id: '22222222-2222-4222-8222-222222222222',
    wert: 30,
    erfasst: '2026-09-06T18:00:00.000Z',
    von: '2026-09-06T17:30:00.000Z',
  }

  beforeEach(() => {
    speicher.clear()
  })

  it('laesst bei einem dauerhaften Speicherfehler keine Teilmenge zurueck', async () => {
    const vorher: Einheit = {
      ...erste,
      id: '33333333-3333-4333-8333-333333333333',
      tag: '2026-09-05',
    }
    speicher.setItem(key, JSON.stringify([vorher]))
    const setItem = vi.spyOn(speicher, 'setItem').mockImplementationOnce(() => {
      throw new Error('speicher voll')
    })

    try {
      await expect(
        lokalesBackend().stelleEinheitenWiederHer([erste, zweite])
      ).rejects.toThrow('speicher voll')
      expect(JSON.parse(speicher.getItem(key)!)).toEqual([vorher])
      expect(setItem).toHaveBeenCalledOnce()
    } finally {
      setItem.mockRestore()
    }
  })

  it('prueft jede Kollision vor dem einzigen Schreibzug', async () => {
    const kollidierend = { ...zweite, wert: 99 }
    speicher.setItem(key, JSON.stringify([kollidierend]))
    const setItem = vi.spyOn(speicher, 'setItem')

    try {
      await expect(
        lokalesBackend().stelleEinheitenWiederHer([erste, zweite])
      ).rejects.toMatchObject({ code: '40001' })
      expect(JSON.parse(speicher.getItem(key)!)).toEqual([kollidierend])
      expect(setItem).not.toHaveBeenCalled()
    } finally {
      setItem.mockRestore()
    }
  })

  it('bestaetigt den identischen Retry ohne zweite Speicher-Schreibung', async () => {
    const backend = lokalesBackend()
    const setItem = vi.spyOn(speicher, 'setItem')

    try {
      await backend.stelleEinheitenWiederHer([erste, zweite])
      await backend.stelleEinheitenWiederHer([erste, zweite])
      expect(setItem).toHaveBeenCalledOnce()
      expect(JSON.parse(speicher.getItem(key)!)).toEqual([erste, zweite])
    } finally {
      setItem.mockRestore()
    }
  })

  it('heilt eine bereits vorhandene exakte Teilmenge mit genau einer Schreibung', async () => {
    speicher.setItem(key, JSON.stringify([erste]))
    const setItem = vi.spyOn(speicher, 'setItem')

    try {
      await lokalesBackend().stelleEinheitenWiederHer([erste, zweite])
      expect(setItem).toHaveBeenCalledOnce()
      expect(JSON.parse(speicher.getItem(key)!)).toEqual([erste, zweite])
    } finally {
      setItem.mockRestore()
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
