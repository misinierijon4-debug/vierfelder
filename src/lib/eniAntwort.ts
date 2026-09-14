import { streamZeilen } from '../../supabase/functions/_shared/eniStream'
import { supabase } from './supabase'
import { eniAntwort } from './eni'
import type { AnhangVorlage } from './eniAnhang'
import type { EniSpeicher, EniZeile } from './eniSpeicher'

/**
 * Wer ENI antworten laesst.
 *
 * Zwei Fassungen mit derselben Form: das Modell hinter der Edge Function, und
 * die lokale Stimmenprobe im Prototyp oder solange kein Schluessel gesetzt ist.
 * Die Oberflaeche kennt nur diese Schnittstelle und muss deshalb nirgends
 * unterscheiden, wo das Urteil herkommt. Nur eine Stelle unterscheidet: die
 * Zeile im Kopf, die sagt, was gerade laeuft. Sie muss die Wahrheit sagen.
 */
/** ein anbieter, so wie die function ihn anbietet */
export type AnbieterInfo = {
  id: string
  name: string
  modell: string
  /** ob diese gegenstelle erst nachdenken kann. sonst steht der umschalter nicht da. */
  denkbar: boolean
  /** was unter dem umschalter steht, solange dieser anbieter dran ist */
  denkHinweis: string
}

/** was die pruefung zurueckgibt: ob überhaupt, und wenn ja, wer zur wahl steht */
export type Modellstand = {
  internet?: boolean
  bereit: boolean
  anbieter: AnbieterInfo[]
}

/** was eine antwort zurueckbringt: die vorlage, das urteil, ggf. ein grund */
export type Antwort = { mensch: EniZeile; eni: EniZeile | null; hinweis?: string }

export type Antwortgeber = {
  art: 'modell' | 'stimmenprobe'
  /** die id des anbieters, der antwortet. null in der stimmenprobe. */
  anbieter: string | null
  /** ob dieser geber die gegenstelle erst nachdenken lässt */
  denkt: boolean
  /**
   * schreibt vorlage und urteil und gibt beide zurueck. `eni` ist null, wenn
   * ENI zu dieser vorlage nichts sagt; dann steht der grund in `hinweis`.
   */
  antworte: (
    chatId: string,
    text: string,
    bisher: EniZeile[],
    /** bilder und dateien, die schon hochgeladen sind. leer ist der normalfall. */
    anhaenge?: AnhangVorlage[],
    signal?: AbortSignal,
    onText?: (text: string) => void,
    internet?: boolean
  ) => Promise<Antwort>
  /**
   * Noch einmal auf die letzte Vorlage antworten, die ohne Urteil geblieben
   * ist.
   *
   * Der Unterschied zu `antworte` ist, was *nicht* passiert: es wird nichts
   * geschrieben. Die Vorlage steht schon im Verlauf — sie ist ja wirklich
   * gesagt worden, auch wenn das Modell danach geschwiegen hat. Sie noch
   * einmal zu schicken hiesse, denselben Satz zweimal in den Chat zu stellen.
   */
  nochmal: (chatId: string, signal?: AbortSignal, onText?: (text: string) => void, internet?: boolean) => Promise<Antwort>
  /**
   * Erzeugt oder laedt den persistenten Wochenrueckblick fuer einen gebundenen
   * Wochenchat.
   */
  wochenbericht?: (
    chatId: string,
    wochenbeginn: string,
    signal?: AbortSignal,
    onText?: (text: string) => void
  ) => Promise<Antwort>
}

export class EniModellFehler extends Error {
  constructor(
    message: string,
    /** die vorlage, wenn sie trotz des fehlers schon im verlauf steht */
    readonly mensch: EniZeile | null = null,
    /** was die function als grund nennt, soweit sie einen nennt */
    readonly code: string | null = null
  ) {
    super(message)
    this.name = 'EniModellFehler'
  }
}

/**
 * Fehlschlaege, nach denen die Vorlage steht und nur das Urteil fehlt. Genau
 * die duerfen mit `nochmal` aufgeholt werden; bei allem anderen — etwa einem
 * Anhang, der nicht gespeichert wurde — fehlt mehr als nur die Antwort.
 */
export const NACHHOLBAR = new Set(['modell_fehler', 'leere_antwort', 'nicht_gespeichert'])

function funktionsAdresse(name: string): { url: string; schluessel: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const schluessel = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!supabase || !url || !schluessel) return null
  return { url: `${url.replace(/\/+$/, '')}/functions/v1/${name}`, schluessel }
}

/**
 * Eine ENI-Function rufen. Exportiert, weil die Stimme dieselbe Anmeldung,
 * dieselben Kopfzeilen und dieselbe Behandlung einer Antwort braucht, die kein
 * JSON ist — und weil zwei Kopien davon garantiert auseinanderlaufen.
 */
export async function rufeEniFunktion(
  name: string,
  rumpf: Record<string, unknown>,
  signal?: AbortSignal,
  onEvent?: (event: Record<string, unknown>) => void
) {
  const adresse = funktionsAdresse(name)
  const db = supabase
  if (!adresse || !db) throw new EniModellFehler('kein konto')

  const { data, error } = await db.auth.getSession()
  if (error || !data.session?.access_token) {
    throw new EniModellFehler('die anmeldung ist abgelaufen. melde dich neu an.')
  }

  const beginn = performance.now()
  let ersterText = false
  let mensch: EniZeile | null = null
  // Der Server hat insgesamt 100 Sekunden Modellbudget. Auch eine danach
  // haengende Verbindung muss mit einer sichtbaren Meldung enden.
  const frist = new AbortController()
  const timer = setTimeout(() => frist.abort(), rumpf.internet === true ? 150_000 : 120_000)
  const abbruch = () => frist.abort()
  if (signal?.aborted) frist.abort()
  signal?.addEventListener('abort', abbruch, { once: true })
  try {
    const antwort = await fetch(adresse.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${data.session.access_token}`,
        apikey: adresse.schluessel,
        'content-type': 'application/json',
      },
      body: JSON.stringify(rumpf),
      signal: frist.signal,
    })

    if (antwort.headers.get('content-type')?.includes('application/x-ndjson') && antwort.body) {
      for await (const zeile of streamZeilen(antwort.body)) {
        if (!zeile.trim()) continue
        const event = JSON.parse(zeile) as Record<string, unknown>
        if (event.typ === 'mensch') mensch = event.mensch as EniZeile
        if (event.typ === 'text' && !ersterText) { ersterText = true; performance.measure('eni.text.erster-teil', { start: beginn, end: performance.now() }) }
        if (event.typ === 'fertig') {
          performance.measure('eni.' + name + '.gesamt', { start: beginn, end: performance.now() })
          return { status: Number(event.status), inhalt: { mensch, ...(event.inhalt as Record<string, unknown>) } }
        }
        onEvent?.(event)
      }
      throw new EniModellFehler('Die Übertragung wurde unterbrochen.', mensch, 'modell_fehler')
    }
    const text = await antwort.text()
    let inhalt: Record<string, unknown>
    try {
      inhalt = text.trim() === '' ? {} : (JSON.parse(text) as Record<string, unknown>)
    } catch {
      throw new EniModellFehler(`server antwortet ${antwort.status}, aber kein json`)
    }
    return { status: antwort.status, inhalt }
  } catch (err) {
    if (err instanceof EniModellFehler) throw err
    if (frist.signal.aborted && !signal?.aborted) {
      throw new EniModellFehler(rumpf.internet === true ? 'Websuche und Modell haben innerhalb von zweieinhalb Minuten keine vollständige Antwort geliefert. Versuch es erneut.' : 'Das Modell hat innerhalb von zwei Minuten keine vollständige Antwort geliefert. Versuch es erneut oder wähle ein anderes Modell.', mensch, 'modell_fehler')
    }
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw new EniModellFehler('anfrage abgebrochen', mensch, 'modell_fehler')
    }
    throw new EniModellFehler('Die Verbindung wurde unterbrochen.', mensch, 'modell_fehler')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abbruch)
  }
}

const rufe = (rumpf: Record<string, unknown>, signal?: AbortSignal, onText?: (text: string) => void) =>
  rufeEniFunktion('eni', { ...rumpf, ...(onText ? { stream: true } : {}) }, signal, (e) => { if (e.typ === 'text' && typeof e.text === 'string') onText?.(e.text) })

/**
 * Ob ueberhaupt ein Schluessel gesetzt ist, und welche Modelle damit zur Wahl
 * stehen. Kostet nichts: die Function ruft dafuer kein Modell auf. Ein Fehler
 * heisst hier immer "nein" statt zu werfen, damit ENI auch ohne Netz aufgeht.
 *
 * Die Liste kommt vom Server, nie aus dem Bundle. Sonst stünde im Menü ein
 * Modell, für das niemand einen Schlüssel gesetzt hat — eine Oberfläche, die
 * eine Verbindung andeutet, die es nicht gibt.
 */
export async function modellBereit(): Promise<Modellstand> {
  try {
    const { status, inhalt } = await rufe({ pruefen: true })
    if (status !== 200 || inhalt.bereit !== true) return { bereit: false, anbieter: [] }
    const roh = Array.isArray(inhalt.anbieter) ? inhalt.anbieter : []
    const anbieter = roh
      .filter((eintrag): eintrag is AnbieterInfo => {
        const wert = eintrag as Partial<AnbieterInfo> | null
        return typeof wert?.id === 'string' && typeof wert.name === 'string'
      })
      .map((eintrag) => ({
        id: eintrag.id,
        name: eintrag.name,
        modell: String(eintrag.modell ?? ''),
        /**
         * Ein alter Server kennt das Feld nicht. Dann steht der Umschalter
         * nicht da — lieber eine Möglichkeit weniger als ein Schalter, der
         * ins Leere greift.
         */
        denkbar: eintrag.denkbar === true,
        denkHinweis: String(eintrag.denkHinweis ?? ''),
      }))
    return { bereit: true, anbieter, internet: inhalt.internet === true }
  } catch {
    return { bereit: false, anbieter: [] }
  }
}

/**
 * ENI hinter der Edge Function. Vorlage und Urteil schreibt der Server.
 *
 * `anbieter` ist nur eine id. Adresse, Modellname und Schlüssel kennt
 * ausschließlich die Function; der Browser weiß von keinem davon.
 *
 * `denkt` ist genauso wenig: ein Ja oder Nein. Welchen Schalter das bei dieser
 * Gegenstelle umlegt und was er kostet, steht ebenfalls nur dort.
 */
export function modellAntwort(
  anbieter: string | null = null,
  denkt = false
): Antwortgeber {
  /** was bei jeder vorlage mitgeht: die wahl und die stellung */
  const wahl = { ...(anbieter ? { modell: anbieter } : {}), ...(denkt ? { denkt: true } : {}) }

  /** aus status und rumpf entweder eine antwort machen oder einen fehler werfen */
  const lies = (status: number, inhalt: Record<string, unknown>): Antwort => {
    const mensch = (inhalt.mensch ?? null) as EniZeile | null
    const code = typeof inhalt.code === 'string' ? inhalt.code : null

    if (status === 200 && inhalt.eni === null) {
      if (!mensch) throw new EniModellFehler('ENI hat nicht geantwortet.')
      return { mensch, eni: null, hinweis: String(inhalt.hinweis ?? '') }
    }
    if (status !== 200) {
      throw new EniModellFehler(
        String(inhalt.error ?? `server antwortet ${status}`),
        mensch,
        code
      )
    }
    if (!mensch || !inhalt.eni) throw new EniModellFehler('ENI hat nicht geantwortet.')
    return { mensch, eni: inhalt.eni as EniZeile }
  }

  return {
    art: 'modell',
    anbieter,
    denkt,
    async antworte(chatId, text, _bisher, anhaenge, signal, onText, internet) {
      const { status, inhalt } = await rufe(
        {
          chatId,
          text,
          ...wahl,
          ...(internet ? { internet: true } : {}),
          ...(anhaenge && anhaenge.length > 0 ? { anhaenge } : {}),
        },
        signal,
        onText
      )
      return lies(status, inhalt)
    },
    async nochmal(chatId, signal, onText, internet) {
      const { status, inhalt } = await rufe(
        { chatId, wiederholen: true, ...wahl, ...(internet ? { internet: true } : {}) },
        signal,
        onText
      )
      return lies(status, inhalt)
    },
    async wochenbericht(chatId, wochenbeginn, signal, onText) {
      const { status, inhalt } = await rufe({ chatId, wochenbeginn, ...wahl }, signal, onText)
      return lies(status, inhalt)
    },
  }
}

/**
 * Die lokale Stimmenprobe. Sie schreibt selbst in den Speicher, weil es hier
 * keinen Server gibt, der das uebernehmen koennte.
 */
export function stimmenprobeAntwort(speicher: EniSpeicher): Antwortgeber {
  return {
    art: 'stimmenprobe',
    anbieter: null,
    // die stimmenprobe hat keine gegenstelle, die nachdenken koennte
    denkt: false,
    async antworte(chatId, text, bisher, _anhaenge, signal) {
      if (signal?.aborted) throw new EniModellFehler('anfrage abgebrochen')
      const person = await speicher.person()
      const nr = bisher.filter((zeile) => zeile.rolle === 'mensch').length
      const mensch = await speicher.schreibe(chatId, 'mensch', text)
      if (signal?.aborted) throw new EniModellFehler('anfrage abgebrochen', mensch)
      const eni = await speicher.schreibe(chatId, 'eni', eniAntwort(text, nr, person))
      return { mensch, eni }
    },
    /**
     * Die Stimmenprobe hat keine Gegenstelle, die schweigen koennte, also gibt
     * es hier nie etwas nachzuholen. Sie kann es trotzdem — sonst muesste die
     * Oberflaeche wissen, mit welcher Fassung sie gerade redet.
     */
    async nochmal(chatId, signal) {
      if (signal?.aborted) throw new EniModellFehler('anfrage abgebrochen')
      const person = await speicher.person()
      const bisher = await speicher.nachrichten(chatId)
      const offene = bisher[bisher.length - 1]
      if (!offene || offene.rolle !== 'mensch') {
        throw new EniModellFehler('da ist keine vorlage offen.')
      }
      const nr = bisher.filter((zeile) => zeile.rolle === 'mensch').length - 1
      const eni = await speicher.schreibe(
        chatId,
        'eni',
        eniAntwort(offene.text, Math.max(0, nr), person)
      )
      return { mensch: offene, eni }
    },
    async wochenbericht(chatId, _wochenbeginn, signal) {
      if (signal?.aborted) throw new EniModellFehler('anfrage abgebrochen')
      const bisher = await speicher.nachrichten(chatId)
      const offene = bisher.find(
        (z) => z.rolle === 'mensch' && z.text === 'Willst du, dass Eni deine Woche zusammenfasst?'
      )
      const mensch = offene ?? (await speicher.schreibe(chatId, 'mensch', 'Willst du, dass Eni deine Woche zusammenfasst?'))
      if (signal?.aborted) throw new EniModellFehler('anfrage abgebrochen', mensch)
      const urteil = 'Erfolge\nSolide Woche. Du hast deine Punkte im Blick behalten.\n\nAktivitäten\nEinheiten und Training wurden erfasst.\n\nSchlaf\nSchlafdaten liegen für die Woche vor.\n\nVergleich\nDer Zweikampf bleibt spannend.\n\nNächste Woche\nBleib bei deinen festen Gewohnheiten. Leg die Einheiten früh fest.'
      const eni = await speicher.schreibe(chatId, 'eni', urteil)
      return { mensch, eni }
    },
  }
}

/**
 * Welches Modell zuletzt gewählt war. Reine Bequemlichkeit auf diesem Gerät:
 * die Wahl ist nichts Geheimes, und sie gilt nur, solange der Server denselben
 * Anbieter noch anbietet — sonst fällt sie auf den ersten zurück.
 */
const ANBIETER_KEY = 'eni.anbieter'
const DENKT_KEY = 'eni.denkt'

/**
 * Bis zum 14.09.2026 war das Vordenken eine eigene Zeile im Menü. Wer sie
 * gewählt hatte, hat auf diesem Gerät `ling-denkt` stehen — eine id, die es
 * nicht mehr gibt. Sie ist kein Müll, sondern eine Aussage: dasselbe Modell,
 * und denken.
 */
const ALTE_DENKZEILE = 'ling-denkt'

function gelesen(schluessel: string): string | null {
  try {
    const wert = localStorage.getItem(schluessel)
    return wert && wert.trim() !== '' ? wert : null
  } catch {
    return null
  }
}

function gemerkt(schluessel: string, wert: string) {
  try {
    localStorage.setItem(schluessel, wert)
  } catch {
    /* ein voller oder gesperrter speicher darf die wahl nicht verhindern */
  }
}

export function anbieterGemerkt(): string | null {
  const wert = gelesen(ANBIETER_KEY)
  return wert === ALTE_DENKZEILE ? 'ling' : wert
}

export function merkeAnbieter(id: string) {
  gemerkt(ANBIETER_KEY, id)
}

/**
 * Ob dieses Gerät zuletzt nachdenken ließ. Ohne eigenen Eintrag zählt die alte
 * Denk-Zeile: wer sie gewählt hatte, wollte das Denken und soll es behalten,
 * ohne es ein zweites Mal einzuschalten.
 */
export function denkenGemerkt(): boolean {
  const wert = gelesen(DENKT_KEY)
  if (wert === null) return gelesen(ANBIETER_KEY) === ALTE_DENKZEILE
  return wert === 'an'
}

export function merkeDenken(an: boolean) {
  gemerkt(DENKT_KEY, an ? 'an' : 'aus')
}
