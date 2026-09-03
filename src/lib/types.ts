export type AreaId = 'lernen' | 'gym' | 'boxen' | 'lesen'
export type UserId = 'erijon' | 'koray'
export type AppTab = 'tracker' | 'duell' | 'schlaf' | 'noten'

/**
 * alles, was in die wochenwertung zählt. `AreaId` bleibt absichtlich bei den
 * vier antippbaren bereichen: nur die landen in `eintraege`, und so kann
 * `schreibeTick` typsicher nie ein 'gewicht' dorthin schreiben.
 */
export type FeldId = AreaId | 'gewicht'

/**
 * die bereiche, für die es eine messung gibt — seit den fokus-modi alle vier.
 * lernen und lesen haben keinen ort, aber einen fokus: der wird bewusst
 * eingeschaltet, läuft eine messbare zeit und wird wieder ausgeschaltet. das
 * belegt so viel wie der standort beim gym, nämlich die sitzung und nicht ihren
 * inhalt — und damit trägt die unterscheidung zwischen gemessen und getippt
 * überall dieselbe aussage.
 */
export type MessbarerBereich = AreaId

export const MESSBARE_BEREICHE: MessbarerBereich[] = ['lernen', 'gym', 'boxen', 'lesen']

export function istMessbar(f: FeldId): f is MessbarerBereich {
  return f !== 'gewicht'
}

/** wie ein tick zustande kam. `null`, wo eine messung gar nicht möglich wäre */
export type TickQuelle = 'gemessen' | 'getippt'

export type AreaDef = {
  id: AreaId
  label: string
  unit: 'min' | 'seiten'
  step: number
}

export type UserDef = {
  id: UserId
  name: string
  farbe: string
  leer: string
}

/** mss: leistungskurs oder grundkurs. rheinland-pfalz hat drei lk */
export type Kursart = 'lk' | 'gk'
export type Notenart = 'klausur' | 'epo' | 'hue'

export type Fach = {
  id: string
  user: UserId
  name: string
  kursart: Kursart
  pruefungsfach: number | null
  sortierung: number
}

export type Note = {
  id: string
  user: UserId
  fachId: string
  art: Notenart
  punkte: number
  /** festes gewicht: epo 20, klausur und hü 10 */
  gewicht: number
  /** lokaler kalendertag, gebildet mit `toKey` */
  datum: string
  titel: string
}

export type Notenstand = { faecher: Fach[]; noten: Note[] }

export const GEWICHT_STANDARD = 10

export const AREAS: AreaDef[] = [
  { id: 'lernen', label: 'lernen', unit: 'min', step: 15 },
  { id: 'gym', label: 'gym', unit: 'min', step: 15 },
  { id: 'boxen', label: 'boxen', unit: 'min', step: 15 },
  { id: 'lesen', label: 'lesen', unit: 'seiten', step: 10 },
]

/**
 * das gewicht ist kein tick, den man antippt, sondern eine messung — es zählt
 * aber genauso in wochenstand, raster und bilanz. deshalb steht es neben AREAS
 * und nicht darin.
 */
export const GEWICHT_FELD = { id: 'gewicht' as const, label: 'gewicht' }

/** alles, worüber gewertet wird: die vier bereiche und das gewicht */
export const FELDER: { id: FeldId; label: string }[] = [
  ...AREAS.map((a) => ({ id: a.id as FeldId, label: a.label })),
  GEWICHT_FELD,
]

/** farbe gehört der person, nicht der rolle */
export const USERS: UserDef[] = [
  { id: 'erijon', name: 'erijon', farbe: 'var(--erijon)', leer: 'var(--erijon-leer)' },
  { id: 'koray', name: 'koray', farbe: 'var(--koray)', leer: 'var(--koray-leer)' },
]

export function user(id: UserId): UserDef {
  return USERS.find((u) => u.id === id)!
}

export function other(id: UserId): UserDef {
  return USERS.find((u) => u.id !== id)!
}

export function area(id: AreaId): AreaDef {
  return AREAS.find((a) => a.id === id)!
}

/** `${user}|${area}|${yyyy-mm-dd}` — der schlüssel eines tages je person */
export type TickKey = string

/** altbestand: der haken je person, bereich und tag aus `eintraege` */
export type Ticks = Record<TickKey, true>

/** altbestand: `${area}|${yyyy-mm-dd}` -> tageswert aus `werte`, nur eigene */
export type Werte = Record<string, number>

/**
 * eine einzelne durchführung. gym um sieben und gym um sieben abends sind zwei
 * einheiten, kein ersetzter tageswert. `wert` ist null, wo nie eine dauer
 * erfasst wurde — geraten wird nichts.
 */
export type Einheit = {
  /** uuid, vom client erzeugt. dieselbe id zweimal zu senden legt nichts an */
  id: string
  user: UserId
  area: AreaId
  /** lokaler kalendertag, gebildet mit `toKey` — nie aus einer utc-zeit */
  tag: string
  /** minuten oder seiten, je nach bereich. null heißt: nie erfasst */
  wert: number | null
  /** zeitpunkt der eintragung als iso-string, soweit vorhanden */
  erfasst: string | null
  /**
   * zeitpunkt der durchfuehrung selbst, soweit erfasst. erfasst bleibt die
   * eintragungszeit — eine nachgetragene oder geplante einheit mit uhrzeit
   * traegt ihre zeit hier. fehlt der wert, zeigt die anzeige erfasst.
   */
  von?: string | null
}

/** `${user}|${area}|${yyyy-mm-dd}` -> die einheiten des tages, älteste zuerst */
export type Einheiten = Record<TickKey, Einheit[]>

/** eine komponente des nachtwerts, so wie der server sie rechnet */
export type ScoreKomponente = {
  wert: number
  gewicht: number
  punkte: number | null
}

export type ScoreKomponenten = Record<string, ScoreKomponente>

/** `${user}|${yyyy-mm-dd}` -> kilogramm. beide sehen beide, wie bei den ticks */
export type Gewichte = Record<string, number>

/**
 * `${user}|${yyyy-mm-dd}` -> wie die zahl in die datenbank kam. fehlt der
 * schlüssel, war es der daumen: eine getippte zahl ist der normalfall, und ein
 * fehlender eintrag darf niemals als messung durchgehen.
 */
export type GewichtQuellen = Record<string, TickQuelle>

/**
 * eine gemessene sitzung, so wie das iphone sie gemeldet hat: eine
 * standort-automation am trainingsort oder eine fokus-automation beim ein- und
 * ausschalten. `abgang` fehlt, solange sie läuft — eine offene sitzung zählt
 * nicht, sonst wäre eine vorbeifahrt ein training und ein vergessener fokus
 * ein lerntag.
 */
export type Aufenthalt = {
  user: UserId
  bereich: MessbarerBereich
  /** name der quelle: ein trainingsort oder ein fokus */
  ort: string
  ankunft: string
  abgang: string | null
}

export type Zustand = {
  einheiten: Einheiten
  gewichte: Gewichte
  /** fehlt der eintrag, gilt die zahl als getippt */
  gewichtQuellen?: GewichtQuellen
  aufenthalte: Aufenthalt[]
}

export type PhasenArt = 'tief' | 'rem' | 'kern' | 'unspez' | 'wach'

/** ein stück nacht. start und dauer in minuten, gezählt ab der einschlafzeit */
export type Phase = {
  art: PhasenArt
  start: number
  dauer: number
}

/**
 * eine nacht, so wie `schlafnaechte_ansicht` sie liefert. alles bis auf den
 * nachtwert ist eine gemessene größe aus apple health; der nachtwert kommt
 * fertig gerechnet aus der datenbank.
 */
export type Schlafnacht = {
  user: UserId
  nacht: string
  schlafMinuten: number
  einschlafzeit: string
  aufwachzeit: string | null
  bettStart: string | null
  bettEnde: string | null
  bettMinuten: number | null
  tiefMinuten: number
  remMinuten: number
  kernMinuten: number
  unspezMinuten: number
  wachMinuten: number
  /** persönliches schlafziel aus dem kurzbefehl */
  zielMinuten: number
  /**
   * der verlauf der nacht.
   *
   * `[]` heisst: die quelle liefert keine stadien, es bleibt die dauer.
   * `null` heisst: noch nicht geladen. die phasen sind mit rund drei kilobyte
   * je nacht das einzige, was mit der historie spuerbar waechst, und gebraucht
   * werden sie nur im nachtdetail — also kommen aeltere naechte ohne sie und
   * holen sie sich, wenn jemand sie oeffnet.
   */
  phasen: Phase[] | null
  /**
   * nachtwert v2 aus der datenbank, 0 bis 100. der trigger auf
   * `schlafnaechte` rechnet ihn für jeden schreibweg gleich, deshalb steht
   * hier nie eine zweite meinung. null im prototyp-modus ohne supabase.
   */
  nachtwert: number | null
  /**
   * wie viel der bewertungsbasis gemessen war, 1 bis 100. eine nacht ohne
   * bettzeit und ohne historie wird nach demselben maßstab bewertet, aber
   * aus weniger belegen.
   */
  scoreKonfidenz: number | null
  /**
   * die komponenten des nachtwerts — dauer, effizienz, phasen,
   * unterbrechungen, regelmaessigkeit — mit wert, gewicht und punkten.
   * null im prototyp ohne datenbank.
   */
  scoreKomponenten?: ScoreKomponenten | null
}

/** eine archivierte wochenabrechnung des sonntagsfinals */
export type Abrechnung = {
  /** lokaler montag der woche, als key */
  woche: string
  sieger: UserId | 'unentschieden'
  grund: 'punkte' | 'beleg' | 'unentschieden'
  /** punkte erijon minus punkte koray, unabhaengig vom angemeldeten konto */
  differenz: number
  belegErijon: number
  belegKoray: number
  wette: string | null
  /** iso-zeitpunkt des abschlusses */
  abgeschlossen: string
}

export function tickKey(u: UserId, a: AreaId, tag: string): TickKey {
  return `${u}|${a}|${tag}`
}

/**
 * eine id, die auf jedem gerät und ohne netz entsteht. sie ist der primary key
 * der zeile: ein wiederholtes senden nach einem timeout legt deshalb keine
 * zweite einheit an, sondern läuft ins leere.
 */
export function neueEinheitId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // älteres webview: zufall aus getRandomValues, sonst aus Math.random
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** derselbe uuid-weg wie bei einheiten */
export const neueNotenId = neueEinheitId

export function wertKey(a: AreaId, tag: string): string {
  return `${a}|${tag}`
}

export function gewichtKey(u: UserId, tag: string): string {
  return `${u}|${tag}`
}

export type Ereignis = {
  id: number
  user: UserId
  area: AreaId
  tag: string
  gesetzt: boolean
  quelle: 'selbst' | 'fremd'
}
