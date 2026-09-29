import { describe, expect, it } from 'vitest'

const migrationen = import.meta.glob(
  '../../supabase/migrations/*_schlaf_nacht_nicht_kuerzen.sql',
  { eager: true, query: '?raw', import: 'default' }
) as Record<string, string>

const sql = Object.values(migrationen)[0] ?? ''

const verzeihend = import.meta.glob(
  '../../supabase/migrations/*_schlaf_segmente_verzeihend.sql',
  { eager: true, query: '?raw', import: 'default' }
) as Record<string, string>

const vorher = Object.values(verzeihend)[0] ?? ''

function wrapper(text: string): string {
  return text.match(/create or replace function public\.record_sleep_night\([\s\S]*?\n\$\$;/i)?.[0] ?? ''
}

describe('schlafimport schneidet eine gespeicherte nacht nicht mehr ab', () => {
  it('liegt genau einmal als forward-fix-migration vor', () => {
    expect(Object.keys(migrationen)).toHaveLength(1)
  })

  it('behaelt nur alte segmente, die vor dem neuen fenster beginnen', () => {
    expect(sql).toMatch(/create or replace function public\._slfn_frueheren_teil_behalten\(/i)
    expect(sql).toMatch(/where n\.user_id = p_user and n\.nacht = p_nacht/i)
    expect(sql).toMatch(/and a\.st < neu\.beginn/i)
  })

  it('schneidet ein altes segment ueber die fenstergrenze genau am fensterbeginn ab', () => {
    // sonst zaehlt die zeit ab fensterbeginn doppelt: einmal alt, einmal neu
    expect(sql).toMatch(
      /case when a\.en > neu\.beginn then a\.s \|\| jsonb_build_object\('end', neu\.roh\) else a\.s end/i
    )
  })

  it('setzt den frueheren teil vor die neue nutzlast und laesst sie sonst unveraendert', () => {
    expect(sql).toMatch(/select coalesce\(\(select segs from frueher\), '\[\]'::jsonb\) \|\| p_segs/i)
  })

  it('waehlt dieselbe nacht wie record_sleep_night_internal', () => {
    const body = wrapper(sql)
    expect(body).toMatch(/v_nacht := public\._slfn_parse_date\(p_night_date\);/i)
    expect(body).toMatch(
      /select \(k\.aufwachzeit at time zone 'Europe\/Berlin'\)::date into v_nacht\s+from public\._slfn_nacht_kennzahlen\(v_segs\) k;/i
    )
  })

  it('ergaenzt erst nach token, grenzen und rate-limit', () => {
    const body = wrapper(sql)
    const rate = body.search(/if v_anfragen > 30 then/i)
    const ergaenzen = body.search(/_slfn_frueheren_teil_behalten\(v_user, v_nacht, v_segs\)/i)
    const aufruf = body.search(/return public\.record_sleep_night_internal\(/i)
    expect(rate).toBeGreaterThan(-1)
    expect(ergaenzen).toBeGreaterThan(rate)
    expect(aufruf).toBeGreaterThan(ergaenzen)
  })

  it('laesst den wrapper bis zum rate-limit wort fuer wort wie zuvor', () => {
    const bisRate = (text: string) => {
      const body = wrapper(text)
      const beginn = body.search(/v_token := btrim/i)
      const ende = body.search(/if v_anfragen > 30 then[\s\S]*?end if;/i)
      return body.slice(beginn, ende)
    }
    expect(bisRate(sql).length).toBeGreaterThan(500)
    expect(bisRate(sql)).toBe(bisRate(vorher))
  })

  it('laesst record_sleep_night_internal unangetastet', () => {
    expect(sql).not.toMatch(/create or replace function public\.record_sleep_night_internal/i)
  })

  it('haelt helfer und wrapper aus den clientrollen heraus', () => {
    expect(sql).toMatch(
      /revoke all on function public\._slfn_frueheren_teil_behalten\(uuid, date, jsonb\)\s+from public, anon, authenticated/i
    )
    expect(sql).toMatch(/\) from public, authenticated;\s+grant execute[\s\S]*\) to anon, service_role;/i)
  })
})
