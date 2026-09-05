import type { Abo, Sendeergebnis, VapidSchluessel } from './webpush.ts'
import { publizierbarerSupabaseKey } from './supabaseKey.ts'

type DatenbankFehler = { code?: string; message?: string; status?: number }
type Ergebnis<T> = { data: T; error: DatenbankFehler | null }

type ProfilTabelle = {
  select(spalten: string): {
    eq(spalte: string, wert: string): {
      maybeSingle(): PromiseLike<Ergebnis<{ id: string } | null>>
    }
  }
}

type PushAboTabelle = {
  select(spalten: string): PromiseLike<Ergebnis<Abo[] | null>>
  delete(): {
    in(spalte: string, werte: string[]): {
      select(spalten: string): PromiseLike<Ergebnis<Array<{ endpoint: string }> | null>>
    }
  }
}

export type PushProbeDatenbank = {
  auth: {
    getUser(token: string): PromiseLike<
      Ergebnis<{ user: { id: string } | null }>
    >
  }
  from(tabelle: 'profile'): ProfilTabelle
  from(tabelle: 'push_abos'): PushAboTabelle
  rpc(name: 'reserviere_push_probe'): PromiseLike<Ergebnis<boolean | null>>
}

export type PushProbeAbhaengigkeiten = {
  umgebung(name: string): string | undefined
  datenbank(url: string, key: string, autorisierung: string): PushProbeDatenbank
  senden(abo: Abo, nachricht: string, schluessel: VapidSchluessel): Promise<Sendeergebnis>
  dienst(endpoint: string): string
  protokoll: Pick<Console, 'log' | 'error'>
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const JSON_HEADERS = {
  ...CORS,
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

function antwort(
  status: number,
  body: Record<string, unknown>,
  zusaetzlicheHeader: Record<string, string> = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...zusaetzlicheHeader },
  })
}

function bearerToken(autorisierung: string): string | null {
  const fund = autorisierung.match(/^Bearer\s+(.+)$/i)
  const token = fund?.[1]?.trim() ?? ''
  return token === '' ? null : token
}

export async function behandlePushProbe(
  request: Request,
  deps: PushProbeAbhaengigkeiten
): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') return antwort(405, { error: 'nur POST' })

  const url = deps.umgebung('SUPABASE_URL')
  const oeffentlicherKey = publizierbarerSupabaseKey(deps.umgebung)
  const schluessel: VapidSchluessel = {
    oeffentlich: deps.umgebung('VAPID_PUBLIC_KEY') ?? '',
    privat: deps.umgebung('VAPID_PRIVATE_KEY') ?? '',
    kontakt: deps.umgebung('VAPID_KONTAKT') ?? '',
  }

  if (!url || !oeffentlicherKey) {
    return antwort(500, { error: 'server ist nicht vollständig konfiguriert' })
  }
  if (!schluessel.oeffentlich || !schluessel.privat || !schluessel.kontakt) {
    return antwort(500, { error: 'vapid-schlüssel fehlen. siehe BENACHRICHTIGUNGEN.md' })
  }

  const autorisierung = request.headers.get('authorization') ?? ''
  const token = bearerToken(autorisierung)
  if (!token) return antwort(401, { error: 'ohne anmeldung aufgerufen' })

  const db = deps.datenbank(url, oeffentlicherKey, autorisierung)
  let userId: string
  try {
    const anmeldung = await db.auth.getUser(token)
    if (anmeldung.error) {
      if (anmeldung.error.status === 401 || anmeldung.error.status === 403) {
        return antwort(401, { error: 'anmeldung ist ungültig oder abgelaufen' })
      }
      return antwort(502, { error: 'anmeldung konnte vorübergehend nicht geprüft werden' })
    }
    if (!anmeldung.data.user) {
      return antwort(401, { error: 'anmeldung ist ungültig oder abgelaufen' })
    }
    userId = anmeldung.data.user.id
  } catch {
    return antwort(502, { error: 'anmeldung konnte vorübergehend nicht geprüft werden' })
  }

  const mitglied = await db
    .from('profile')
    .select('id')
    .eq('id', userId)
    .maybeSingle()
  if (mitglied.error) return antwort(500, { error: 'mitgliedschaft konnte nicht geprüft werden' })
  if (!mitglied.data) return antwort(403, { error: 'dieses konto gehört nicht zum duell' })

  const aboAntwort = await db.from('push_abos').select('endpoint, p256dh, auth')
  if (aboAntwort.error) return antwort(500, { error: 'push-abos konnten nicht gelesen werden' })

  const abos = aboAntwort.data ?? []
  if (abos.length === 0) {
    return antwort(404, { error: 'für dieses konto ist kein gerät angemeldet' })
  }

  const reservierung = await db.rpc('reserviere_push_probe')
  if (reservierung.error) {
    const status = reservierung.error.code === '42501' ? 403 : 500
    return antwort(status, {
      error: status === 403 ? 'dieses konto darf keine probe senden' : 'probe konnte nicht reserviert werden',
    })
  }
  if (reservierung.data === false) {
    return antwort(
      429,
      { error: 'bitte warte eine minute bis zur nächsten probe' },
      { 'retry-after': '60' }
    )
  }
  if (reservierung.data !== true) {
    return antwort(500, { error: 'probe wurde nicht eindeutig reserviert' })
  }

  const nachricht = JSON.stringify({
    titel: 'zweikampf',
    text: 'probe angekommen. der weg steht.',
    tag: 'probe',
  })

  deps.protokoll.log(`probe: ${abos.length} gerät(e) für das angemeldete konto`)

  const ergebnisse = await Promise.all(
    abos.map(async (abo, index) => {
      const nummer = index + 1
      let dienst = 'unbekannt'
      try {
        dienst = deps.dienst(abo.endpoint)
      } catch {
        // `senden` lehnt denselben Endpunkt fail-closed ab. Die Adresse wird
        // weder protokolliert noch an den Browser zurueckgegeben.
      }
      try {
        const ergebnis = await deps.senden(abo, nachricht, schluessel)
        deps.protokoll.log(
          `push-abo ${nummer} über ${dienst}: status ${ergebnis.status}` +
            `${ergebnis.weg ? ' (abo weg)' : ''}${ergebnis.fehler ? ` — ${ergebnis.fehler}` : ''}`
        )
        return { endpoint: abo.endpoint, nummer, dienst, ...ergebnis }
      } catch {
        deps.protokoll.error(`push-abo ${nummer} über ${dienst}: versand abgelehnt`)
        return {
          endpoint: abo.endpoint,
          nummer,
          dienst,
          status: 0,
          weg: false,
          fehler: 'push konnte nicht gesendet werden',
        }
      }
    })
  )

  const weg = ergebnisse.filter((ergebnis) => ergebnis.weg).map((ergebnis) => ergebnis.endpoint)
  let entfernt = 0
  if (weg.length > 0) {
    const loeschen = await db.from('push_abos').delete().in('endpoint', weg).select('endpoint')
    entfernt = loeschen.data?.length ?? 0
    if (loeschen.error || entfernt !== weg.length) {
      deps.protokoll.error('probe: alte push-abos konnten nicht vollständig entfernt werden')
    }
  }

  const gesendet = ergebnisse.filter((ergebnis) => !ergebnis.weg && ergebnis.fehler === null).length
  deps.protokoll.log(`probe fertig: ${gesendet} gesendet, ${entfernt} entfernt`)
  return antwort(gesendet > 0 ? 200 : 502, {
    gesendet,
    entfernt,
    geraete: ergebnisse.map((ergebnis) => ({
      nummer: ergebnis.nummer,
      dienst: ergebnis.dienst,
      status: ergebnis.status,
      weg: ergebnis.weg,
      fehler: ergebnis.fehler,
    })),
  })
}
