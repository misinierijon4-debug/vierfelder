import { CaretRight } from '@phosphor-icons/react'
import { USERS, user as userDef } from '../../lib/types'
import type { UserId } from '../../lib/types'
import type { WochenMarke } from '../../lib/wochenbericht'

type Props = {
  marke: WochenMarke | undefined
  /** kurzform fuer die zeile selbst, etwa `14.–20.` */
  kurz: string
  /** vollständiger zeitraum für die vorlesesprache, etwa `14.–20. september` */
  zeitraum: string
  onOeffnen: (woche: string) => void
}

/** mehr als das holt in einer woche niemand: fuenf felder mal sieben tage */
const MAX_PUNKTE = 35

/**
 * Die Berichtszeile unter einer Kalenderwoche.
 *
 * Sie stand frueher als achte Spalte am rechten Rand: zwei fuenf pixel breite
 * Saeulen in einem hohen, leeren Kasten. Auf dem Telefon blieb davon ein
 * Strichpaar uebrig, das niemand als Knopf las — und die sieben Tagesspalten
 * verloren die Breite, die sie brauchen. Jetzt liegt die Woche quer unter
 * ihren eigenen Tagen und hat Platz fuer das, was sie sagen will: um welche
 * Woche es geht, wie viel geholt wurde und wer vorn liegt.
 *
 * Die beiden Balken messen an denselben 35 Punkten. Deshalb zeigt die Zeile
 * zweierlei zugleich — den Vergleich der Personen und die Menge der Woche.
 * Ein reiner Verhaeltnisbalken koennte das nicht: 2 zu 1 saehe aus wie 20 zu 10.
 *
 * Eine Woche ohne jede Zeile bekommt keinen Bericht: ein Bericht ueber nichts
 * ist keine Information, sondern ein leerer Knopf.
 */
export function BerichtZeile({ marke, kurz, zeitraum, onOeffnen }: Props) {
  if (!marke) return null

  const ergebnis =
    marke.sieger === 'unentschieden'
      ? 'unentschieden'
      : `${userDef(marke.sieger).name} vorn`

  // die zahl der person, die vorn liegt, traegt ihre farbe — die andere tritt
  // zurueck. bei gleichstand stehen beide farbig, weil keine zurueckzutreten hat.
  const zahlenfarbe = (id: UserId) =>
    marke.sieger === 'unentschieden' || marke.sieger === id
      ? userDef(id).farbe
      : 'var(--kreide-52)'

  return (
    <button
      type="button"
      onClick={() => onOeffnen(marke.woche)}
      aria-label={`Wochenbericht ${zeitraum}, ${marke.punkte.erijon} zu ${marke.punkte.koray}, ${ergebnis}${
        marke.laeuft ? ', woche läuft noch' : ''
      }`}
      className={`col-span-7 mb-3 mt-0.5 flex w-full items-center gap-3 rounded-[3px] border px-2.5 py-2 text-left transition-colors duration-150 hover:border-linie-hell focus-visible:outline-none ${
        marke.laeuft ? 'border-dashed border-linie-hell/70' : 'border-linie bg-flaeche/40'
      }`}
    >
      {/* die laufende woche ist ein stand und kein ergebnis. das steht hier,
          damit niemand einen zwischenstand fuer die fertige woche haelt. */}
      <span className="shrink-0 text-[11px] font-medium text-kreide-52">
        {marke.laeuft ? 'läuft' : 'bericht'} · {kurz}
      </span>

      <span aria-hidden="true" className="flex min-w-0 flex-1 flex-col gap-[3px]">
        {USERS.map((person) => (
          <span
            key={person.id}
            className="block h-[3px] overflow-hidden rounded-full bg-linie"
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.min(100, (marke.punkte[person.id] / MAX_PUNKTE) * 100)}%`,
                backgroundColor: person.farbe,
                opacity:
                  marke.sieger === 'unentschieden' || marke.sieger === person.id ? 1 : 0.55,
              }}
            />
          </span>
        ))}
      </span>

      <span aria-hidden="true" className="tnum shrink-0 text-[12px] font-semibold">
        <span style={{ color: zahlenfarbe('erijon') }}>{marke.punkte.erijon}</span>
        <span className="px-1 text-kreide-52">:</span>
        <span style={{ color: zahlenfarbe('koray') }}>{marke.punkte.koray}</span>
      </span>

      <CaretRight
        size={12}
        weight="bold"
        aria-hidden="true"
        className="shrink-0 text-kreide-52"
      />
    </button>
  )
}

/**
 * Sieben Tagesspalten — mehr braucht das Raster nicht mehr.
 *
 * Steht hier und nicht in beiden Kalendern, weil die Spalten und die Zeile,
 * die sie ueberspannt (`col-span-7`), dieselbe Entscheidung sind.
 */
export const KALENDER_SPALTEN = 'grid-cols-7'
