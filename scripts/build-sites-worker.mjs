import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projekt = fileURLToPath(new URL('..', import.meta.url))
const dist = join(projekt, 'dist')
const server = join(dist, 'server')

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2',
}

async function dateienIn(ordner) {
  const eintraege = await readdir(ordner, { withFileTypes: true })
  const dateien = []
  for (const eintrag of eintraege) {
    if (ordner === dist && (eintrag.name === 'server' || eintrag.name === '.openai')) continue
    const pfad = join(ordner, eintrag.name)
    if (eintrag.isDirectory()) dateien.push(...await dateienIn(pfad))
    else dateien.push(pfad)
  }
  return dateien
}

const dateiMap = {}
for (const pfad of await dateienIn(dist)) {
  const webPfad = '/' + relative(dist, pfad).split(sep).join('/')
  dateiMap[webPfad] = {
    body: (await readFile(pfad)).toString('base64'),
    type: mimeTypes[extname(pfad)] ?? 'application/octet-stream',
  }
}

const worker = `const DATEIEN = ${JSON.stringify(dateiMap)}

function dekodiere(base64) {
  const text = atob(base64)
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i)
  return bytes
}

export default {
  fetch(request) {
    const url = new URL(request.url)
    let pfad
    try {
      pfad = decodeURIComponent(url.pathname)
    } catch {
      return new Response('Bad request', { status: 400 })
    }

    const direkt = DATEIEN[pfad === '/' ? '/index.html' : pfad]
    const istNavigation = request.headers.get('accept')?.includes('text/html')
    const datei = direkt ?? (istNavigation ? DATEIEN['/index.html'] : null)
    if (!datei) return new Response('Not found', { status: 404 })

    const istHtml = datei.type.startsWith('text/html')
    const istUpdateDatei = ['/sw.js', '/push-sw.js', '/manifest.webmanifest'].includes(pfad)
    const dateiname = pfad.split('/').pop() ?? ''
    const punkt = dateiname.lastIndexOf('.')
    const strich = dateiname.lastIndexOf('-', punkt)
    const hash = dateiname.slice(strich + 1, punkt)
    const istGehasht =
      pfad.startsWith('/assets/') && strich >= 0 && /^[A-Za-z0-9_-]{8,}$/.test(hash)
    const cache = istHtml || istUpdateDatei
      ? 'no-store'
      : istGehasht
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=86400'
    return new Response(request.method === 'HEAD' ? null : dekodiere(datei.body), {
      headers: {
        'content-type': datei.type,
        'cache-control': cache,
        'x-content-type-options': 'nosniff',
      },
    })
  },
}
`

await mkdir(server, { recursive: true })
await writeFile(join(server, 'index.js'), worker)
