export const FOKUS_BEREICHE = ['lernen', 'gym', 'boxen', 'lesen'] as const

type FokusBereich = (typeof FOKUS_BEREICHE)[number]
type FokusEreignis = 'an' | 'aus'

type FokusBefehl = {
  token: string
  bereich: FokusBereich
  ereignis: FokusEreignis
  ort: string
  legacyGet: boolean
}

type RpcFehler = { code?: string; message?: string }
type RpcAntwort = { data: unknown; error: RpcFehler | null; status?: number }

export type FokusDatenbank = {
  rpc(name: string, argumente: Record<string, unknown>): PromiseLike<RpcAntwort>
}

export type FokusAbhaengigkeiten = {
  umgebung(name: string): string | undefined
  datenbank(url: string, key: string): FokusDatenbank
}

class AnfrageFehler extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

const LEGACY_GET_HEADERS = {
  deprecation: 'true',
  'x-zweikampf-fokus-get': 'veraltet',
}

const EREIGNIS_ALIASE: Record<FokusEreignis, ReadonlySet<string>> = {
  an: new Set(['ankunft', 'ankommen', 'arrival', 'arrive', 'an', 'start', 'on']),
  aus: new Set(['abgang', 'verlassen', 'weggehen', 'departure', 'leave', 'aus', 'ende', 'off']),
}

function antwort(
  status: number,
  body: Record<string, unknown>,
  extra: Record<string, string> = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extra },
  })
}

/** kurze und lange schreibweise, damit die alten GET-URLs lesbar bleiben */
function hole(params: URLSearchParams, ...namen: string[]): string {
  for (const name of namen) {
    const wert = params.get(name)
    if (wert !== null && wert.trim() !== '') return wert.trim()
  }
  return ''
}

/**
 * Die neuen Supabase-Variablen sind JSON-Woerterbuecher. Ist eines vorhanden,
 * aber kaputt, endet die Function bewusst fail-closed und faellt nicht auf
 * einen anderen Key zurueck. Nur wenn die neue Variable ganz fehlt, bleibt der
 * unprivilegierte Legacy-anon-Key waehrend des Uebergangs erlaubt.
 */
export function publizierbarerSupabaseKey(
  umgebung: FokusAbhaengigkeiten['umgebung']
): string | null {
  const neu = umgebung('SUPABASE_PUBLISHABLE_KEYS')
  if (neu !== undefined) {
    try {
      const keys = JSON.parse(neu) as unknown
      if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return null
      const standard = (keys as Record<string, unknown>).default
      if (typeof standard !== 'string' || !standard.startsWith('sb_publishable_')) return null
      return standard
    } catch {
      return null
    }
  }

  const legacy = umgebung('SUPABASE_ANON_KEY')?.trim()
  if (!legacy || legacy.startsWith('sb_secret_')) return null
  if (legacy.startsWith('sb_publishable_')) return legacy

  // Bei den alten JWT-Keys ist nur die Rolle `anon` fuer diesen oeffentlichen
  // Weg korrekt. Unbekannte Rollen und unlesbare JWTs enden fail-closed.
  const teile = legacy.split('.')
  if (teile.length !== 3) return null
  try {
    const payload = teile[1].replace(/-/g, '+').replace(/_/g, '/')
    const aufgefuellt = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')
    const rolle = (JSON.parse(atob(aufgefuellt)) as { role?: unknown }).role
    return rolle === 'anon' ? legacy : null
  } catch {
    return null
  }
}

function normalisiereEreignis(roh: string): FokusEreignis | null {
  if (EREIGNIS_ALIASE.an.has(roh)) return 'an'
  if (EREIGNIS_ALIASE.aus.has(roh)) return 'aus'
  return null
}

function sichereSupabaseUrl(roh: string | undefined): string | null {
  if (!roh?.trim()) return null
  try {
    const url = new URL(roh.trim())
    const lokal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && lokal)) return null
    if (url.username || url.password || url.search || url.hash) return null
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function liesBefehl(request: Request): FokusBefehl {
  if (request.method !== 'GET' && request.method !== 'POST') {
    throw new AnfrageFehler(405, 'nur GET oder POST')
  }

  const params = new URL(request.url).searchParams
  const legacyGet = request.method === 'GET'
  if (!legacyGet && (params.has('t') || params.has('token'))) {
    throw new AnfrageFehler(400, 'bei POST gehört das import-token in x-import-token')
  }

  const token = legacyGet
    ? hole(params, 't', 'token')
    : (request.headers.get('x-import-token')?.trim() ?? '')
  const bereich = hole(params, 'b', 'bereich').toLowerCase()
  const ereignis = normalisiereEreignis(hole(params, 'e', 'ereignis').toLowerCase())
  const ort = hole(params, 'o', 'ort') || `fokus ${bereich}`

  if (token.length < 32 || token.length > 512) {
    throw new AnfrageFehler(401, 'import-token fehlt oder hat eine ungültige länge')
  }
  if (!FOKUS_BEREICHE.includes(bereich as FokusBereich)) {
    throw new AnfrageFehler(400, `b muss ${FOKUS_BEREICHE.join(', ')} sein`)
  }
  if (!ereignis) throw new AnfrageFehler(400, 'e ist kein bekanntes fokus-ereignis')
  if (ort.length > 40) throw new AnfrageFehler(400, 'o ist zu lang')

  return {
    token,
    bereich: bereich as FokusBereich,
    ereignis,
    ort,
    legacyGet,
  }
}

function deuteRpcFehler(fehler: RpcFehler): { status: number; text: string } {
  const roh = fehler.message?.trim().toLowerCase() ?? ''
  if (fehler.code === '28000' || roh === 'kein gueltiges import-token') {
    return { status: 401, text: 'import-token ist ungültig' }
  }
  if (/^p_(bereich|ereignis|ort)\b/.test(roh)) {
    return { status: 400, text: 'fokus-eingabe ist ungültig' }
  }
  return { status: 500, text: 'fokus-ereignis konnte nicht gespeichert werden' }
}

/** Vollstaendiger, ohne Deno-Global testbarer Request-Handler. */
export async function behandleFokus(
  request: Request,
  abhaengigkeiten: FokusAbhaengigkeiten
): Promise<Response> {
  let befehl: FokusBefehl
  try {
    befehl = liesBefehl(request)
  } catch (fehler) {
    if (fehler instanceof AnfrageFehler) return antwort(fehler.status, { error: fehler.message })
    return antwort(400, { error: 'fokus-anfrage ist ungültig' })
  }

  const url = sichereSupabaseUrl(abhaengigkeiten.umgebung('SUPABASE_URL'))
  const key = publizierbarerSupabaseKey(abhaengigkeiten.umgebung)
  if (!url || !key) return antwort(500, { error: 'server ist nicht vollständig konfiguriert' })

  let db: FokusDatenbank
  try {
    db = abhaengigkeiten.datenbank(url, key)
  } catch {
    return antwort(500, { error: 'server ist nicht vollständig konfiguriert' })
  }

  let rpc: RpcAntwort
  try {
    rpc = await db.rpc('record_aufenthalt', {
      p_token: befehl.token,
      p_bereich: befehl.bereich,
      p_ort: befehl.ort,
      p_ereignis: befehl.ereignis,
    })
  } catch {
    return antwort(502, { error: 'fokus-speicher ist nicht erreichbar' })
  }

  const { data, error } = rpc

  // PostgREST faengt Fetch-Rejections selbst und liefert sie in dieser Form,
  // statt den Promise abzulehnen. Status 0 ist daher ebenfalls ein
  // Transportfehler und kein fachlicher Datenbankfehler.
  if (rpc.status === 0) {
    return antwort(502, { error: 'fokus-speicher ist nicht erreichbar' })
  }

  if (error) {
    const sicher = deuteRpcFehler(error)
    return antwort(sicher.status, { error: sicher.text })
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || !('ok' in data)) {
    return antwort(500, { error: 'fokus-ereignis wurde nicht bestätigt' })
  }

  const ergebnis = data as Record<string, unknown>
  if (ergebnis.ok !== true) {
    return antwort(
      409,
      { error: 'kein passender offener fokus vorhanden', code: 'kein_offener_fokus' },
      befehl.legacyGet ? LEGACY_GET_HEADERS : undefined
    )
  }

  const body = befehl.legacyGet
    ? { ...ergebnis, veraltet: true }
    : ergebnis
  return antwort(
    200,
    body,
    befehl.legacyGet ? LEGACY_GET_HEADERS : undefined
  )
}
