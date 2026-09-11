import { readFile } from 'node:fs/promises'

/**
 * Fragt die ausgerollte ENI-Function, ob ihr Modellschluessel gesetzt ist.
 *
 * Der Schluessel selbst kommt hier nie vor. Die Function antwortet nur mit ja
 * oder nein; sie gibt ihn auch dann nicht heraus, wenn man danach fragt.
 * Gelesen wird ausschliesslich der publizierbare Supabase-Key, der ohnehin im
 * Browser-Bundle steht.
 */

const umgebung = await readFile(new URL('../.env.local', import.meta.url), 'utf8').catch(
  () => {
    throw new Error('.env.local nicht gefunden. Ohne sie kenne ich die Projektadresse nicht.')
  }
)

function lies(name) {
  const treffer = umgebung.match(new RegExp(`^${name}=(.*)$`, 'm'))
  return treffer?.[1]?.trim().replace(/^"|"$/g, '') ?? ''
}

const url = lies('VITE_SUPABASE_URL')
const schluessel = lies('VITE_SUPABASE_PUBLISHABLE_KEY')
if (!url || !schluessel) {
  throw new Error('VITE_SUPABASE_URL oder VITE_SUPABASE_PUBLISHABLE_KEY fehlt in .env.local')
}

const ziel = `${url.replace(/\/+$/, '')}/functions/v1/eni`

const SETZEN = '  npx supabase secrets set DEEPSEEK_API_KEY=sk-DEIN-SCHLUESSEL'

/**
 * Kein `process.exit()`: Node reisst damit den noch offenen Verbindungshandle
 * von `fetch` ab, und libuv bricht auf Windows mit einer Assertion ab. Der
 * Exitcode wird gesetzt, die Laufzeit beendet sich danach von selbst.
 */
process.exitCode = await pruefe()

async function pruefe() {
  const antwort = await fetch(ziel, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${schluessel}`,
      apikey: schluessel,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ pruefen: true }),
  })

  const text = await antwort.text()

  if (antwort.status === 404) {
    console.error('ENI ist nicht ausgerollt. Hol das nach mit:')
    console.error('  npx supabase functions deploy eni')
    return 1
  }
  if (antwort.status === 401) {
    console.error('Die Function weist den Aufruf ab.')
    console.error('Steht in .env.local der richtige publizierbare Key?')
    return 1
  }
  if (!antwort.ok) {
    console.error(`Die Function antwortet ${antwort.status}: ${text.slice(0, 200)}`)
    return 1
  }

  let inhalt
  try {
    inhalt = JSON.parse(text)
  } catch {
    console.error(`Die Function antwortet kein JSON: ${text.slice(0, 200)}`)
    return 1
  }

  if (inhalt.bereit === true) {
    console.log(`ENI ist verbunden. Modell: ${inhalt.modell}.`)
    console.log('In der App steht oben im Kopf jetzt "deepseek ueber supabase".')
    return 0
  }

  console.log('ENI ist ausgerollt, aber ohne Schluessel. Setz ihn mit:')
  console.log('')
  console.log(SETZEN)
  console.log('')
  console.log('Danach noch einmal: npm run check:eni')
  return 1
}
