import { ABLEHNUNG } from './eniModell.ts'

/**
 * Noch einmal fragen, wenn die Gegenstelle gerade nicht kann.
 *
 * Der haeufigste Grund, aus dem ENI schweigt, ist keiner, der bleibt: das
 * kostenlose Kontingent bei OpenRouter kennt eine Grenze je Minute, und die
 * ist nach ein paar Sekunden wieder offen. Ein einziger Versuch macht daraus
 * einen Fehler im Gespraech, obwohl gar nichts kaputt ist.
 *
 * Zwei Entscheidungen tragen dieses Modul:
 *
 * 1. **Wiederholt wird nur, was von selbst weggeht.** Ein falscher Schluessel,
 *    eine erfundene Modell-id, eine Ablehnung durch den Filter: das faellt
 *    beim dritten Mal genauso aus und darf niemanden warten lassen.
 * 2. **Der Deckel ist die Gesamtfrist, nicht die Zahl der Versuche.** Eine
 *    haengende Gegenstelle darf nicht dreimal hintereinander eine Minute lang
 *    haengen; die Function hat selbst ein Wanduhrlimit, und wer das reisst,
 *    bekommt gar keine Antwort mehr, auch keine ehrliche.
 */

/** so oft wird es versucht, bevor ENI aufgibt */
export const VERSUCHE = 3

/** wie lange vor dem zweiten und dritten versuch gewartet wird */
export const WARTEN_MS = [1_500, 4_000]

/** so lange wird hoechstens gewartet, auch wenn die gegenstelle mehr verlangt */
export const MAX_WARTEN_MS = 15_000

/**
 * So lange darf ein Modellaufruf insgesamt dauern, alle Versuche und alle
 * Wartezeiten zusammen.
 */
export const GESAMTFRIST_MS = 100_000

/**
 * Ein Fehler, bei dem ein zweiter Versuch Aussicht hat. Wer wirft, sagt damit:
 * das war die Lage, nicht die Anfrage.
 */
export class Nochmal extends Error {
  constructor(
    nachricht: string,
    /** was die gegenstelle selbst an wartezeit verlangt, in ms */
    readonly wartenMs: number | null = null
  ) {
    super(nachricht)
    this.name = 'EniNochmal'
  }
}

/**
 * Ob ein Status von selbst wieder weggeht. 429 ist die Grenze je Minute, 5xx
 * eine Gegenstelle, die gerade nicht kann; beides ist in Sekunden vorbei.
 */
export const vorruebergehend = (status: number) =>
  status === 408 || status === 409 || status === 425 || status === 429 || status >= 500

/** `Retry-After` lesen, in sekunden oder als datum. null heisst: sagt nichts. */
export function retryAfter(antwort: Response, jetzt = Date.now()): number | null {
  const roh = antwort.headers.get('retry-after')
  if (!roh) return null
  const sekunden = Number(roh.trim())
  if (roh.trim() !== '' && Number.isFinite(sekunden)) return Math.max(0, sekunden * 1000)
  const zeitpunkt = Date.parse(roh)
  return Number.isFinite(zeitpunkt) ? Math.max(0, zeitpunkt - jetzt) : null
}

/**
 * Ein abgebrochenes `fetch` ist fast immer die Leitung und nicht die Anfrage:
 * Zeitueberschreitung, abgerissene Verbindung, DNS. Das darf noch einmal.
 */
export const leitungsfehler = (ursache: unknown) =>
  ursache instanceof TypeError ||
  (ursache instanceof Error &&
    (ursache.name === 'TimeoutError' || ursache.name === 'AbortError'))

export type WiederholungsOptionen = {
  /** die frist eines einzelnen versuchs */
  fristMs: number
  /** was gemeldet wird, bevor gewartet wird. schweigt, wenn nichts gesetzt ist. */
  protokoll?: (was: string) => void
  /** nur fuer tests. sonst die echte uhr und der echte timer. */
  jetzt?: () => number
  schlafe?: (ms: number) => Promise<void>
}

/**
 * `einVersuch` rufen und bei einem voruebergehenden Fehler noch einmal. Was
 * an Frist uebrig ist, ist die Frist des naechsten Versuchs.
 */
export async function mitWiederholung<T>(
  einVersuch: (fristMs: number) => Promise<T>,
  optionen: WiederholungsOptionen
): Promise<T> {
  const jetzt = optionen.jetzt ?? (() => Date.now())
  const schlafe =
    optionen.schlafe ?? ((ms: number) => new Promise<void>((weiter) => setTimeout(weiter, ms)))

  const start = jetzt()
  let letzter: unknown

  for (let versuch = 1; versuch <= VERSUCHE; versuch += 1) {
    const rest = GESAMTFRIST_MS - (jetzt() - start)
    if (rest <= 0) break

    try {
      return await einVersuch(Math.min(optionen.fristMs, rest))
    } catch (ursache) {
      // Eine Ablehnung ist ein Urteil, kein Fehler. Sie faellt beim zweiten Mal
      // genauso aus und geht deshalb sofort durch.
      if (ursache instanceof Error && ursache.name === ABLEHNUNG) throw ursache
      if (!(ursache instanceof Nochmal) && !leitungsfehler(ursache)) throw ursache

      letzter = ursache
      if (versuch === VERSUCHE) break

      const verlangt = ursache instanceof Nochmal ? ursache.wartenMs : null
      const warten = Math.min(verlangt ?? WARTEN_MS[versuch - 1] ?? 4_000, MAX_WARTEN_MS)
      // Lieber jetzt aufgeben als nach dem Warten: eine Antwort, die zu spaet
      // kommt, ist dasselbe wie keine, hat aber die Frist aufgebraucht.
      if (jetzt() - start + warten >= GESAMTFRIST_MS) break

      optionen.protokoll?.(
        `${(ursache as Error).message}, versuch ${versuch + 1} in ${warten}ms`
      )
      await schlafe(warten)
    }
  }

  throw letzter instanceof Error ? letzter : new Error('die gegenstelle antwortet nicht')
}
