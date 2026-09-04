/**
 * Push-Endpunkte sind keine beliebigen Webhooks. Browser stellen sie nur bei
 * wenigen bekannten Push-Diensten aus. Diese harte Liste ist absichtlich
 * enger als `https:`: Edge Functions duerfen niemals zu einem vom Client frei
 * gewaehlt internen oder fremden Ziel verbinden.
 */
export type PushDienst = 'apple' | 'google' | 'microsoft' | 'mozilla'

export const PUSH_ENDPOINT_FEHLER = 'push-endpoint gehört zu keinem unterstützten dienst'
export const MAX_PUSH_ENDPOINT_ZEICHEN = 800

function dienstFuerHost(host: string): PushDienst | null {
  if (host === 'fcm.googleapis.com') return 'google'
  if (host === 'updates.push.services.mozilla.com') return 'mozilla'
  if (host.endsWith('.push.apple.com')) return 'apple'
  if (host === 'notify.windows.com' || host.endsWith('.notify.windows.com')) return 'microsoft'
  return null
}

/**
 * Prueft einen Endpunkt an jeder Vertrauensgrenze. Der Rueckgabewert enthaelt
 * nur den groben Dienstnamen; die eigentliche, sensible Abo-Adresse darf weder
 * in Logs noch in API-Antworten auftauchen.
 */
export function pushDienst(endpoint: string): PushDienst {
  if (
    typeof endpoint !== 'string' ||
    endpoint.length === 0 ||
    endpoint.length > MAX_PUSH_ENDPOINT_ZEICHEN ||
    endpoint.trim() !== endpoint
  ) {
    throw new Error(PUSH_ENDPOINT_FEHLER)
  }

  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new Error(PUSH_ENDPOINT_FEHLER)
  }

  // URL normalisiert den Host, aber nicht alle sicherheitsrelevanten Teile.
  // Benutzerinfo, Fragmente und abweichende Ports gehoeren nie zu einem vom
  // Browser ausgestellten Push-Abo. Die Hostliste schliesst zugleich IP-
  // Literale, localhost, private Netze und irrefuehrende Suffixe aus.
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== '' ||
    url.port !== '' ||
    url.hostname.endsWith('.')
  ) {
    throw new Error(PUSH_ENDPOINT_FEHLER)
  }

  const dienst = dienstFuerHost(url.hostname.toLowerCase())
  if (!dienst) throw new Error(PUSH_ENDPOINT_FEHLER)
  return dienst
}
