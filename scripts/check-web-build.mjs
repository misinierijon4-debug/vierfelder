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
  'eni.html',
  'eni.webmanifest',
  'eni-favicon-32x32.png',
  'eni-apple-touch-icon.png',
  'eni-192x192.png',
  'eni-512x512.png',
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

// ENIs eigener einstieg fuer das zweite homescreen-symbol. die adressen im
// manifest sind relativ und werden gegen seinen ort aufgeloest wie im browser.
const eniManifestUrl = new URL(`${erwartet}eni.webmanifest`, 'https://pages.invalid')
const eniManifest = JSON.parse(await readFile(new URL('eni.webmanifest', dist), 'utf8'))
const eniAdresse = (wert, basis = eniManifestUrl) => new URL(wert, basis).pathname
const eniStart = new URL(eniManifest.start_url, eniManifestUrl)
if (eniAdresse(eniManifest.scope) !== erwartet) {
  throw new Error(`eni.webmanifest.scope zeigt nicht auf ${erwartet}`)
}
if (eniStart.pathname !== `${erwartet}eni.html`) {
  throw new Error(`eni.webmanifest.start_url zeigt nicht auf ${erwartet}eni.html`)
}
if (eniAdresse(eniManifest.id, eniStart) === erwartet) {
  throw new Error('eni.webmanifest hat dieselbe id wie die hauptapp')
}
for (const icon of [
  { datei: 'eni-192x192.png', groesse: '192x192', purpose: 'any' },
  { datei: 'eni-512x512.png', groesse: '512x512', purpose: 'any maskable' },
]) {
  const eintrag = eniManifest.icons?.find((wert) => eniAdresse(wert.src) === `${erwartet}${icon.datei}`)
  if (
    !eintrag ||
    eintrag.sizes !== icon.groesse ||
    eintrag.type !== 'image/png' ||
    eintrag.purpose !== icon.purpose
  ) {
    throw new Error(`eni.webmanifest enthaelt kein gueltiges ${icon.groesse}-icon`)
  }
}

for (const [datei, breite, hoehe] of [
  ['favicon-32x32.png', 32, 32],
  ['apple-touch-icon.png', 180, 180],
  ['pwa-192x192.png', 192, 192],
  ['pwa-512x512.png', 512, 512],
  ['eni-favicon-32x32.png', 32, 32],
  ['eni-apple-touch-icon.png', 180, 180],
  ['eni-192x192.png', 192, 192],
  ['eni-512x512.png', 512, 512],
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
  'eni.html',
  'eni.webmanifest',
  'eni-favicon-32x32.png',
  'eni-apple-touch-icon.png',
  'eni-192x192.png',
  'eni-512x512.png',
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
const eniHtml = await readFile(new URL('eni.html', dist), 'utf8')
const referenzenIn = (inhalt) =>
  [...inhalt.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((treffer) => treffer[1])
    .filter((pfad) => !pfad.startsWith('http') && !pfad.startsWith('data:'))
const referenzen = referenzenIn(html)
const eniReferenzen = referenzenIn(eniHtml)

for (const [seite, liste] of [['index.html', referenzen], ['eni.html', eniReferenzen]]) {
  for (const referenz of liste) {
    if (!referenz.startsWith(erwartet)) {
      throw new Error(`${seite} referenziert ${referenz} ausserhalb von ${erwartet}`)
    }
    const relativ = referenz.slice(erwartet.length)
    await access(new URL(relativ, dist))
  }
}

// eni.html ist index.html mit anderem gesicht: dasselbe javascript, aber ein
// eigenes manifest (genau eines — das der hauptapp haengt das PWA-plugin an),
// eigenes symbol und der sprung auf die ENI-route.
const manifestLinks = [...eniHtml.matchAll(/<link rel="manifest" href="([^"]+)"/g)].map((t) => t[1])
if (manifestLinks.length !== 1 || manifestLinks[0] !== `${erwartet}eni.webmanifest`) {
  throw new Error(`eni.html verweist nicht genau auf ${erwartet}eni.webmanifest: ${manifestLinks.join(', ')}`)
}
if (!eniHtml.includes(`rel="apple-touch-icon" sizes="180x180" href="${erwartet}eni-apple-touch-icon.png"`)) {
  throw new Error('eni.html traegt nicht ENIs homescreen-symbol')
}
if (!eniHtml.includes('name="apple-mobile-web-app-title" content="ENI"')) {
  throw new Error('eni.html traegt nicht den homescreen-titel ENI')
}
if (!eniHtml.includes("history.replaceState(null,'','#/eni')")) {
  throw new Error('eni.html springt nicht auf die ENI-route')
}
const skripte = (liste) => liste.filter((pfad) => pfad.endsWith('.js') || pfad.endsWith('.css')).join('\n')
if (skripte(eniReferenzen) !== skripte(referenzen)) {
  throw new Error('eni.html laedt nicht dasselbe javascript wie index.html')
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
// ENI-Gedaechtnis und Streaming kommen dazu: persoenliche Erinnerungen,
// Wissensdialog, Aufgabenverwaltung, Audio-Streaming-Warteschlange fuer PCM
// und Text-Streaming liegen restlos im ENI-Lazy-Chunk. Der initiale Startpfad
// bleibt unveraendert; die Gesamtsumme erhaelt dafuer 5 KiB kontrollierten Spielraum.
// ENI-Wochenrueckblick und Einladungskarte kommen dazu: dauerhafte
// Einladungskarte, Schliessen-RPC, gebundener Wochenchat und die erweiterte
// Aktivitaetssteuerung. Die Gesamtsumme erhaelt kontrolliert 4 KiB Spielraum;
// der initiale Einstiegspfad traegt zusaetzlich den iOS-Viewport-Schutz.
// ENIs Websuche kommt dazu: der Internet-Schalter ueber der Eingabe, der
// Recherchehinweis, die Weitergabe des Flags an die Function und die gepruefte
// Linkdarstellung im Verlauf. Alles davon liegt im ENI-Lazy-Chunk; der
// Startpfad hat sich dabei nicht bewegt (gemessen 236807 Byte initial vorher,
// 236806 danach; Gesamtsumme 269996 auf 270446 Byte). Deshalb steigt nur die
// Gesamtsumme um ein KiB, und die strengere initiale Grenze bleibt stehen, wo
// sie stand. Beide bleiben verbindlich; keine Budgetabschaltung.
// ENIs Moduswechsel und die weitergereichte, bereits freigegebene Mikrofonspur
// liegen ebenfalls restlos im ENI-Lazy-Chunk. Gemessener Pages-Stand: 272142
// Byte gesamt. Die Gesamtsumme erhaelt dafuer 2 KiB kontrollierten Spielraum;
// die initiale Grenze bleibt unveraendert und beide Pruefungen bleiben hart.
// Kopieren und das atomare Bearbeiten eigener ENI-Nachrichten erweitern vor
// allem den ENI-Lazy-Chunk. Gemessener Pages-Stand: 237697 Byte initial und
// 274125 Byte gesamt. Fuer den Pages-Einstieg kommt ein KiB, fuer die neue
// Funktion insgesamt drei KiB kontrollierter Spielraum dazu; beide Grenzen
// bleiben harte Buildfehler.
// Native Diagramme (Saeulen und Balken) fuer ENI erweitern restlos den
// ENI-Lazy-Chunk. Gemessener Pages-Stand: 237731 Byte initial und 277643 Byte
// gesamt. Die Gesamtsumme erhaelt dafuer 2 KiB kontrollierten Spielraum; die
// initiale Grenze bleibt unveraendert und beide Pruefungen bleiben harte Buildfehler.
// Das Rivalitaets-Badge im Duell-Ticker kommt dazu: die semantische Zuordnung
// eines Ticker-Eintrags ueber classifier.dev, die Freitext-Zuordnung und die
// situativen Rivalitaetssaetze. Der Ticker steht auf dem ersten Bildschirm,
// die Zuordnung laeuft aber erst nach dem ersten Bild. Deshalb liegt in
// duellBadge.ts nur, was sofort sichtbar ist — die Worte des Badges und das
// heuristische Urteil —, und duellKlassifizierung.ts wird im Effekt
// nachgeladen; das haelt rund 1,4 KiB Anweisungstexte und HTTP-Teil aus dem
// Einstiegspfad heraus. Gemessener Pages-Stand: 238461 Byte initial und 279911
// Byte gesamt. Der Einstieg traegt die sichtbaren Reste des Badges und erhaelt
// dafuer ein KiB, die Gesamtsumme zwei KiB kontrollierten Spielraum. Beide
// Pruefungen bleiben harte Buildfehler; keine Budgetabschaltung.
// Wochenbericht: Kalenderzeichen und Wochenauswahl erweitern den Einstieg;
// Blatt, Diagramme, Archivzugriff und Textpruefung bleiben im Lazy-Chunk.
// Lokal gemessen: 241694 Byte initial, 292168 Byte gesamt (gzip).
// Der Pages-Build mit dem oeffentlichen Supabase-Schluessel liegt knapp
// darueber; dafuer stehen jetzt 14 KiB kontrollierter Spielraum zur Verfuegung.
// Beide Grenzen bleiben harte Buildfehler.
// Ansagen: Punkte der Ansagen in Wochenstand, Rechner und Bilanz, der
// Hinweis im Tracker und beide Datenmodi rechnen schon beim Start mit. Der
// Bereich im Duell-Tab mit Vorschlaegen, ENI-Spruechen und ihrer Pruefung
// liegt hinter React.lazy. Gemessener Pages-Stand vorher 242612 Byte initial
// und 294236 gesamt, nachher 247734 und 302398 Byte (gzip). Dafuer je gut ein
// KiB Spielraum; beide Grenzen bleiben harte Buildfehler.
// ENI anpassen (Ton, Laenge, eigene Anweisungen, Rollen mit Vorschau) und das
// neu geordnete Gedaechtnis liegen restlos im ENI-Lazy-Chunk. Gemessen im
// Pages-Build (mit Supabase-Schluessel, nicht im Prototyp-Build — der ist um
// den Supabase-Chunk kleiner und hatte den Ueberlauf verdeckt): vorher 242849
// Byte initial und 303295 gesamt, nachher initial praktisch gleich (index +3
// Byte) und 314273 gesamt; der ENI-Chunk waechst von 32775 auf 43810 Byte.
// Die Gesamtsumme erhaelt dafuer 11 KiB, die initiale Grenze bleibt, wo sie
// stand. Beide Pruefungen bleiben harte Buildfehler; keine Budgetabschaltung.
const INITIAL_GZIP_BUDGET = 243 * 1024
// Rollenwahl am Chat bleibt im ENI-Lazy-Chunk: Pages vorher 314226 Byte,
// nachher 315560 Byte gzip gesamt. Ein KiB zusaetzlicher Spielraum fuer das
// Popup; die initiale Grenze und beide harten Budgetpruefungen bleiben bestehen.
// Formeln und Tabellen in ENIs Antworten: ein eigener kleiner Uebersetzer von
// LaTeX nach MathML (src/lib/eniFormel.ts) statt KaTeX, das rund 75 KiB gzip
// plus Schriften gekostet haette; gesetzt wird mit der Mathematik des Browsers.
// Alles liegt im ENI-Lazy-Chunk. Gemessener Pages-Stand: vorher 315451 Byte
// gzip gesamt, nachher 319600; initial unveraendert 242785. Die Gesamtsumme
// erhaelt dafuer 4 KiB, die initiale Grenze bleibt; beide bleiben harte
// Buildfehler, keine Budgetabschaltung.
// ENI schlaegt Eintraege vor (Einheit, Gewicht, Ansage), die Person bestaetigt
// auf einer Karte: Pruefung, feste ids und Karte liegen im ENI-Lazy-Chunk, der
// Startpfad traegt nur die Weitergabe des Backends (+7 Byte, 242792).
// Gesamt vorher 319600, nachher 321334 Byte gzip. Dafuer 2 KiB kontrollierter
// Spielraum; beide Grenzen bleiben harte Buildfehler.
// Formeln wie im Unterricht: Binomialkoeffizienten, Matrizen und Vektoren,
// Fallunterscheidungen, `aligned`, und Fettdruck, der eine Formel enthaelt.
// Alles im ENI-Lazy-Chunk. Gesamt vorher 321960, nachher 322968 Byte gzip;
// initial roh gleich, gzip 242811 statt 242809 (nur Chunk-Namen). Dafuer 2 KiB
// kontrollierter Spielraum; beide Grenzen bleiben harte Buildfehler.
// Rollen recherchieren: Knopf, Fortschritt und Akte in „ENI anpassen“ liegen
// im ENI-Lazy-Chunk; die Recherche selbst laeuft auf dem Server, ihre Prompts
// kommen nicht ins Bundle. Gesamt vorher 322968, nachher 325932 Byte gzip;
// initial roh gleich (838541 Byte).
// Dafuer 3 KiB kontrollierter Spielraum; beide Grenzen bleiben harte
// Buildfehler.
// Klausurplan im Tab „abi“: Countdown, Liste, fehlende Note, Laden der
// Tabelle `klausuren` und die Adresse `#/abi`. Gesamt vorher 326435, nachher
// 328037 Byte gzip; initial 242815 auf 244327 (der Tab liegt im Startpfad,
// innerhalb der initialen Grenze). Dafuer 2 KiB kontrollierter
// Spielraum; beide Grenzen bleiben harte Buildfehler.
const GESAMT_GZIP_BUDGET = 322 * 1024
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
