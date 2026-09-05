import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { behandlePushProbe, type PushProbeDatenbank } from '../_shared/pushProbe.ts'
import { pushDienst } from '../_shared/pushEndpoint.ts'
import { sende } from '../_shared/webpush.ts'

/**
 * Die Probenachricht laeuft absichtlich mit dem JWT des angemeldeten Kontos.
 * Der gemeinsame Handler prueft zusaetzlich die Zwei-Personen-Mitgliedschaft
 * und reserviert atomar hoechstens eine Probe je Minute.
 */
Deno.serve((request) =>
  behandlePushProbe(request, {
    umgebung: (name) => Deno.env.get(name),
    datenbank: (url, key, autorisierung) =>
      createClient(url, key, {
        global: { headers: { authorization: autorisierung } },
        auth: { autoRefreshToken: false, persistSession: false },
      }) as unknown as PushProbeDatenbank,
    senden: sende,
    dienst: pushDienst,
    protokoll: console,
  })
)
