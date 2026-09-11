import { publizierbarerSupabaseKey } from './supabaseKey.ts'
import { subAusToken } from './token.ts'

/**
 * ENIs Stimme, wenn eine echte dahintersteht.
 *
 * Die Sprachausgabe des Browsers bleibt eingebaut und faengt alles auf, was
 * hier nicht klappt. Sie klingt aber, wie sie klingt: auf dem iPhone sind alle
 * ihre Stimmen lokal und blechern, und daran aendert keine Einstellung etwas.
 * Wer ENI wirklich zuhoeren soll, braucht eine neuronale Stimme, und die kommt
 * von einer Gegenstelle.
 *
 * Drei Entscheidungen tragen diese Funktion:
 *
 * 1. Der Client schickt eine Nachrichten-ID, nie einen Text. Was gesprochen
 *    wird, liest die Function selbst aus der Datenbank, unter Row Level
 *    Security und nur, wenn die Zeile von ENI stammt. Ein Client, der beliebigen
 *    Text vorlesen lassen koennte, waere eine offene Rechnung: man koennte in
 *    einer Schleife Romane synthetisieren lassen.
 * 2. Jeder Ton wird genau einmal erzeugt. Der Pfad im Bucket ergibt sich aus
 *    der Nachricht, also ist „gibt es das schon" dieselbe Frage wie „liegt die
 *    Datei da". Eine Antwort zehnmal anzuhoeren kostet danach nichts mehr.
 * 3. Der Schluessel steht nur in `Deno.env`. Er geht nie in eine Antwort und
 *    nie in eine URL — auch nicht als `?key=`, weshalb der Aufruf drueben den
 *    Header `X-Goog-Api-Key` benutzt.
 *
 * Die Gegenstelle liefert rohes PCM, kein fertiges Audioformat. Der WAV-Kopf
 * wird deshalb hier geschrieben: vierundvierzig Byte, die jeder Browser
 * versteht. Ein MP3-Kodierer waere eine Bibliothek in einer Deno-Function fuer
 * eine Ersparnis, die auf dem freien Speicher dieses Projekts niemand merkt.
 *
 * Eine eigene Tagesgrenze braucht es nicht. Weil jeder Ton nur einmal entsteht,
 * ist der Verbrauch durch die Zahl der Antworten gedeckelt, und die deckelt
 * `ENI_TAGESLIMIT` in der anderen Function schon.
 */

/**
 * Maennerstimme. Charon ist die ruhige tiefe; Fenrir, Orus, Puck, Umbriel,
 * Enceladus und Iapetus sind die anderen maennlichen derselben Familie. Ueber
 * ENI_STIMME umstellbar, weil Geschmack bei einer Stimme nichts ist, was man in
 * Code gerecht entscheiden kann.
 */
export const STANDARD_STIMME = 'Charon'

export const STIMME_BUCKET = 'eni-stimme'

/** so lang darf eine antwort insgesamt sein, die gesprochen wird */
export const MAX_ZEICHEN = 12_000

/**
 * So viel Text geht in einen einzelnen Aufruf.
 *
 * Die Gegenstelle naehme gut viertausend Zeichen am Stueck, und genau so stand
 * es hier auch. Das war der Grund, warum ENIs Stimme eine halbe Minute auf sich
 * warten liess: die Dauer eines TTS-Aufrufs haengt fast nur an der Laenge des
 * erzeugten Tons, und ein einzelner langer Aufruf ist eine einzelne lange
 * Wartezeit. Neunhundert Zeichen sind etwa eine Minute Sprache — kurz genug,
 * dass drei davon nebeneinander schneller fertig sind als eines am Stueck.
 */
export const MAX_STUECK_ZEICHEN = 900

/**
 * So viele Stuecke werden gleichzeitig gesprochen. Drei, nicht mehr: die
 * Gegenstelle zaehlt Anfragen je Minute, und ein Schluessel aus AI Studio zaehlt
 * knapp. Wer hier hochdreht, tauscht Wartezeit gegen 429er ein — und ein 429
 * kostet mit Wiederholung mehr Zeit, als die Nebenlaeufigkeit einbringt.
 */
export const GLEICHZEITIG = 3

/** so oft wird ein einzelnes stueck hoechstens versucht */
export const VERSUCHE = 3

/** wie lange nach einem missglueckten versuch gewartet wird */
export const WARTE_MS = [700, 2_000]

/**
 * Nach dieser Zeit wird die Erzeugung abgebrochen, egal wie weit sie ist. Eine
 * Edge Function hat ein Zeitbudget; es abzuwarten heisst, dass der Browser gar
 * keine Antwort bekommt und der Mensch in die Stille schaut. Lieber ein sauberer
 * Fehlschlag, auf den der Browser mit seiner eigenen Stimme antworten kann.
 */
export const GESAMT_FRIST_MS = 100_000

/** was die gegenstelle liefert: 24 kHz, ein kanal, 16 bit */
export const ABTASTRATE = 24_000

/** so lange gilt die adresse, unter der der browser den ton abholt */
export const FRIST_S = 3600

type Fehler = { code?: string; message?: string; status?: number; statusCode?: string }
type Ergebnis<T> = { data: T; error: Fehler | null }

export type Zeile = Record<string, unknown>

type Abfrage = PromiseLike<Ergebnis<Zeile[] | null>> & {
  eq(spalte: string, wert: unknown): Abfrage
  maybeSingle(): PromiseLike<Ergebnis<Zeile | null>>
}

export type StimmDatenbank = {
  auth: {
    getClaims?(token: string): PromiseLike<Ergebnis<{ claims?: { sub?: string } } | null>>
  }
  from(tabelle: string): { select(spalten: string): Abfrage }
  storage: {
    from(bucket: string): {
      list(
        ordner: string,
        optionen: { search: string; limit: number }
      ): PromiseLike<Ergebnis<Array<{ name: string }> | null>>
      upload(
        pfad: string,
        daten: Uint8Array,
        optionen: { contentType: string; upsert: boolean }
      ): PromiseLike<Ergebnis<unknown>>
      createSignedUrl(
        pfad: string,
        sekunden: number
      ): PromiseLike<Ergebnis<{ signedUrl?: string | null } | null>>
    }
  }
}

export type StimmAnfrage = { text: string; stimme: string }

/**
 * Ein Fehlschlag der Gegenstelle, der sagt, ob es sich lohnt, es noch einmal zu
 * versuchen.
 *
 * Das ist der Unterschied zwischen „ENIs Stimme kommt nie" und „ENIs Stimme kam
 * gerade nicht": eine Drosselung (429) oder ein Aussetzer (5xx) sind in ein paar
 * hundert Millisekunden vorbei, eine abgelehnte Anfrage (400) ist es nie. Ohne
 * diese Unterscheidung wurde bisher jeder Aussetzer bis zum Menschen
 * durchgereicht, der dann selbst noch einmal getippt hat — genau das, was eine
 * Wiederholung hier in einer Sekunde erledigt.
 */
export class StimmFehler extends Error {
  constructor(
    message: string,
    readonly wiederholbar: boolean,
    /** was die gegenstelle selbst als wartezeit nennt, in millisekunden */
    readonly wartenMs: number | null = null
  ) {
    super(message)
    this.name = 'StimmFehler'
  }
}

export type EniStimmeAbhaengigkeiten = {
  umgebung(name: string): string | undefined
  datenbank(url: string, key: string, autorisierung: string): StimmDatenbank
  /** liefert das rohe PCM eines stuecks. injiziert, damit tests kein netz brauchen */
  modell(anfrage: StimmAnfrage, schluessel: string): Promise<Uint8Array>
  protokoll: Pick<Console, 'error'>
  /** wartet zwischen zwei versuchen. injiziert, damit tests nicht wirklich warten. */
  warte?(ms: number): Promise<void>
  /** die uhr, aus demselben grund injizierbar */
  jetzt?(): number
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const JSON_HEADERS = {
  ...CORS,
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

function antwort(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function bearerToken(autorisierung: string): string | null {
  const fund = autorisierung.match(/^Bearer\s+(.+)$/i)
  const token = fund?.[1]?.trim() ?? ''
  return token === '' ? null : token
}

/**
 * Ob ein missglueckter Upload nur heisst: jemand war schneller.
 *
 * Liegt die Datei schon da, ist alles gut. Derselbe Pfad heisst derselbe Ton —
 * er ergibt sich vollstaendig aus der Nachricht —, also hat ein zweiter Aufruf
 * fuer dieselbe Zeile hier genau das gefunden, was er selbst ablegen wollte.
 * Wer zweimal auf den Knopf tippt, weil es beim ersten Mal lange dauert, loest
 * das aus, und das ist kein Fehler, sondern ein Rennen mit gutem Ausgang.
 *
 * Der kurze Umweg ueber `upsert: true` war die falsche Antwort darauf: der Bucket
 * gibt dem angemeldeten Konto insert, select und delete, aber kein update, und
 * ein Upsert verlangt beides. Ergebnis war ein AccessDenied bei jedem Ton —
 * und damit die blecherne Stimme statt ENIs eigener. Ein Konto braucht hier kein
 * Ueberschreiben; es reicht zu wissen, dass Ueberschreiben nicht noetig ist.
 */
export function liegtSchonDa(fehler: Fehler): boolean {
  if (fehler.statusCode === '409' || fehler.status === 409) return true
  if (fehler.code === 'KeyAlreadyExists' || fehler.code === 'Duplicate') return true
  return /already exists|duplicate/i.test(fehler.message ?? '')
}

/**
 * Der Pfad eines Tons. Rein und exportiert, weil er die ganze Cache-Logik
 * traegt: derselbe Pfad heisst derselbe Ton, und der erste Ordner ist die
 * user-id, an der die Policy im Bucket haengt.
 */
export function tonPfad(userId: string, chatId: string, nachrichtId: string): string {
  return `${userId}/${chatId}/${nachrichtId}.wav`
}

/**
 * Eine lange Antwort in Stuecke schneiden, die einzeln gesprochen werden
 * koennen — an Satzenden, damit die Naht zwischen zwei Stuecken dort liegt, wo
 * ohnehin eine Pause ist. Ein Satz, der allein schon zu lang ist, bricht am
 * letzten Leerzeichen davor.
 */
export function teileFuerAufnahme(text: string, grenze = MAX_STUECK_ZEICHEN): string[] {
  const saetze = text
    .split(/(?<=[.!?:])\s+|\n+/)
    .map((satz) => satz.trim())
    .filter((satz) => satz !== '')

  const stuecke: string[] = []
  let offen = ''

  for (const satz of saetze) {
    if (satz.length > grenze) {
      if (offen !== '') {
        stuecke.push(offen)
        offen = ''
      }
      let rest = satz
      while (rest.length > grenze) {
        const schnitt = rest.lastIndexOf(' ', grenze)
        const bei = schnitt > grenze / 2 ? schnitt : grenze
        stuecke.push(rest.slice(0, bei).trim())
        rest = rest.slice(bei).trim()
      }
      if (rest !== '') offen = rest
      continue
    }
    if (offen === '') offen = satz
    else if (offen.length + 1 + satz.length <= grenze) offen = `${offen} ${satz}`
    else {
      stuecke.push(offen)
      offen = satz
    }
  }

  if (offen !== '') stuecke.push(offen)
  return stuecke
}

/**
 * Was ENI schreibt, ist fuer Augen gesetzt; was gesprochen wird, ist es nicht.
 *
 * Sterne, Rauten und Backticks liest eine neuronale Stimme entweder mit oder sie
 * stolpert darueber, und jedes Zeichen, das sie liest, ist Ton, der erzeugt und
 * uebertragen werden will. Das hier nimmt die Auszeichnung heraus und laesst die
 * Worte stehen. Rein und exportiert, weil „was hat ENI eigentlich gesagt" eine
 * Frage ist, die man pruefen koennen muss.
 */
export function fuerDieStimme(text: string): string {
  return text
    // ein codeblock ist nichts zum vorlesen; die zaeune fallen, der inhalt bleibt
    .replace(/^```.*$/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    // [wort](adresse): die adresse vorzulesen hilft niemandem
    .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(?<![A-Za-zÀ-ÿ0-9])[*_](?=\S)([^*_\n]+?)(?<=\S)[*_](?![A-Za-zÀ-ÿ0-9])/g, '$1')
    // ueberschriften, aufzaehlungen und zitatzeichen am zeilenanfang
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    // eine trennlinie wuerde als drei bindestriche gesprochen
    .replace(/^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Ein einzelnes Stueck sprechen lassen, und zwar so oft, wie es sich lohnt.
 *
 * Ein leeres Ergebnis zaehlt wie ein Fehlschlag. Frueher wurde es stillschweigend
 * uebersprungen: aus einer Antwort, deren mittleres Stueck die Gegenstelle
 * verschluckt hat, wurde dann eine Aufnahme, in der mitten im Satz ein Stueck
 * fehlt — und die lag danach im Regal und wurde nie wieder erzeugt.
 */
async function sprichStueck(
  stueck: string,
  stimme: string,
  schluessel: string,
  deps: EniStimmeAbhaengigkeiten
): Promise<Uint8Array> {
  const warte = deps.warte ?? ((ms: number) => new Promise((fertig) => setTimeout(fertig, ms)))
  let letzter: unknown = null

  for (let versuch = 0; versuch < VERSUCHE; versuch += 1) {
    if (versuch > 0) {
      const eigen = letzter instanceof StimmFehler ? letzter.wartenMs : null
      await warte(Math.min(eigen ?? WARTE_MS[versuch - 1] ?? 2_000, 5_000))
    }
    try {
      const pcm = await deps.modell({ text: stueck, stimme }, schluessel)
      if (pcm.byteLength > 0) return pcm
      letzter = new StimmFehler('gegenstelle liefert keinen ton', true)
    } catch (ursache) {
      letzter = ursache
      // eine abgelehnte anfrage wird beim zweiten mal genauso abgelehnt
      if (ursache instanceof StimmFehler && !ursache.wiederholbar) break
    }
    deps.protokoll.error(`eni-stimme: versuch ${versuch + 1} misslungen`, letzter)
  }

  throw letzter instanceof Error ? letzter : new StimmFehler('stimme kam nicht durch', false)
}

/**
 * Alle Stuecke sprechen lassen, hoechstens `GLEICHZEITIG` davon nebeneinander,
 * und in der Reihenfolge zurueckgeben, in der sie geschrieben stehen.
 *
 * Die Reihenfolge der Abtastwerte ist die Reihenfolge der Saetze — deshalb die
 * feste Ablage in `teile[nr]` statt eines Anhaengens in der Reihenfolge des
 * Eintreffens. Nebeneinander heisst hier nur: die Wartezeiten ueberlappen sich.
 */
async function sprichAlle(
  stuecke: string[],
  stimme: string,
  schluessel: string,
  deps: EniStimmeAbhaengigkeiten
): Promise<Uint8Array[]> {
  const jetzt = deps.jetzt ?? (() => Date.now())
  const beginn = jetzt()
  const teile = new Array<Uint8Array>(stuecke.length)
  let naechstes = 0

  const arbeiter = async () => {
    for (;;) {
      const nr = naechstes
      naechstes += 1
      if (nr >= stuecke.length) return
      if (jetzt() - beginn > GESAMT_FRIST_MS) {
        throw new StimmFehler('ENIs stimme hat zu lange gebraucht', false)
      }
      teile[nr] = await sprichStueck(stuecke[nr]!, stimme, schluessel, deps)
    }
  }

  const spuren = Math.min(GLEICHZEITIG, stuecke.length)
  await Promise.all(Array.from({ length: spuren }, arbeiter))
  return teile
}

/**
 * Aus rohem PCM eine Datei machen, die ein Browser abspielt.
 *
 * Ein WAV ist vierundvierzig Byte Kopf und danach die Abtastwerte, so wie sie
 * hereinkamen. Alles darin ist Little-Endian, und die zwei Groessenangaben sind
 * die einzige Stelle, an der man sich vertun kann: die erste zaehlt alles nach
 * den ersten acht Byte, die zweite nur die Abtastwerte.
 */
export function wavAusPcm(pcm: Uint8Array, rate = ABTASTRATE): Uint8Array {
  const kanaele = 1
  const bits = 16
  const byteJeSekunde = (rate * kanaele * bits) / 8
  const blockausrichtung = (kanaele * bits) / 8

  const datei = new Uint8Array(44 + pcm.byteLength)
  const sicht = new DataView(datei.buffer)
  const schreibe = (versatz: number, wort: string) => {
    for (let i = 0; i < wort.length; i += 1) datei[versatz + i] = wort.charCodeAt(i)
  }

  schreibe(0, 'RIFF')
  sicht.setUint32(4, 36 + pcm.byteLength, true)
  schreibe(8, 'WAVE')
  schreibe(12, 'fmt ')
  sicht.setUint32(16, 16, true) // laenge des fmt-abschnitts
  sicht.setUint16(20, 1, true) // 1 = unkomprimiertes PCM
  sicht.setUint16(22, kanaele, true)
  sicht.setUint32(24, rate, true)
  sicht.setUint32(28, byteJeSekunde, true)
  sicht.setUint16(32, blockausrichtung, true)
  sicht.setUint16(34, bits, true)
  schreibe(36, 'data')
  sicht.setUint32(40, pcm.byteLength, true)
  datei.set(pcm, 44)
  return datei
}

export async function behandleEniStimme(
  request: Request,
  deps: EniStimmeAbhaengigkeiten
): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') return antwort(405, { error: 'nur POST' })

  const url = deps.umgebung('SUPABASE_URL')
  const oeffentlicherKey = publizierbarerSupabaseKey(deps.umgebung)
  const schluessel = deps.umgebung('GEMINI_API_KEY')?.trim() ?? ''
  const stimme = deps.umgebung('ENI_STIMME')?.trim() || STANDARD_STIMME

  if (!url || !oeffentlicherKey) {
    return antwort(500, { error: 'server ist nicht vollständig konfiguriert' })
  }

  let anfrage: { nachrichtId?: unknown; pruefen?: unknown }
  try {
    anfrage = (await request.json()) as typeof anfrage
  } catch {
    return antwort(400, { error: 'anfrage ist kein gültiges json' })
  }

  // Sagt nur, ob eine Stimme eingerichtet ist, und ruft dafuer nichts auf. Der
  // Client fragt das einmal beim Aufgehen, um zu wissen, ob er die Stimme des
  // Browsers nehmen muss.
  if (anfrage.pruefen === true) {
    return antwort(200, { bereit: schluessel !== '', stimme: schluessel === '' ? null : stimme })
  }

  if (schluessel === '') {
    return antwort(503, {
      error: 'ENI hat noch keine eigene stimme. siehe ENI-SCHLUESSEL.md',
      code: 'keine_stimme',
    })
  }

  const nachrichtId = typeof anfrage.nachrichtId === 'string' ? anfrage.nachrichtId.trim() : ''
  if (!nachrichtId) return antwort(400, { error: 'nachricht ist pflicht' })

  const autorisierung = request.headers.get('authorization') ?? ''
  const token = bearerToken(autorisierung)
  if (!token) return antwort(401, { error: 'ohne anmeldung aufgerufen' })

  const db = deps.datenbank(url, oeffentlicherKey, autorisierung)

  /**
   * Wer da ruft. Erst der Blick ins Token selbst, dann `getClaims`.
   *
   * Die Reihenfolge stand andersherum und kostete bei jedem Ton einen Umweg,
   * bevor ueberhaupt jemand gesprochen hatte. Sie ist trotzdem sicher: die
   * user-id entscheidet hier nur, in welchem Ordner der Ton liegt. Was gesprochen
   * werden darf, entscheidet die Policy an der Zeile — und die prueft die
   * Unterschrift des Tokens, nicht diese Zeile hier.
   */
  let userId = subAusToken(token)
  if (!userId) {
    try {
      if (db.auth.getClaims) {
        const anspruch = await db.auth.getClaims(token)
        if (!anspruch.error) userId = anspruch.data?.claims?.sub ?? null
      }
    } catch (ursache) {
      deps.protokoll.error('eni-stimme: getClaims nicht nutzbar', ursache)
    }
  }
  if (!userId) return antwort(401, { error: 'anmeldung ist ungültig oder abgelaufen' })

  // Was gesprochen wird, steht in der Datenbank und nicht in der Anfrage. Ein
  // fremder Chat scheitert hier an der Policy, nicht an einer eigenen Pruefung.
  const zeile = await db
    .from('eni_nachrichten')
    .select('id,chat_id,rolle,text')
    .eq('id', nachrichtId)
    .maybeSingle()
  if (zeile.error) return antwort(500, { error: 'die nachricht konnte nicht gelesen werden' })
  if (!zeile.data) return antwort(404, { error: 'diese nachricht gibt es nicht' })

  // Nur ENIs eigene Zeilen. Die eigenen Worte vorgelesen zu bekommen hilft
  // niemandem, und jede Zeile, die nicht von ENI stammt, waere eine weitere
  // Stelle, an der jemand Text in die Rechnung schreiben koennte.
  if (zeile.data.rolle !== 'eni') {
    return antwort(400, { error: 'nur ENIs eigene antworten werden gesprochen' })
  }

  const text = fuerDieStimme(String(zeile.data.text ?? ''))
  if (text === '') return antwort(400, { error: 'diese antwort hat keinen text' })
  if (text.length > MAX_ZEICHEN) {
    return antwort(400, { error: 'diese antwort ist zu lang zum vorlesen' })
  }

  const chatId = String(zeile.data.chat_id ?? '')
  const pfad = tonPfad(userId, chatId, nachrichtId)
  const ordner = `${userId}/${chatId}`
  const eimer = db.storage.from(STIMME_BUCKET)

  const gibEsSchon = await eimer.list(ordner, { search: `${nachrichtId}.wav`, limit: 1 })
  const liegtDa = (gibEsSchon.data ?? []).some((eintrag) => eintrag.name === `${nachrichtId}.wav`)

  if (!liegtDa) {
    // Die Stuecke ueberlappen sich, statt hintereinander zu warten. Die
    // Reihenfolge bleibt trotzdem die der Saetze, dafuer sorgt `sprichAlle`.
    let teile: Uint8Array[]
    try {
      teile = await sprichAlle(teileFuerAufnahme(text), stimme, schluessel, deps)
    } catch (ursache) {
      deps.protokoll.error('eni-stimme: gegenstelle nicht erreichbar', ursache)
      return antwort(502, {
        error: 'ENIs stimme kam nicht durch.',
        code: 'stimme_fehler',
      })
    }

    const gesamtlaenge = teile.reduce((summe, teil) => summe + (teil?.byteLength ?? 0), 0)
    if (gesamtlaenge === 0) {
      return antwort(502, { error: 'ENIs stimme kam nicht durch.', code: 'leerer_ton' })
    }

    const pcm = new Uint8Array(gesamtlaenge)
    let versatz = 0
    for (const teil of teile) {
      pcm.set(teil, versatz)
      versatz += teil.byteLength
    }
    const toene = wavAusPcm(pcm)

    // `upsert: false`: der Bucket erlaubt dem Konto kein Ueberschreiben, und es
    // braucht auch keins. Dass die Datei schon dalag, ist kein Fehlschlag —
    // siehe `liegtSchonDa`.
    const gelegt = await eimer.upload(pfad, toene, { contentType: 'audio/wav', upsert: false })
    if (gelegt.error && !liegtSchonDa(gelegt.error)) {
      // Eine Adresse zu unterschreiben, hinter der nichts liegt, waere die
      // schlechteste aller Antworten: der Browser laedt sie, bekommt 404 und
      // faellt erst dann auf seine eigene Stimme zurueck — nach der ganzen
      // Wartezeit. Ein Fehler hier laesst ihn sofort selbst sprechen.
      deps.protokoll.error('eni-stimme: ton nicht abgelegt', gelegt.error)
      return antwort(502, { error: 'ENIs stimme kam nicht durch.', code: 'nicht_abgelegt' })
    }
  }

  const adresse = await eimer.createSignedUrl(pfad, FRIST_S)
  if (adresse.error || !adresse.data?.signedUrl) {
    return antwort(502, { error: 'ENIs stimme kam nicht durch.', code: 'keine_adresse' })
  }

  return antwort(200, {
    adresse: adresse.data.signedUrl,
    stimme,
    // damit der Client sieht, ob er gerade bezahlt hat oder aus dem Regal nimmt
    ausDemRegal: liegtDa,
  })
}
