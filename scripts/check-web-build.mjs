import { access, readFile, readdir, stat } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const dist = new URL('../dist/', import.meta.url)
const erforderlich = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'push-sw.js',
  'favicon-32x32.png',
  'apple-touch-icon.png',
  'pwa-192x192.png',
  'pwa-512x512.png',
]

for (const datei of erforderlich) await access(new URL(datei, dist))

const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', dist), 'utf8'))
const erwartet = process.env.VITE_BASE || manifest.scope
for (const feld of ['id', 'scope', 'start_url']) {
  if (manifest[feld] !== erwartet) {
    throw new Error(`manifest.${feld} ist ${JSON.stringify(manifest[feld])}, erwartet ${erwartet}`)
  }
}

const erwarteteIcons = [
  { datei: 'pwa-192x192.png', groesse: '192x192', purpose: 'any' },
  { datei: 'pwa-512x512.png', groesse: '512x512', purpose: 'any maskable' },
]
for (const icon of erwarteteIcons) {
  const eintrag = manifest.icons?.find((wert) => wert.src === `${erwartet}${icon.datei}`)
  if (
    !eintrag ||
    eintrag.sizes !== icon.groesse ||
    eintrag.type !== 'image/png' ||
    eintrag.purpose !== icon.purpose
  ) {
    throw new Error(`manifest enthaelt kein gueltiges ${icon.groesse}-icon unter ${erwartet}`)
  }
}

for (const [datei, breite, hoehe] of [
  ['favicon-32x32.png', 32, 32],
  ['apple-touch-icon.png', 180, 180],
  ['pwa-192x192.png', 192, 192],
  ['pwa-512x512.png', 512, 512],
]) {
  const png = await readFile(new URL(datei, dist))
  const signatur = png.subarray(0, 8).toString('hex')
  if (signatur !== '89504e470d0a1a0a' || png.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`${datei} ist keine lesbare PNG-Datei`)
  }
  if (png.readUInt32BE(16) !== breite || png.readUInt32BE(20) !== hoehe) {
    throw new Error(`${datei} hat nicht die erwarteten ${breite}x${hoehe} Pixel`)
  }
}

const worker = await readFile(new URL('sw.js', dist), 'utf8')
for (const datei of [
  'push-sw.js',
  'favicon-32x32.png',
  'apple-touch-icon.png',
  'pwa-192x192.png',
  'pwa-512x512.png',
  'manifest.webmanifest',
]) {
  if (!worker.includes(`\"${datei}\"`)) {
    throw new Error(`${datei} fehlt im PWA-Precache`)
  }
}
if (!worker.includes('SKIP_WAITING')) {
  throw new Error('Service Worker besitzt keinen ausdruecklichen Update-Pfad')
}
if (/\.clientsClaim\(\)/.test(worker)) {
  throw new Error('Service Worker wuerde neue Fassungen automatisch uebernehmen')
}
if (!/importScripts\(["']push-sw\.js["']\)/.test(worker)) {
  throw new Error('push-sw.js wird nicht relativ zum PWA-Scope geladen')
}

const html = await readFile(new URL('index.html', dist), 'utf8')
const referenzen = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((treffer) => treffer[1])
  .filter((pfad) => !pfad.startsWith('http') && !pfad.startsWith('data:'))

for (const referenz of referenzen) {
  if (!referenz.startsWith(erwartet)) {
    throw new Error(`index.html referenziert ${referenz} ausserhalb von ${erwartet}`)
  }
  const relativ = referenz.slice(erwartet.length)
  await access(new URL(relativ, dist))
}

if (process.env.CHECK_NO_SERVER === '1') {
  for (const ordner of ['server/', '.openai/']) {
    try {
      await access(new URL(ordner, dist))
      throw new Error(`Pages-Artefakt enthaelt unerwartet dist/${ordner.slice(0, -1)}`)
    } catch (ursache) {
      if (ursache instanceof Error && ursache.message.includes('unerwartet')) throw ursache
    }
  }
}

const assetsOrdner = new URL('assets/', dist)
const jsDateien = (await readdir(assetsOrdner)).filter((name) => name.endsWith('.js'))
const initialeJsPfade = new Set(
  referenzen
    .map((referenz) => referenz.slice(erwartet.length))
    .filter((referenz) => referenz.startsWith('assets/') && referenz.endsWith('.js'))
)
let jsRoh = 0
let jsGzip = 0
let initialRoh = 0
let initialGzip = 0
for (const name of jsDateien) {
  const bytes = await readFile(new URL(name, assetsOrdner))
  const gzip = gzipSync(bytes, { level: 9 }).byteLength
  jsRoh += bytes.byteLength
  jsGzip += gzip
  if (initialeJsPfade.has(`assets/${name}`)) {
    initialRoh += bytes.byteLength
    initialGzip += gzip
  }
}

// Ein Split ist nur dann ein Gewinn, wenn der Browser zum Start tatsaechlich
// weniger laden muss. Deshalb wird der HTML-Einstieg strenger begrenzt als die
// Summe aller spaeter bedarfsweise geladenen Tabs.
// Versionierte gemeinsame Wette, atomarer Mehrfach-Undo und die fail-closed-
// Pruefung vorhandener lokaler Daten erweitern den Startpfad messbar. Die
// Budgets lassen dafuer gut ein KiB kontrollierten Spielraum; ein groesserer
// Zuwachs bleibt weiterhin ein harter Buildfehler.
// Drei einzeln bestaetigt speicherbare Reminder-Schalter kommen als Lazy-Chunk
// hinzu. Gemessener Pages-Stand: 233514 Byte initial, rund 237000 Byte gesamt.
// Initial nur 128 Byte zusaetzlicher Spielraum, insgesamt ein KiB fuer die
// neue Funktion. Beide Grenzen bleiben verbindlich; keine Budgetabschaltung.
// ENI ist eine eigene Oberflaeche hinter React.lazy. Vom Startpfad bleiben nur
// die Tuer im Kopf (Zeichen plus Knopf) und die Hash-Route uebrig, zusammen gut
// ein halbes KiB (gemessen 598 Byte gzip); die Ansicht selbst, ihr Verlauf, der
// Dialog und der Aufruf der Modell-Function liegen im Lazy-Chunk und zaehlen
// nur gegen die Gesamtsumme. Beide Grenzen behalten rund ein KiB Spielraum und
// bleiben verbindlich; keine Budgetabschaltung.
// Anhaenge, Diktat und ENIs Stimme kommen dazu: Bild zuschneiden, Datei lesen,
// Hochladen, der Streifen ueber dem Eingabefeld, die Darstellung im Verlauf,
// die Spracherkennung des Browsers, seine Sprachausgabe als Rueckfall und der
// Weg zur neuronalen Stimme hinter der zweiten Edge Function, dazu fuenf
// weitere Icons. Das sind rund 10 KiB gzip, und sie liegen restlos im
// ENI-Chunk: der Startpfad hat sich dabei nicht um ein Byte bewegt (gemessen
// 235722 Byte initial, 257596 Byte gesamt). Deshalb steigt hier nur die
// Gesamtsumme, und die strengere der beiden Grenzen bleibt stehen, wo sie
// stand. Beide bleiben verbindlich; keine Budgetabschaltung.
const INITIAL_GZIP_BUDGET = 231 * 1024
const GESAMT_GZIP_BUDGET = 253 * 1024
if (initialGzip > INITIAL_GZIP_BUDGET) {
  throw new Error(
    `Initiales JavaScript-Budget ueberschritten: ${initialGzip} > ${INITIAL_GZIP_BUDGET} Byte gzip`
  )
}
if (jsGzip > GESAMT_GZIP_BUDGET) {
  throw new Error(
    `Gesamtes JavaScript-Budget ueberschritten: ${jsGzip} > ${GESAMT_GZIP_BUDGET} Byte gzip`
  )
}

const gesamt = await groesse(new URL('.', dist))
console.log(
  `Web-Artefakt geprueft: initial ${initialRoh} Byte roh / ${initialGzip} Byte gzip; ` +
    `${jsDateien.length} JS-Datei(en) insgesamt ${jsRoh} Byte roh / ${jsGzip} Byte gzip; ` +
    `${gesamt} Byte Artefakt.`
)

async function groesse(url) {
  const eintraege = await readdir(url, { withFileTypes: true })
  let summe = 0
  for (const eintrag of eintraege) {
    if (eintrag.name === 'server' || eintrag.name === '.openai') continue
    const ziel = new URL(`${eintrag.name}${eintrag.isDirectory() ? '/' : ''}`, url)
    summe += eintrag.isDirectory() ? await groesse(ziel) : (await stat(ziel)).size
  }
  return summe
}
