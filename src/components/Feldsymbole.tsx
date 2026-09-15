import type { ReactNode } from 'react'
import type { FeldId } from '../lib/types'

/**
 * ein zeichen je feld, rechts neben dem wort. es steht dort als merkhilfe für
 * den daumen, nicht als ersatz für die schrift: das wort bleibt stehen und
 * behält die kante links, an der die ganze liste ausgerichtet ist; das zeichen
 * kommt dahinter dazu. deshalb ist es `aria-hidden` — eine vorlesestimme, die
 * „boxen, boxhandschuh" sagt, wiederholt sich nur.
 *
 * gezeichnet wie der rest der app: haarlinien, radius 2px, keine flächen, keine
 * sechste farbe. die farbe kommt über `currentColor` aus der zeile, damit das
 * zeichen mit dem wort zusammen hell wird, wenn der tag gesetzt ist.
 *
 * eigene pfade statt phosphor, weil DESIGN.md abschnitt 3 phosphor auf `minus`
 * und `plus` festlegt — und weil ein zeichensatz von der stange in dieser
 * bildsprache nach einer anderen app aussieht.
 */
const PFADE: Record<FeldId, ReactNode> = {
  /* doktorhut: raute, darunter der schmaler werdende korpus, rechts die quaste */
  lernen: (
    <>
      <path d="M12 3.6 21 8l-9 4.4L3 8z" />
      <path d="M7.4 10.2 8.6 16.4h6.8l1.2-6.2" />
      <path d="M21 8v5.2" />
    </>
  ),
  /* hantel: stange, zwei scheiben, zwei verschlüsse */
  gym: (
    <>
      <path d="M2.8 9v6" />
      <path d="M21.2 9v6" />
      <rect x="4.8" y="6.2" width="3.6" height="11.6" rx="1" />
      <rect x="15.6" y="6.2" width="3.6" height="11.6" rx="1" />
      <path d="M8.4 12h7.2" />
    </>
  ),
  /* boxhandschuh: faust mit daumen links, darunter die stulpe */
  boxen: (
    <>
      <path d="M8.2 14.8V13.2H6.2a2.9 2.9 0 0 1-.1-5.6h2.1a3.6 3.6 0 0 1 3.6-3.6h3.6A3.6 3.6 0 0 1 19 7.6v7.2z" />
      <rect x="8.6" y="15.9" width="9.8" height="4.5" rx="1.3" />
    </>
  ),
  /* offenes buch: zwei seiten, die sich am bund treffen */
  lesen: (
    <>
      <path d="M12 7.2 4 5.4v11.8l8 1.8z" />
      <path d="M12 7.2 20 5.4v11.8l-8 1.8z" />
    </>
  ),
  /* balkenwaage: balken, zwei schalen, säule, fuß. die personenwaage wäre ein
     quadrat mit strich darin und sähe neben der marke nach einem zweiten
     kästchen aus — der balken ist bei 16px noch eine waage. */
  gewicht: (
    <>
      <path d="M12 7v10.4" />
      <path d="M5 7h14" />
      <path d="M8.4 17.4h7.2" />
      <path d="M2.6 11.8h4.8L5 7.2z" />
      <path d="M16.6 11.8h4.8L19 7.2z" />
    </>
  ),
}

type Props = {
  feld: FeldId
  /** 20px trägt neben der 22px-überschrift, ohne sie zu überstimmen */
  size?: number
  className?: string
}

export function Feldsymbol({ feld, size = 20, className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {PFADE[feld]}
    </svg>
  )
}
