import { CalendarBlank } from '@phosphor-icons/react'

type Props = {
  /** was der knopf oeffnet — steht so auch in der vorlesehilfe */
  label: string
  onOeffnen: () => void
}

/**
 * der weg in die historie, in derselben sprache wie der rest der oberflaeche:
 * ein feld mit 2px radius, linie und flaeche — wie jede marke, jede karte, jede
 * zelle. der runde knopf davor war das einzige kreisrunde element weit und
 * breit und sass deshalb wie aufgeklebt neben der zeile.
 *
 * sichtbar bleibt er klein, damit er die kopfzeile nicht streckt; die
 * trefferflaeche wachst ueber ein unsichtbares polster auf die vollen 44px.
 */
export function KalenderKnopf({ label, onOeffnen }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      onClick={onOeffnen}
      className="relative flex size-7 shrink-0 items-center justify-center rounded-[2px] border border-linie bg-flaeche text-kreide-52 transition-colors duration-150 hover:border-linie-hell hover:text-kreide"
    >
      <CalendarBlank size={14} weight="bold" aria-hidden="true" />
      <span aria-hidden="true" className="absolute -inset-2" />
    </button>
  )
}
