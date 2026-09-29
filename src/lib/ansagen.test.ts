import { describe, expect, it } from 'vitest'
import {
  ANSAGEN_JE_WOCHE,
  AnsageAbgelehnt,
  ansageFehlerAus,
  ansageFenster,
  ansageFrist,
  ansageKandidaten,
  ansagePunkte,
  ansageStand,
  ansageVorschlaege,
  ansageZiele,
  ansageZielText,
  festzuschreiben,
  gewerteterStatus,
  istAnsage,
  neueAnsage,
  offeneAnsageWende,
  reagiere,
  reaktionsLage,
  verbleibendeAnsagen,
  vorlageSpruch,
  wirksamerEinsatz,
  wochenAnsagePunkte,
  wochenVerlauf,
  zaehltAusZustand,
} from './ansagen'
import type { Ansage } from './ansagen'
import { addDays, toKey } from './dates'
import { fuegeEinheitHinzu } from './tracker'
import { gewichtKey } from './types'
import type { AreaId, UserId, Zustand } from './types'

// die woche läuft von mo 21.09. bis so 27.09.2026, frist so 18 uhr. der
// rückblick geht über die vier wochen ab mo 24.08.
const MONTAG = new Date(2026, 8, 21, 10)
const DIENSTAG = new Date(2026, 8, 22, 12)
const FRIST = new Date(2026, 8, 27, 18)
const MONTAG_ABEND = new Date(2026, 8, 21, 20)

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
    aufenthalte: [...z.aufenthalte, { user: u, bereich, ort: 'test', ankunft: ankunft.toISOString(), abgang }],
  }
}

/** eine getippte einheit für `tag`, eingetragen um `erfasst` */
function getippt(z: Zustand, u: UserId, bereich: AreaId, tag: string, erfasst: string): Zustand {
  return fuegeEinheitHinzu(z, {
    id: `${u}-${bereich}-${tag}-${erfasst}`,
    user: u,
    area: bereich,
    tag,
    wert: null,
    erfasst: new Date(erfasst).toISOString(),
  })
}

function gewogen(z: Zustand, u: UserId, tag: string): Zustand {
  return { ...z, gewichte: { ...z.gewichte, [gewichtKey(u, tag)]: 80 } }
}

/** koray boxt in den vier wochen vor dem 21.09. 1, 2, 3 und 2 mal — schnitt 2 */
function korayBoxt(): Zustand {
  let z = leererZustand()
  for (const tag of [
    '2026-08-25',
    '2026-09-01', '2026-09-03',
    '2026-09-08', '2026-09-10', '2026-09-12',
    '2026-09-15', '2026-09-17',
  ]) z = sitzung(z, 'koray', 'boxen', tag)
  return z
}

function ansage(rest: Partial<Ansage> = {}): Ansage {
  return {
    id: 'a1',
    version: 2,
    von: 'erijon',
    an: 'koray',
    feld: 'boxen',
    stufe: 'mutig',
    einsatz: 2,
    ab: '2026-09-21',
    bis: '2026-09-27',
    ziel: 3,
    erstelltAm: MONTAG.toISOString(),
    ...rest,
  }
}

describe('zaehltAusZustand', () => {
  const ab = MONTAG
  it('zählt eine sitzung nach der ansage, nicht davor', () => {
    let z = sitzung(leererZustand(), 'koray', 'boxen', '2026-09-21', { beginn: '08:00' })
    expect(zaehltAusZustand(z).ehrlich('koray', 'boxen', '2026-09-21', ab, FRIST)).toBe(false)
    z = sitzung(z, 'koray', 'boxen', '2026-09-21', { beginn: '19:00' })
    expect(zaehltAusZustand(z).ehrlich('koray', 'boxen', '2026-09-21', ab, FRIST)).toBe(true)
  })

  it('zählt getippt nur am selben tag eingetragen und nach der ansage', () => {
    const selberTag = getippt(leererZustand(), 'koray', 'boxen', '2026-09-22', '2026-09-22T20:00:00')
    expect(zaehltAusZustand(selberTag).ehrlich('koray', 'boxen', '2026-09-22', ab, FRIST)).toBe(true)
    const nachgetragen = getippt(leererZustand(), 'koray', 'boxen', '2026-09-22', '2026-09-23T09:00:00')
    expect(zaehltAusZustand(nachgetragen).ehrlich('koray', 'boxen', '2026-09-22', ab, FRIST)).toBe(false)
    const vorher = getippt(leererZustand(), 'koray', 'boxen', '2026-09-21', '2026-09-21T09:00:00')
    expect(zaehltAusZustand(vorher).ehrlich('koray', 'boxen', '2026-09-21', ab, FRIST)).toBe(false)
  })

  it('zählt keine sitzung, die erst nach der frist fertig ist', () => {
    const z = sitzung(leererZustand(), 'koray', 'boxen', '2026-09-27', { beginn: '17:45', minuten: 30 })
    expect(zaehltAusZustand(z).ehrlich('koray', 'boxen', '2026-09-27', ab, FRIST)).toBe(false)
  })

  it('zählt das gewicht ab dem tag der ansage', () => {
    const z = gewogen(gewogen(leererZustand(), 'koray', '2026-09-20'), 'koray', '2026-09-22')
    const zaehlt = zaehltAusZustand(z)
    expect(zaehlt.ehrlich('koray', 'gewicht', '2026-09-20', ab, FRIST)).toBe(false)
    expect(zaehlt.ehrlich('koray', 'gewicht', '2026-09-22', ab, FRIST)).toBe(true)
  })

  it('zählt für die form getippt und gemessen wie im duell', () => {
    const z = getippt(leererZustand(), 'koray', 'lesen', '2026-09-02', '2026-09-05T09:00:00')
    expect(zaehltAusZustand(z).gesetzt('koray', 'lesen', '2026-09-02')).toBe(true)
  })
})

describe('training aus gym und boxen', () => {
  it('zählt beide bereiche pro tag einmal, für beide personen', () => {
    let z = korayBoxt()
    z = sitzung(z, 'koray', 'gym', '2026-09-01')
    z = sitzung(z, 'erijon', 'gym', '2026-09-22')
    z = getippt(z, 'erijon', 'boxen', '2026-09-22', '2026-09-22T20:00:00')
    const zaehlt = zaehltAusZustand(z)
    expect(wochenVerlauf(zaehlt, 'koray', 'training', '2026-09-21')).toEqual([1, 2, 3, 2])
    expect(zaehlt.ehrlich('erijon', 'training', '2026-09-22', MONTAG, FRIST)).toBe(true)
    expect(ansageStand(zaehlt, ansage({ an: 'erijon', von: 'koray', feld: 'training', ziel: 2 }), DIENSTAG).erreicht).toBe(1)
    expect(zaehlt.ehrlich('koray', 'boxen', '2026-09-22', MONTAG, FRIST)).toBe(false)
  })
})

describe('ansageFenster', () => {
  it('läuft ab heute bis sonntag 18 uhr', () => {
    expect(ansageFenster(MONTAG)).toEqual({ ab: '2026-09-21', bis: '2026-09-27', frist: FRIST, verfuegbar: 7 })
  })

  it('braucht 48 stunden bis zur frist: freitag 18 uhr geht noch, eine minute später nicht', () => {
    expect(ansageFenster(new Date(2026, 8, 25, 18, 0))?.verfuegbar).toBe(3)
    expect(ansageFenster(new Date(2026, 8, 25, 18, 1))).toBeNull()
    expect(ansageFenster(new Date(2026, 8, 26, 9))).toBeNull()
  })
})

describe('ansageZiele', () => {
  it('nimmt die mindestwerte, wenn die form niedrig ist', () => {
    expect(ansageZiele('lesen', [0, 1, 0, 1], 7)).toEqual({ sicher: 2, mutig: 3, allin: 4 })
    expect(ansageZiele('gewicht', [1, 1, 1, 1], 7)).toEqual({ sicher: 4, mutig: 5, allin: 6 })
    expect(ansageZiele('lernen', [0, 0, 1, 1], 7)).toEqual({ sicher: 2, mutig: 3, allin: 4 })
  })

  it('liegt über der eigenen form: schnitt mal 1,3, 1,6 und 2, aufgerundet', () => {
    // schnitt 3: 3,9 → 4, 4,8 → 5, 6
    expect(ansageZiele('boxen', [3, 3, 3, 3], 7)).toEqual({ sicher: 4, mutig: 5, allin: 6 })
  })

  it('rundet ohne fließkomma-fehler und hält jede stufe über der vorigen', () => {
    // schnitt 2,5: 3,25 → 4, 4,0 → 4 → wird 5, 5 → wird 6
    expect(ansageZiele('boxen', [2, 3, 2, 3], 7)).toEqual({ sicher: 4, mutig: 5, allin: 6 })
  })

  it('muss in die woche passen: sicher und mutig mit einem tag spielraum, all-in ohne', () => {
    expect(ansageZiele('boxen', [0, 0, 1, 1], 3)).toEqual({ sicher: 2, mutig: null, allin: null })
    expect(ansageZiele('boxen', [0, 0, 1, 1], 4)).toEqual({ sicher: 2, mutig: 3, allin: 4 })
    expect(ansageZiele('gewicht', [7, 7, 7, 7], 7).sicher).toBeNull()
  })
})

describe('wochenVerlauf', () => {
  it('zählt die vier wochen davor, älteste zuerst', () => {
    expect(wochenVerlauf(zaehltAusZustand(korayBoxt()), 'koray', 'boxen', '2026-09-21')).toEqual([1, 2, 3, 2])
  })
})

describe('ansageKandidaten', () => {
  it('sperrt felder, die die andere person gar nicht macht', () => {
    const k = ansageKandidaten(zaehltAusZustand(korayBoxt()), [], 'erijon', 'koray', MONTAG)
    expect(k.map((x) => x.feld)).toEqual(['training', 'lesen', 'lernen', 'gewicht'])
    const boxen = k.find((x) => x.feld === 'training')!
    expect(boxen.gesperrt).toBeNull()
    expect(boxen.schnitt).toBe(2)
    expect(boxen.ziele).toEqual({ sicher: 3, mutig: 4, allin: 5 })
  })

  it('sperrt ein feld, in dem man schon angesagt hat, und das zweite all-in', () => {
    const vorher = [ansage({ id: 'x', feld: 'lesen', stufe: 'allin', einsatz: 3 })]
    const k = ansageKandidaten(zaehltAusZustand(korayBoxt()), vorher, 'erijon', 'koray', DIENSTAG)
    expect(k.find((x) => x.feld === 'lesen')?.gesperrt).toBe('schonAngesagt')
    expect(k.find((x) => x.feld === 'training')?.ziele.allin).toBeNull()
  })

  it('ist leer ohne kontingent oder nach freitag 18 uhr', () => {
    const zaehlt = zaehltAusZustand(korayBoxt())
    const zwei = [ansage({ id: 'x' }), ansage({ id: 'y', feld: 'lesen' })]
    expect(ansageKandidaten(zaehlt, zwei, 'erijon', 'koray', DIENSTAG)).toEqual([])
    expect(ansageKandidaten(zaehlt, [], 'erijon', 'koray', new Date(2026, 8, 26, 9))).toEqual([])
    expect(ansageKandidaten(zaehlt, [], 'erijon', 'erijon', MONTAG)).toEqual([])
  })

  it('empfiehlt die höchste stufe, die man selbst schafft', () => {
    let z = korayBoxt()
    // erijon boxt selbst 4× je woche
    for (let w = 0; w < 4; w++) {
      for (let i = 0; i < 4; i++) z = sitzung(z, 'erijon', 'boxen', toKey(addDays(new Date(2026, 7, 24), 7 * w + i)))
    }
    const k = ansageKandidaten(zaehltAusZustand(z), [], 'erijon', 'koray', MONTAG)
    // erijon schafft ⌈4 × 1,3⌉ = 6 → all-in (5) tut nicht weh
    expect(k.find((x) => x.feld === 'training')?.empfohlen).toBe('allin')
    expect(ansageKandidaten(zaehltAusZustand(korayBoxt()), [], 'erijon', 'koray', MONTAG)
      .find((x) => x.feld === 'training')?.empfohlen).toBe('sicher')
  })
})

describe('ansageVorschlaege', () => {
  it('nennt nur ansagbare felder mit empfohlener stufe', () => {
    const v = ansageVorschlaege(zaehltAusZustand(korayBoxt()), [], 'erijon', 'koray', MONTAG)
    expect(v.map((x) => [x.feld, x.stufe, x.ziel])).toEqual([['training', 'sicher', 3]])
  })

  it('schlägt lernen erst ab zwei tagen vor, auch wenn es selten ist', () => {
    let z = leererZustand()
    for (const tag of ['2026-09-01', '2026-09-15']) z = sitzung(z, 'koray', 'lernen', tag)
    const v = ansageVorschlaege(zaehltAusZustand(z), [], 'erijon', 'koray', MONTAG)
    expect(v.map((x) => [x.feld, x.stufe, x.ziel])).toEqual([['lernen', 'sicher', 2]])
  })
})

describe('neueAnsage', () => {
  const zaehlt = zaehltAusZustand(korayBoxt())

  it('übernimmt ziel, einsatz und fenster aus der stufe', () => {
    const r = neueAnsage(zaehlt, [], 'erijon', 'koray', 'training', 'allin', MONTAG, 'neu')
    expect(r).toEqual({
      ansage: {
        id: 'neu',
        version: 2,
        von: 'erijon',
        an: 'koray',
        feld: 'training',
        stufe: 'allin',
        einsatz: 3,
        ab: '2026-09-21',
        bis: '2026-09-27',
        ziel: 5,
        erstelltAm: MONTAG.toISOString(),
      },
    })
  })

  it('sagt, warum es nicht geht', () => {
    expect(neueAnsage(zaehlt, [], 'erijon', 'erijon', 'training', 'sicher', MONTAG, 'n')).toEqual({ fehler: 'selbst' })
    expect(neueAnsage(zaehlt, [], 'erijon', 'koray', 'gym', 'sicher', MONTAG, 'n')).toEqual({ fehler: 'keinZiel' })
    expect(neueAnsage(zaehlt, [ansage({ feld: 'training' })], 'erijon', 'koray', 'training', 'sicher', DIENSTAG, 'n')).toEqual({
      fehler: 'schonAngesagt',
    })
    const allin = [ansage({ feld: 'lesen', stufe: 'allin', einsatz: 3 })]
    expect(neueAnsage(zaehlt, allin, 'erijon', 'koray', 'training', 'allin', DIENSTAG, 'n')).toEqual({
      fehler: 'allinVerbraucht',
    })
    const zwei = [ansage({ id: 'x' }), ansage({ id: 'y', feld: 'lesen' })]
    expect(neueAnsage(zaehlt, zwei, 'erijon', 'koray', 'gewicht', 'sicher', DIENSTAG, 'n')).toEqual({
      fehler: 'keineAnsagenMehr',
    })
    expect(neueAnsage(zaehlt, [], 'erijon', 'koray', 'training', 'sicher', new Date(2026, 8, 25, 19), 'n')).toEqual({
      fehler: 'zuSpaet',
    })
    // freitag 17 uhr: noch 3 tage, mutig (4) passt nicht mehr
    expect(neueAnsage(zaehlt, [], 'erijon', 'koray', 'training', 'mutig', new Date(2026, 8, 25, 17), 'n')).toEqual({
      fehler: 'keinZiel',
    })
  })
})

describe('ansageStand', () => {
  it('zählt nur, was nach der ansage passiert', () => {
    let z = sitzung(korayBoxt(), 'koray', 'boxen', '2026-09-21', { beginn: '08:00' })
    z = sitzung(z, 'koray', 'boxen', '2026-09-22')
    expect(ansageStand(zaehltAusZustand(z), ansage(), MONTAG_ABEND)).toEqual({
      status: 'laeuft',
      erreicht: 0,
      ziel: 3,
      offeneTage: 7,
    })
    expect(ansageStand(zaehltAusZustand(z), ansage(), new Date(2026, 8, 22, 20)).erreicht).toBe(1)
  })

  it('ist geschafft mit dem letzten nötigen tag', () => {
    let z = leererZustand()
    for (const tag of ['2026-09-21', '2026-09-22', '2026-09-23']) z = sitzung(z, 'koray', 'boxen', tag)
    expect(ansageStand(zaehltAusZustand(z), ansage(), new Date(2026, 8, 23, 20)).status).toBe('geschafft')
  })

  it('ist rechnerisch verfehlt, sobald die tage nicht mehr reichen, und sonntag nach 18 uhr zählt heute nicht mehr', () => {
    const zaehlt = zaehltAusZustand(leererZustand())
    expect(ansageStand(zaehlt, ansage({ ziel: 2 }), new Date(2026, 8, 26, 12)).status).toBe('laeuft')
    expect(ansageStand(zaehlt, ansage({ ziel: 3 }), new Date(2026, 8, 26, 12)).status).toBe('verfehlt')
    expect(ansageStand(zaehlt, ansage(), new Date(2026, 8, 26, 12)).offeneTage).toBe(2)
    expect(ansageStand(zaehlt, ansage({ ziel: 2 }), new Date(2026, 8, 27, 17, 59)).offeneTage).toBe(1)
    expect(ansageStand(zaehlt, ansage({ ziel: 1 }), FRIST).status).toBe('verfehlt')
  })

  it('bleibt beim festgeschriebenen ergebnis', () => {
    let z = leererZustand()
    for (const tag of ['2026-09-21', '2026-09-22', '2026-09-23']) z = sitzung(z, 'koray', 'boxen', tag)
    const a = ansage({ entschieden: { ergebnis: 'verfehlt', am: FRIST.toISOString() } })
    expect(ansageStand(zaehltAusZustand(z), a, new Date(2026, 8, 28)).status).toBe('verfehlt')
  })

  it('rechnet version 1 weiter nach ihren alten regeln', () => {
    const alt: Ansage = { ...ansage(), version: undefined, stufe: undefined, einsatz: undefined, ab: '2026-09-22', bis: '2026-09-26', ziel: 1 }
    const z = getippt(leererZustand(), 'koray', 'boxen', '2026-09-22', '2026-09-22T20:00:00')
    // getippt zählte in version 1 nicht
    expect(ansageStand(zaehltAusZustand(z), alt, new Date(2026, 8, 22, 21)).erreicht).toBe(0)
    expect(ansageFrist(alt)).toEqual(new Date(2026, 8, 27))
  })
})

describe('festzuschreiben', () => {
  it('schreibt geschafft sofort fest', () => {
    let z = leererZustand()
    for (const tag of ['2026-09-21', '2026-09-22', '2026-09-23']) z = sitzung(z, 'koray', 'boxen', tag)
    const jetzt = new Date(2026, 8, 23, 20)
    expect(festzuschreiben(z, zaehltAusZustand(z), ansage(), jetzt)).toEqual({ ergebnis: 'geschafft', am: jetzt.toISOString() })
  })

  it('schreibt verfehlt erst mit der frist sonntag 18 uhr fest', () => {
    const z = leererZustand()
    const zaehlt = zaehltAusZustand(z)
    expect(festzuschreiben(z, zaehlt, ansage(), new Date(2026, 8, 27, 17, 59))).toBeNull()
    expect(festzuschreiben(z, zaehlt, ansage(), FRIST)).toEqual({ ergebnis: 'verfehlt', am: FRIST.toISOString() })
  })

  it('schreibt nichts zweimal fest', () => {
    const z = leererZustand()
    const a = ansage({ entschieden: { ergebnis: 'verfehlt', am: FRIST.toISOString() } })
    expect(festzuschreiben(z, zaehltAusZustand(z), a, new Date(2026, 8, 28))).toBeNull()
  })
})

describe('ansagePunkte', () => {
  it('zählt nichts, solange die ansage läuft', () => {
    expect(ansagePunkte('laeuft', ansage())).toEqual({ erijon: 0, koray: 0 })
  })

  it('gibt den einsatz an die herausgeforderte person, wenn sie liefert', () => {
    expect(ansagePunkte('geschafft', ansage())).toEqual({ erijon: 0, koray: 2 })
  })

  it('gibt den einsatz an die ansagende person, wenn die andere verfehlt', () => {
    expect(ansagePunkte('verfehlt', ansage({ stufe: 'allin', einsatz: 3 }))).toEqual({ erijon: 3, koray: 0 })
  })

  it('verdoppelt gekontert', () => {
    const a = ansage({ stufe: 'allin', einsatz: 3, reaktion: { art: 'kontern', am: DIENSTAG.toISOString() } })
    expect(wirksamerEinsatz(a)).toBe(6)
    expect(ansagePunkte('geschafft', a)).toEqual({ erijon: 0, koray: 6 })
  })

  it('wertet version 1 wie früher', () => {
    const alt: Ansage = { ...ansage(), version: undefined, stufe: undefined, einsatz: undefined }
    expect(ansagePunkte('laeuft', alt)).toEqual({ erijon: -1, koray: 0 })
    expect(ansagePunkte('verfehlt', alt)).toEqual({ erijon: 1, koray: 0 })
  })
})

describe('wochenAnsagePunkte und offeneAnsageWende', () => {
  it('wertet rechnerisch verfehlt erst mit der frist', () => {
    const zaehlt = zaehltAusZustand(leererZustand())
    const a = ansage({ ziel: 3 })
    const samstag = new Date(2026, 8, 26, 12)
    expect(ansageStand(zaehlt, a, new Date(2026, 8, 27, 12)).status).toBe('verfehlt')
    expect(gewerteterStatus(zaehlt, a, new Date(2026, 8, 27, 12))).toBe('laeuft')
    expect(wochenAnsagePunkte(zaehlt, [a], '2026-09-21', samstag)).toEqual({ erijon: 0, koray: 0 })
    expect(wochenAnsagePunkte(zaehlt, [a], '2026-09-21', FRIST)).toEqual({ erijon: 2, koray: 0 })
  })

  it('lässt beide den offenen einsatz noch gewinnen', () => {
    const zaehlt = zaehltAusZustand(leererZustand())
    const gekontert = ansage({ reaktion: { art: 'kontern', am: DIENSTAG.toISOString() } })
    expect(offeneAnsageWende(zaehlt, [gekontert], '2026-09-21', DIENSTAG)).toEqual({ erijon: 4, koray: 4 })
    // rechnerisch schon verloren: nur noch erijon kann den einsatz bekommen
    expect(offeneAnsageWende(zaehlt, [gekontert], '2026-09-21', new Date(2026, 8, 27, 12))).toEqual({ erijon: 4, koray: 0 })
    expect(offeneAnsageWende(zaehlt, [gekontert], '2026-09-14', DIENSTAG)).toEqual({ erijon: 0, koray: 0 })
  })
})

describe('reaktionen', () => {
  it('erlaubt kontern und du auch 24 stunden lang', () => {
    const zaehlt = zaehltAusZustand(leererZustand())
    expect(reaktionsLage(zaehlt, [], ansage(), 'koray', MONTAG_ABEND)).toEqual({
      kontern: true,
      duAuch: true,
      bis: new Date(2026, 8, 22, 10),
    })
    expect(reaktionsLage(zaehlt, [], ansage(), 'koray', new Date(2026, 8, 22, 10))).toBeNull()
    expect(reaktionsLage(zaehlt, [], ansage(), 'koray', DIENSTAG)).toBeNull()
    expect(reaktionsLage(zaehlt, [], ansage(), 'erijon', MONTAG_ABEND)).toBeNull()
  })

  it('erlaubt kontern nur, bevor bei der herausgeforderten person etwas zählt', () => {
    const z = sitzung(leererZustand(), 'koray', 'boxen', '2026-09-21', { beginn: '12:00' })
    const zaehlt = zaehltAusZustand(z)
    expect(reaktionsLage(zaehlt, [], ansage(), 'koray', MONTAG_ABEND)?.kontern).toBe(false)
    expect(reagiere(zaehlt, [], ansage(), 'koray', 'kontern', MONTAG_ABEND, 'r')).toEqual({ fehler: 'kontraZuSpaet' })
  })

  it('kontern verdoppelt die ansage selbst', () => {
    const r = reagiere(zaehltAusZustand(leererZustand()), [], ansage(), 'koray', 'kontern', MONTAG_ABEND, 'r')
    expect('ansage' in r && r.ansage.reaktion).toEqual({ art: 'kontern', am: MONTAG_ABEND.toISOString() })
    expect('ansage' in r && r.gegen).toBeUndefined()
    expect('ansage' in r && wirksamerEinsatz(r.ansage)).toBe(4)
  })

  it('du auch legt die gegenrichtung an, gezählt ab derselben ansage', () => {
    const r = reagiere(zaehltAusZustand(leererZustand()), [], ansage(), 'koray', 'duAuch', MONTAG_ABEND, 'gegen')
    if (!('ansage' in r) || !r.gegen) throw new Error('reaktion erwartet')
    expect(r.gegen).toMatchObject({
      id: 'gegen',
      von: 'koray',
      an: 'erijon',
      feld: 'boxen',
      ziel: 3,
      einsatz: 2,
      bezug: 'a1',
      erstelltAm: MONTAG.toISOString(),
    })
    // erijon trainiert montagmittag, bevor koray reagiert: zählt trotzdem
    const z = sitzung(leererZustand(), 'erijon', 'boxen', '2026-09-21', { beginn: '12:00' })
    expect(ansageStand(zaehltAusZustand(z), r.gegen, MONTAG_ABEND).erreicht).toBe(1)
    // die gegenrichtung kostet kein kontingent
    expect(verbleibendeAnsagen([r.gegen], 'koray', MONTAG_ABEND)).toBe(ANSAGEN_JE_WOCHE)
    // und auf sie gibt es keine reaktion
    expect(reaktionsLage(zaehltAusZustand(z), [], r.gegen, 'erijon', MONTAG_ABEND)).toBeNull()
  })

  it('kostet eine der zwei ansagen der woche', () => {
    const zaehlt = zaehltAusZustand(leererZustand())
    const r = reagiere(zaehlt, [], ansage(), 'koray', 'kontern', MONTAG_ABEND, 'r')
    if (!('ansage' in r)) throw new Error('reaktion erwartet')
    expect(verbleibendeAnsagen([r.ansage], 'koray', MONTAG_ABEND)).toBe(ANSAGEN_JE_WOCHE - 1)
    // erijon zahlt nur für die eigene ansage, die reaktion kostet ihn nichts
    expect(verbleibendeAnsagen([r.ansage], 'erijon', MONTAG_ABEND)).toBe(ANSAGEN_JE_WOCHE - 1)
  })

  it('geht nicht mehr, wenn beide ansagen der woche weg sind', () => {
    const zaehlt = zaehltAusZustand(leererZustand())
    const eigene = [
      ansage({ id: 'k1', von: 'koray', an: 'erijon', feld: 'lesen' }),
      ansage({ id: 'k2', von: 'koray', an: 'erijon', feld: 'lernen' }),
    ]
    const alle = [ansage(), ...eigene]
    expect(verbleibendeAnsagen(alle, 'koray', MONTAG_ABEND)).toBe(0)
    expect(reaktionsLage(zaehlt, alle, ansage(), 'koray', MONTAG_ABEND)).toBeNull()
    expect(reagiere(zaehlt, alle, ansage(), 'koray', 'duAuch', MONTAG_ABEND, 'g')).toEqual({
      fehler: 'keineAnsagenMehr',
    })
    // eine eigene ansage und eine reaktion sind auch zwei
    const gekontert = ansage({ id: 'x', reaktion: { art: 'kontern', am: MONTAG_ABEND.toISOString() } })
    const gemischt = [ansage(), eigene[0], gekontert]
    expect(verbleibendeAnsagen(gemischt, 'koray', MONTAG_ABEND)).toBe(0)
    expect(reaktionsLage(zaehlt, gemischt, ansage(), 'koray', MONTAG_ABEND)).toBeNull()
  })

  it('erlaubt nur eine reaktion', () => {
    const a = ansage({ reaktion: { art: 'duAuch', am: MONTAG_ABEND.toISOString() } })
    expect(reagiere(zaehltAusZustand(leererZustand()), [], a, 'koray', 'kontern', MONTAG_ABEND, 'r')).toEqual({ fehler: 'schonReagiert' })
  })
})

describe('texte', () => {
  it('nennt ziel und feld', () => {
    expect(ansageZielText('gewicht', 4)).toBe('4× wiegen')
    expect(ansageZielText('lernen', 2)).toBe('2× lernen')
  })

  it('baut den ersatzspruch nur aus den zahlen des vorschlags, kleingeschrieben', () => {
    const s = vorlageSpruch({ feld: 'boxen', ziel: 3, verlauf: [1, 2, 3, 2] }, 'koray')
    expect(s).toBe('koray boxt 2× die woche. 3× bis sonntag, dann zeigt sich, wer nur redet.')
    expect(s).toBe(s.toLowerCase())
  })
})

describe('istAnsage und ansageFehlerAus', () => {
  it('nimmt nur vollständige, stimmige ansagen an', () => {
    expect(istAnsage(ansage())).toBe(true)
    expect(istAnsage(ansage({ einsatz: 3 }))).toBe(false)
    expect(istAnsage(ansage({ reaktion: { art: 'kontern', am: 'kaputt' } }))).toBe(false)
    expect(istAnsage(ansage({ von: 'koray' }))).toBe(false)
    expect(istAnsage({ ...ansage(), version: undefined, stufe: undefined, einsatz: undefined })).toBe(true)
    expect(istAnsage({ ...ansage(), version: undefined, stufe: undefined, einsatz: undefined, feld: 'lernen' })).toBe(false)
  })

  it('liest den grund aus lokalen und server-fehlern gleich', () => {
    expect(ansageFehlerAus(new AnsageAbgelehnt('kontraZuSpaet'))).toBe('kontraZuSpaet')
    expect(ansageFehlerAus({ message: 'ansage:feldInaktiv' })).toBe('feldInaktiv')
    expect(ansageFehlerAus({ message: 'ansage:unbekannt' })).toBeNull()
  })
})
