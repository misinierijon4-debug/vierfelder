/**
 * Die Punktezaehlung des Duells, an einer Stelle.
 *
 * Ein Punkt je Person, Feld und Tag. Drei Quellen zaehlen ein: getippte
 * Einheiten, abgeschlossene Messungen ab einer Mindestdauer und ein
 * Gewichtseintrag als fuenftes Feld. Mehrere Einheiten oder Messungen am
 * selben Tag geben keinen Zusatzpunkt.
 *
 * Die Regeln standen bisher zweimal da: in der LAGE fuer ENI vollstaendig und
 * im Begruessungsschirm von ENI als blosses Zaehlen der Zeilen aus
 * `einheiten`. Die zweite Fassung zeigte 1:1, wo 5:3 stand. Wer die Regeln
 * aendert, aendert sie hier — und nur hier.
 */

export const BEREICHE = ['lernen', 'gym', 'boxen', 'lesen'] as const
export type Bereich = (typeof BEREICHE)[number]

/** die vier bereiche plus das gewicht als fuenftes feld, in der reihenfolge der app */
export const FELDER = [...BEREICHE, 'gewicht'] as const
export type Feld = (typeof FELDER)[number]

export function istBereich(wert: unknown): wert is Bereich {
  return (BEREICHE as readonly unknown[]).includes(wert)
}

/**
 * Eine Messung zaehlt erst abgeschlossen und ab 20 Minuten, Lesen ab 10.
 * Kuerzer ist ein Weg zum Ort, keine Einheit.
 */
export function mindestminuten(bereich: Bereich): number {
  return bereich === 'lesen' ? 10 : 20
}

export function messungZaehlt(bereich: unknown, minuten: number): boolean {
  return istBereich(bereich) && Number.isFinite(minuten) && minuten >= mindestminuten(bereich)
}

/** der montag der woche zu einem lokalen tag `JJJJ-MM-TT`, ohne zeitzone gerechnet */
function wochenmontag(tag: string): string {
  const [j, m, t] = tag.split('-').map(Number)
  const datum = new Date(Date.UTC(j!, m! - 1, t!))
  datum.setUTCDate(datum.getUTCDate() - ((datum.getUTCDay() + 6) % 7))
  return datum.toISOString().slice(0, 10)
}

/**
 * Sonntag 24 Uhr ist die Woche vorbei. Eine Messung, die erst in der
 * naechsten Woche endet (auch genau um 0 Uhr), war beim Wochenschluss noch
 * offen und zaehlt nicht. Unter der Woche bleibt 23:40 bis 00:30 beim Vortag.
 * Gleich im Client (`vorWochenschluss`) und in `finalisiere_wochenabrechnung`.
 */
export function endetInDerWoche(beginnTag: string, endeTag: string): boolean {
  return wochenmontag(beginnTag) === wochenmontag(endeTag)
}

/**
 * Die Tafel haelt je Person, Feld und Tag hoechstens einen Punkt. Sie nimmt
 * nur an, was im Zeitraum liegt — doppelt gemeldete Tage und Nachzuegler aus
 * der Vorwoche fallen dabei von allein heraus.
 */
export type Punktetafel = {
  setze: (person: string | null, feld: string, tag: string) => void
  /** punkte der person, wahlweise auf ein feld und einen tag eingegrenzt */
  anzahl: (person: string, feld?: string, tag?: string) => number
  /** die felder, die diese person an diesem tag erledigt hat */
  felderAm: (person: string, tag: string) => Feld[]
}

export function neuePunktetafel(von: string, bis: string): Punktetafel {
  const punkte = new Set<string>()
  return {
    setze(person, feld, tag) {
      if (!person || tag < von || tag > bis) return
      punkte.add(`${person}:${feld}:${tag}`)
    },
    anzahl(person, feld, tag) {
      let gezaehlt = 0
      for (const punkt of punkte) {
        const [p, f, t] = punkt.split(':')
        if (p === person && (!feld || f === feld) && (!tag || t === tag)) gezaehlt += 1
      }
      return gezaehlt
    },
    felderAm(person, tag) {
      return FELDER.filter((feld) => punkte.has(`${person}:${feld}:${tag}`))
    },
  }
}

type Zeile = Record<string, unknown>

/** die drei tabellen, so wie sie in supabase stehen. eine fehlende ist leer. */
export type Punktquellen = {
  einheiten?: Zeile[] | null
  aufenthalte?: Zeile[] | null
  gewicht?: Zeile[] | null
}

/**
 * Baut die Tafel aus den drei Tabellen.
 *
 * `person` ordnet eine Konto-UUID einer Person zu und gibt null, wenn die
 * Zeile zu niemandem gehoert. `tagVon` macht aus dem Zeitpunkt einer Messung
 * den lokalen Tag — nie eine UTC-Zerlegung, sonst rutscht eine Sitzung am
 * Sonntagabend in die falsche Woche.
 */
export function tafelAusZeilen(
  quellen: Punktquellen,
  person: (userId: unknown) => string | null,
  tagVon: (zeitpunkt: Date) => string,
  von: string,
  bis: string
): Punktetafel {
  const tafel = neuePunktetafel(von, bis)

  for (const eintrag of quellen.einheiten ?? []) {
    if (!istBereich(String(eintrag.bereich))) continue
    tafel.setze(person(eintrag.user_id), String(eintrag.bereich), String(eintrag.tag))
  }

  for (const aufenthalt of quellen.aufenthalte ?? []) {
    const bereich = String(aufenthalt.bereich)
    if (!istBereich(bereich) || !aufenthalt.abgang) continue
    const start = new Date(String(aufenthalt.ankunft))
    const ende = new Date(String(aufenthalt.abgang))
    const dauer = (ende.getTime() - start.getTime()) / 60_000
    if (!messungZaehlt(bereich, dauer)) continue
    if (!endetInDerWoche(tagVon(start), tagVon(ende))) continue
    tafel.setze(person(aufenthalt.user_id), bereich, tagVon(start))
  }

  for (const eintrag of quellen.gewicht ?? []) {
    tafel.setze(person(eintrag.user_id), 'gewicht', String(eintrag.tag))
  }

  return tafel
}
