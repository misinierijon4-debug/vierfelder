import type { Fach, Klausur, Note, Notenstand, UserId } from './types'
import { daysBetween, fromKey } from './dates'

const WOCHENTAG = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa']

/** wie lange eine geschriebene klausur ohne note noch auffällt */
export const NOTE_OFFEN_TAGE = 42

/** ganze kalendertage von heute bis zum termin; negativ, wenn er vorbei ist */
export function tageBis(heute: string, datum: string): number {
  return daysBetween(fromKey(heute), fromKey(datum))
}

/** „heute“, „morgen“, „in 12 tagen“ */
export function abstandText(tage: number): string {
  if (tage === 0) return 'heute'
  if (tage === 1) return 'morgen'
  if (tage === -1) return 'gestern'
  return tage > 0 ? `in ${tage} tagen` : `vor ${-tage} tagen`
}

/** „di 27.10.“ */
export function datumKurz(datum: string): string {
  const tag = fromKey(datum)
  return `${WOCHENTAG[tag.getDay()]} ${datum.slice(8, 10)}.${datum.slice(5, 7)}.`
}

/** „09:45–11:20“, oder null, solange die stunde nicht feststeht */
export function zeitText(klausur: Klausur): string | null {
  return klausur.beginn && klausur.ende ? `${klausur.beginn}–${klausur.ende}` : null
}

function fachVon(stand: Notenstand, klausur: Klausur): Fach | null {
  return stand.faecher.find((fach) => fach.id === klausur.fachId && fach.user === klausur.user) ?? null
}

export type KlausurZeile = {
  klausur: Klausur
  fach: Fach
  tage: number
  /** die andere person schreibt am selben tag im selben fach */
  zusammen: boolean
}

function zeilen(stand: Notenstand, wer: UserId, heute: string): KlausurZeile[] {
  const alle = stand.klausuren ?? []
  const ergebnis: KlausurZeile[] = []
  for (const klausur of alle) {
    if (klausur.user !== wer) continue
    const fach = fachVon(stand, klausur)
    if (!fach) continue
    const zusammen = alle.some((andere) => {
      if (andere.user === wer || andere.datum !== klausur.datum || andere.art !== klausur.art) return false
      return fachVon(stand, andere)?.name === fach.name
    })
    ergebnis.push({ klausur, fach, tage: tageBis(heute, klausur.datum), zusammen })
  }
  return ergebnis.sort((a, b) =>
    a.klausur.datum.localeCompare(b.klausur.datum)
    || (a.klausur.beginn ?? '').localeCompare(b.klausur.beginn ?? '')
    || a.fach.name.localeCompare(b.fach.name, 'de'))
}

/** was noch kommt, heute eingeschlossen, nächste zuerst */
export function kommendeKlausuren(stand: Notenstand, wer: UserId, heute: string): KlausurZeile[] {
  return zeilen(stand, wer, heute).filter((zeile) => zeile.tage >= 0)
}

/** die nächste klausur in einem fach, oder null */
export function naechsteKlausur(stand: Notenstand, fach: Fach, heute: string): KlausurZeile | null {
  return kommendeKlausuren(stand, fach.user, heute).find((zeile) => zeile.fach.id === fach.id) ?? null
}

/**
 * geschrieben, aber noch keine klausurnote im fach von diesem tag an. die
 * note kommt meist zwei, drei wochen später; nach `NOTE_OFFEN_TAGE` hört die
 * erinnerung auf, damit eine vergessene zeile nicht für immer dasteht.
 */
export function ohneNote(stand: Notenstand, wer: UserId, heute: string): KlausurZeile[] {
  return zeilen(stand, wer, heute).filter((zeile) =>
    zeile.tage < 0
    && zeile.tage >= -NOTE_OFFEN_TAGE
    && zeile.klausur.art === 'klausur'
    && !stand.noten.some((note: Note) =>
      note.user === wer
      && note.fachId === zeile.fach.id
      && note.art === 'klausur'
      && note.datum >= zeile.klausur.datum))
}

/** so weit vorher bietet ENI im leeren chat einen lernplan an */
export const LERNPLAN_VORLAUF_TAGE = 21

/** die nächste eigene klausur, so knapp, wie ENIs begrüßung sie braucht */
export type EniKlausur = { fach: string; datum: string; tage: number }

/**
 * die nächste klausur in den nächsten drei wochen, oder null. nimmt rohe
 * zeilen, weil ENI auch ohne tracker-zustand startet (eigenes homescreen-symbol).
 */
export function eniKlausur(
  termine: ReadonlyArray<{ fach: string; lk: boolean; datum: string }>,
  heute: string,
): EniKlausur | null {
  const naechste = termine
    .map((t) => ({ ...t, tage: tageBis(heute, t.datum) }))
    .filter((t) => t.tage >= 0 && t.tage <= LERNPLAN_VORLAUF_TAGE)
    .sort((a, b) => a.datum.localeCompare(b.datum))[0]
  return naechste ? { fach: `${naechste.fach}${naechste.lk ? ' lk' : ''}`, datum: naechste.datum, tage: naechste.tage } : null
}

/** dieselbe auswahl aus dem notenstand des trackers */
export function eniKlausurAusStand(stand: Notenstand, wer: UserId, heute: string): EniKlausur | null {
  return eniKlausur(
    kommendeKlausuren(stand, wer, heute).map((z) => ({ fach: z.fach.name, lk: z.fach.kursart === 'lk', datum: z.klausur.datum })),
    heute,
  )
}
