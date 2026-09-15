/**
 * Der Wegweiser fuer Agenten liegt dreimal im wurzelverzeichnis, weil jedes
 * werkzeug einen anderen namen sucht: Claude Code `CLAUDE.md`, Codex
 * `AGENTS.md`, Gemini CLI `GEMINI.md`.
 *
 * Symlinks waeren die offensichtliche loesung und sind genau die falsche: git
 * checkt sie unter Windows ohne `core.symlinks` als textdatei mit dem
 * zielpfad aus. Das werkzeug liest dann neun bytes, meldet keinen fehler und
 * arbeitet ohne wegweiser weiter. Also echte kopien — und dieses skript, damit
 * sie nicht auseinanderlaufen.
 *
 * `--schreiben` zieht die kopien aus CLAUDE.md nach, ohne flag wird nur
 * geprueft.
 */
import { readFile, writeFile } from 'node:fs/promises'

const QUELLE = 'CLAUDE.md'
const KOPIEN = ['AGENTS.md', 'GEMINI.md']

const wurzel = new URL('../', import.meta.url)
const schreiben = process.argv.includes('--schreiben')

const quelle = await readFile(new URL(QUELLE, wurzel), 'utf8')
const abweichend = []

for (const name of KOPIEN) {
  const ziel = new URL(name, wurzel)
  if (schreiben) {
    await writeFile(ziel, quelle)
    continue
  }
  const inhalt = await readFile(ziel, 'utf8').catch(() => null)
  if (inhalt === null) abweichend.push(`${name} fehlt`)
  else if (inhalt !== quelle) abweichend.push(`${name} weicht von ${QUELLE} ab`)
}

if (schreiben) {
  console.log(`${QUELLE} nach ${KOPIEN.join(' und ')} uebernommen`)
} else if (abweichend.length > 0) {
  throw new Error(
    `${abweichend.join('; ')}. ${QUELLE} ist das original: dort aendern, ` +
      `danach \`npm run sync:agentendoku\`.`,
  )
} else {
  console.log(`${QUELLE}, ${KOPIEN.join(' und ')} sind gleich`)
}
