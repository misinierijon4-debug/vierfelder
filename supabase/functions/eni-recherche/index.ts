import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { behandleRecherche, type RechercheDatenbank } from '../_shared/eniRechercheHandler.ts'

/**
 * Die Recherche fuer ENIs Rollen. Was sie tut, steht in
 * `_shared/eniRecherche.ts`, wer sie rufen darf, in
 * `_shared/eniRechercheHandler.ts`.
 *
 * Deploy mit `verify_jwt: false`: der Cron-Job hat kein JWT, er weist sich
 * mit `x-erinnerungs-secret` aus; die App schickt das Token der Person, und
 * der Handler prueft es selbst.
 *
 * Schluessel aus der Umgebung, dieselben wie bei `eni`:
 *   INFRON_API_KEY  das kostenlose Modell
 *   TAVILY_API_KEY  die Suche
 */

type Laufzeit = { waitUntil(arbeit: Promise<unknown>): void }

Deno.serve((request) =>
  behandleRecherche(request, {
    umgebung: (name) => Deno.env.get(name),
    dienst: () => {
      const url = Deno.env.get('SUPABASE_URL')
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (!url || !key) return null
      return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      }) as unknown as RechercheDatenbank
    },
    imHintergrund: (arbeit) => {
      const laufzeit = (globalThis as { EdgeRuntime?: Laufzeit }).EdgeRuntime
      if (laufzeit) laufzeit.waitUntil(arbeit)
    },
    protokoll: console,
  })
)
