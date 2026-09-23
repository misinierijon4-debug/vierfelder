import { addDays, startOfWeek, toKey } from './dates'
import { ansageFrist, ansagePunkte, istV2, wirksamerEinsatz } from './ansagen'
import type { Ansage, AnsageStatus } from './ansagen'
import { user as userDef } from './types'
import type { UserId } from './types'

/**
 * was die ansagen-oberfläche sagt, ohne zu rechnen: die zahlen kommen aus
 * `ansagen.ts`, hier wird nur formuliert. alles kleingeschrieben, aus sicht
 * der person, die gerade schaut.
 */

/** eine ansage mit ihrer „du auch“-gegenrichtung, falls es eine gibt */
export type AnsagePaar = { ansage: Ansage; gegen: Ansage | null }

/**
 * die ansagen einer woche, je ansage einmal: die gegenrichtung hängt an ihrer
 * ansage statt als eigene zeile dazustehen. neueste zuerst.
 */
export function ansagePaare(ansagen: Ansage[], heute: Date): AnsagePaar[] {
  const montag = toKey(startOfWeek(heute))
  const sonntag = toKey(addDays(startOfWeek(heute), 6))
  const dieseWoche = ansagen.filter((a) => a.bis >= montag && a.bis <= sonntag)
  const gegen = new Map(dieseWoche.filter((a) => a.bezug).map((a) => [a.bezug!, a]))
  return dieseWoche
    .filter((a) => !a.bezug)
    .map((a) => ({ ansage: a, gegen: gegen.get(a.id) ?? null }))
    .sort((a, b) => (a.ansage.erstelltAm < b.ansage.erstelltAm ? 1 : -1))
}

/** „du“ für die schauende person, sonst der name */
export function wer(u: UserId, me: UserId): string {
  return u === me ? 'du' : userDef(u).name
}

/** „dich“ für die schauende person, sonst der name — nach „für“ */
export function fuerWen(u: UserId, me: UserId): string {
  return u === me ? 'dich' : userDef(u).name
}

/**
 * die restzeit bis zu einem zeitpunkt, so kurz wie möglich: „3 t 4 std“,
 * „5 std 12 min“, „8 min“. vorbei heißt vorbei.
 */
export function restzeitText(jetzt: Date, bis: Date): string {
  const ms = bis.getTime() - jetzt.getTime()
  if (ms <= 0) return 'vorbei'
  const minuten = Math.ceil(ms / 60_000)
  const tage = Math.floor(minuten / 1440)
  const stunden = Math.floor((minuten % 1440) / 60)
  const rest = minuten % 60
  // genau ein tag liest sich als „24 std“, erst darüber zählen tage
  if (minuten > 1440) return stunden > 0 ? `${tage} t ${stunden} std` : `${tage} t`
  if (minuten === 1440) return '24 std'
  if (stunden > 0) return rest > 0 ? `${stunden} std ${rest} min` : `${stunden} std`
  return `${rest} min`
}

/** wie eine ansage wem punkte bringt, aus sicht von `me`: „schafft koray es: +2 für koray. sonst +2 für dich.“ */
export function wertungText(a: Ansage, me: UserId): string {
  const e = wirksamerEinsatz(a)
  const liefert = a.an === me ? 'du' : userDef(a.an).name
  const punkt = e === 1 ? 'Punkt' : 'Punkte'
  return `Wenn ${liefert} das Ziel schaff${a.an === me ? 'st' : 't'}: +${e} ${punkt} für ${fuerWen(a.an, me)}. Sonst: +${e} ${punkt} für ${fuerWen(a.von, me)}.`
}

/** wer aus einer entschiedenen ansage wie viel bekommt, oder null solange sie läuft */
export function ergebnisFuer(a: Ansage, status: AnsageStatus): { an: UserId; punkte: number } | null {
  if (status === 'laeuft' || !istV2(a)) return null
  const p = ansagePunkte(status, a)
  const an: UserId = p.erijon > 0 ? 'erijon' : 'koray'
  return { an, punkte: p[an] }
}

/** die frist in worten */
export function fristText(a: Ansage): string {
  if (!istV2(a)) return 'bis sa'
  const frist = ansageFrist(a)
  return `bis so ${frist.getHours()} uhr`
}
