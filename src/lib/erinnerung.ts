import { supabase } from './supabase'

export const STANDARD_ERINNERUNGSZEIT = '20:00'

type Einstellungszeile = { gewicht_zeit: string }

function tabelleFehlt(code?: string): boolean {
  return code === '42P01' || code === 'PGRST205'
}

/** Die eigene Uhrzeit; null solange das neue Schema noch nicht veroeffentlicht ist. */
export async function ladeGewichtErinnerungszeit(): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('erinnerungs_einstellungen')
    .select('gewicht_zeit')
    .maybeSingle()
  if (error && tabelleFehlt(error.code)) return null
  if (error) throw new Error(error.message)
  return ((data as Einstellungszeile | null)?.gewicht_zeit ?? STANDARD_ERINNERUNGSZEIT).slice(0, 5)
}

export function istErlaubteErinnerungszeit(zeit: string): boolean {
  return /^\d{2}:\d{2}$/.test(zeit) && zeit >= '06:00' && zeit < '22:00'
}

/** RLS laesst den Upsert ausschliesslich fuer das angemeldete Konto zu. */
export async function setzeGewichtErinnerungszeit(zeit: string): Promise<void> {
  if (!supabase) throw new Error('kein konto')
  if (!istErlaubteErinnerungszeit(zeit)) {
    throw new Error('die uhrzeit muss zwischen 06:00 und 21:59 liegen.')
  }
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) throw new Error('die anmeldung ist abgelaufen. melde dich neu an.')

  const { error } = await supabase.from('erinnerungs_einstellungen').upsert(
    {
      user_id: userId,
      gewicht_aktiv: true,
      gewicht_zeit: zeit,
      aktualisiert: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
  if (error) throw new Error(error.message)
}
