import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { behandleFokus } from '../_shared/fokus.ts'

/**
 * Ein Fokus-Umschalter fuer iPhone-Kurzbefehle. Neu und bevorzugt:
 *
 *   POST /fokus?b=lernen&e=an
 *   x-import-token: TOKEN
 *
 * Die bisher installierten GET-URLs bleiben voruebergehend funktionsfaehig,
 * tragen das Token aber in der URL und kennzeichnen ihre Antwort deshalb als
 * veraltet. Abschalten darf dieser Weg erst nach Umstellung beider iPhones und
 * kontrollierter Tokenrotation.
 *
 * Geschrieben wird nichts selbst. Die Funktion ruft `record_aufenthalt` auf,
 * dieselbe Datenbankfunktion wie die Standort-Kurzbefehle — sonst gaebe es zwei
 * Stellen, an denen die Regeln fuer eine Sitzung stehen, und irgendwann zwei
 * verschiedene.
 */

Deno.serve((request) =>
  behandleFokus(request, {
    umgebung: (name) => Deno.env.get(name),
    datenbank: (url, key) =>
      createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      }),
  })
)
