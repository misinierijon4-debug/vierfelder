import { createClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import type { Anfangszustand, Backend, TickEreignis } from './backend'
import { tickKey, wertKey } from './types'
import type { AreaId, Ticks, UserId, Werte } from './types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const hatSupabase = Boolean(url && key)

export const supabase = hatSupabase ? createClient(url!, key!) : null

type ProfilZeile = { id: string; person: UserId }
type EintragZeile = { user_id: string; bereich: AreaId; tag: string }
type WertZeile = { bereich: AreaId; tag: string; wert: number }

export type Anmeldestatus = 'laden' | 'an' | 'aus'

export function useSession() {
  const [status, setStatus] = useState<Anmeldestatus>(hatSupabase ? 'laden' : 'aus')
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    if (!supabase) return
    let aktiv = true
    supabase.auth.getSession().then(({ data }) => {
      if (!aktiv) return
      setSession(data.session)
      setStatus(data.session ? 'an' : 'aus')
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setStatus(s ? 'an' : 'aus')
    })
    return () => {
      aktiv = false
      data.subscription.unsubscribe()
    }
  }, [])

  return { status, session }
}

export async function anmelden(email: string, passwort: string): Promise<string | null> {
  if (!supabase) return 'supabase ist nicht eingerichtet.'
  const { error } = await supabase.auth.signInWithPassword({ email, password: passwort })
  if (!error) return null
  if (error.message.toLowerCase().includes('invalid')) {
    return 'e-mail oder passwort stimmt nicht.'
  }
  return 'anmeldung fehlgeschlagen. prüfe die verbindung und versuch es nochmal.'
}

export async function abmelden() {
  await supabase?.auth.signOut()
}

export function supabaseBackend(eigeneId: string): Backend {
  if (!supabase) throw new Error('supabase ist nicht eingerichtet')
  const db = supabase
  /** uuid -> person. wird beim laden gefüllt und von realtime mitbenutzt */
  const personen = new Map<string, UserId>()

  return {
    art: 'supabase',

    async laden(): Promise<Anfangszustand> {
      const [profile, eintraege, werteZeilen] = await Promise.all([
        db.from('profile').select('id, person'),
        db.from('eintraege').select('user_id, bereich, tag'),
        db.from('werte').select('bereich, tag, wert'),
      ])

      if (profile.error) throw profile.error
      if (eintraege.error) throw eintraege.error
      if (werteZeilen.error) throw werteZeilen.error

      personen.clear()
      for (const p of (profile.data ?? []) as ProfilZeile[]) personen.set(p.id, p.person)

      const me = personen.get(eigeneId)
      if (!me) {
        throw new Error('kein profil für dieses konto. lege in der tabelle profile eine zeile an.')
      }

      const ticks: Ticks = {}
      for (const e of (eintraege.data ?? []) as EintragZeile[]) {
        const person = personen.get(e.user_id)
        if (person) ticks[tickKey(person, e.bereich, e.tag)] = true
      }

      const werte: Werte = {}
      for (const w of (werteZeilen.data ?? []) as WertZeile[]) {
        werte[wertKey(w.bereich, w.tag)] = w.wert
      }

      return { me, ticks, werte }
    },

    async schreibeTick(bereich, tag, gesetzt) {
      if (gesetzt) {
        const { error } = await db
          .from('eintraege')
          .upsert({ user_id: eigeneId, bereich, tag }, { onConflict: 'user_id,bereich,tag' })
        if (error) throw error
      } else {
        const { error } = await db
          .from('eintraege')
          .delete()
          .match({ user_id: eigeneId, bereich, tag })
        if (error) throw error
      }
    },

    async schreibeWert(bereich, tag, wert) {
      if (wert <= 0) {
        const { error } = await db.from('werte').delete().match({ user_id: eigeneId, bereich, tag })
        if (error) throw error
      } else {
        const { error } = await db
          .from('werte')
          .upsert({ user_id: eigeneId, bereich, tag, wert }, { onConflict: 'user_id,bereich,tag' })
        if (error) throw error
      }
    },

    abonniere(cb) {
      const melde = (zeile: EintragZeile | null, gesetzt: boolean) => {
        if (!zeile) return
        const person = personen.get(zeile.user_id)
        if (!person) return
        cb({ user: person, area: zeile.bereich, tag: zeile.tag, gesetzt } satisfies TickEreignis)
      }

      const kanal = db
        .channel('eintraege')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'eintraege' },
          (p) => melde(p.new as EintragZeile, true)
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'eintraege' },
          // bei DELETE liefert postgres nur die replica identity — das ist genau unser primary key
          (p) => melde(p.old as EintragZeile, false)
        )
        .subscribe()

      return () => {
        db.removeChannel(kanal)
      }
    },
  }
}
