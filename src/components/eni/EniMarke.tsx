type Props = {
  /** kantenlänge des zeichens in pixeln */
  groesse?: number
  /** grund-farbe fuer rueckwaertskompatibilitaet */
  grund?: string
}

/**
 * ENIs zeichen: ein monolith. ein aufgerichteter stein, oben schräg
 * abgeschlagen, mit einer harten kerbe im rechten grat.
 *
 * das app-zeichen erzählt von zweien, die sich ineinander verkeilen.
 * ENI steht für sich allein, deshalb ist sein zeichen eine einzelne figur
 * ohne gegenstück. die kerbe sitzt als meisselschlag im oberen drittel.
 *
 * keine sechste farbe. gold und petrol gehören den zwei menschen.
 */
export function EniMarke({ groesse = 40, grund: _grund = 'var(--flaeche)' }: Props) {
  const klein = groesse <= 22

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={groesse}
      height={groesse}
      viewBox="0 0 40 40"
      className="shrink-0"
    >
      {klein ? (
        /* optisch verstärkte silhouette für kleine größen (z.b. 15-22px) mit integrierter kerbe */
        <path
          d="M11 6 L28 3.5 L28.5 13.5 L21 17.5 L29 21.5 L30 37 H10 Z"
          fill="var(--kreide)"
        />
      ) : (
        /* verfeinerte, ausgewogene monolith-geometrie für große darstellungen */
        <path
          d="M11.5 6.5 L28.5 4 L28.8 14 L22 17.5 L29.2 21 L30 37 H10 Z"
          fill="var(--kreide)"
        />
      )}
    </svg>
  )
}
