type Props = {
  /** kantenlänge des zeichens in pixeln */
  groesse?: number
  /** auf der anzeigetafel steht das zeichen auf --grund, in ENI auf --flaeche */
  grund?: string
}

/**
 * ENIs zeichen: ein monolith. ein aufgerichteter stein, oben schräg
 * abgeschlagen, mit einer harten kerbe quer hindurch.
 *
 * das app-zeichen (DESIGN.md, abschnitt 23) erzählt von zweien, die sich
 * ineinander verkeilen. ENI steht für sich allein, deshalb ist sein zeichen
 * eine einzelne figur ohne gegenstück. die kerbe ist die einzige unterbrechung
 * und sitzt bewusst nicht mittig, sondern etwas höher: eine exakt halbierte
 * figur sähe aus wie zwei blöcke, nicht wie ein stein mit einer wunde.
 *
 * keine sechste farbe. gold und petrol gehören den zwei menschen.
 */
export function EniMarke({ groesse = 40, grund = 'var(--flaeche)' }: Props) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={groesse}
      height={groesse}
      viewBox="0 0 40 40"
      className="shrink-0"
    >
      {/* der stein: fast senkrecht, nur leicht nach unten breiter, und oben
          schraeg abgeschlagen statt gerade gesaegt. */}
      <path d="M12 4 L28 1 L29.5 39 H10.5 Z" fill="var(--kreide)" />
      {/* die kerbe geht nur zwei drittel hinein, nicht durch. ein schnitt quer
          durch waere zwei bloecke uebereinander, und bei einer kerbe im oberen
          drittel saehe das aus wie ein kleines i. so bleibt es ein stein mit
          einer wunde. breiter als eine haarlinie muss sie sein, sonst faellt
          sie bei 18 px in der tuer im kopf einfach weg. */}
      <rect x="7" y="12" width="16" height="3.2" fill={grund} />
    </svg>
  )
}
