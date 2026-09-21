import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { ANBIETER, STANDARD_ANBIETER, mitVordenken } from '../_shared/eniAnbieter.ts'
import { BERICHT_PERSONEN, behandleBericht, BERICHT_ANWEISUNG, fasseBerichtWocheZusammen } from '../_shared/wochenberichtHandler.ts'
import type { BerichtArchiv, BerichtPerson } from '../_shared/wochenberichtHandler.ts'

Deno.serve((request) => {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  // Erst nach erfolgreicher Mitgliedschaft werden privilegierte Daten gelesen.
  const db = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return behandleBericht(request, {
    async person(token) {
      const client = db()
      const { data, error } = await client.auth.getUser(token.replace(/^Bearer /i, ''))
      if (error || !data.user) return null
      const profil = await client.from('profile').select('person').eq('id', data.user.id).single()
      if (profil.error) return null
      const person = profil.data?.person
      return BERICHT_PERSONEN.includes(person) ? person as BerichtPerson : null
    },
    async laden(woche, person) {
      const client = db()
      const gesichert = await client.rpc('hole_wochenbericht', { p_woche: woche })
      if (gesichert.error) throw gesichert.error
      const { data, error } = await client.from('wochenberichte')
        .select('woche,daten,eingefroren,quelle,naechte_vollstaendig').eq('woche', woche).single()
      if (error || !data) throw error ?? new Error('archiv fehlt')
      // Der Text gehoert einer Person. Ein Konto sieht nie den des anderen.
      const eigener = await client.from('wochenbericht_texte').select('texte,modell,erstellt')
        .eq('woche', woche).eq('person', person).maybeSingle()
      if (eigener.error) throw eigener.error
      return {
        ...(data as Omit<BerichtArchiv, 'texte' | 'modell' | 'text_erstellt'>),
        texte: eigener.data?.texte ?? null,
        modell: eigener.data?.modell ?? null,
        text_erstellt: eigener.data?.erstellt ?? null,
      } as BerichtArchiv
    },
    async reservieren(woche, person, erzwingen = false) {
      const { data, error } = await db().rpc('reserviere_wochenbericht_text',
        { p_woche: woche, p_person: person, p_erzwingen: erzwingen })
      if (error) throw error
      return data === true
    },
    async schreiben(daten, person) {
      const anbieter = mitVordenken(ANBIETER.find(a => a.id === STANDARD_ANBIETER)!, false)
      const secret = Deno.env.get(anbieter.schluessel)
      if (!secret) throw new Error('modell fehlt')
      const zusammenfassung = fasseBerichtWocheZusammen(daten, person)
      const response = await fetch(anbieter.endpunkt, {
        method: 'POST', signal: AbortSignal.timeout(45_000),
        headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: anbieter.modell, ...anbieter.denken, max_tokens: 1200,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: BERICHT_ANWEISUNG },
            { role: 'user', content: JSON.stringify(zusammenfassung) }] }),
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
    async speichern(woche, person, texte, modell) {
      const { error } = await db().from('wochenbericht_texte')
        .update({ texte, modell, erstellt: new Date().toISOString() })
        .eq('woche', woche).eq('person', person)
      if (error) throw error
    },
  })
})
