import type {
  Anfangszustand,
  Backend,
  BackendEreignis,
  EinheitEreignis,
  FachEreignis,
  NoteEreignis,
  Wetten,
} from './backend'
import { toKey, weekDays } from './dates'
import { gewichtKey, neueEinheitId, tickKey, wertKey } from './types'
import { notenGewicht } from './noten'
import type {
  Aufenthalt,
  AreaId,
  Einheit,
  Einheiten,
  Fach,
  Gewichte,
  Note,
  Phase,
  PhasenArt,
  Schlafnacht,
  Ticks,
  UserId,
  Werte,
} from './types'

// die schlüssel behalten den alten namen: die app heisst seit dem 31.08.2026
// zweikampf, aber ein umbenannter schlüssel ist ein leerer schlüssel — der
// prototyp-modus verlöre damit alles, was lokal drinsteht.
/** altbestand: ein haken je person, bereich und tag */
const TICKS_KEY = 'vierfelder.ticks.v2'
/** altbestand: ein tageswert je bereich und tag, pro person */
const WERTE_KEY = 'vierfelder.werte.v2'
const ME_KEY = 'vierfelder.me.v2'
const SCHLAF_KEY = 'vierfelder.schlaf.v2'
/** flach über beide personen wie die ticks, nicht pro nutzer wie die werte */
const GEWICHT_KEY = 'vierfelder.gewicht.v1'
/** eine zeile pro durchführung, flach über beide personen */
const EINHEITEN_KEY = 'vierfelder.einheiten.v1'
const WETTEN_KEY = 'vierfelder.wetten.v1'
const FAECHER_KEY = 'vierfelder.faecher.v2'
const NOTEN_KEY = 'vierfelder.noten.v2'
/** damit die übernahme des altbestands genau einmal läuft */
const MIGRIERT_KEY = 'vierfelder.einheiten.migriert.v1'
const KANAL = 'vierfelder'

type AlleWerte = Record<UserId, Werte>
type Nachricht = BackendEreignis & { von: string }

function lade<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as T) : fallback
  } catch {
    return fallback
  }
}

function alleWerte(): AlleWerte {
  const alle = lade<AlleWerte>(WERTE_KEY, { erijon: {}, koray: {} })
  return { erijon: alle.erijon ?? {}, koray: alle.koray ?? {} }
}

function alleEinheiten(): Einheit[] {
  const roh = lade<Einheit[]>(EINHEITEN_KEY, [])
  return Array.isArray(roh) ? roh : []
}

function sichere(einheiten: Einheit[]) {
  localStorage.setItem(EINHEITEN_KEY, JSON.stringify(einheiten))
}

const START_FAECHER: Fach[] = [
  { id: 'a0000000-0000-4000-8000-000000000001', user: 'erijon', name: 'bio', kursart: 'lk', pruefungsfach: null, sortierung: 0 },
  { id: 'a0000000-0000-4000-8000-000000000002', user: 'erijon', name: 'englisch', kursart: 'lk', pruefungsfach: null, sortierung: 1 },
  { id: 'a0000000-0000-4000-8000-000000000003', user: 'erijon', name: 'geschichte', kursart: 'lk', pruefungsfach: null, sortierung: 2 },
  { id: 'a0000000-0000-4000-8000-000000000004', user: 'erijon', name: 'mathe', kursart: 'gk', pruefungsfach: null, sortierung: 3 },
  { id: 'a0000000-0000-4000-8000-000000000005', user: 'erijon', name: 'deutsch', kursart: 'gk', pruefungsfach: null, sortierung: 4 },
  { id: 'a0000000-0000-4000-8000-000000000006', user: 'erijon', name: 'sozialkunde', kursart: 'gk', pruefungsfach: null, sortierung: 5 },
  { id: 'a0000000-0000-4000-8000-000000000007', user: 'erijon', name: 'ethik', kursart: 'gk', pruefungsfach: null, sortierung: 6 },
  { id: 'a0000000-0000-4000-8000-000000000009', user: 'erijon', name: 'sport', kursart: 'gk', pruefungsfach: null, sortierung: 7 },
  { id: 'a0000000-0000-4000-8000-000000000010', user: 'erijon', name: 'informatik', kursart: 'gk', pruefungsfach: null, sortierung: 8 },
  { id: 'a0000000-0000-4000-8000-000000000011', user: 'erijon', name: 'bildende kunst', kursart: 'gk', pruefungsfach: null, sortierung: 9 },
  { id: 'b0000000-0000-4000-8000-000000000001', user: 'koray', name: 'deutsch', kursart: 'lk', pruefungsfach: null, sortierung: 0 },
  { id: 'b0000000-0000-4000-8000-000000000002', user: 'koray', name: 'physik', kursart: 'lk', pruefungsfach: null, sortierung: 1 },
  { id: 'b0000000-0000-4000-8000-000000000003', user: 'koray', name: 'geschichte', kursart: 'lk', pruefungsfach: null, sortierung: 2 },
  { id: 'b0000000-0000-4000-8000-000000000004', user: 'koray', name: 'mathe', kursart: 'gk', pruefungsfach: null, sortierung: 3 },
  { id: 'b0000000-0000-4000-8000-000000000005', user: 'koray', name: 'englisch', kursart: 'gk', pruefungsfach: null, sortierung: 4 },
  { id: 'b0000000-0000-4000-8000-000000000006', user: 'koray', name: 'sozialkunde', kursart: 'gk', pruefungsfach: null, sortierung: 5 },
  { id: 'b0000000-0000-4000-8000-000000000007', user: 'koray', name: 'katholische religion', kursart: 'gk', pruefungsfach: null, sortierung: 6 },
  { id: 'b0000000-0000-4000-8000-000000000008', user: 'koray', name: 'französisch', kursart: 'gk', pruefungsfach: null, sortierung: 7 },
  { id: 'b0000000-0000-4000-8000-000000000010', user: 'koray', name: 'sport', kursart: 'gk', pruefungsfach: null, sortierung: 8 },
  { id: 'b0000000-0000-4000-8000-000000000011', user: 'koray', name: 'bildende kunst', kursart: 'gk', pruefungsfach: null, sortierung: 9 },
]

function beispielNoten(): Note[] {
  const tag = (tage: number) => toKey(new Date(Date.now() - tage * 86400000))
  const daten: Array<[string, UserId, Note['art'], number, number]> = [
    ['a0000000-0000-4000-8000-000000000001', 'erijon', 'klausur', 12, 12],
    ['a0000000-0000-4000-8000-000000000001', 'erijon', 'epo', 13, 7],
    ['a0000000-0000-4000-8000-000000000002', 'erijon', 'klausur', 11, 11],
    ['a0000000-0000-4000-8000-000000000003', 'erijon', 'hue', 10, 8],
    ['a0000000-0000-4000-8000-000000000004', 'erijon', 'klausur', 9, 6],
    ['a0000000-0000-4000-8000-000000000010', 'erijon', 'epo', 14, 3],
    ['b0000000-0000-4000-8000-000000000001', 'koray', 'klausur', 10, 12],
    ['b0000000-0000-4000-8000-000000000001', 'koray', 'epo', 11, 7],
    ['b0000000-0000-4000-8000-000000000002', 'koray', 'klausur', 12, 10],
    ['b0000000-0000-4000-8000-000000000003', 'koray', 'hue', 9, 8],
    ['b0000000-0000-4000-8000-000000000004', 'koray', 'klausur', 8, 5],
    ['b0000000-0000-4000-8000-000000000005', 'koray', 'epo', 13, 2],
  ]
  return daten.map(([fachId, user, art, punkte, tage], i) => ({
    id: `c0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    user, fachId, art, punkte, gewicht: notenGewicht(art), datum: tag(tage), titel: '',
  }))
}

function alleFaecher(): Fach[] {
  if (localStorage.getItem(FAECHER_KEY) === null) {
    localStorage.setItem(FAECHER_KEY, JSON.stringify(START_FAECHER))
    return START_FAECHER
  }
  const roh = lade<Fach[]>(FAECHER_KEY, [])
  return Array.isArray(roh) ? roh : []
}

function alleNoten(): Note[] {
  if (localStorage.getItem(NOTEN_KEY) === null) {
    const start = beispielNoten()
    localStorage.setItem(NOTEN_KEY, JSON.stringify(start))
    return start
  }
  const roh = lade<Note[]>(NOTEN_KEY, [])
  return Array.isArray(roh) ? roh : []
}

/**
 * übernimmt ticks und werte aus dem alten format in einheiten — einmalig, und
 * ohne minuten zu erfinden: wo kein wert gespeichert war, bleibt `wert` null.
 * der zeitpunkt fehlt, weil das alte format keinen gespeichert hat.
 */
function uebernimmAltbestand() {
  if (localStorage.getItem(MIGRIERT_KEY)) return

  const ticks = lade<Ticks>(TICKS_KEY, {})
  const werte = alleWerte()
  const vorhanden = new Set(alleEinheiten().map((e) => `${e.user}|${e.area}|${e.tag}`))
  const uebernommen = alleEinheiten()

  for (const key of Object.keys(ticks)) {
    const [user, area, tag] = key.split('|') as [UserId, AreaId, string]
    if (!user || !area || !tag || vorhanden.has(key)) continue
    uebernommen.push({
      id: neueEinheitId(),
      user,
      area,
      tag,
      wert: werte[user]?.[wertKey(area, tag)] ?? null,
      erfasst: null,
    })
  }

  sichere(uebernommen)
  localStorage.setItem(MIGRIERT_KEY, '1')
}

export function lokalesMe(): UserId {
  return localStorage.getItem(ME_KEY) === 'koray' ? 'koray' : 'erijon'
}

export function lokalWechseln(u: UserId) {
  localStorage.setItem(ME_KEY, u)
}

/**
 * Beispielnaechte fuer den Prototyp ohne Supabase. Sie werden aus echten
 * Phasenzyklen aufgebaut, damit Zeitstrahl, Effizienz und Duell dasselbe
 * zeigen wie mit Health-Daten — nur eben erfunden statt gemessen.
 */
function erzeugeBeispielSchlaf(): Schlafnacht[] {
  const woche = weekDays(new Date())
  const naechte: Schlafnacht[] = []

  // je eintrag: stunde und minute des zubettgehens, minuten bis zum
  // einschlafen, laenge der schlafspanne
  const muster: Record<UserId, Array<[number, number, number, number]>> = {
    erijon: [
      [22, 55, 15, 470],
      [23, 10, 12, 490],
      [23, 5, 18, 455],
      [22, 50, 10, 500],
    ],
    koray: [
      [0, 20, 15, 420],
      [0, 55, 25, 400],
      [1, 5, 14, 445],
      [0, 5, 20, 430],
    ],
  }

  const arten: PhasenArt[] = ['kern', 'tief', 'kern', 'rem']
  const dauern = [42, 26, 34, 22]

  const zyklen = (spanne: number, versatz: number): Phase[] => {
    const phasen: Phase[] = []
    let t = 0
    let i = versatz
    while (t < spanne - 6) {
      const dauer = Math.min(dauern[i % 4]!, spanne - t)
      phasen.push({ art: arten[i % 4]!, start: t, dauer })
      t += dauer
      if (i % 4 === 3 && t < spanne - 25) {
        const wach = 4 + ((i + versatz) % 3) * 5
        phasen.push({ art: 'wach', start: t, dauer: wach })
        t += wach
      }
      i++
    }
    return phasen
  }

  // `abend` ist der tag, an dem jemand ins bett geht. eine uhrzeit vor mittag
  // gehoert damit schon zum folgetag.
  const iso = (abend: string, stunde: number, minute: number, plusMinuten = 0): string => {
    const [j, mo, t] = abend.split('-').map(Number)
    const d = new Date(j!, mo! - 1, t! + (stunde >= 12 ? 0 : 1), stunde, minute + plusMinuten)
    return d.toISOString()
  }

  /** lokales datum eines zeitpunkts als yyyy-mm-dd */
  const datumVon = (zeitpunkt: string): string => {
    const d = new Date(zeitpunkt)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`
  }

  woche.slice(0, 4).forEach((abend, i) => {
    for (const user of ['erijon', 'koray'] as UserId[]) {
      const [stunde, minute, verzoegerung, spanne] = muster[user][i]!
      const phasen = zyklen(spanne, user === 'erijon' ? i : i + 1)
      const summe = (art: PhasenArt) =>
        phasen.filter((p) => p.art === art).reduce((s, p) => s + p.dauer, 0)
      const wach = summe('wach')
      const aufwachzeit = iso(abend, stunde, minute, verzoegerung + spanne)

      naechte.push({
        user,
        // die datenbank benennt die nacht nach dem morgen
        nacht: datumVon(aufwachzeit),
        schlafMinuten: spanne - wach,
        einschlafzeit: iso(abend, stunde, minute, verzoegerung),
        aufwachzeit,
        bettStart: iso(abend, stunde, minute),
        bettEnde: iso(abend, stunde, minute, verzoegerung + spanne + 8),
        bettMinuten: verzoegerung + spanne + 8,
        tiefMinuten: summe('tief'),
        remMinuten: summe('rem'),
        kernMinuten: summe('kern'),
        unspezMinuten: 0,
        wachMinuten: wach,
        zielMinuten: 540,
        phasen,
        // ohne datenbank gibt es keinen gerechneten nachtwert. die anzeige
        // faellt dann auf die kurve in `qualitaet` zurueck.
        nachtwert: null,
        scoreKonfidenz: null,
      })
    }
  })

  return naechte
}

/**
 * beispielsitzungen fuer den prototyp ohne supabase. echte sitzungen schreibt
 * ausschliesslich die automation auf dem iphone ueber die datenbank — standort
 * oder fokus. hier stehen sie nur, damit man ohne iphone sieht, wie sich ein
 * gemessener tick von einem getippten unterscheidet.
 */
function erzeugeBeispielAufenthalte(): Aufenthalt[] {
  const woche = weekDays(new Date())
  const heute = toKey(new Date())

  const zeit = (tag: string, stunde: number, minute: number): string => {
    const [j, mo, t] = tag.split('-').map(Number)
    return new Date(j!, mo! - 1, t!, stunde, minute).toISOString()
  }

  // [wochentag, person, bereich, quelle, beginn, dauer in minuten]
  const muster: Array<[number, UserId, AreaId, string, [number, number], number]> = [
    [0, 'erijon', 'gym', 'gym nord', [18, 5], 74],
    [0, 'koray', 'gym', 'gym sued', [7, 10], 55],
    [1, 'erijon', 'boxen', 'boxhalle', [19, 0], 88],
    [1, 'erijon', 'lernen', 'fokus lernen', [16, 10], 95],
    [2, 'koray', 'gym', 'gym sued', [7, 20], 48],
    // gemessen in minuten, gezaehlt in seiten: hier sieht man beides
    [2, 'koray', 'lesen', 'fokus lesen', [21, 40], 35],
  ]

  const aufenthalte: Aufenthalt[] = muster
    .filter(([i]) => woche[i]! < heute)
    .map(([i, user, bereich, ort, [stunde, minute], dauer]) => ({
      user,
      bereich,
      ort,
      ankunft: zeit(woche[i]!, stunde, minute),
      abgang: zeit(woche[i]!, stunde, minute + dauer),
    }))

  // einer für heute, relativ zu jetzt: nur so sieht man im prototyp auch die
  // gemessene bereichszeile, die nicht antippbar ist.
  const jetzt = Date.now()
  aufenthalte.push({
    user: 'erijon',
    bereich: 'gym',
    ort: 'gym nord',
    ankunft: new Date(jetzt - 180 * 60000).toISOString(),
    abgang: new Date(jetzt - 106 * 60000).toISOString(),
  })

  return aufenthalte
}

let kanal: BroadcastChannel | null | undefined
function holeKanal(): BroadcastChannel | null {
  if (kanal === undefined) {
    kanal = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(KANAL)
  }
  return kanal
}

export function lokalesBackend(): Backend {
  const absender = Math.random().toString(36).slice(2)

  const sende = (art: EinheitEreignis['art'], einheit: Einheit) => {
    holeKanal()?.postMessage({ von: absender, typ: 'einheit', art, einheit } satisfies Nachricht)
  }
  const sendeFach = (art: FachEreignis['art'], fach: Fach) => {
    holeKanal()?.postMessage({ von: absender, typ: 'fach', art, fach } satisfies Nachricht)
  }
  const sendeNote = (art: NoteEreignis['art'], note: Note) => {
    holeKanal()?.postMessage({ von: absender, typ: 'note', art, note } satisfies Nachricht)
  }

  return {
    art: 'lokal',

    async laden(): Promise<Anfangszustand> {
      uebernimmAltbestand()

      const me = lokalesMe()
      const gespeicherterSchlaf = lade<Schlafnacht[]>(SCHLAF_KEY, [])
      const schlaf = gespeicherterSchlaf.length > 0 ? gespeicherterSchlaf : erzeugeBeispielSchlaf()

      const einheiten: Einheiten = {}
      for (const e of alleEinheiten()) {
        const key = tickKey(e.user, e.area, e.tag)
        const liste = einheiten[key]
        if (!liste) einheiten[key] = [e]
        else if (!liste.some((x) => x.id === e.id)) liste.push(e)
      }

      return {
        me,
        einheiten,
        gewichte: lade<Gewichte>(GEWICHT_KEY, {}),
        schlaf,
        aufenthalte: erzeugeBeispielAufenthalte(),
        wetten: lade<Wetten>(WETTEN_KEY, {}),
        noten: { faecher: alleFaecher(), noten: alleNoten() },
        altbestand: false,
      }
    },

    async schreibeEinheit(e: Einheit) {
      const alle = alleEinheiten()
      // die id entscheidet: derselbe schreibversuch zweimal legt nichts an
      if (alle.some((x) => x.id === e.id)) return
      alle.push(e)
      sichere(alle)
      sende('neu', e)
    },

    async schreibeEinheitWert(e: Einheit, wert: number | null) {
      const alle = alleEinheiten().map((x) => (x.id === e.id ? { ...x, wert } : x))
      sichere(alle)
      sende('wert', { ...e, wert })
    },

    async loescheEinheit(e: Einheit) {
      sichere(alleEinheiten().filter((x) => x.id !== e.id))
      sende('weg', e)
    },

    async loescheTag(einheiten: Einheit[]) {
      if (einheiten.length === 0) return
      const weg = new Set(einheiten.map((e) => e.id))
      sichere(alleEinheiten().filter((x) => !weg.has(x.id)))
      for (const e of einheiten) sende('weg', e)
    },

    async schreibeGewicht(tag: string, kg: number) {
      const me = lokalesMe()
      const gewichte = lade<Gewichte>(GEWICHT_KEY, {})
      const key = gewichtKey(me, tag)
      if (kg <= 0) delete gewichte[key]
      else gewichte[key] = kg
      localStorage.setItem(GEWICHT_KEY, JSON.stringify(gewichte))
    },

    async schreibeWette(woche: string, text: string) {
      const wetten = lade<Wetten>(WETTEN_KEY, {})
      wetten[woche] = text
      localStorage.setItem(WETTEN_KEY, JSON.stringify(wetten))
      holeKanal()?.postMessage({ von: absender, typ: 'wette', woche, text } satisfies Nachricht)
    },

    async setzePruefungsfach(id: string, nummer: number | null) {
      const fach = alleFaecher().find((x) => x.id === id)
      if (!fach) return
      const next = { ...fach, pruefungsfach: nummer }
      localStorage.setItem(FAECHER_KEY, JSON.stringify(alleFaecher().map((x) => x.id === id ? next : x)))
      sendeFach('wert', next)
    },

    async schreibeNote(note: Note) {
      const alle = alleNoten()
      if (alle.some((x) => x.id === note.id)) return
      localStorage.setItem(NOTEN_KEY, JSON.stringify([...alle, note]))
      sendeNote('neu', note)
    },

    async loescheNote(id: string) {
      const note = alleNoten().find((x) => x.id === id)
      if (!note) return
      localStorage.setItem(NOTEN_KEY, JSON.stringify(alleNoten().filter((x) => x.id !== id)))
      sendeNote('weg', note)
    },

    // im prototyp liegt alles im browser, es gibt nichts nachzuladen
    async ladePhasen(user, nacht) {
      const gespeichert = lade<Schlafnacht[]>(SCHLAF_KEY, [])
      const alle = gespeichert.length > 0 ? gespeichert : erzeugeBeispielSchlaf()
      return alle.find((n) => n.user === user && n.nacht === nacht)?.phasen ?? []
    },

    abonniere(cb) {
      const ch = holeKanal()
      if (!ch) return () => {}
      const onMessage = (e: MessageEvent<Nachricht>) => {
        const n = e.data
        if (!n || n.von === absender) return
        if (n.typ === 'wette') cb({ typ: 'wette', woche: n.woche, text: n.text })
        else if (n.typ === 'einheit') cb({ typ: 'einheit', art: n.art, einheit: n.einheit })
        else if (n.typ === 'fach') cb({ typ: 'fach', art: n.art, fach: n.fach })
        else if (n.typ === 'note') cb({ typ: 'note', art: n.art, note: n.note })
      }
      ch.addEventListener('message', onMessage)
      return () => ch.removeEventListener('message', onMessage)
    },
  }
}
