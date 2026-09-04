const fehler = []

const base = process.env.VITE_BASE ?? ''
const supabaseUrl = process.env.VITE_SUPABASE_URL ?? ''
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''

if (base !== '/vierfelder/') {
  fehler.push('VITE_BASE muss fuer GitHub Pages exakt /vierfelder/ sein')
}

try {
  const parsed = new URL(supabaseUrl)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    fehler.push('VITE_SUPABASE_URL muss eine HTTPS-URL ohne Zugangsdaten sein')
  }
} catch {
  fehler.push('VITE_SUPABASE_URL fehlt oder ist keine gueltige URL')
}

if (!publishableKey.startsWith('sb_publishable_')) {
  fehler.push('VITE_SUPABASE_PUBLISHABLE_KEY muss ein sb_publishable_-Schluessel sein')
}

for (const [name, value] of Object.entries(process.env)) {
  if (name.startsWith('VITE_') && value?.startsWith('sb_secret_')) {
    fehler.push(`${name} darf keinen sb_secret_-Schluessel enthalten`)
  }
}

if (fehler.length > 0) {
  console.error(`Pages-Konfiguration ungueltig:\n- ${fehler.join('\n- ')}`)
  process.exit(1)
}

console.log('Pages-Konfiguration: Unterpfad, Supabase-URL und Key-Klasse sind plausibel.')
