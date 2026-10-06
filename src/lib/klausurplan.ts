import type { UserId } from './types'

/**
 * Kursarbeitsplan MSS 13, Schuljahr 2026/27 — dieselben zeilen wie in der
 * migration `*_klausuren.sql`, die produktiv gilt. Hier steht er für den
 * prototypmodus; `klausurplan.test.ts` hält beide gleich.
 *
 * je zeile: person, fachname (wie in `faecher`), kurs, datum, beginn, ende,
 * bemerkung. ein leerer kurs heißt: es gibt parallelkurse, und welcher es ist,
 * steht nicht fest.
 *
 * nachtrag `*_fach_erdkunde.sql`: das fach heißt dieses halbjahr erdkunde, und
 * korays klausur liegt wie erijons in der 3.–4. stunde.
 */
export type Planzeile = [UserId, string, string | null, string, string | null, string | null, string]

export const KLAUSURPLAN: readonly Planzeile[] = [
  ['erijon', 'deutsch', null, '2026-09-30', '08:45', '11:20', '3-stündig'],
  ['erijon', 'erdkunde', 'skek1', '2026-10-27', '09:45', '11:20', ''],
  ['erijon', 'ethik', 'eth', '2026-10-29', '11:35', '13:05', ''],
  ['erijon', 'englisch', 'E2', '2026-11-06', '09:00', '13:30', 'Zentraltermin'],
  ['erijon', 'bildende kunst', 'bk1', '2026-11-12', '15:30', '17:00', ''],
  ['erijon', 'geschichte', 'G', '2026-11-18', '08:00', '12:00', '4 Zeitstunden'],
  ['erijon', 'mathe', 'm3', '2026-11-23', '07:55', '09:30', ''],
  ['erijon', 'bio', 'BIO1', '2026-12-03', '08:00', '12:00', '4 Zeitstunden'],
  ['erijon', 'informatik', 'inf', '2026-12-07', '15:30', '17:00', ''],
  ['koray', 'deutsch', 'D', '2026-09-30', '08:45', '13:15', '4,5 Zeitstunden'],
  ['koray', 'erdkunde', null, '2026-10-27', '09:45', '11:20', ''],
  ['koray', 'katholische religion', null, '2026-10-29', '11:35', '13:05', ''],
  ['koray', 'bildende kunst', null, '2026-11-12', '15:30', '17:00', ''],
  ['koray', 'geschichte', 'G', '2026-11-18', '08:00', '12:00', '4 Zeitstunden'],
  ['koray', 'mathe', null, '2026-11-23', '07:55', '09:30', ''],
  ['koray', 'französisch', null, '2026-11-27', '11:35', '13:05', ''],
  ['koray', 'physik', 'PH', '2026-12-03', '08:00', '12:00', '4 Zeitstunden'],
  ['koray', 'englisch', null, '2026-12-09', '09:45', '11:20', ''],
]
