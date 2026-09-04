import { access, readFile, readdir, stat } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const dist = new URL('../dist/', import.meta.url)
const erforderlich = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'push-sw.js',
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
  try {
    await access(new URL('server/', dist))
    throw new Error('Pages-Artefakt enthaelt unerwartet dist/server')
  } catch (ursache) {
    if (ursache instanceof Error && ursache.message.includes('unerwartet')) throw ursache
  }
}

const assetsOrdner = new URL('assets/', dist)
const jsDateien = (await readdir(assetsOrdner)).filter((name) => name.endsWith('.js'))
let jsRoh = 0
let jsGzip = 0
for (const name of jsDateien) {
  const bytes = await readFile(new URL(name, assetsOrdner))
  jsRoh += bytes.byteLength
  jsGzip += gzipSync(bytes, { level: 9 }).byteLength
}

const GZIP_BUDGET = 230 * 1024
if (jsGzip > GZIP_BUDGET) {
  throw new Error(`JavaScript-Budget ueberschritten: ${jsGzip} > ${GZIP_BUDGET} Byte gzip`)
}

const gesamt = await groesse(new URL('.', dist))
console.log(
  `Web-Artefakt geprueft: ${jsDateien.length} JS-Datei(en), ` +
    `${jsRoh} Byte roh / ${jsGzip} Byte gzip, ${gesamt} Byte gesamt.`
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
