/**
 * Wer fuer ENI spricht.
 *
 * ENI ist eine Haltung, kein Modell. Welche Gegenstelle die Saetze formt, darf
 * deshalb waehlbar sein, ohne dass sich irgendetwas anderes aendert: der
 * Charakter, die Lage, der Verlauf und die Regeln bleiben dieselben.
 *
 * Drei Entscheidungen tragen diese Liste:
 *
 * 1. **Der Client schickt eine id, nie eine Adresse und nie einen
 *    Modellnamen.** Was er schickt, wird hier nachgeschlagen; findet sich
 *    nichts, ist die Anfrage ungueltig. Sonst koennte jemand die Function
 *    dazu bringen, den Schluessel an eine fremde Adresse zu tragen.
 * 2. **Jeder Anbieter nennt seine eigene Umgebungsvariable.** Getrennte
 *    Secrets, keiner kennt den anderen. Wer nur einen setzt, bekommt nur
 *    den einen Anbieter angeboten.
 * 3. **Die Unterschiede stehen hier, nicht im Aufruf.** Alle Gegenstellen
 *    sprechen dasselbe OpenAI-Chatformat; sie streiten sich nur darueber, wie
 *    man das Vordenken regelt. Genau dieser Streit steht als Feld in der
 *    Zeile und nicht als `if` im heissen Pfad.
 * 4. **Eine Zeile ist nicht dasselbe wie ein Modell.** Zwei Zeilen duerfen auf
 *    denselben Modellnamen und denselben Schluessel zeigen und sich nur im
 *    Vordenken unterscheiden. Fuer den Menschen sind das zwei Gespraechspartner
 *    mit verschiedenem Tempo, und genau so steht es im Menue.
 */

export type Anbieter = {
  /** was der client schickt. kurz, stabil, nie der modellname selbst. */
  id: string
  /** was in der oberflaeche steht */
  name: string
  /** eine zeile, die sagt, was den anbieter ausmacht */
  hinweis: string
  /** der name, unter dem die gegenstelle das modell kennt */
  modell: string
  endpunkt: string
  /** name der umgebungsvariable, in der der schluessel steht */
  schluessel: string
  /**
   * was zusaetzlich in den rumpf gehoert, um das vordenken zu regeln. jede
   * gegenstelle nennt den schalter anders, und `ling-3.0-flash-vl` denkt von
   * sich aus vor: `default_enabled` steht in OpenRouters modellauskunft auf
   * true. wer es aus haben will, muss es also hinschreiben.
   */
  denken: Record<string, unknown>
  /**
   * ein eigener deckel fuer die ausgabe, wenn diese zeile vordenkt. denk-token
   * sind ausgabe-token und zaehlen gegen dasselbe `max_tokens`; mit dem
   * normalen deckel koennte das denken die erklaerung auffressen und den satz
   * mittendrin abschneiden. ohne angabe gilt `MAX_TOKENS`.
   */
  maxTokens?: number
}

export const ANBIETER: readonly Anbieter[] = [
  {
    id: 'deepseek',
    name: 'deepseek flash',
    hinweis: 'schnell und knapp. liest bilder.',
    modell: 'deepseek-flash',
    endpunkt: 'https://api.deepseek.com/chat/completions',
    schluessel: 'DEEPSEEK_API_KEY',
    denken: { thinking: { type: 'disabled' } },
  },
  {
    id: 'ling',
    name: 'ling 3.0 flash',
    hinweis: 'über openrouter, kostenlos. liest bilder.',
    // VL heisst vision-language: dieses Modell sieht die Bildbloecke selbst,
    // sonst haette ein Wechsel die Anhaenge stillschweigend blind gemacht.
    modell: 'inclusionai/ling-3.0-flash-vl:free',
    endpunkt: 'https://openrouter.ai/api/v1/chat/completions',
    schluessel: 'OPENROUTER_API_KEY',
    denken: { reasoning: { enabled: false } },
  },
  {
    id: 'ling-denkt',
    name: 'ling 3.0 flash (denkt)',
    hinweis: 'dasselbe modell, denkt erst nach. langsamer.',
    /**
     * Dieselbe Adresse, derselbe Schluessel, dasselbe Modell wie die Zeile
     * darueber. Der einzige Unterschied ist das Vordenken — und das ist genug
     * Unterschied, um zwei Eintraege im Menue zu rechtfertigen: fuer den
     * Menschen sind es zwei verschiedene Gespraechspartner.
     *
     * Stufen gibt es hier nicht. OpenRouters Modellauskunft nennt fuer dieses
     * Modell weder `supported_efforts` noch `supports_max_tokens`, und das
     * heisst laut deren Doku, dass es keine Abstufung anbietet. Ein Menue mit
     * `hoch`/`mittel`/`niedrig` waere also eine Behauptung, keine Einstellung.
     */
    modell: 'inclusionai/ling-3.0-flash-vl:free',
    endpunkt: 'https://openrouter.ai/api/v1/chat/completions',
    schluessel: 'OPENROUTER_API_KEY',
    /**
     * `exclude`, weil ENI die gedanken nicht ausliefert. Sie stuenden ohnehin
     * in `message.reasoning` und nicht in `content`, aber sie muessen deshalb
     * auch nicht durch die leitung.
     */
    denken: { reasoning: { enabled: true, exclude: true } },
    /**
     * Mehr Luft, weil das Denken von diesem Deckel abgeht. Das Modell laesst
     * bis 32768 Ausgabe-Token zu und kostet nichts; der Deckel bremst hier nur
     * eine Schleife, nicht die Rechnung.
     */
    maxTokens: 8000,
  },
  {
    id: 'qwen-infron',
    name: 'qwen 3.8 27b',
    hinweis: 'über infron, kostenloses modell. liest bilder.',
    modell: 'qwen/qwen3.8-27b:free',
    endpunkt: 'https://llm.onerouter.pro/v1/chat/completions',
    schluessel: 'INFRON_API_KEY',
    /**
     * Derselbe Schalter wie bei OpenRouter, und aus demselben Grund derselbe
     * Wortlaut: Infron ist eine OpenAI-kompatible Durchleitung und normalisiert
     * `reasoning` auf das, was das Modell dahinter versteht. `enabled: false`
     * ist die Stellung, die dieselbe Datei beim freien Ling-Modell schon
     * benutzt; `effort: 'none'` stand vorher hier und ist keine Stufe, die
     * OpenRouters Format kennt — eine Gegenstelle, die streng liest, lehnt sie
     * ab, und Qwen3.8 denkt von sich aus vor.
     *
     * Bleibt das Vordenken trotzdem an, faellt das nicht mehr still aus: eine
     * Antwort, die nur aus Gedanken besteht, meldet sich als solche.
     */
    denken: { reasoning: { enabled: false } },
  },
]

/** der anbieter, den eine anfrage ohne wahl bekommt */
export const STANDARD_ANBIETER = ANBIETER[0]!.id

/**
 * Was die Gegenstelle gemeldet hat — als Feld, nicht als Satz.
 *
 * Ihr *Text* darf nie in eine Meldung wandern: er kann alles enthalten, bis
 * hin zur eigenen Anfrage. Ihr *Status* darf es. Deshalb steht er hier als
 * Zahl neben der Anbieter-id, statt in eine Fehlernachricht geschrieben und
 * spaeter wieder aus ihr herausgelesen zu werden. Eine Nachricht kann jeder
 * erfinden, ein Feld, das nur diese Function setzt, nicht.
 *
 * `art` traegt die Faelle ohne Status. Genau daran ist die Diagnose bisher
 * gescheitert: ein Fehler im 200er-Rumpf, ein abgebrochener Strom oder eine
 * Antwort, die nur aus Denken bestand, hatten keine Zahl — und wurden deshalb
 * alle zu demselben "ENI hat nicht geantwortet", das nichts erklaert.
 */
export type Gemeldet = {
  /** wer gemeldet hat. nur die eigene id zaehlt. */
  anbieterId: string
  /** http-status oder code aus dem rumpf. 0 heisst: keinen genannt. */
  status: number
  /** was es war, wenn es keinen status gibt */
  art?: Art
}

/**
 * Die Fehlschlaege ohne Status, benannt. Sie brauchen verschiedene Saetze,
 * weil sie verschiedene naechste Schritte haben: warten, wechseln, nachsehen.
 */
export type Art = 'leer' | 'gedacht' | 'strom' | 'fehler'

/** ein fehler, der bleibt. wer wiederholen darf, wirft `Nochmal`. */
export class GegenstelleFehler extends Error implements Gemeldet {
  constructor(
    readonly anbieterId: string,
    readonly status: number,
    readonly art?: Art,
    nachricht?: string
  ) {
    super(nachricht ?? `${anbieterId} ${art ?? 'antwortet'} ${status || ''}`.trim())
    this.name = 'EniGegenstelle'
  }
}

/** wie der anbieter in einer meldung heisst */
const anzeigename = (anbieter: Anbieter) =>
  anbieter.id === 'qwen-infron' ? 'Infron' : anbieter.name

/**
 * Die Meldung, die an dem Fehler haengt — aber nur, wenn sie von genau diesem
 * Anbieter stammt. Ein fremdes Feld ist kein Beleg.
 */
function gemeldet(anbieter: Anbieter, ursache: Error): Gemeldet | null {
  const roh = ursache as Error & Partial<Gemeldet>
  if (roh.anbieterId !== anbieter.id) return null
  return {
    anbieterId: anbieter.id,
    status: typeof roh.status === 'number' && Number.isFinite(roh.status) ? roh.status : 0,
    art: roh.art,
  }
}

/** derselbe status, ein satz, den man lesen und danach etwas tun kann */
function statustext(name: string, status: number): string {
  switch (status) {
    case 400: case 422:
      return `${name} lehnt das Anfrageformat ab (HTTP ${status}). Die Modellanbindung muss geprüft werden.`
    case 401:
      return `${name} akzeptiert den API-Key nicht (HTTP 401). Prüfe den hinterlegten Schlüssel.`
    case 402:
      return `${name} verlangt Guthaben oder eine Zahlungsfreigabe (HTTP 402). Prüfe dein Anbieterkonto.`
    case 403:
      return `${name} verweigert den Modellzugriff (HTTP 403). Prüfe die Freigaben im Anbieterkonto.`
    case 404:
      return `${name} findet das Modell oder den Endpunkt nicht (HTTP 404). Die Anbindung muss geprüft werden.`
    case 429:
      return `${name} meldet ein Anfrage- oder Kontingentlimit (HTTP 429). Warte etwas oder wähle ein anderes Modell.`
    default:
      return `${name} antwortet mit HTTP ${status}. Versuch es später oder wähle ein anderes Modell.`
  }
}

/** Nur eigene Statusmeldungen auswerten, nie Texte oder Secrets der Gegenstelle. */
export function anbieterFehlertext(anbieter: Anbieter, ursache: unknown): string {
  const allgemein = 'ENI hat nicht geantwortet. versuch es gleich noch einmal.'
  if (!(ursache instanceof Error)) return allgemein
  if (ursache.name === 'TimeoutError') {
    return `${anbieter.name} braucht zu lange. Versuch es später oder wähle ein anderes Modell.`
  }
  const name = anzeigename(anbieter)
  /**
   * Ein `fetch`, das gar nicht erst zustande kommt, wirft `TypeError`: Adresse
   * unbekannt, TLS abgelehnt, Verbindung verweigert. Das ist kein Schweigen
   * des Modells, sondern gar keine Leitung, und beides zu verwechseln kostet
   * einen Abend Suche an der falschen Stelle.
   */
  if (ursache instanceof TypeError) {
    return `Die Verbindung zu ${name} kam nicht zustande. Prüfe Endpunkt und Netz oder wähle ein anderes Modell.`
  }

  const meldung = gemeldet(anbieter, ursache)
  if (meldung) {
    if (meldung.status > 0) return statustext(name, meldung.status)
    switch (meldung.art) {
      case 'gedacht':
        return `${name} hat nur nachgedacht und nichts gesagt. Wähle ein anderes Modell oder schalte das Vordenken ab.`
      case 'leer':
        return `${name} hat leer geantwortet. Versuch es gleich noch einmal oder wähle ein anderes Modell.`
      case 'strom':
        return `${name} hat die Antwort mittendrin abgebrochen. Versuch es gleich noch einmal oder wähle ein anderes Modell.`
      case 'fehler':
        return `${name} meldet einen Fehler ohne Status. Der Grund steht im Protokoll der Function.`
    }
  }

  // Rueckfall fuer Fehler, die nur eine Nachricht tragen. Streng verankert:
  // was nicht genau so aussieht, gilt als fremder Text und wird nicht gezeigt.
  const status = ursache.message.match(/^([a-z0-9-]+) (?:antwortet|meldet fehler) (\d{3})$/)
  if (!status || status[1] !== anbieter.id) return allgemein
  return statustext(name, Number(status[2]))
}

/**
 * Den Anbieter zu einer id finden. `null` heisst: der Client hat sich etwas
 * ausgedacht, und das ist ein Fehler, kein stiller Rueckfall auf den Standard.
 */
export function findeAnbieter(id: unknown): Anbieter | null {
  if (typeof id !== 'string') return null
  return ANBIETER.find((anbieter) => anbieter.id === id.trim()) ?? null
}

/** der schluessel dieses anbieters, oder ein leerer string */
export function schluesselVon(
  anbieter: Anbieter,
  umgebung: (name: string) => string | undefined
): string {
  return umgebung(anbieter.schluessel)?.trim() ?? ''
}

/**
 * Was die Oberflaeche anbieten darf: nur, wofuer wirklich ein Schluessel
 * gesetzt ist. Ein Menue mit einem Eintrag, der nie antwortet, waere genau der
 * Selbstbetrug, gegen den ENI sonst redet.
 */
export function verfuegbareAnbieter(
  umgebung: (name: string) => string | undefined
): Array<{ id: string; name: string; hinweis: string; modell: string }> {
  return ANBIETER.filter((anbieter) => schluesselVon(anbieter, umgebung) !== '').map(
    ({ id, name, hinweis, modell }) => ({ id, name, hinweis, modell })
  )
}
