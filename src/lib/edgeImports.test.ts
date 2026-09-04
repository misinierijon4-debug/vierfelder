import { describe, expect, it } from 'vitest'

const edgeDateien = import.meta.glob('../../supabase/functions/**/*.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

describe('edge-function-abhaengigkeiten', () => {
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
