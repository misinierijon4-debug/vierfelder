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
 * 2. **Jeder Anbieter nennt seine eigene Umgebungsvariable.** Zwei Schluessel,
 *    zwei Secrets, keiner kennt den anderen. Wer nur einen setzt, bekommt nur
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
]

/** der anbieter, den eine anfrage ohne wahl bekommt */
export const STANDARD_ANBIETER = ANBIETER[0]!.id

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
