import { describe, expect, it } from 'vitest'
import {
  ANSAGEN_JE_WOCHE,
  ansagePunkte,
  ansageStand,
  ansageVorschlaege,
  ansageZeitraum,
  ansageZiel,
  festzuschreiben,
  neueAnsage,
  verbleibendeAnsagen,
  wochenAnsagePunkte,
  wochenVerlauf,
  zaehltAusZustand,
} from './ansagen'
import type { Ansage } from './ansagen'
import { addDays, toKey } from './dates'
import { setzeTick } from './tracker'
import { gewichtKey } from './types'
import type { AreaId, UserId, Zustand } from './types'

// die woche läuft von mo 21.09. bis so 27.09.2026, der rückblick über die vier
// wochen ab mo 24.08.
const MONTAG = new Date(2026, 8, 21, 12)
const DIENSTAG = new Date(2026, 8, 22, 12)

function leererZustand(): Zustand {
  return { einheiten: {}, gewichte: {}, aufenthalte: [] }
}

function sitzung(
  z: Zustand,
  u: UserId,
  bereich: AreaId,
  tag: string,
  { beginn = '18:00', minuten = 30, offen = false } = {}
): Zustand {
  const ankunft = new Date(`${tag}T${beginn}:00`)
  const abgang = offen ? null : new Date(ankunft.getTime() + minuten * 60_000).toISOString()
  return {
    ...z,
    aufenthalte: [
      ...z.aufenthalte,
      { user: u, bereich, ort: 'test', ankunft: ankunft.toISOString(), abgang },
    ],
  }
}

function gewogen(z: Zustand, u: UserId, tag: string): Zustand {
  return { ...z, gewichte: { ...z.gewichte, [gewichtKey(u, tag)]: 80 } }
}

/** koray boxt in den vier wochen vor dem 21.09. 1, 0, 1 und 1 mal */
function korayBoxtSelten(): Zustand {
  let z = leererZustand()
  for (const tag of ['2026-08-25', '2026-09-09', '2026-09-16']) z = sitzung(z, 'koray', 'boxen', tag)
  return z
}

function ansage(rest: Partial<Ansage> = {}): Ansage {
  return {
    id: 'a1',
    von: 'erijon',
    an: 'koray',
    feld: 'boxen',
    ab: '2026-09-22',
    bis: '2026-09-27',
    ziel: 2,
    erstelltAm: MONTAG.toISOString(),
    ...rest,
  }
}

describe('zaehltAusZustand', () => {
  it('zählt bei den bereichen nur gemessene tage', () => {
    const getippt = setzeTick(leererZustand(), 'koray', 'gym', '2026-09-22', true)
    expect(zaehltAusZustand(getippt)('koray', 'gym', '2026-09-22')).toBe(false)
    const gemessen = sitzung(getippt, 'koray', 'gym', '2026-09-22')
    expect(zaehltAusZustand(gemessen)('koray', 'gym', '2026-09-22')).toBe(true)
  })

  it('zählt beim gewicht jeden eintrag', () => {
    const z = gewogen(leererZustand(), 'koray', '2026-09-22')
    expect(zaehltAusZustand(z)('koray', 'gewicht', '2026-09-22')).toBe(true)
    expect(zaehltAusZustand(z)('erijon', 'gewicht', '2026-09-22')).toBe(false)
  })
})

describe('ansageZeitraum', () => {
  it('läuft von morgen bis sonntag', () => {
    expect(ansageZeitraum(MONTAG)).toEqual({ ab: '2026-09-22', bis: '2026-09-27' })
    expect(ansageZeitraum(new Date(2026, 8, 25, 23, 59))).toEqual({ ab: '2026-09-26', bis: '2026-09-27' })
  })

  it('gibt es ab samstag nicht mehr', () => {
    expect(ansageZeitraum(new Date(2026, 8, 26, 0, 1))).toBeNull()
    expect(ansageZeitraum(new Date(2026, 8, 27, 12))).toBeNull()
  })
})

describe('ansageZiel', () => {
  it('liegt einen tag über dem üblichen stand', () => {
    expect(ansageZiel([1, 0, 1, 1], 7)).toBe(2)
    expect(ansageZiel([3, 4, 3, 4], 7)).toBe(4)
    expect(ansageZiel([0, 0, 0, 0], 7)).toBe(1)
  })

  it('rechnet auf kürzere zeiträume herunter und rundet auf', () => {
    expect(ansageZiel([3, 4, 3, 4], 6)).toBe(4)
    expect(ansageZiel([1, 0, 1, 1], 2)).toBe(1)
  })

  it('lässt immer einen tag spielraum', () => {
    expect(ansageZiel([3, 4, 3, 4], 2)).toBeNull()
    // wer sich jeden tag wiegt, kann darin nicht herausgefordert werden
    expect(ansageZiel([7, 7, 6, 7], 6)).toBeNull()
  })
})

describe('wochenVerlauf', () => {
  it('zählt die vier wochen davor, älteste zuerst', () => {
    const zaehlt = zaehltAusZustand(korayBoxtSelten())
    expect(wochenVerlauf(zaehlt, 'koray', 'boxen', '2026-09-21')).toEqual([1, 0, 1, 1])
  })
})

describe('ansageVorschlaege', () => {
  it('schlägt je feld ein ziel aus dem verlauf vor', () => {
    const zaehlt = zaehltAusZustand(korayBoxtSelten())
    const boxen = ansageVorschlaege(zaehlt, [], 'erijon', 'koray', MONTAG).find((v) => v.feld === 'boxen')
    expect(boxen).toEqual({
      an: 'koray',
      feld: 'boxen',
      ziel: 2,
      ab: '2026-09-22',
      bis: '2026-09-27',
      verlauf: [1, 0, 1, 1],
    })
  })

  it('lässt felder weg, in denen man diese woche schon angesagt hat', () => {
    const zaehlt = zaehltAusZustand(korayBoxtSelten())
    const felder = ansageVorschlaege(zaehlt, [ansage()], 'erijon', 'koray', DIENSTAG).map((v) => v.feld)
    expect(felder).toEqual(['gym', 'lesen', 'gewicht'])
  })

  it('ist leer ohne kontingent oder zeitraum', () => {
    const zaehlt = zaehltAusZustand(leererZustand())
    const verbraucht = [ansage({ id: 'a' }), ansage({ id: 'b', feld: 'gym' })]
    expect(ansageVorschlaege(zaehlt, verbraucht, 'erijon', 'koray', DIENSTAG)).toEqual([])
    expect(ansageVorschlaege(zaehlt, [], 'erijon', 'koray', new Date(2026, 8, 26, 9))).toEqual([])
    expect(ansageVorschlaege(zaehlt, [], 'erijon', 'erijon', DIENSTAG)).toEqual([])
  })
})

describe('neueAnsage', () => {
  const zaehlt = zaehltAusZustand(korayBoxtSelten())

  it('übernimmt ziel und zeitraum aus dem vorschlag', () => {
    expect(neueAnsage(zaehlt, [], 'erijon', 'koray', 'boxen', MONTAG, 'x')).toEqual({
      ansage: ansage({ id: 'x' }),
    })
  })

  it('sagt, warum es nicht geht', () => {
    expect(neueAnsage(zaehlt, [], 'erijon', 'erijon', 'boxen', MONTAG, 'x')).toEqual({ fehler: 'selbst' })
    const zwei = [ansage({ id: 'a', feld: 'gym' }), ansage({ id: 'b', feld: 'lesen' })]
    expect(neueAnsage(zaehlt, zwei, 'erijon', 'koray', 'boxen', MONTAG, 'x')).toEqual({
      fehler: 'keineAnsagenMehr',
    })
    expect(neueAnsage(zaehlt, [], 'erijon', 'koray', 'boxen', new Date(2026, 8, 26), 'x')).toEqual({
      fehler: 'zuSpaet',
    })
    expect(neueAnsage(zaehlt, [ansage()], 'erijon', 'koray', 'boxen', DIENSTAG, 'x')).toEqual({
      fehler: 'schonAngesagt',
    })
  })

  it('verweigert ein feld ohne erreichbares ziel', () => {
    let z = leererZustand()
    // jeden tag gewogen, vier wochen lang
    for (let i = 0; i < 28; i++) z = gewogen(z, 'koray', toKey(addDays(new Date(2026, 7, 24), i)))
    expect(neueAnsage(zaehltAusZustand(z), [], 'erijon', 'koray', 'gewicht', MONTAG, 'x')).toEqual({
      fehler: 'keinZiel',
    })
  })
})

describe('ansageStand', () => {
  it('läuft, solange noch tage offen sind', () => {
    const zaehlt = zaehltAusZustand(leererZustand())
    expect(ansageStand(zaehlt, ansage(), new Date(2026, 8, 23, 9))).toEqual({
      status: 'laeuft',
      erreicht: 0,
      ziel: 2,
      offeneTage: 5,
    })
  })

  it('ist geschafft, sobald das ziel erreicht ist', () => {
    let z = sitzung(leererZustand(), 'koray', 'boxen', '2026-09-22')
    z = sitzung(z, 'koray', 'boxen', '2026-09-24')
    expect(ansageStand(zaehltAusZustand(z), ansage(), new Date(2026, 8, 24, 20)).status).toBe('geschafft')
  })

  it('ist verfehlt, sobald die übrigen tage nicht mehr reichen', () => {
    const z = sitzung(leererZustand(), 'koray', 'boxen', '2026-09-22')
    const zaehlt = zaehltAusZustand(z)
    expect(ansageStand(zaehlt, ansage(), new Date(2026, 8, 27, 23)).status).toBe('laeuft')
    expect(ansageStand(zaehlt, ansage(), new Date(2026, 8, 28, 0, 1)).status).toBe('verfehlt')
  })

  it('bleibt beim festgeschriebenen ergebnis, auch wenn später etwas nachkommt', () => {
    let z = leererZustand()
    const a = ansage({ entschieden: { ergebnis: 'verfehlt', am: '2026-09-28T01:00:00.000Z' } })
    z = sitzung(z, 'koray', 'boxen', '2026-09-22')
    z = sitzung(z, 'koray', 'boxen', '2026-09-23')
    expect(ansageStand(zaehltAusZustand(z), a, new Date(2026, 8, 29)).status).toBe('verfehlt')
  })
})

describe('festzuschreiben', () => {
  it('schreibt geschafft sofort fest', () => {
    let z = sitzung(leererZustand(), 'koray', 'boxen', '2026-09-22')
    z = sitzung(z, 'koray', 'boxen', '2026-09-23')
    const jetzt = new Date(2026, 8, 23, 20)
    expect(festzuschreiben(z, zaehltAusZustand(z), ansage(), jetzt)).toEqual({
      ergebnis: 'geschafft',
      am: jetzt.toISOString(),
    })
  })

  it('schreibt verfehlt erst nach dem letzten tag fest', () => {
    const z = leererZustand()
    const zaehlt = zaehltAusZustand(z)
    // rechnerisch steht es am sonntag schon fest, eingefroren wird trotzdem erst danach
    expect(festzuschreiben(z, zaehlt, ansage(), new Date(2026, 8, 27, 12))).toBeNull()
    expect(festzuschreiben(z, zaehlt, ansage(), new Date(2026, 8, 28, 0, 1))?.ergebnis).toBe('verfehlt')
  })

  it('wartet auf eine sitzung vom sonntagabend, die über mitternacht läuft', () => {
    let z = sitzung(leererZustand(), 'koray', 'boxen', '2026-09-22')
    z = sitzung(z, 'koray', 'boxen', '2026-09-27', { beginn: '23:45', offen: true })
    const nachMitternacht = new Date(2026, 8, 28, 0, 5)
    expect(festzuschreiben(z, zaehltAusZustand(z), ansage(), nachMitternacht)).toBeNull()

    // die sitzung endet um 00:20 und zählt zum sonntag
    const beendet = sitzung(leererZustand(), 'koray', 'boxen', '2026-09-22')
    const mitSonntag = sitzung(beendet, 'koray', 'boxen', '2026-09-27', { beginn: '23:45', minuten: 35 })
    expect(festzuschreiben(mitSonntag, zaehltAusZustand(mitSonntag), ansage(), new Date(2026, 8, 28, 0, 25))?.ergebnis).toBe(
      'geschafft'
    )
  })

  it('wartet nicht ewig auf einen vergessenen fokus', () => {
    const z = sitzung(leererZustand(), 'koray', 'boxen', '2026-09-27', { beginn: '23:45', offen: true })
    expect(festzuschreiben(z, zaehltAusZustand(z), ansage(), new Date(2026, 8, 28, 3, 1))?.ergebnis).toBe(
      'verfehlt'
    )
  })

  it('schreibt nichts zweimal fest', () => {
    const a = ansage({ entschieden: { ergebnis: 'verfehlt', am: '2026-09-28T01:00:00.000Z' } })
    const z = leererZustand()
    expect(festzuschreiben(z, zaehltAusZustand(z), a, new Date(2026, 8, 29))).toBeNull()
  })
})

describe('ansagePunkte', () => {
  it('hält den einsatz, solange die ansage läuft', () => {
    expect(ansagePunkte('laeuft', ansage())).toEqual({ erijon: -1, koray: 0 })
  })

  it('gibt den einsatz zurück und einen punkt obendrauf, wenn die andere person scheitert', () => {
    expect(ansagePunkte('verfehlt', ansage())).toEqual({ erijon: 1, koray: 0 })
  })

  it('behält den einsatz, wenn die andere person liefert', () => {
    expect(ansagePunkte('geschafft', ansage())).toEqual({ erijon: -1, koray: 0 })
  })
})

describe('wochenAnsagePunkte', () => {
  it('summiert die ansagen der woche mit laufenden einsätzen', () => {
    const z = sitzung(sitzung(leererZustand(), 'erijon', 'gym', '2026-09-22'), 'erijon', 'gym', '2026-09-23')
    const ansagen = [
      // koray verfehlt: erijon +1
      ansage({ id: 'a', entschieden: { ergebnis: 'verfehlt', am: '2026-09-28T01:00:00.000Z' } }),
      // erijon hat geliefert: koray -1
      ansage({ id: 'b', von: 'koray', an: 'erijon', feld: 'gym' }),
      // läuft noch: erijon -1
      ansage({ id: 'c', feld: 'lesen' }),
      // andere woche
      ansage({ id: 'd', ab: '2026-09-29', bis: '2026-10-04' }),
    ]
    expect(wochenAnsagePunkte(zaehltAusZustand(z), ansagen, '2026-09-21', new Date(2026, 8, 24))).toEqual({
      erijon: 0,
      koray: -1,
    })
  })
})

describe('verbleibendeAnsagen', () => {
  it('zählt nur die eigenen ansagen der laufenden woche', () => {
    const ansagen = [
      ansage({ id: 'a' }),
      ansage({ id: 'b', von: 'koray', an: 'erijon' }),
      ansage({ id: 'c', erstelltAm: new Date(2026, 8, 14, 12).toISOString() }),
    ]
    expect(verbleibendeAnsagen(ansagen, 'erijon', DIENSTAG)).toBe(ANSAGEN_JE_WOCHE - 1)
    expect(verbleibendeAnsagen([], 'erijon', DIENSTAG)).toBe(ANSAGEN_JE_WOCHE)
  })
})
