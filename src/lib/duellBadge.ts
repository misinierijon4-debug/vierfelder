/**
 * Das Rivalitäts-Badge, so weit der Startpfad es braucht.
 *
 * Getrennt von `duellKlassifizierung.ts`, und zwar aus genau einem grund: der
 * ticker steht auf dem ersten bildschirm, die zuordnung über classifier.dev
 * aber läuft erst nach dem ersten bild. Läge beides in einer datei, trüge jeder
 * kaltstart die anweisungstexte, die lagebeschreibungen und den http-teil mit,
 * die in der ersten sekunde niemand braucht — gemessen zwei kilobyte gzip im
 * Einstiegspfad.
 *
 * Hier steht deshalb nur, was schon beim ersten bild gezeigt wird: die worte
 * des badges und das urteil aus der drucklage. Der rest kommt als eigener
 * chunk nach. `duellKlassifizierung.ts` reicht alles von hier weiter, damit
 * aufrufer nur eine adresse kennen müssen.
 */

import type { DruckStatus } from './duell'

/** wie ein eintrag im duell gelesen wird */
export type RivalitaetsBadge =
  | 'konter'
  | 'fuehrungsausbau'
  | 'aufholjagd'
  | 'kraftakt'
  | 'routine'

/** kurzform fürs badge; nur diese worte stehen im ticker */
export const BADGE_KURZ: Readonly<Record<RivalitaetsBadge, string>> = {
  konter: 'konter',
  fuehrungsausbau: 'ausbau',
  aufholjagd: 'aufholjagd',
  kraftakt: 'kraftakt',
  routine: 'routine',
}

/** langform für den tooltip — „ausbau“ allein sagt zu wenig */
export const BADGE_LANG: Readonly<Record<RivalitaetsBadge, string>> = {
  konter: 'konter · antwort aus dem rückstand',
  fuehrungsausbau: 'führungsausbau · punkt aus der führung heraus',
  aufholjagd: 'aufholjagd · der abstand schrumpft',
  kraftakt: 'kraftakt · punkt unter höchstem druck',
  routine: 'routine · ein gewöhnlicher eintrag',
}

/**
 * Das urteil ohne dienst: allein aus der drucklage und der seite.
 *
 * `istIch` dreht die lesart um, denn `druckStatus` steht immer aus meiner
 * sicht: führe ich die woche, ist *sein* eintrag eine aufholjagd und meiner ein
 * ausbau. Synchron, deterministisch, immer ein ergebnis — die oberfläche zeigt
 * diesen wert beim ersten bild und behält ihn, wenn der dienst schweigt.
 */
export function heuristischesBadge(druckStatus: DruckStatus, istIch: boolean): RivalitaetsBadge {
  if (istIch) {
    switch (druckStatus) {
      case 'matchball':
      case 'zugzwang':
      case 'uneinholbar':
        return 'kraftakt'
      case 'aufholen':
        return 'aufholjagd'
      case 'heuteRueckstand':
      case 'wocheRueckstand':
      case 'abstandGross':
        return 'konter'
      case 'heuteFuehrung':
      case 'wocheFuehrung':
        return 'fuehrungsausbau'
      default:
        return 'routine'
    }
  }
  switch (druckStatus) {
    case 'zugzwang':
      return 'kraftakt'
    case 'matchball':
    case 'aufholen':
      return 'konter'
    case 'heuteFuehrung':
    case 'wocheFuehrung':
    case 'uneinholbar':
      return 'aufholjagd'
    case 'heuteRueckstand':
    case 'wocheRueckstand':
    case 'abstandGross':
      return 'fuehrungsausbau'
    default:
      return 'routine'
  }
}
