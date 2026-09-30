import { supabase } from './supabase'
import {
  bereinigeEinstellungen,
  LAENGEN,
  ROLLEN_VORLAGEN,
  STANDARD,
  TOENE,
  type EniEinstellungen,
  type EniLaenge,
  type EniRolle,
  type EniTon,
} from '../../supabase/functions/_shared/eniEinstellungen'

export { GRENZEN, LAENGEN, ROLLEN_VORLAGEN, STANDARD, TOENE } from '../../supabase/functions/_shared/eniEinstellungen'
export type { EniEinstellungen, EniLaenge, EniRolle, EniTon }

/**
 * Laden und speichern, wie ENI mit einem redet. Angemeldet liegt das in
 * `eni_einstellungen` (eine zeile je person, nur für sie lesbar), im
 * prototyp ohne supabase im browser. beide wege liefern dasselbe format.
 */

const LOKAL = 'eni-einstellungen'
export const EINSTELLUNGEN_GESPEICHERT = 'eni-einstellungen-gespeichert'

function lokalLesen(): EniEinstellungen {
  try {
    return bereinigeEinstellungen(JSON.parse(localStorage.getItem(LOKAL) ?? 'null'))
  } catch {
    return { ...STANDARD, rollen: [] }
  }
}

function fehlertext(code: string | undefined, meldung: string): string {
  // PGRST205: PostgREST kennt die tabelle nicht. 42P01: PostgreSQL auch nicht.
  if (code === 'PGRST205' || code === '42P01')
    return 'Die Einstellungen sind in dieser Umgebung noch nicht angelegt. Die Migration eni_einstellungen fehlt in der Datenbank.'
  if (code === '42501' || code === 'PGRST301') return 'Kein Zugriff auf die Einstellungen. Melde dich neu an.'
  return `Die Einstellungen sind gerade nicht erreichbar: ${meldung}`
}

export async function ladeEinstellungen(): Promise<EniEinstellungen> {
  if (!supabase) return lokalLesen()
  const { data, error } = await supabase.from('eni_einstellungen').select('*').maybeSingle()
  if (error) throw new Error(fehlertext(error.code, error.message))
  return bereinigeEinstellungen(data)
}

export async function speichereEinstellungen(userId: string | null, e: EniEinstellungen): Promise<void> {
  const sauber = bereinigeEinstellungen(e)
  if (!supabase) {
    try {
      localStorage.setItem(LOKAL, JSON.stringify(sauber))
    } catch {
      throw new Error('Nicht gespeichert: der Browser lässt gerade keinen Speicher zu.')
    }
    window.dispatchEvent(new Event(EINSTELLUNGEN_GESPEICHERT))
    return
  }
  if (!userId) throw new Error('Zum Speichern braucht es eine Anmeldung.')
  const { error } = await supabase
    .from('eni_einstellungen')
    .upsert({ user_id: userId, ...sauber }, { onConflict: 'user_id' })
  if (error) throw new Error(fehlertext(error.code, error.message))
  window.dispatchEvent(new Event(EINSTELLUNGEN_GESPEICHERT))
}

/**
 * Alle rollen zum anzeigen: die vorlagen in fester reihenfolge — mit dem, was
 * die person daran geändert hat — und danach ihre eigenen.
 */
export function alleRollen(e: EniEinstellungen): EniRolle[] {
  const eigene = new Map(e.rollen.map((r) => [r.id, r]))
  return [
    ...ROLLEN_VORLAGEN.map((v) => eigene.get(v.id) ?? v),
    ...e.rollen.filter((r) => !ROLLEN_VORLAGEN.some((v) => v.id === r.id)),
  ]
}

export function istVorlage(id: string): boolean {
  return ROLLEN_VORLAGEN.some((v) => v.id === id)
}

/** setzt eine rolle in die einstellungen, neu oder geändert */
export function mitRolle(e: EniEinstellungen, rolle: EniRolle): EniEinstellungen {
  const da = e.rollen.some((r) => r.id === rolle.id)
  return { ...e, rollen: da ? e.rollen.map((r) => (r.id === rolle.id ? rolle : r)) : [...e.rollen, rolle] }
}

export function ohneRolle(e: EniEinstellungen, id: string): EniEinstellungen {
  return { ...e, rollen: e.rollen.filter((r) => r.id !== id) }
}

/**
 * Die vorschau oben auf der seite: dieselbe frage, und ENIs antwort im
 * gewählten ton. kurz ist der erste satz, normal zwei, ausführlich alle.
 * das ist ein beispiel, keine echte antwort — es soll zeigen, was die
 * einstellung bewirkt, bevor man den nächsten chat anfängt.
 */
export const VORSCHAU_FRAGE = 'Hab heute keinen Bock aufs Gym.'

const VORSCHAU: Record<Exclude<EniTon, 'eigener'>, string[]> = {
  standard: [
    'Verständlich, aber lass den Tag nicht ganz fallen.',
    'Geh für 30 Minuten hin und mach nur deine Grundübungen – oft kommt die Lust mit dem ersten Satz.',
    'Und wenn du wirklich platt bist: heute früher schlafen, morgen nachholen. Dann zählt die Einheit trotzdem.',
  ],
  streng: [
    'Keine Lust ist kein Grund.',
    'Tasche packen, 45 Minuten, los – Koray trainiert heute auch.',
    'Müde sein darfst du danach. Wenn du jetzt einknickst, fehlt dir am Sonntag genau dieser Punkt.',
  ],
  locker: [
    'Kenn ich, manche Tage sind einfach zäh.',
    'Wie wär’s mit einer lockeren Runde, 20 Minuten, Musik auf die Ohren – kein Rekordversuch.',
    'Und wenn’s gar nicht geht: gönn dir den Abend, morgen greifst du wieder an.',
  ],
  sanft: [
    'Das ist völlig okay, solche Tage hat jeder.',
    'Bist du eher müde oder einfach unmotiviert? Dann finden wir den kleinen Schritt, der heute passt.',
    'Selbst zehn Minuten Mobility zu Hause sind heute ein guter Beitrag für dich.',
  ],
  sachlich: [
    'Motivation schwankt, Routine trägt.',
    'Eine kurze Einheit von 30 Minuten hält die Trainingsfrequenz und damit den Fortschritt stabil.',
    'Bei Schlafmangel oder starkem Muskelkater ist ein Ruhetag sinnvoller als ein erzwungenes Training.',
  ],
}

const SAETZE: Record<EniLaenge, number> = { kurz: 1, normal: 2, ausfuehrlich: 3 }

export function vorschau(ton: EniTon, laenge: EniLaenge): string {
  return VORSCHAU[ton === 'eigener' ? 'standard' : ton].slice(0, SAETZE[laenge]).join(' ')
}

/** die einstellung in einer zeile, etwa für den kopf des chats */
export function einstellungKurz(e: EniEinstellungen): string {
  const aktiv = e.rollen.filter((r) => r.aktiv).length
  return [
    TOENE[e.ton].name,
    LAENGEN[e.laenge].name,
    aktiv ? `${aktiv} ${aktiv === 1 ? 'Rolle' : 'Rollen'}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}
