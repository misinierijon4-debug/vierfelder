/**
 * Wer fuer ENI spricht — und ob er vorher nachdenkt.
 *
 * ENI ist eine Haltung, kein Modell. Welche Gegenstelle die Saetze formt, darf
 * deshalb waehlbar sein, ohne dass sich irgendetwas anderes aendert: der
 * Charakter, die Lage, der Verlauf und die Regeln bleiben dieselben.
 *
 * Vier Entscheidungen tragen diese Liste:
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
 * 4. **Das Vordenken ist eine Stellung, keine eigene Zeile.** Eine Zeit lang
 *    stand `ling 3.0 flash (denkt)` als zweiter Eintrag im Menue. Bei einem
 *    Modell ging das; bei dreien waeren es sechs Eintraege fuer drei
 *    Gespraechspartner, und das Menue haette laenger ueber den Modus geredet
 *    als ueber die Wahl. Jede Zeile bringt deshalb beide Stellungen mit, und
 *    welche gilt, sagt ein Umschalter daneben.
 *
 * Der Client schickt dafuer genau einen Boolean. Er kann damit nichts
 * adressieren — was hinter `an` steht, weiss nur diese Datei.
 */

/** was zusaetzlich in den rumpf gehoert, um eine stellung des vordenkens zu setzen */
export type Denkstellung = Record<string, unknown>

export type Anbieter = {
  /** was der client schickt. kurz, stabil, nie der modellname selbst. */
  id: string
  /**
   * was in der oberflaeche steht. nur der name, keine beschreibung darunter:
   * das menue beantwortet die frage "wer spricht", und drei erklaerzeilen
   * haben sie lauter beantwortet als noetig. wer wissen will, was ein modell
   * kann, liest ENI-SCHLUESSEL.md — im menue steht, was man waehlt.
   */
  name: string
  /** der name, unter dem die gegenstelle das modell kennt */
  modell: string
  endpunkt: string
  /** name der umgebungsvariable, in der der schluessel steht */
  schluessel: string
  /**
   * Beide Stellungen des Vordenkens. Jede Gegenstelle nennt den Schalter
   * anders, und keine steht von sich aus dort, wo ENI sie haben will:
   * `ling-3.0-flash-vl` und `deepseek-flash` denken beide von sich aus vor.
   * Wer eine Stellung nicht hinschreibt, bekommt also nicht "wie das Modell es
   * macht", sondern unabsichtlich langsam.
   */
  denken: {
    aus: Denkstellung
    /** `null` heisst: diese gegenstelle kann nicht vordenken. */
    an: Denkstellung | null
    /** was der umschalter unter sich schreibt, solange diese zeile dran ist */
    hinweis?: string
  }
  /**
   * Ein eigener Deckel fuer die Ausgabe, je Stellung. Denk-Token sind
   * Ausgabe-Token und zaehlen gegen dasselbe `max_tokens`; mit dem normalen
   * Deckel koennte das Denken die Erklaerung auffressen und den Satz mittendrin
   * abschneiden — oder, schlimmer, gar nichts uebrig lassen: eine leere Antwort
   * mit `finish_reason: 'length'` geht als leer durch und nicht als Fehler.
   * Ohne Angabe gilt `MAX_TOKENS`.
   */
  maxTokens?: { aus?: number; an?: number }
}

/**
 * Derselbe Anbieter, das Vordenken auf eine Stellung festgelegt. Was hier
 * ankommt, geht ohne weitere Entscheidung in den Rumpf — der heisse Pfad
 * kennt nur noch eine Gegenstelle und keine Wahl mehr.
 */
export type Gegenstelle = Omit<Anbieter, 'denken' | 'maxTokens'> & {
  denken: Denkstellung
  maxTokens?: number
  /** ob in dieser stellung vorgedacht wird */
  denkt: boolean
}

export const ANBIETER: readonly Anbieter[] = [
  {
    id: 'deepseek',
    name: 'deepseek',
    // schnell und knapp, liest bilder, kostet geld
    modell: 'deepseek-flash',
    endpunkt: 'https://api.deepseek.com/chat/completions',
    schluessel: 'DEEPSEEK_API_KEY',
    denken: {
      aus: { thinking: { type: 'disabled' } },
      /**
       * Als einzige Gegenstelle kennt DeepSeek echte Stufen — `low`, `high`,
       * `max`, Vorgabe `high` — und als einzige kostet das Denken hier Geld:
       * Denk-Token werden als Ausgabe-Token abgerechnet. Deshalb `low` und
       * nicht die Vorgabe. Es soll nachdenken, nicht gruebeln.
       */
      an: { thinking: { type: 'enabled' }, reasoning_effort: 'low' },
      hinweis: 'langsamer, und die denkzeit kostet hier geld.',
    },
    maxTokens: { an: 8000 },
  },
  {
    id: 'ling',
    name: 'ling 3.0',
    // ueber openrouter, kostenlos
    // VL heisst vision-language: dieses Modell sieht die Bildbloecke selbst,
    // sonst haette ein Wechsel die Anhaenge stillschweigend blind gemacht.
    modell: 'inclusionai/ling-3.0-flash-vl:free',
    endpunkt: 'https://openrouter.ai/api/v1/chat/completions',
    schluessel: 'OPENROUTER_API_KEY',
    denken: {
      aus: { reasoning: { enabled: false } },
      /**
       * Stufen gibt es hier nicht. OpenRouters Modellauskunft nennt fuer dieses
       * Modell weder `supported_efforts` noch `supports_max_tokens`, und das
       * heisst laut deren Doku, dass es keine Abstufung anbietet. An ist also
       * schon das hoechste, was geht.
       *
       * `exclude`, weil ENI die Gedanken nicht ausliefert. Sie stuenden ohnehin
       * in `message.reasoning` und nicht in `content`, aber sie muessen deshalb
       * auch nicht durch die Leitung.
       */
      an: { reasoning: { enabled: true, exclude: true } },
      hinweis: 'langsamer, dafür gründlicher. kostet nichts.',
    },
    /**
     * Mehr Luft, weil das Denken von diesem Deckel abgeht. Das Modell laesst
     * bis 32768 Ausgabe-Token zu und kostet nichts; der Deckel bremst hier nur
     * eine Schleife, nicht die Rechnung.
     */
    maxTokens: { an: 8000 },
  },
  {
    id: 'qwen-infron',
    // "unzensiert" statt der parameterzahl: `27b` sagt einem menschen nichts
    // ueber das gespraech, das ihn erwartet. Infron fuehrt das modell als
    // "Qwen3.8 27B Uncensored" — das ist der unterschied, den man merkt.
    name: 'qwen 3.8 unzensiert',
    // ueber infron, kostenlos, liest bilder
    modell: 'qwen/qwen3.8-27b:free',
    endpunkt: 'https://llm.onerouter.pro/v1/chat/completions',
    schluessel: 'INFRON_API_KEY',
    // Infrons dokumentierter Reasoning-Schalter; keine DeepSeek-spezifischen
    // Parameter. Die :free-ID bleibt fest, auch bei Limits kein Bezahl-Fallback.
    denken: {
      aus: { reasoning: { effort: 'none' } },
      /**
       * `xhigh` ist die oberste Stufe von Infrons Skala
       * (`xhigh|high|medium|low|minimal|none`). Die Modellkarte sagt zu
       * Qwen 3.8 27B ausdruecklich "flexible thinking that can be enabled or
       * disabled", der Schalter ist also gedeckt.
       *
       * Kein `exclude` wie bei OpenRouter — das kennt Infron nicht. Die
       * Gedanken kommen in `message.reasoning_content` zurueck, nie in
       * `content`; ENI liest nur `content` und zeigt sie damit nie an.
       */
      an: { reasoning: { effort: 'xhigh' } },
      hinweis: 'langsamer, dafür gründlicher. kostet nichts.',
    },
    /**
     * Deutlich mehr Luft als bei den anderen, und das hat einen Grund: Infron
     * rechnet die Stufe bei Gegenstellen, die nur ein Denkbudget kennen, in
     * einen Anteil von `max_tokens` um — `xhigh` sind rund 95 Prozent. Mit
     * 8000 blieben fuer die Antwort ein paar hundert Token; mit 16000 bleiben
     * auch im schlechtesten Fall genug. Das Modell laesst 256k zu und kostet
     * nichts.
     */
    maxTokens: { an: 16000 },
  },
]

/** der anbieter, den eine anfrage ohne wahl bekommt */
export const STANDARD_ANBIETER = ANBIETER[0]!.id

/** ob dieser anbieter ueberhaupt eine denk-stellung hat */
export function kannDenken(anbieter: Anbieter): boolean {
  return anbieter.denken.an !== null
}

/**
 * Das Vordenken festlegen und damit aus einer Zeile eine Gegenstelle machen.
 *
 * Wer denken will, wo nichts zu holen ist, bekommt stillschweigend die
 * Aus-Stellung. Ein Fehler waere hier falsch: die Oberflaeche bietet den
 * Umschalter fuer so eine Zeile gar nicht erst an, und ein Client, der ihn
 * trotzdem mitschickt, hat nichts Gefaehrliches getan.
 */
export function mitVordenken(anbieter: Anbieter, denkt: boolean): Gegenstelle {
  const { denken, maxTokens, ...rest } = anbieter
  const wirklich = denkt && denken.an !== null
  return {
    ...rest,
    denken: wirklich ? denken.an! : denken.aus,
    maxTokens: wirklich ? maxTokens?.an : maxTokens?.aus,
    denkt: wirklich,
  }
}

/** Nur eigene Statusmeldungen auswerten, nie Texte oder Secrets der Gegenstelle. */
export function anbieterFehlertext(
  anbieter: Pick<Anbieter, 'id' | 'name'>,
  ursache: unknown
): string {
  const allgemein = 'ENI hat nicht geantwortet. versuch es gleich noch einmal.'
  if (!(ursache instanceof Error)) return allgemein
  if (ursache.name === 'TimeoutError') {
    return `${anbieter.name} braucht zu lange. Versuch es später oder wähle ein anderes Modell.`
  }
  const status = ursache.message.match(/^([a-z0-9-]+) (?:antwortet|meldet fehler) (\d{3})$/)
  if (!status || status[1] !== anbieter.id) return allgemein
  const name = anbieter.id === 'qwen-infron' ? 'Infron' : anbieter.name
  switch (Number(status[2])) {
    case 400: case 422:
      return `${name} lehnt das Anfrageformat ab (HTTP ${status[2]}). Die Modellanbindung muss geprüft werden.`
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
      return `${name} antwortet mit HTTP ${status[2]}. Versuch es später oder wähle ein anderes Modell.`
  }
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
  anbieter: Pick<Anbieter, 'schluessel'>,
  umgebung: (name: string) => string | undefined
): string {
  return umgebung(anbieter.schluessel)?.trim() ?? ''
}

/**
 * Was die Oberflaeche anbieten darf: nur, wofuer wirklich ein Schluessel
 * gesetzt ist. Ein Menue mit einem Eintrag, der nie antwortet, waere genau der
 * Selbstbetrug, gegen den ENI sonst redet.
 *
 * `denkbar` sagt, ob der Umschalter fuer diese Zeile ueberhaupt einen Sinn
 * hat. Auch das gehoert vom Server: ob eine Gegenstelle vordenken kann, steht
 * in ihrer Zeile und nicht in einer Annahme im Browser.
 */
export function verfuegbareAnbieter(
  umgebung: (name: string) => string | undefined
): Array<{
  id: string
  name: string
  modell: string
  denkbar: boolean
  denkHinweis: string
}> {
  return ANBIETER.filter((anbieter) => schluesselVon(anbieter, umgebung) !== '').map(
    ({ id, name, modell, denken }) => ({
      id,
      name,
      modell,
      denkbar: denken.an !== null,
      denkHinweis: denken.hinweis ?? '',
    })
  )
}
