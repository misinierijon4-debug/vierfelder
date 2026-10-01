import { findeAnbieter, mitVordenken, schluesselVon } from './eniAnbieter.ts'
import {
  baueAkte,
  DauerFehler,
  ersteSchritte,
  fuehreSchrittAus,
  istFertig,
  MAX_VERSUCHE,
  naechsterSchritt,
  SCHRITT_FRIST_MS,
  SEITE_MAX,
  WIKI_MAX,
  type AktenAbschnitt,
  type ModellAufruf,
  type Notiz,
  type Recherche,
  type RechercheDienste,
  type Schritt,
  type Seite,
} from './eniRecherche.ts'

/**
 * Die Function `eni-recherche`: nimmt eine laufende Recherche aus
 * `eni_rollen_wissen`, arbeitet Schritte ab, solange die Zeit reicht, und
 * legt den Stand zurück.
 *
 * Zwei Wege führen herein. Der Cron-Job ruft jede Minute mit dem
 * Scheduler-Geheimnis (dasselbe wie bei `aktivitaets-erinnerung`) und nimmt
 * irgendeine wartende Recherche; so läuft sie weiter, wenn die App zu ist.
 * Die offene Seite „ENI anpassen“ ruft mit dem Token der Person und nimmt nur
 * deren Recherche; so geht es schneller, solange jemand zusieht.
 *
 * Dass nie zwei Aufrufe an derselben Recherche arbeiten, regelt die Sperre in
 * `eni_recherche_nehmen` (drei Minuten, länger als ein Aufruf dauern darf).
 * Dass ein alter Aufruf nach einem Neustart nichts überschreibt, regelt `lauf`:
 * jeder Start bekommt eine neue, und gespeichert wird nur mit der eigenen.
 */

/** das kostenlose modell aus `eniAnbieter.ts`. viele lange aufrufe kosten hier nichts */
export const RECHERCHE_MODELL = 'qwen-flash'

/**
 * So lange darf ein Aufruf arbeiten. Supabase beendet eine Function nach 150
 * Sekunden; ein Schritt beginnt nur, wenn seine Frist noch davor endet.
 */
export const WANDUHR_MS = 135_000

/** nach einem fehlgeschlagenen schritt so lange pause, damit ein limit sich erholt */
export const PAUSE_NACH_FEHLER_MS = 45_000

// wikipedia will wissen, wer fragt; eine adresse braucht es dafuer nicht
const UA = 'vierfelder-eni/1.0 (private App, github.com/misinierijon4-debug/vierfelder)'

/** die beiden wikipedias, die gelesen werden. feste adressen, keine aus daten gebaute */
const WIKIPEDIA = { de: 'https://de.wikipedia.org', en: 'https://en.wikipedia.org' } as const

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function antwort(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

type Fehler = { code?: string; message: string }
type Ergebnis<T> = { data: T; error: Fehler | null }

type Aenderung = {
  eq(spalte: string, wert: unknown): Aenderung
  select(spalten: string): PromiseLike<Ergebnis<Array<Record<string, unknown>> | null>>
}

/** nur die kette, die hier benutzt wird — die tests bauen sie klein nach */
export type RechercheDatenbank = {
  auth: { getUser(token: string): PromiseLike<Ergebnis<{ user: { id: string } | null } | null>> }
  rpc(name: string, argumente: Record<string, unknown>): PromiseLike<Ergebnis<unknown>>
  from(tabelle: string): { update(zeile: Record<string, unknown>): Aenderung }
}

export type RechercheAbhaengigkeiten = {
  umgebung(name: string): string | undefined
  /** ein klient mit dienstrechten. `null`, wenn die umgebung ihn nicht hergibt */
  dienst(): RechercheDatenbank | null
  http?: typeof fetch
  /** nur für tests: netz und modell als attrappe */
  dienste?: RechercheDienste
  /**
   * Hält die Function nach der Antwort am Leben (`EdgeRuntime.waitUntil`).
   * Der Cron-Aufruf wartet damit keine zwei Minuten auf eine Antwort, und die
   * Arbeit hängt nicht an der Verbindung dessen, der angestoßen hat.
   */
  imHintergrund?(arbeit: Promise<unknown>): void
  jetzt?(): number
  protokoll: Pick<Console, 'error'> & Partial<Pick<Console, 'info'>>
}

// ---------------------------------------------------------------- netz

/** markdown-reste und leerraum aus einem seitentext */
export function seitentext(roh: string): string {
  return roh
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g, '$1')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*(\n\s*)+/g, '\n\n')
    .trim()
}

/** eine adresse, die anklickbar bleiben darf: http(s), ohne zugangsdaten */
function adresse(roh: unknown): string | null {
  if (typeof roh !== 'string') return null
  try {
    const url = new URL(roh)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}

export function seitenAusTavily(ergebnisse: unknown): Seite[] {
  const seiten: Seite[] = []
  for (const e of Array.isArray(ergebnisse) ? ergebnisse : []) {
    if (!e || typeof e !== 'object') continue
    const treffer = e as Record<string, unknown>
    const url = adresse(treffer.url)
    if (!url || seiten.some((s) => s.url === url)) continue
    const voll = typeof treffer.raw_content === 'string' ? seitentext(treffer.raw_content) : ''
    const kurz = typeof treffer.content === 'string' ? seitentext(treffer.content) : ''
    const text = (voll.length > kurz.length ? voll : kurz).slice(0, SEITE_MAX)
    if (!text) continue
    const titel = typeof treffer.title === 'string' && treffer.title.trim() ? treffer.title.trim() : new URL(url).hostname
    seiten.push({ titel: titel.replace(/\s+/g, ' ').slice(0, 180), url, text })
  }
  return seiten
}

/**
 * Suchen mit ganzem Seitentext. `basic` kostet einen Credit; der Inhalt
 * kommt aus `raw_content`, nicht aus den kurzen Auszügen — die sagen, worum
 * es auf einer Seite geht, aber nicht, was im dritten Kapitel steht.
 */
export function tavilySuche(schluessel: string, http: typeof fetch): RechercheDienste['suche'] {
  return async (frage, fristMs) => {
    if (!schluessel) throw new DauerFehler('Für die Recherche fehlt TAVILY_API_KEY.')
    const antwort = await http('https://api.tavily.com/search', {
      method: 'POST',
      headers: { authorization: `Bearer ${schluessel}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(fristMs),
      body: JSON.stringify({
        query: frage.slice(0, 400),
        search_depth: 'basic',
        max_results: 5,
        include_raw_content: true,
      }),
    })
    if (!antwort.ok) {
      await antwort.body?.cancel()
      if (antwort.status === 401 || antwort.status === 403)
        throw new DauerFehler('Tavily nimmt den Suchschlüssel nicht an. Prüfe TAVILY_API_KEY.')
      if (antwort.status === 432 || antwort.status === 433)
        throw new DauerFehler('Die freien Tavily-Suchen sind für diesen Monat aufgebraucht.')
      throw new Error(`tavily antwortet ${antwort.status}`)
    }
    return seitenAusTavily(((await antwort.json()) as { results?: unknown })?.results)
  }
}

/** ob ein gefundener artikel überhaupt zu dem namen gehört */
export function passtZumNamen(name: string, titel: string): boolean {
  const teile = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []
  const gesucht = teile(name)
  return teile(titel).some((t) =>
    gesucht.some((g) => {
      let gleich = 0
      while (gleich < t.length && gleich < g.length && t[gleich] === g[gleich]) gleich++
      return gleich === Math.min(t.length, g.length) || gleich >= 6
    }),
  )
}

/** der beste wikipedia-artikel je sprache, als ganzer text. kostenlos, ohne schlüssel */
export function wikipediaSuche(http: typeof fetch): RechercheDienste['wikipedia'] {
  return async (name, fristMs) => {
    const seiten = await Promise.all(
      (Object.keys(WIKIPEDIA) as Array<keyof typeof WIKIPEDIA>).map(async (sprache): Promise<Seite | null> => {
        try {
          const parameter = new URLSearchParams({
            action: 'query',
            format: 'json',
            formatversion: '2',
            generator: 'search',
            gsrsearch: name,
            gsrlimit: '1',
            prop: 'extracts',
            explaintext: '1',
            redirects: '1',
          })
          const antwort = await http(`${WIKIPEDIA[sprache]}/w/api.php?${parameter}`, {
            headers: { 'user-agent': UA, 'api-user-agent': UA },
            signal: AbortSignal.timeout(fristMs),
          })
          if (!antwort.ok) {
            await antwort.body?.cancel()
            return null
          }
          const daten = (await antwort.json()) as { query?: { pages?: Array<{ title?: unknown; extract?: unknown }> } }
          const seite = daten?.query?.pages?.[0]
          if (typeof seite?.title !== 'string' || typeof seite.extract !== 'string' || !seite.extract.trim()) return null
          if (!passtZumNamen(name, seite.title)) return null
          return {
            titel: `Wikipedia (${sprache}): ${seite.title}`,
            url: `${WIKIPEDIA[sprache]}/wiki/${encodeURIComponent(seite.title.replace(/ /g, '_'))}`,
            text: seite.extract.slice(0, WIKI_MAX),
          }
        } catch {
          // ohne wikipedia geht es auch, der plan sucht dann breiter
          return null
        }
      }),
    )
    return seiten.filter((s): s is Seite => s !== null)
  }
}

/** das kostenlose modell, ohne vordenken: viele kurze lese-aufrufe statt einer langen denkzeit */
export function freiesModell(
  umgebung: (name: string) => string | undefined,
  http: typeof fetch,
): RechercheDienste['modell'] {
  const anbieter = findeAnbieter(RECHERCHE_MODELL)!
  const gegenstelle = mitVordenken(anbieter, false)
  const schluessel = schluesselVon(anbieter, umgebung)
  return async (aufruf: ModellAufruf) => {
    if (!schluessel) throw new DauerFehler(`Für die Recherche fehlt ${anbieter.schluessel}.`)
    const antwort = await http(gegenstelle.endpunkt, {
      method: 'POST',
      headers: { authorization: `Bearer ${schluessel}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(aufruf.fristMs),
      body: JSON.stringify({
        model: gegenstelle.modell,
        max_tokens: aufruf.maxTokens,
        ...gegenstelle.denken,
        messages: [
          { role: 'system', content: aufruf.system },
          { role: 'user', content: aufruf.nutzer },
        ],
      }),
    })
    if (!antwort.ok) {
      await antwort.body?.cancel()
      const status = antwort.status
      // nur, was kein zweiter versuch behebt. ein 400 kann an einer zu langen
      // seite liegen; der trifft nur diesen schritt, nicht die recherche.
      if (status === 401) throw new DauerFehler(`${anbieter.name} nimmt den Schlüssel nicht an (HTTP 401). Prüfe ${anbieter.schluessel}.`)
      if (status === 402) throw new DauerFehler(`${anbieter.name} verlangt Guthaben (HTTP 402).`)
      if (status === 403) throw new DauerFehler(`${anbieter.name} verweigert den Modellzugriff (HTTP 403).`)
      if (status === 404) throw new DauerFehler(`${anbieter.name} findet das Modell nicht mehr (HTTP 404).`)
      throw new Error(`modell antwortet ${status}`)
    }
    const daten = (await antwort.json()) as {
      error?: { code?: unknown }
      choices?: Array<{ message?: { content?: unknown } }>
    }
    if (daten.error) throw new Error(`modell meldet fehler ${String(daten.error.code ?? '?')}`)
    const text = daten.choices?.[0]?.message?.content
    if (typeof text !== 'string' || !text.trim()) throw new Error('modell antwortet leer')
    return text
  }
}

// ---------------------------------------------------------------- zustand

function liste<T>(wert: unknown, pruefe: (e: Record<string, unknown>) => T | null): T[] {
  const raus: T[] = []
  for (const e of Array.isArray(wert) ? wert : []) {
    if (!e || typeof e !== 'object') continue
    const gut = pruefe(e as Record<string, unknown>)
    if (gut) raus.push(gut)
  }
  return raus
}

const text = (wert: unknown) => (typeof wert === 'string' ? wert : '')

/** eine zeile aus der datenbank als recherche. was nicht passt, fällt weg */
export function ausZeile(zeile: Record<string, unknown>): Recherche {
  const schritte = liste<Schritt>(zeile.schritte, (s) => {
    const basis = { erledigt: s.erledigt === true, versuche: typeof s.versuche === 'number' ? s.versuche : 0 }
    if (s.art === 'wiki' || s.art === 'planen') return { art: s.art, ...basis }
    if (s.art === 'suche' && text(s.frage)) return { art: 'suche', frage: text(s.frage), ...basis }
    if (s.art === 'abschnitt' && text(s.titel))
      return {
        art: 'abschnitt',
        titel: text(s.titel),
        auftrag: text(s.auftrag),
        woerter: typeof s.woerter === 'number' ? s.woerter : 600,
        ...basis,
      }
    return null
  })
  return {
    name: text(zeile.name),
    auftrag: text(zeile.auftrag),
    schritte: schritte.length ? schritte : ersteSchritte(),
    notizen: liste<Notiz>(zeile.notizen, (n) =>
      text(n.text)
        ? {
            titel: text(n.titel),
            text: text(n.text),
            quellen: liste(n.quellen, (q) => (adresse(q.url) ? { titel: text(q.titel), url: adresse(q.url)! } : null)),
          }
        : null,
    ),
    abschnitte: liste<AktenAbschnitt>(zeile.abschnitte, (a) =>
      text(a.titel) && text(a.text) ? { titel: text(a.titel), text: text(a.text) } : null,
    ),
  }
}

function datumText(ms: number): string {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'long', timeZone: 'Europe/Berlin' }).format(new Date(ms))
}

// ---------------------------------------------------------------- ablauf

/**
 * Schritte abarbeiten, bis die Recherche fertig ist oder die Zeit nicht mehr
 * für den nächsten reicht. Nach jedem Schritt wird gespeichert; findet das
 * Speichern die Zeile nicht mehr (abgebrochen, neu gestartet, gelöscht), hört
 * dieser Aufruf still auf.
 */
export async function arbeite(
  zeile: Record<string, unknown>,
  db: RechercheDatenbank,
  dienste: RechercheDienste,
  optionen: { start: number; jetzt: () => number; protokoll: RechercheAbhaengigkeiten['protokoll'] },
): Promise<'fertig' | 'weiter' | 'pause' | 'fehler' | 'weg'> {
  const { start, jetzt, protokoll } = optionen
  const speichere = async (felder: Record<string, unknown>): Promise<boolean> => {
    const { data, error } = await db
      .from('eni_rollen_wissen')
      .update(felder)
      .eq('user_id', zeile.user_id)
      .eq('rolle_id', zeile.rolle_id)
      .eq('lauf', zeile.lauf)
      .eq('status', 'laeuft')
      .select('lauf')
    if (error) throw new Error(`stand nicht speicherbar: ${error.message}`)
    return (data?.length ?? 0) > 0
  }

  let r = ausZeile(zeile)
  try {
    while (!istFertig(r)) {
      const schritt = r.schritte[naechsterSchritt(r)]!
      if (jetzt() - start + SCHRITT_FRIST_MS[schritt.art] > WANDUHR_MS) break
      const ergebnis = await fuehreSchrittAus(r, dienste)
      r = ergebnis.recherche
      const pause = !ergebnis.ok
      if (pause) protokoll.error(`eni-recherche: schritt ${schritt.art} gescheitert`, ergebnis.fehler)
      const bleibt = await speichere({
        schritte: r.schritte,
        notizen: r.notizen,
        abschnitte: r.abschnitte,
        // nach einem fehler kurz ruhen, sonst sofort weiter für den nächsten aufruf
        ...(pause ? { gesperrt_bis: new Date(jetzt() + PAUSE_NACH_FEHLER_MS).toISOString() } : {}),
      })
      if (!bleibt) return 'weg'
      if (pause) return 'pause'
    }
    if (!istFertig(r)) {
      return (await speichere({ gesperrt_bis: null })) ? 'weiter' : 'weg'
    }
    if (!r.abschnitte.length) {
      // uebersprungene schritte heissen: modell oder suche haben nicht
      // geantwortet. dann liegt es nicht am namen, und das soll da stehen.
      const gescheitert = r.schritte.filter((s) => s.versuche >= MAX_VERSUCHE).length
      await speichere({
        status: 'fehler',
        fehler: gescheitert
          ? `Die Recherche ist an Fehlern gescheitert: ${gescheitert} Schritte bekamen keine Antwort von Modell oder Suche. Versuch es später nochmal.`
          : `Zu „${r.name}“ hat die Recherche nichts Brauchbares gefunden. Prüf, ob der Name richtig geschrieben ist.`,
        gesperrt_bis: null,
      })
      return 'fehler'
    }
    const { akte, quellen } = baueAkte(r, datumText(jetzt()))
    const ok = await speichere({
      status: 'fertig',
      akte,
      quellen,
      akte_name: r.name,
      fertig_am: new Date(jetzt()).toISOString(),
      schritte: [],
      notizen: [],
      abschnitte: [],
      fehler: null,
      gesperrt_bis: null,
    })
    protokoll.info?.(`eni-recherche: fertig, ${r.abschnitte.length} abschnitte, ${quellen.length} quellen, ${akte.length} zeichen`)
    return ok ? 'fertig' : 'weg'
  } catch (ursache) {
    if (ursache instanceof DauerFehler) {
      await speichere({ status: 'fehler', fehler: ursache.message, gesperrt_bis: null }).catch(() => false)
      return 'fehler'
    }
    protokoll.error('eni-recherche: aufruf abgebrochen', ursache)
    await speichere({ gesperrt_bis: null }).catch(() => false)
    return 'pause'
  }
}

export async function behandleRecherche(request: Request, deps: RechercheAbhaengigkeiten): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') return antwort(405, { error: 'nur POST' })
  const db = deps.dienst()
  if (!db) return antwort(503, { error: 'server nicht bereit' })
  const jetzt = deps.jetzt ?? (() => Date.now())

  let nutzer: string | null = null
  const geheim = request.headers.get('x-erinnerungs-secret')
  if (geheim !== null) {
    if (!/^[a-f0-9]{64}$/.test(geheim)) return antwort(401, { error: 'nicht autorisiert' })
    const { data, error } = await db.rpc('pruefe_aktivitaets_scheduler', { p_token: geheim })
    if (error) return antwort(503, { error: 'autorisierung nicht pruefbar' })
    if (data !== true) return antwort(401, { error: 'nicht autorisiert' })
  } else {
    const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return antwort(401, { error: 'nicht angemeldet' })
    const { data, error } = await db.auth.getUser(token)
    if (error || !data?.user?.id) return antwort(401, { error: 'nicht angemeldet' })
    nutzer = data.user.id
  }

  const start = jetzt()
  const { data, error } = await db.rpc('eni_recherche_nehmen', { p_user: nutzer })
  if (error) {
    deps.protokoll.error('eni-recherche: nicht lesbar', error)
    return antwort(503, { error: 'recherche nicht lesbar' })
  }
  const zeile = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined
  if (!zeile) return antwort(200, { arbeit: false })

  const http = deps.http ?? fetch
  const dienste: RechercheDienste = deps.dienste ?? {
    suche: tavilySuche(deps.umgebung('TAVILY_API_KEY')?.trim() ?? '', http),
    wikipedia: wikipediaSuche(http),
    modell: freiesModell(deps.umgebung, http),
  }
  const arbeit = arbeite(zeile, db, dienste, { start, jetzt, protokoll: deps.protokoll }).catch((ursache) => {
    deps.protokoll.error('eni-recherche: unerwartet', ursache)
    return 'pause' as const
  })
  if (deps.imHintergrund) {
    deps.imHintergrund(arbeit)
    return antwort(202, { arbeit: true })
  }
  return antwort(200, { arbeit: true, ergebnis: await arbeit })
}
