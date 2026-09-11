/**
 * Wer da ruft, aus dem Token selbst gelesen.
 *
 * Eine eigene Datei fuer eine einzige kurze Funktion, und das hat einen Grund:
 * sie stand in `eniModell.ts`, und `eni-stimme` brauchte nur sie. Ein Import
 * zog damit die ganze Anbietertabelle, ENIs Charakter und den Lagebericht in
 * ein Buendel, das davon kein Zeichen benutzt — jedes Mal mitgeladen, wenn die
 * Stimme kalt startet. Was zwei Functions teilen, gehoert dorthin, wo beide
 * hinschauen koennen, ohne den Rest mitzunehmen.
 */

/**
 * Liest `sub` aus dem JWT, ohne die Signatur selbst zu pruefen.
 *
 * Das ist hier kein Vertrauensvorschuss, sondern arbeitsteilig. Zwei Instanzen
 * pruefen bereits, und beide sitzen naeher an der Wahrheit als diese Zeile:
 *
 *   1. Das Gateway. `verify_jwt = true` in supabase/config.toml laesst eine
 *      Anfrage mit ungueltiger Signatur gar nicht bis hierher; sie endet mit
 *      UNAUTHORIZED_INVALID_JWT_FORMAT, bevor die Function startet.
 *   2. Die Datenbank. Jede Abfrage laeuft mit dem Token des Aufrufers unter
 *      Row Level Security. Waere `sub` falsch, scheiterte spaetestens das
 *      Insert an `auth.uid() = user_id` und die Antwort waere ein 403.
 *
 * Frueher stand hier `getUser()`, ein Netzaufruf beim Auth-Server je Nachricht.
 * Der lieferte in dieser Umgebung eine HTML-Fehlerseite statt JSON und legte
 * damit die ganze Function lahm. Ein Aufruf, der nichts pruefen kann, was nicht
 * ohnehin schon geprueft ist, gehoert nicht in den heissen Pfad.
 */
export function subAusToken(token: string): string | null {
  const teile = token.split('.')
  if (teile.length !== 3) return null
  try {
    const roh = teile[1].replace(/-/g, '+').replace(/_/g, '/')
    const aufgefuellt = roh.padEnd(Math.ceil(roh.length / 4) * 4, '=')
    const sub = (JSON.parse(atob(aufgefuellt)) as { sub?: unknown }).sub
    return typeof sub === 'string' && sub !== '' ? sub : null
  } catch {
    return null
  }
}
