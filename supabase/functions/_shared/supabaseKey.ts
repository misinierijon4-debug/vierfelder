export type EdgeUmgebung = (name: string) => string | undefined

/**
 * Waehlt ausschliesslich einen oeffentlichen Supabase-Key.
 *
 * Die neue Runtime-Variable ist ein JSON-Woerterbuch. Ist sie vorhanden, aber
 * kaputt, endet der Aufrufer bewusst fail-closed. Nur wenn sie vollstaendig
 * fehlt, bleibt waehrend der dokumentierten Migration ein Legacy-anon-JWT
 * erlaubt. Secret-, Service-Role- und User-Keys werden nie angenommen.
 */
export function publizierbarerSupabaseKey(umgebung: EdgeUmgebung): string | null {
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
