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

/**
 * menüs klappen aus der ecke ihres knopfes auf: kurz, ohne überschwingen.
 * das zugehen ist schneller als das aufgehen — ein menü, das sich zeit lässt
 * zu verschwinden, steht im weg.
 */
export const MENUE = {
  auf: 0.17,
  zu: 0.11,
  /** weg, den die hülle aus der ecke heraus zurücklegt */
  weg: 6,
  /** die zeilen kommen knapp hinterher, damit man das öffnen liest */
  staffel: 0.035,
  vorlauf: 0.04,
}

/**
 * ENI ist ein eigener bildschirm, kein reiter. er kommt herein statt
 * umzuschalten — knapp von unten, wie etwas, das hochgeholt wird.
 */
export const BILDSCHIRM = { dauer: 0.26, weg: 10 }

/**
 * die tastatur verkleinert den sichtbaren bereich. das soll gleiten statt
 * springen; länger als die tastatur selbst braucht darf es nicht dauern.
 */
export const TASTATUR = 0.22

/** beim laden kommen die vier zeilen gestaffelt herein, das raster als ein block */
export const EINGANG = {
  dauer: 0.2,
  versatz: 0.045,
  weg: 6,
}

/** einmaliger aufbau des schlafdiagramms: erst balken, dann linien */
export const DIAGRAMM = {
  balkenDauer: 0.42,
  balkenVersatz: 0.045,
  linienPause: 0.16,
  linienDauer: 0.55,
}
