import { readFile } from 'node:fs/promises'

const server = new URL('../dist/server/index.js', import.meta.url)
const { default: worker } = await import(`${server.href}?pruefung=${Date.now()}`)

async function hole(pfad, accept = '*/*', methode = 'GET') {
  return worker.fetch(new Request(`https://preview.invalid${pfad}`, {
    method: methode,
    headers: { accept },
  }))
}

const root = await hole('/', 'text/html')
if (root.status !== 200 || !root.headers.get('content-type')?.startsWith('text/html')) {
  throw new Error('Sites-Root liefert kein HTML mit Status 200')
}
if (root.headers.get('cache-control') !== 'no-store') {
  throw new Error('Sites-HTML ist nicht update-sicher auf no-store gesetzt')
}
const html = await root.text()
if (!html.includes('<div id="root"></div>')) {
  throw new Error('Sites-Root enthaelt nicht die App-Huelle')
}

const referenzen = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((treffer) => treffer[1])
  .filter((pfad) => pfad.startsWith('/'))
for (const pfad of referenzen) {
  const antwort = await hole(pfad)
  if (antwort.status !== 200) throw new Error(`Sites-Asset ${pfad} liefert ${antwort.status}`)
  if (!antwort.headers.get('content-type')) throw new Error(`Sites-Asset ${pfad} ohne Content-Type`)
}

for (const pfad of ['/sw.js', '/push-sw.js', '/manifest.webmanifest']) {
  const antwort = await hole(pfad)
  if (antwort.status !== 200 || antwort.headers.get('cache-control') !== 'no-store') {
    throw new Error(`Sites-Updatedatei ${pfad} ist nicht unverzueglich aktualisierbar`)
  }
}

const unbekannt = await hole('/nicht-vorhanden.bin')
if (unbekannt.status !== 404) throw new Error('Sites-Worker verschluckt unbekannte Assets')

const navigation = await hole('/tiefer/einstieg', 'text/html')
if (navigation.status !== 200 || !(await navigation.text()).includes('<div id="root"></div>')) {
  throw new Error('Sites-Worker liefert fuer Navigationen nicht die App-Huelle')
}

const head = await hole('/', 'text/html', 'HEAD')
if (head.status !== 200 || (await head.arrayBuffer()).byteLength !== 0) {
  throw new Error('Sites-Worker beantwortet HEAD nicht korrekt')
}

// Das generierte Modul darf keine Pfade aus einem Pages-Unterpfad einbetten.
const quelle = await readFile(server, 'utf8')
if (quelle.includes('/vierfelder/')) {
  throw new Error('Sites-Worker enthaelt versehentlich den Pages-Unterpfad')
}

console.log(`Sites-Worker geprueft: Root, ${referenzen.length} HTML-Assets, PWA-Dateien, Navigation, 404 und HEAD.`)
