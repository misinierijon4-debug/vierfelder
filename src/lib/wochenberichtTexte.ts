/**
 * Was ENI zum Wochenbericht beitraegt: Saetze, keine Zahlen.
 *
 * Die Aufteilung ist Absicht. Der erste Versuch liess ENI den ganzen Bericht
 * schreiben — das Ergebnis war eine Abschrift der Rohdaten, mit selbst
 * gezaehlten Punkten und ohne Umlaute. Zahlen rechnet jetzt
 * `wochenbericht.ts`, und ENI bekommt die fertigen Zahlen und schreibt drei
 * kurze Absaetze dazu. Was das Modell nicht selbst zaehlt, kann es auch nicht
 * falsch zaehlen.
 *
 * Die Felder sind fest: das Design gibt die Plaetze vor, ENI fuellt sie. Ein
 * Text, der nicht in dieses Schema passt, wird verworfen statt angezeigt.
 */

export type WochenberichtTexte = {
  /** eine zeile, die die woche auf den punkt bringt */
  ueberschrift: string
  /** was gut lief, mit einer konkreten zahl aus dem bericht */
  lief: string
  /** das muster der woche: wann sie gekippt ist, woran es lag */
  muster: string
  /** genau zwei vorschlaege fuer die naechste woche */
  naechste: [string, string]
}

export type WochenberichtText = {
  /** montag der woche, zu der dieser text gehoert */
  woche: string
  texte: WochenberichtTexte
  /** iso-zeitpunkt, zu dem ENI ihn geschrieben hat */
  erstellt: string
  /** modellkennung, soweit der server sie mitschickt */
  modell: string | null
}

/** so lang darf eine einzelne zeile werden, bevor sie das blatt sprengt */
const MAX_UEBERSCHRIFT = 90
const MAX_ABSATZ = 400
const MAX_VORSCHLAG = 180

function saubereZeile(wert: unknown, maxLaenge: number): string | null {
  if (typeof wert !== 'string') return null
  const text = wert.replace(/\s+/g, ' ').trim()
  if (text.length === 0 || text.length > maxLaenge) return null
  return text
}

/**
 * Prueft, was vom Server kommt, bevor es auf dem Blatt landet.
 *
 * Ein Modell kann ein Feld vergessen, eine Liste mit drei Eintraegen liefern
 * oder eine leere Zeichenkette. Nichts davon darf als halb gefuellter Bericht
 * durchgehen: entweder der Text passt vollstaendig ins Schema, oder es gibt
 * keinen — und das Blatt sagt das ehrlich.
 */
export function pruefeTexte(roh: unknown): WochenberichtTexte | null {
  if (!roh || typeof roh !== 'object') return null
  const daten = roh as Record<string, unknown>

  const ueberschrift = saubereZeile(daten.ueberschrift, MAX_UEBERSCHRIFT)
  const lief = saubereZeile(daten.lief, MAX_ABSATZ)
  const muster = saubereZeile(daten.muster, MAX_ABSATZ)
  if (!ueberschrift || !lief || !muster) return null

  if (!Array.isArray(daten.naechste)) return null
  const naechste = daten.naechste
    .map((eintrag) => saubereZeile(eintrag, MAX_VORSCHLAG))
    .filter((eintrag): eintrag is string => eintrag !== null)
  if (naechste.length < 2) return null

  return { ueberschrift, lief, muster, naechste: [naechste[0]!, naechste[1]!] }
}

/** die antwort des servers, so wie die oberflaeche sie braucht */
export function pruefeWochenberichtText(roh: unknown): WochenberichtText | null {
  if (!roh || typeof roh !== 'object') return null
  const daten = roh as Record<string, unknown>
  const texte = pruefeTexte(daten.texte)
  if (!texte) return null
  if (typeof daten.woche !== 'string') return null

  return {
    woche: daten.woche,
    texte,
    erstellt: typeof daten.erstellt === 'string' ? daten.erstellt : new Date().toISOString(),
    modell: typeof daten.modell === 'string' ? daten.modell : null,
  }
}
