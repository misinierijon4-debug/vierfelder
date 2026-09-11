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
  hinweis: string
  modell: string
}

/** was die pruefung zurueckgibt: ob überhaupt, und wenn ja, wer zur wahl steht */
export type Modellstand = {
  bereit: boolean
  anbieter: AnbieterInfo[]
}

/** was eine antwort zurueckbringt: die vorlage, das urteil, ggf. ein grund */
export type Antwort = { mensch: EniZeile; eni: EniZeile | null; hinweis?: string }

export type Antwortgeber = {
  art: 'modell' | 'stimmenprobe'
  /** die id des anbieters, der antwortet. null in der stimmenprobe. */
  anbieter: string | null
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
    signal?: AbortSignal
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
  nochmal: (chatId: string, signal?: AbortSignal) => Promise<Antwort>
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
  signal?: AbortSignal
) {
  const adresse = funktionsAdresse(name)
  const db = supabase
  if (!adresse || !db) throw new EniModellFehler('kein konto')

  const { data, error } = await db.auth.getSession()
  if (error || !data.session?.access_token) {
    throw new EniModellFehler('die anmeldung ist abgelaufen. melde dich neu an.')
  }

  try {
    const antwort = await fetch(adresse.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${data.session.access_token}`,
        apikey: adresse.schluessel,
        'content-type': 'application/json',
      },
      body: JSON.stringify(rumpf),
      signal,
    })

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
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw new EniModellFehler('anfrage abgebrochen')
    }
    throw err
  }
}

const rufe = (rumpf: Record<string, unknown>, signal?: AbortSignal) =>
  rufeEniFunktion('eni', rumpf, signal)

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
        hinweis: String(eintrag.hinweis ?? ''),
        modell: String(eintrag.modell ?? ''),
      }))
    return { bereit: true, anbieter }
  } catch {
    return { bereit: false, anbieter: [] }
  }
}

/**
 * ENI hinter der Edge Function. Vorlage und Urteil schreibt der Server.
 *
 * `anbieter` ist nur eine id. Adresse, Modellname und Schlüssel kennt
 * ausschließlich die Function; der Browser weiß von keinem davon.
 */
export function modellAntwort(anbieter: string | null = null): Antwortgeber {
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
    async antworte(chatId, text, _bisher, anhaenge, signal) {
      const { status, inhalt } = await rufe(
        {
          chatId,
          text,
          ...(anbieter ? { modell: anbieter } : {}),
          ...(anhaenge && anhaenge.length > 0 ? { anhaenge } : {}),
        },
        signal
      )
      return lies(status, inhalt)
    },
    async nochmal(chatId, signal) {
      const { status, inhalt } = await rufe(
        { chatId, wiederholen: true, ...(anbieter ? { modell: anbieter } : {}) },
        signal
      )
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
  }
}

/**
 * Welches Modell zuletzt gewählt war. Reine Bequemlichkeit auf diesem Gerät:
 * die Wahl ist nichts Geheimes, und sie gilt nur, solange der Server denselben
 * Anbieter noch anbietet — sonst fällt sie auf den ersten zurück.
 */
const ANBIETER_KEY = 'eni.anbieter'

export function anbieterGemerkt(): string | null {
  try {
    const wert = localStorage.getItem(ANBIETER_KEY)
    return wert && wert.trim() !== '' ? wert : null
  } catch {
    return null
  }
}

export function merkeAnbieter(id: string) {
  try {
    localStorage.setItem(ANBIETER_KEY, id)
  } catch {
    /* ein voller oder gesperrter speicher darf die wahl nicht verhindern */
  }
}
