/**
 * Woerter fuers Vergleichen von Nachricht und Text, ohne Deno-Eigenheiten.
 *
 * Ein exakter Wortvergleich fand „Rezepte“ nicht, wenn die Akte „Rezept“ sagt,
 * und „Ernährung“ nicht in „ernähren“. Deutsch beugt und setzt zusammen; ein
 * Stemmer waere fuer diesen Zweck zu viel. Die ersten fuenf Buchstaben reichen,
 * damit Einzahl, Mehrzahl, Beugung und die meisten Zusammensetzungen
 * („Proteinshake“, „Proteinquelle“) auf dasselbe Stammwort fallen. Treffer
 * dienen nur der Rangfolge, ein Zufallstreffer kostet also hoechstens etwas
 * Platz im Prompt.
 */

/** die Laenge des Stammworts; kuerzere Woerter bleiben, wie sie sind */
export const STAMM_LAENGE = 5

export function stamm(wort: string): string {
  return wort.length > STAMM_LAENGE ? wort.slice(0, STAMM_LAENGE) : wort
}

/**
 * Die Stammwoerter eines Textes, klein geschrieben. Woerter unter
 * `mindestLaenge` und die in `auslassen` (volle Form, klein) zaehlen nicht.
 */
export function stammwoerter(text: string, mindestLaenge = 4, auslassen?: ReadonlySet<string>): Set<string> {
  const raus = new Set<string>()
  for (const wort of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (wort.length < mindestLaenge || auslassen?.has(wort)) continue
    raus.add(stamm(wort))
  }
  return raus
}
