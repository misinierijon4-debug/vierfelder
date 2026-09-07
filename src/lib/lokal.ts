import type {
  Anfangszustand,
  Backend,
  BackendEreignis,
  EinheitEreignis,
  FachEreignis,
  NoteEreignis,
  WetteMeta,
  WetteStand,
  Wetten,
  WettenMeta,
} from './backend'
import {
  KEINE_WETTE_VERSION,
  istWochenmontag,
  istWetteVersion,
  vergleicheWetteVersion,
} from './backend'
import { addDays, toKey, weekDays } from './dates'
import { gewichtKey, neueEinheitId, tickKey, wertKey } from './types'
import { notenGewicht } from './noten'
import type {
  Abrechnung,
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
  ScoreKomponenten,
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
/** CAS/Audit getrennt halten: der bestehende Wetten-Key bleibt unveraendert. */
const WETTEN_META_KEY = 'vierfelder.wetten.meta.v1'
const ABRECHNUNG_KEY = 'vierfelder.abrechnung.v1'
const FAECHER_KEY = 'vierfelder.faecher.v2'
const NOTEN_KEY = 'vierfelder.noten.v2'
/** damit die übernahme des altbestands genau einmal läuft */
const MIGRIERT_KEY = 'vierfelder.einheiten.migriert.v1'
const KANAL = 'vierfelder'

type AlleWerte = Record<UserId, Werte>
type Nachricht =
  | (BackendEreignis & { von: string })
  // Uebergangsformat: neue Tabs lesen `id`, bereits offene alte Tabs die
  // Vollzeile. Nach dem naechsten erzwungenen PWA-Update kann das entfallen.
  | { von: string; typ: 'einheit'; art: 'weg'; id: string; einheit: Einheit }
  | { von: string; typ: 'note'; art: 'weg'; id: string; note: Note }

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

/**
 * Ein localStorage-Schreibzyklus ist nur innerhalb eines einzelnen Tabs
 * unteilbar. Web Locks serialisiert read-modify-write auch zwischen Tabs,
 * ohne einen zweiten dauerhaften Speichervertrag einzuführen.
 */
function mitLokalerSperre<T>(key: string, aktion: () => T | Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined') return Promise.resolve(aktion())
  const sperren = navigator.locks
  if (!sperren) {
    return Promise.reject(new Error('sichere lokale mehrtab-speicherung wird nicht unterstützt'))
  }
  return sperren.request<Promise<T>>(
    `vierfelder.storage.${key}`,
    { mode: 'exclusive' },
    async () => await aktion()
  ).then((wert) => wert)
}

type LokalerWettenMetaSpeicher = {
  revision: string
  wochen: WettenMeta
}

const LEGACY_WETTE_ZEIT = '1970-01-01T00:00:00.000Z'

function istLokaleWetteMeta(wert: unknown): wert is WetteMeta {
  if (!wert || typeof wert !== 'object' || Array.isArray(wert)) return false
  const meta = wert as Record<string, unknown>
  return istWetteVersion(meta.version)
    && typeof meta.updatedBy === 'string'
    && meta.updatedBy.length > 0
    && typeof meta.updatedAt === 'string'
    && Number.isFinite(Date.parse(meta.updatedAt))
}

function istLokalerWetteStand(wert: unknown): wert is WetteStand {
  if (!wert || typeof wert !== 'object' || Array.isArray(wert)) return false
  const stand = wert as Record<string, unknown>
  return istWochenmontag(stand.woche)
    && (stand.text === null || (
      typeof stand.text === 'string'
      && stand.text === stand.text.trim()
      && stand.text.length >= 1
      && stand.text.length <= 160
    ))
    && istLokaleWetteMeta(stand)
}

/**
 * Ein alter `vierfelder.wetten.v1`-Bestand hat noch keine CAS-Daten. Unter
 * derselben Web-Lock-Sperre bekommt er in sortierter Wochenreihenfolge stabile
 * Versionen. Tombstones aus einem vorhandenen Meta-Stand bleiben erhalten.
 */
function ladeLokalenWettenStand(): {
  wetten: Wetten
  meta: LokalerWettenMetaSpeicher
  metaGeaendert: boolean
} {
  const wetten = lade<Wetten>(WETTEN_KEY, {})
  const roh = lade<Partial<LokalerWettenMetaSpeicher>>(WETTEN_META_KEY, {})
  const revisionGueltig = istWetteVersion(roh.revision, true)
  const roheRevision = revisionGueltig ? roh.revision! : KEINE_WETTE_VERSION
  let revision = BigInt(roheRevision)
  const wochen: WettenMeta = {}
  const versionen = new Set<string>()

  if (roh.wochen && typeof roh.wochen === 'object' && !Array.isArray(roh.wochen)) {
    for (const woche of Object.keys(roh.wochen).sort()) {
      const eintrag = roh.wochen[woche]
      if (!istLokaleWetteMeta(eintrag) || versionen.has(eintrag.version)) {
        throw new Error('lokale wetten-metadaten sind widerspruechlich')
      }
      wochen[woche] = eintrag
      versionen.add(eintrag.version)
      const version = BigInt(eintrag.version)
      if (version > revision) revision = version
    }
  }

  for (const woche of Object.keys(wetten).sort()) {
    if (wochen[woche]) continue
    revision += 1n
    const version = revision.toString()
    wochen[woche] = {
      version,
      updatedBy: 'legacy',
      updatedAt: LEGACY_WETTE_ZEIT,
    }
    versionen.add(version)
  }

  const meta = { revision: revision.toString(), wochen }
  return {
    wetten,
    meta,
    metaGeaendert: !revisionGueltig || JSON.stringify(roh) !== JSON.stringify(meta),
  }
}

function speichereLokalenWettenStand(wetten: Wetten, meta: LokalerWettenMetaSpeicher): void {
  const vorher = localStorage.getItem(WETTEN_KEY)
  localStorage.setItem(WETTEN_KEY, JSON.stringify(wetten))
  try {
    localStorage.setItem(WETTEN_META_KEY, JSON.stringify(meta))
  } catch (error) {
    // Bestmoegliche Kompensation: nie einen neuen Wert mit alter CAS-Version
    // als bestaetigt zurueckgeben.
    try {
      if (vorher === null) localStorage.removeItem(WETTEN_KEY)
      else localStorage.setItem(WETTEN_KEY, vorher)
    } catch {
      // Der kanonische Reload meldet den Speicherfehler; Originalursache bleibt.
    }
    throw error
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

// vier pruefungen je person: die drei lk schriftlich, dazu genau ein
// muendlicher gk — bei erijon mathe, bei koray englisch
const START_FAECHER: Fach[] = [
  { id: 'a0000000-0000-4000-8000-000000000001', user: 'erijon', name: 'bio', kursart: 'lk', pruefungsfach: null, sortierung: 0 },
  { id: 'a0000000-0000-4000-8000-000000000002', user: 'erijon', name: 'englisch', kursart: 'lk', pruefungsfach: null, sortierung: 1 },
  { id: 'a0000000-0000-4000-8000-000000000003', user: 'erijon', name: 'geschichte', kursart: 'lk', pruefungsfach: null, sortierung: 2 },
  { id: 'a0000000-0000-4000-8000-000000000004', user: 'erijon', name: 'mathe', kursart: 'gk', pruefungsfach: 4, sortierung: 3 },
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
  { id: 'b0000000-0000-4000-8000-000000000005', user: 'koray', name: 'englisch', kursart: 'gk', pruefungsfach: 4, sortierung: 4 },
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

      const komponenten: ScoreKomponenten = {
        dauer: {
          wert: Math.min(100, Math.round(((spanne - wach) / 540) * 100)),
          gewicht: 45,
          punkte: Math.round((Math.min(100, ((spanne - wach) / 540) * 100) * 45) / 100),
        },
        effizienz: {
          wert: Math.round(((spanne - wach) / (verzoegerung + spanne + 8)) * 100),
          gewicht: 20,
          punkte: null,
        },
        phasen: { wert: 82, gewicht: 10, punkte: 8 },
        unterbrechungen: { wert: 68, gewicht: 10, punkte: 7 },
        regelmaessigkeit: { wert: 74, gewicht: 0, punkte: null },
      }

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
        scoreKomponenten: komponenten,
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

/** zwei archivierte wochen, damit die bilanz im prototyp archiviert wirkt */
function erzeugeBeispielAbrechnungen(): Abrechnung[] {
  const montag = (wochenZurueck: number) =>
    weekDays(addDays(new Date(), -7 * wochenZurueck))[0]!
  return [
    {
      woche: montag(1),
      sieger: 'erijon',
      grund: 'punkte',
      differenz: 4,
      belegErijon: 18,
      belegKoray: 14,
      wette: 'verlierer kocht abendessen',
      abgeschlossen: new Date(Date.now() - 6 * 86400000).toISOString(),
    },
    {
      woche: montag(2),
      sieger: 'koray',
      grund: 'beleg',
      differenz: 0,
      belegErijon: 12,
      belegKoray: 13,
      wette: 'der verlierer traegt die einkaeufe',
      abgeschlossen: new Date(Date.now() - 13 * 86400000).toISOString(),
    },
  ]
}

function alleAbrechnungen(): Abrechnung[] {
  if (localStorage.getItem(ABRECHNUNG_KEY) === null) {
    const beispiele = erzeugeBeispielAbrechnungen()
    localStorage.setItem(ABRECHNUNG_KEY, JSON.stringify(beispiele))
    return beispiele
  }
  const roh = lade<Abrechnung[]>(ABRECHNUNG_KEY, [])
  return Array.isArray(roh) ? roh : []
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
  // Die sichtbare Person gehoert zur Backend-Instanz. Ein anderer Tab darf
  // diesen Vertrag nicht mitten in einer offenen Eingabe ueber localStorage
  // umbiegen; ein bewusster Personenwechsel erzeugt im App-Root ein neues
  // Backend.
  const me = lokalesMe()

  const sende = (ereignis: EinheitEreignis) => {
    holeKanal()?.postMessage({ von: absender, ...ereignis } satisfies Nachricht)
  }
  const sendeFach = (ereignis: FachEreignis) => {
    holeKanal()?.postMessage({ von: absender, ...ereignis } satisfies Nachricht)
  }
  const sendeNote = (ereignis: NoteEreignis) => {
    holeKanal()?.postMessage({ von: absender, ...ereignis } satisfies Nachricht)
  }
  const sendeEinheitWeg = (einheit: Einheit) => {
    holeKanal()?.postMessage({
      von: absender, typ: 'einheit', art: 'weg', id: einheit.id, einheit,
    } satisfies Nachricht)
  }
  const sendeNoteWeg = (note: Note) => {
    holeKanal()?.postMessage({
      von: absender, typ: 'note', art: 'weg', id: note.id, note,
    } satisfies Nachricht)
  }

  return {
    art: 'lokal',

    async laden(): Promise<Anfangszustand> {
      await mitLokalerSperre(EINHEITEN_KEY, uebernimmAltbestand)
      const wetteStand = await mitLokalerSperre(WETTEN_KEY, () => {
        const stand = ladeLokalenWettenStand()
        if (stand.metaGeaendert) {
          localStorage.setItem(WETTEN_META_KEY, JSON.stringify(stand.meta))
        }
        return stand
      })

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
        // im demomodus gibt es keine waage und keine automation: hier wird
        // getippt, und genau das steht dann auch dran.
        gewichtQuellen: {},
        schlaf,
        aufenthalte: erzeugeBeispielAufenthalte(),
        wetten: wetteStand.wetten,
        wettenMeta: wetteStand.meta.wochen,
        abrechnungen: alleAbrechnungen(),
        noten: { faecher: alleFaecher(), noten: alleNoten() },
        einheitVonVerfuegbar: true,
        altbestand: false,
      }
    },

    async schreibeEinheit(e: Einheit) {
      return mitLokalerSperre(EINHEITEN_KEY, () => {
        const alle = alleEinheiten()
        // die id entscheidet: derselbe schreibversuch zweimal legt nichts an
        if (alle.some((x) => x.id === e.id)) return
        alle.push(e)
        sichere(alle)
        sende({ typ: 'einheit', art: 'neu', einheit: e })
      })
    },

    async schreibeEinheitWert(e: Einheit, wert: number | null) {
      return mitLokalerSperre(EINHEITEN_KEY, () => {
        const alle = alleEinheiten()
        const vorhanden = alle.find((x) => x.id === e.id)
        if (!vorhanden) throw new Error('einheit wurde nicht gefunden')
        if (vorhanden.wert !== e.wert) {
          throw Object.assign(new Error('einheit-wert wurde parallel geaendert'), { code: '40001' })
        }
        const aktualisiert = { ...vorhanden, wert }
        sichere(alle.map((x) => (x.id === e.id ? aktualisiert : x)))
        sende({ typ: 'einheit', art: 'wert', einheit: aktualisiert })
      })
    },

    async schreibeEinheitVon(e: Einheit, von: string | null) {
      return mitLokalerSperre(EINHEITEN_KEY, () => {
        const alle = alleEinheiten()
        const vorhanden = alle.find((x) => x.id === e.id)
        if (!vorhanden) throw new Error('einheit wurde nicht gefunden')
        if ((vorhanden.von ?? null) !== (e.von ?? null)) {
          throw Object.assign(new Error('einheit-zeit wurde parallel geaendert'), { code: '40001' })
        }
        const aktualisiert = { ...vorhanden, von }
        sichere(alle.map((x) => (x.id === e.id ? aktualisiert : x)))
        sende({ typ: 'einheit', art: 'wert', einheit: aktualisiert })
      })
    },

    async loescheEinheit(e: Einheit) {
      return mitLokalerSperre(EINHEITEN_KEY, () => {
        const alle = alleEinheiten()
        const vorhanden = alle.find((x) => x.id === e.id)
        if (!vorhanden) return
        sichere(alle.filter((x) => x.id !== e.id))
        sendeEinheitWeg(vorhanden)
      })
    },

    async loescheTag(einheiten: Einheit[]) {
      if (einheiten.length === 0) return
      return mitLokalerSperre(EINHEITEN_KEY, () => {
        const weg = new Set(einheiten.map((e) => e.id))
        const alle = alleEinheiten()
        const vorhanden = alle.filter((x) => weg.has(x.id))
        sichere(alle.filter((x) => !weg.has(x.id)))
        for (const e of vorhanden) sendeEinheitWeg(e)
      })
    },

    async schreibeGewicht(tag: string, kg: number) {
      return mitLokalerSperre(GEWICHT_KEY, () => {
        const gewichte = lade<Gewichte>(GEWICHT_KEY, {})
        const key = gewichtKey(me, tag)
        if (kg <= 0) delete gewichte[key]
        else gewichte[key] = kg
        localStorage.setItem(GEWICHT_KEY, JSON.stringify(gewichte))
        holeKanal()?.postMessage({
          von: absender,
          typ: 'gewicht',
          user: me,
          tag,
          kg: kg <= 0 ? null : kg,
          quelle: 'getippt',
        } satisfies Nachricht)
      })
    },

    async schreibeWette(woche: string, text: string, erwarteteVersion: string) {
      if (!istWochenmontag(woche)) throw new Error('wette braucht einen wochenmontag')
      if (!istWetteVersion(erwarteteVersion, true)) {
        throw new Error('wette braucht eine gueltige erwartete version')
      }
      if (
        text !== ''
        && (text !== text.trim() || text.length < 1 || text.length > 160)
      ) {
        throw new Error('wette braucht einen getrimmten text mit hoechstens 160 zeichen')
      }
      return mitLokalerSperre(WETTEN_KEY, () => {
        if (alleAbrechnungen().some((abrechnung) => abrechnung.woche === woche)) {
          throw Object.assign(new Error('eine archivierte woche darf nicht mehr geaendert werden'), {
            code: '23514',
          })
        }
        const aktuell = ladeLokalenWettenStand()
        const aktuelleVersion = aktuell.meta.wochen[woche]?.version ?? KEINE_WETTE_VERSION
        if (vergleicheWetteVersion(aktuelleVersion, erwarteteVersion) !== 0) {
          throw Object.assign(new Error('duell_wette wurde parallel geaendert'), { code: '40001' })
        }

        const version = (BigInt(aktuell.meta.revision) + 1n).toString()
        const updatedAt = new Date().toISOString()
        const neuerStand: WetteStand = {
          woche,
          text: text || null,
          version,
          updatedBy: me,
          updatedAt,
        }
        const wetten = { ...aktuell.wetten }
        if (neuerStand.text === null) delete wetten[woche]
        else wetten[woche] = neuerStand.text
        const meta: LokalerWettenMetaSpeicher = {
          revision: version,
          wochen: {
            ...aktuell.meta.wochen,
            [woche]: { version, updatedBy: me, updatedAt },
          },
        }
        speichereLokalenWettenStand(wetten, meta)
        holeKanal()?.postMessage({
          von: absender,
          typ: 'wette',
          art: 'wert',
          stand: neuerStand,
        } satisfies Nachricht)
        return neuerStand
      })
    },

    async schreibeAbrechnung(a: Abrechnung) {
      // Derselbe Lock wie bei der Wette schliesst die Archiv/Wette-Race-Luecke.
      return mitLokalerSperre(WETTEN_KEY, () => {
        const alle = alleAbrechnungen()
        const vorhanden = alle.find((x) => x.woche === a.woche)
        if (vorhanden) return vorhanden
        const wetten = ladeLokalenWettenStand().wetten
        const kanonisch = { ...a, wette: wetten[a.woche] ?? null }
        localStorage.setItem(ABRECHNUNG_KEY, JSON.stringify([...alle, kanonisch]))
        holeKanal()?.postMessage({
          von: absender,
          typ: 'abrechnung',
          abrechnung: kanonisch,
        } satisfies Nachricht)
        return kanonisch
      })
    },

    async setzePruefungsfach(id: string, erwartetesFachId: string) {
      return mitLokalerSperre(FAECHER_KEY, () => {
        const faecher = alleFaecher()
        const ziel = faecher.find((x) => x.id === id)
        const aktuell = faecher.find((x) => x.user === me && x.pruefungsfach === 4)
        if (!ziel || ziel.user !== me || ziel.kursart !== 'gk' || ziel.name === 'sport') {
          throw new Error('ungueltiges pruefungsfach')
        }
        if (!aktuell) throw new Error('fachmodell ist widerspruechlich')
        if (aktuell.id === ziel.id) return ziel.id
        if (aktuell.id !== erwartetesFachId) {
          throw Object.assign(new Error('pruefungsfach wurde parallel geaendert'), { code: '40001' })
        }

        const altes = { ...aktuell, pruefungsfach: null }
        const neues = { ...ziel, pruefungsfach: 4 }
        const next = faecher.map((fach) =>
          fach.id === altes.id ? altes : fach.id === neues.id ? neues : fach
        )
        localStorage.setItem(FAECHER_KEY, JSON.stringify(next))
        sendeFach({ typ: 'fach', art: 'wert', fach: altes })
        sendeFach({ typ: 'fach', art: 'wert', fach: neues })
        return neues.id
      })
    },

    async schreibeNote(note: Note) {
      return mitLokalerSperre(NOTEN_KEY, () => {
        const alle = alleNoten()
        const vorhanden = alle.find((x) => x.id === note.id)
        if (vorhanden) {
          if (JSON.stringify(vorhanden) !== JSON.stringify(note)) {
            throw new Error('noten-id gehoert zu einem anderen eintrag')
          }
          return note.id
        }
        localStorage.setItem(NOTEN_KEY, JSON.stringify([...alle, note]))
        sendeNote({ typ: 'note', art: 'neu', note })
        return note.id
      })
    },

    async loescheNote(id: string) {
      return mitLokalerSperre(NOTEN_KEY, () => {
        const alle = alleNoten()
        const note = alle.find((x) => x.id === id)
        if (!note) throw new Error('note wurde nicht bestaetigt geloescht')
        localStorage.setItem(NOTEN_KEY, JSON.stringify(alle.filter((x) => x.id !== id)))
        sendeNoteWeg(note)
        return id
      })
    },

    // im prototyp liegt alles im browser, es gibt nichts nachzuladen
    async ladePhasen(user, nacht, signal) {
      if (signal.aborted) throw new DOMException('abgebrochen', 'AbortError')
      const gespeichert = lade<Schlafnacht[]>(SCHLAF_KEY, [])
      const alle = gespeichert.length > 0 ? gespeichert : erzeugeBeispielSchlaf()
      const gefunden = alle.find((n) => n.user === user && n.nacht === nacht)
      if (!gefunden) throw new Error('schlafnacht wurde nicht gefunden')
      if (gefunden.phasen === null) throw new Error('schlafphasen sind lokal nicht verfuegbar')
      return gefunden.phasen
    },

    abonniere(cb) {
      const ch = holeKanal()
      if (!ch) return () => {}
      const onMessage = (e: MessageEvent<Nachricht>) => {
        const n = e.data
        if (!n || n.von === absender) return
        const roheWette = n as unknown as {
          typ?: unknown
          art?: unknown
          stand?: unknown
          woche?: unknown
        }
        if (roheWette.typ === 'wette') {
          if (roheWette.art === 'wert' && istLokalerWetteStand(roheWette.stand)) {
            cb({ typ: 'wette', art: 'wert', stand: roheWette.stand })
          } else {
            // Alte Tabs senden `{typ,woche,text}` ohne Version. Das ist nur ein
            // Invalidation-Signal; der aktuelle Wert kommt aus dem CAS-Snapshot.
            cb({
              typ: 'wette',
              art: 'invalidierung',
              ...(typeof roheWette.woche === 'string' ? { woche: roheWette.woche } : {}),
            })
          }
          return
        }
        // Ein bereits offener Tab mit der vorherigen Fassung sendet bei
        // Deletes noch die ganze Zeile. Bis alle Tabs aktualisiert sind,
        // normalisieren wir sie auf denselben stabilen ID-Vertrag.
        const alt = n as unknown as {
          typ?: string
          art?: string
          einheit?: Einheit
          fach?: Fach
          note?: Note
          id?: string
        }
        if (alt.art === 'weg' && alt.id) {
          if (alt.typ === 'einheit') {
            cb({ typ: 'einheit', art: 'weg', id: alt.id })
            return
          }
          if (alt.typ === 'fach') {
            cb({ typ: 'fach', art: 'weg', id: alt.id })
            return
          }
          if (alt.typ === 'note') {
            cb({ typ: 'note', art: 'weg', id: alt.id })
            return
          }
        }
        if (alt.art === 'weg' && !alt.id) {
          if (alt.typ === 'einheit' && alt.einheit?.id) {
            cb({ typ: 'einheit', art: 'weg', id: alt.einheit.id })
            return
          }
          if (alt.typ === 'fach' && alt.fach?.id) {
            cb({ typ: 'fach', art: 'weg', id: alt.fach.id })
            return
          }
          if (alt.typ === 'note' && alt.note?.id) {
            cb({ typ: 'note', art: 'weg', id: alt.note.id })
            return
          }
        }
        const { von: _absender, ...ereignis } = n
        cb(ereignis as BackendEreignis)
      }
      ch.addEventListener('message', onMessage)
      return () => ch.removeEventListener('message', onMessage)
    },
  }
}
