import { USERS } from '../../lib/types'
import type { WochenMarke } from '../../lib/wochenbericht'

type Props = {
  marke: WochenMarke | undefined
  /** vollständiger zeitraum für die vorlesesprache, etwa `14.–20. september` */
  zeitraum: string
  onOeffnen: (woche: string) => void
}

/** mehr als das holt in einer woche niemand: fuenf felder mal sieben tage */
const MAX_PUNKTE = 35

/**
 * Das Berichtszeichen am rechten Rand einer Kalenderzeile.
 *
 * Es zeigt die Woche als zwei Saeulen: wer weiter oben steht, hat sie geholt.
 * Das reicht, um im Scrollen eine gute von einer schwachen Woche zu
 * unterscheiden — alles Weitere steht im Bericht selbst, einen Tipp entfernt.
 *
 * Eine Woche ohne jede Zeile bekommt kein Zeichen: ein Bericht ueber nichts
 * ist keine Information, sondern ein leerer Knopf.
 */
export function BerichtZeichen({ marke, zeitraum, onOeffnen }: Props) {
  if (!marke) return <span aria-hidden="true" />

  const hoehe = (punkte: number) =>
    `${Math.max(8, Math.min(100, (punkte / MAX_PUNKTE) * 100))}%`

  const ergebnis =
    marke.sieger === 'unentschieden'
      ? 'unentschieden'
      : `${USERS.find((p) => p.id === marke.sieger)!.name} vorn`

  return (
    <button
      type="button"
      onClick={() => onOeffnen(marke.woche)}
      aria-label={`Wochenbericht ${zeitraum}, ${marke.punkte.erijon} zu ${marke.punkte.koray}, ${ergebnis}${
        marke.laeuft ? ', woche läuft noch' : ''
      }`}
      className={`ml-0.5 flex min-h-[72px] items-end justify-center gap-[3px] self-stretch rounded-[2px] border px-1 pb-2.5 pt-1 transition-colors duration-150 hover:border-linie-hell focus-visible:outline-none ${
        marke.laeuft ? 'border-dashed border-linie-hell/70 opacity-70' : 'border-linie'
      }`}
    >
      {USERS.map((person) => (
        <span
          key={person.id}
          aria-hidden="true"
          className="block w-[5px] rounded-[1px]"
          style={{
            height: hoehe(marke.punkte[person.id]),
            backgroundColor: person.farbe,
            opacity: marke.sieger === 'unentschieden' || marke.sieger === person.id ? 1 : 0.5,
          }}
        />
      ))}
    </button>
  )
}

/**
 * Sieben Tage plus die Spalte fuer das Berichtszeichen.
 *
 * Steht hier und nicht in beiden Kalendern, weil die Breite der achten Spalte
 * und die Breite des Zeichens dieselbe Entscheidung sind.
 */
export const KALENDER_SPALTEN = 'grid-cols-[repeat(7,minmax(0,1fr))_1.75rem]'
