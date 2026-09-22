import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { ANBIETER, STANDARD_ANBIETER, mitVordenken } from '../_shared/eniAnbieter.ts'
import { SPRUCH_ANWEISUNG, SPRUCH_PERSONEN, behandleSprueche } from '../_shared/ansageSprueche.ts'
import type { SpruchPerson } from '../_shared/ansageSprueche.ts'

Deno.serve((request) => {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const db = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return behandleSprueche(request, {
    async person(token) {
      const client = db()
      const { data, error } = await client.auth.getUser(token.replace(/^Bearer /i, ''))
      if (error || !data.user) return null
      const profil = await client.from('profile').select('person').eq('id', data.user.id).single()
      if (profil.error) return null
      const person = profil.data?.person
      return SPRUCH_PERSONEN.includes(person) ? person as SpruchPerson : null
    },
    async schreiben(eingabe) {
      const anbieter = mitVordenken(ANBIETER.find(a => a.id === STANDARD_ANBIETER)!, false)
      const secret = Deno.env.get(anbieter.schluessel)
      if (!secret) throw new Error('modell fehlt')
      const response = await fetch(anbieter.endpunkt, {
        method: 'POST', signal: AbortSignal.timeout(20_000),
        headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: anbieter.modell, ...anbieter.denken, max_tokens: 400,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: SPRUCH_ANWEISUNG },
            { role: 'user', content: JSON.stringify(eingabe) }] }),
      })
      if (!response.ok) { await response.body?.cancel(); throw new Error('modell nicht erreichbar') }
      const result = await response.json()
      const choice = result.choices?.[0]
      if (choice?.finish_reason !== 'stop') throw new Error('antwort unvollstaendig')
      return { antwort: JSON.parse(choice.message.content), modell: anbieter.modell }
    },
  })
})
