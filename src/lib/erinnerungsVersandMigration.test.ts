import { describe, expect, it } from 'vitest'

const migrationen = import.meta.glob(
  '../../supabase/migrations/*_erinnerungsversand_zustandsmaschine.sql',
  { eager: true, query: '?raw', import: 'default' }
) as Record<string, string>
const sql = Object.values(migrationen)[0] ?? ''

function funktion(name: string): string {
  return (
    sql.match(
      new RegExp(
        `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
        'i'
      )
    )?.[0] ?? ''
  )
}

describe('erinnerungsversand-zustandsmaschine', () => {
  it('liegt genau einmal als forward-migration vor', () => {
    expect(Object.keys(migrationen)).toHaveLength(1)
  })

  it('bildet bestaetigten und mehrdeutigen altbestand ohne erneuten versand ab', () => {
    expect(sql).toMatch(
      /zustand = case when gesendet is not null then 'gesendet' else 'unbestaetigt' end/i
    )
    expect(sql).toMatch(
      /fehlerart = case when gesendet is null then 'legacy_unbestaetigt' else null end/i
    )
    expect(sql).toMatch(
      /aktualisiert = case when gesendet is not null then gesendet else reserviert end/i
    )
    expect(sql).not.toMatch(/pg_catalog\.coalesce/i)
    expect(sql).not.toMatch(/delete from public\.erinnerungs_versand/i)
  })

  it('erzwingt explizite und widerspruchsfreie zustaende', () => {
    for (const zustand of [
      'bereit',
      'sendet',
      'wiederholen',
      'gesendet',
      'fehlgeschlagen',
      'unbestaetigt',
    ]) {
      expect(sql).toContain(`'${zustand}'`)
    }
    expect(sql).toMatch(/check \(versuche between 1 and 4\)/i)
    expect(sql).toMatch(/zustand in \('bereit', 'sendet'\)[\s\S]*lease_token is not null/i)
    expect(sql).toMatch(/check \(\(zustand = 'gesendet'\) = \(gesendet is not null\)\)/i)
    expect(sql).toMatch(
      /check \(\(zustand = 'wiederholen'\) = \(naechster_versuch is not null\)\)/i
    )
  })

  it('nutzt invoker-rpcs mit leerem suchpfad und nur service-role-execute', () => {
    const namen = [
      'reserviere_erinnerungsversand',
      'starte_erinnerungsversand',
      'bestaetige_erinnerungsversand',
      'melde_erinnerungsversand_fehler',
    ]
    for (const name of namen) {
      const block = funktion(name)
      expect(block, `${name} fehlt`).not.toBe('')
      expect(block).toMatch(/security invoker\s+set search_path = ''/i)
      expect(block).not.toMatch(/security definer/i)
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated;`,
          'i'
        )
      )
      expect(sql).toMatch(
        new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role;`, 'i')
      )
    }
    expect(sql).not.toMatch(/grant execute[\s\S]*to (anon|authenticated)/i)
  })

  it('beansprucht atomar mit fencing-token, lease und begrenzten versuchen', () => {
    const claim = funktion('reserviere_erinnerungsversand')
    expect(claim).toMatch(/on conflict \(user_id, art, tag\) do update/i)
    expect(claim).toContain("interval '2 minutes'")
    expect(claim).toMatch(/v\.lease_token = p_lease_token/i)
    expect(claim).toMatch(/v\.versuche < 4/i)
    expect(claim).toMatch(/v\.zustand = 'bereit'[\s\S]*v\.lease_bis <= v_jetzt/i)
    expect(claim).toMatch(
      /v\.zustand = 'wiederholen'[\s\S]*v\.naechster_versuch <= v_jetzt/i
    )
    expect(claim).toMatch(/get diagnostics v_geaendert = row_count;[\s\S]*return v_geaendert = 1/i)
  })

  it('archiviert abgelaufenes sendet als unbestaetigt statt es zu reclaimen', () => {
    const claim = funktion('reserviere_erinnerungsversand')
    expect(claim).toMatch(
      /set[\s\S]*zustand = 'unbestaetigt'[\s\S]*fehlerart = 'prozess_unbestaetigt'[\s\S]*where v\.zustand = 'sendet'[\s\S]*v\.lease_bis <= v_jetzt/i
    )
    const konflikt = claim.slice(claim.indexOf('on conflict'))
    expect(konflikt).not.toMatch(/v\.zustand = 'sendet'/i)
  })

  it('bestaetigt jeden zustandswechsel ueber token und exakt eine zeile', () => {
    for (const name of [
      'starte_erinnerungsversand',
      'bestaetige_erinnerungsversand',
      'melde_erinnerungsversand_fehler',
    ]) {
      const block = funktion(name)
      expect(block).toMatch(/v\.lease_token = p_lease_token/i)
      expect(block).toMatch(/get diagnostics v_geaendert = row_count/i)
      expect(block).toMatch(/return v_geaendert = 1/i)
    }
  })

  it('setzt nur sichere fehler auf retry und stoppt nach vier versuchen', () => {
    const fehler = funktion('melde_erinnerungsversand_fehler')
    expect(fehler).toMatch(
      /p_ausgang is null[\s\S]*or p_ausgang not in \('wiederholen', 'fehlgeschlagen', 'unbestaetigt'\)/i
    )
    expect(fehler).toMatch(
      /p_ausgang = 'wiederholen' and v\.versuche < 4 then 'wiederholen'/i
    )
    expect(fehler).toContain("v_jetzt + interval '5 minutes'")
    expect(fehler).toMatch(/when p_ausgang = 'wiederholen' then 'versuchslimit'/i)
    expect(fehler).toMatch(
      /when p_ausgang = 'unbestaetigt' then 'netzwerk_unbestaetigt'/i
    )
  })

  it('persistiert weder endpoints noch freie providerantworten', () => {
    expect(sql).not.toMatch(/add column (endpoint|provider|fehlertext|antwort)/i)
    expect(sql).not.toMatch(/jsonb|response_body|response_text/i)
  })
})
