import { describe, expect, it } from 'vitest'

const edgeDateien = import.meta.glob('../../supabase/functions/**/*.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

describe('edge-function-abhaengigkeiten', () => {
  it('holt das modell ohne sdk und nur von der einen festen adresse', () => {
    const quellen = Object.entries(edgeDateien)
    const sdkImporte = quellen.flatMap(([datei, inhalt]) =>
      [...inhalt.matchAll(/npm:(@anthropic-ai\/sdk|openai)[@'"]/g)].map(() => datei)
    )
    // ein SDK waere ein halber node-unterbau in einer deno-function, fuer
    // einen einzigen POST mit JSON hin und JSON zurueck.
    expect(sdkImporte).toEqual([])

    /**
     * Jede Adresse, die eine Function nach draussen anspricht, steht hier
     * namentlich. Absichtlich nicht nur die eine, an der ENI gerade haengt:
     * die Liste ist die Stelle, an der auffaellt, wenn eine Function anfaengt,
     * irgendwo anders hinzutelefonieren.
     */
    // als Menge: dieselbe Adresse darf mehrfach dastehen, sobald zwei Zeilen
    // der Anbietertabelle auf dieselbe Gegenstelle zeigen. Die Frage hier ist
    // nicht, wie oft telefoniert wird, sondern wohin.
    const adressen = [
      ...new Set(
        quellen.flatMap(([, inhalt]) =>
          [...inhalt.matchAll(/https:\/\/[^'"\s`]+/g)].map((f) => f[0])
        )
      ),
    ].sort()
    expect(adressen).toEqual([
      'https://api.deepseek.com/chat/completions',
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent',
      'https://openrouter.ai/api/v1/chat/completions',
    ])

    // der schluessel gehoert in eine kopfzeile, nie in die adresse: eine URL
    // landet in protokollen, in fehlermeldungen und in weiterleitungen.
    for (const adresse of adressen) expect(adresse).not.toContain('key=')
  })

  it('pinnt supabase-js exakt auf die installierte fassung', () => {
    const erwarteteVersion = '2.112.4'
    const funde = Object.entries(edgeDateien).flatMap(([datei, inhalt]) => {
      return [...inhalt.matchAll(/npm:@supabase\/supabase-js@([^'"\s]+)/g)].map((fund) => ({
        datei,
        version: fund[1],
      }))
    })

    expect(funde.length).toBeGreaterThan(0)
    expect(funde.filter((fund) => fund.version !== erwarteteVersion)).toEqual([])
  })
})
