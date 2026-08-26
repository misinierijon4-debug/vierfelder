/**
 * ein takt für die ganze app. wer eine dauer braucht, nimmt sie hier raus.
 * begründung je wert steht in DESIGN.md, abschnitt 5 und 6.
 */
export const EASE = [0.16, 1, 0.3, 1] as const
export const EASE_WEICH = [0.32, 0.72, 0, 1] as const

/** die zelle im raster setzt auf */
export const STEMPEL = {
  type: 'spring',
  stiffness: 420,
  damping: 30,
  mass: 0.8,
} as const

/** reihenfolge des abhak-ablaufs, in sekunden */
export const TAKT = {
  marke: 0.18,
  zahl: 0.12,
  zelle: 0.18,
  summe: 0.26,
  /** langsamer, weil es nicht deine handlung ist */
  fremd: 0.32,
  sweep: 0.42,
}

/** beim laden kommen die vier zeilen gestaffelt herein, das raster als ein block */
export const EINGANG = {
  dauer: 0.2,
  versatz: 0.045,
  weg: 6,
}
