/**
 * Feste Wortlaute, die ENI nicht nur anzeigt, sondern auch wiedererkennt.
 *
 * Die Wochenvorlage stand dreimal im Code: als Konstante in der Function, als
 * Literal im Prototypmodus und noch einmal in der Einladung im Tracker. Sie
 * wird an einer dieser Stellen mit gespeicherten Zeilen verglichen — wer den
 * Wortlaut nur an zweien aendert, bekommt zwei Wochenvorlagen im selben Chat.
 * Deshalb steht sie hier, und nur hier.
 */

/** Die Vorlage des woechentlichen ENI-Chats. Bleibt deterministisch. */
export const WOCHENBERICHT_VORLAGE = 'Willst du, dass ENI deine Woche zusammenfasst?'

/**
 * Frueherer Wortlaut. Chats von vor dem 16.09.2026 tragen ihn noch, und eine
 * Zeile, die nicht als Vorlage erkannt wird, legt eine zweite daneben.
 */
export const ALTE_WOCHENBERICHT_VORLAGEN = [
  'Willst du, dass Eni deine Woche zusammenfasst?',
] as const

export function istWochenberichtVorlage(text: string): boolean {
  return (
    text === WOCHENBERICHT_VORLAGE
    || ALTE_WOCHENBERICHT_VORLAGEN.some((alt) => alt === text)
  )
}
