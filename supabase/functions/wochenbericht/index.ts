import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { ANBIETER, STANDARD_ANBIETER, mitVordenken } from '../_shared/eniAnbieter.ts'
import { behandleBericht, BERICHT_ANWEISUNG } from '../_shared/wochenberichtHandler.ts'
import type { BerichtArchiv } from '../_shared/wochenberichtHandler.ts'

Deno.serve((request) => {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  // Erst nach erfolgreicher Mitgliedschaft werden privilegierte Daten gelesen.
  const db = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return behandleBericht(request, {
    async mitglied(token) {
      const client = db()
      const { data, error } = await client.auth.getUser(token.replace(/^Bearer /i, ''))
      if (error || !data.user) return false
      const profil = await client.from('profile').select('person').eq('id', data.user.id).single()
      return !profil.error && ['erijon', 'koray'].includes(profil.data?.person)
    },
    async laden(woche) {
      const client = db()
      const gesichert = await client.rpc('hole_wochenbericht', { p_woche: woche })
      if (gesichert.error) throw gesichert.error
      const { data, error } = await client.from('wochenberichte').select('woche,daten,eingefroren,quelle,texte,modell,text_erstellt').eq('woche', woche).single()
      if (error || !data) throw error ?? new Error('archiv fehlt')
      return data as BerichtArchiv
    },
    async reservieren(woche) {
      const { data, error } = await db().from('wochenberichte')
        .update({ text_versuch: new Date().toISOString() }).eq('woche', woche).is('texte', null)
        .or(`text_versuch.is.null,text_versuch.lt.${new Date(Date.now() - 120_000).toISOString()}`)
        .select('woche')
      if (error) throw error
      return data.length === 1
    },
    async schreiben(daten) {
      const anbieter = mitVordenken(ANBIETER.find(a => a.id === STANDARD_ANBIETER)!, false)
      const secret = Deno.env.get(anbieter.schluessel)
      if (!secret) throw new Error('modell fehlt')
      const response = await fetch(anbieter.endpunkt, {
        method: 'POST', signal: AbortSignal.timeout(45_000),
        headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: anbieter.modell, ...anbieter.denken, max_tokens: 1200,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: BERICHT_ANWEISUNG },
            { role: 'user', content: JSON.stringify(daten) }] }),
      })
      if (!response.ok) { await response.body?.cancel(); throw new Error('modell nicht erreichbar') }
      const result = await response.json()
      const choice = result.choices?.[0]
      if (choice?.finish_reason !== 'stop') throw new Error('text unvollstaendig')
      const texte = JSON.parse(choice.message.content)
      // Zahlen bleiben ausschliesslich Sache der deterministischen Diagramme.
      if (/\d/.test(JSON.stringify(texte))) throw new Error('text enthaelt eigene zahlen')
      return { texte, modell: anbieter.modell }
    },
    async speichern(woche, texte, modell) {
      const { error } = await db().from('wochenberichte')
        .update({ texte, modell, text_erstellt: new Date().toISOString() })
        .eq('woche', woche).is('texte', null)
      if (error) throw error
    },
  })
})
