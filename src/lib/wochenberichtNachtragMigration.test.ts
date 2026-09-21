import { describe, expect, it } from 'vitest'

const migrationen = import.meta.glob(
  '../../supabase/migrations/*_wochenbericht_nachtrag_push_und_persoenliche_texte.sql',
  { eager: true, query: '?raw', import: 'default' }
) as Record<string, string>
const sql = Object.values(migrationen)[0] ?? ''

function funktion(name: string): string {
  return sql.match(new RegExp(`function (?:private|public)\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, 'i'))?.[0] ?? ''
}

describe('der montag laeuft der letzten nacht hinterher', () => {
  it('liegt genau einmal als forward-migration vor', () => {
    expect(Object.keys(migrationen)).toHaveLength(1)
  })

  it('traegt nur fehlende naechte nach und ersetzt keine vorhandene', () => {
    const nachtrag = funktion('ergaenze_wochenbericht_naechte')
    expect(nachtrag).toMatch(/not exists \(\s*select 1 from jsonb_array_elements/i)
    expect(nachtrag).toMatch(/alt->>'user' = p\.person and alt->>'nacht' = n\.nacht::text/i)
    // Angehaengt, nie ueberschrieben: der eingefrorene Stand bleibt stehen.
    expect(nachtrag).toMatch(/jsonb_set\(v_daten, '\{naechte\}', coalesce\(v_daten->'naechte', '\[\]'::jsonb\) \|\| v_neu\)/i)
    expect(nachtrag).toMatch(/for update/i)
  })

  it('erklaert die woche erst mit beiden sonntagnaechten fuer fertig, spaetestens um 20 uhr', () => {
    const job = funktion('wochenbericht_nachtrag')
    expect(job).toMatch(/if extract\(isodow from v_lokal\) <> 1 then return; end if;/i)
    expect(job).toMatch(/v_woche := v_lokal::date - 7;/i)
    expect(job).toMatch(/- interval '15 hours'\)::date = v_woche \+ 6/i)
    expect(job).toMatch(/if v_offen = 0 or extract\(hour from v_lokal\) >= 20 then/i)
    expect(job).toMatch(/set naechte_vollstaendig = pg_catalog\.now\(\)\s+where woche = v_woche and naechte_vollstaendig is null/i)
  })

  it('laeuft im UTC-sonntag und -montag, damit der Berliner montag ganz abgedeckt ist', () => {
    expect(sql).toMatch(/cron\.schedule\('wochenbericht-nachtrag', '\*\/15 \* \* \* 0,1'/i)
  })

  it('traegt den bestand einmal nach, bevor er als fertig gilt', () => {
    const bestand = sql.indexOf('perform private.ergaenze_wochenbericht_naechte(v_woche);')
    const markiert = sql.indexOf('update public.wochenberichte set naechte_vollstaendig = now()\nwhere naechte_vollstaendig is null;')
    expect(bestand).toBeGreaterThan(-1)
    expect(markiert).toBeGreaterThan(bestand)
  })
})

describe('die meldung zum fertigen bericht', () => {
  it('haengt am zustand des archivs, nicht nur an der uhr', () => {
    expect(sql).toMatch(/w\.naechte_vollstaendig is not null/i)
    expect(sql).toMatch(/join public\.wochenberichte w on w\.woche = \(l\.montag - 7\)::date/i)
  })

  it('weckt niemanden nachts und kommt nach dem montag nicht mehr', () => {
    expect(sql).toMatch(/and l\.wochentag = 1\s+and l\.zeit >= time '07:00' and l\.zeit < time '21:00'/i)
  })

  it('gibt es je woche genau einmal und sie zeigt auf die eigene adresse', () => {
    // Der Tag der Reservierung ist der Berichtsmontag; der Primaerschluessel
    // von `aktivitaets_versand` macht daraus eine Meldung je Person und Woche.
    expect(sql).toMatch(/'wochenbericht'::text as art,\s+\(l\.montag - 7\)::date as tag/i)
    expect(sql).toMatch(/'\.\/#\/bericht\?woche=' \|\| \(l\.montag - 7\)::text as url/i)
    expect(sql).toMatch(/check \(art in \('lernen', 'lesen', 'wochenblick', 'partner', 'wochenrueckblick', 'wochenbericht'\)\)/i)
    expect(sql).toMatch(/add column if not exists wochenbericht_aktiv boolean not null default true/i)
  })

  it('laesst die bestehenden erinnerungen unveraendert stehen', () => {
    expect(sql).toContain('select * from grundtaetigkeiten')
    for (const art of ['alter_wochenblick', 'partner', 'neue_wochenrueckblicke', 'fertige_wochenberichte']) {
      expect(sql).toContain(`union all select * from ${art}`)
    }
  })
})

describe('persoenliche ENI-texte', () => {
  it('haelt je woche und person eine eigene zeile', () => {
    expect(sql).toMatch(/create table public\.wochenbericht_texte/i)
    expect(sql).toMatch(/primary key \(woche, person\)/i)
    expect(sql).toMatch(/check \(person in \('erijon', 'koray'\)\)/i)
  })

  it('gibt keinem browser zugriff — gelesen wird nur ueber die function', () => {
    expect(sql).toMatch(/alter table public\.wochenbericht_texte enable row level security/i)
    expect(sql).toMatch(/revoke all on table public\.wochenbericht_texte from public, anon, authenticated/i)
    expect(sql).toMatch(/grant select, insert, update on table public\.wochenbericht_texte to service_role/i)
    expect(sql).not.toMatch(/grant select on table public\.wochenbericht_texte to authenticated/i)
    expect(sql).not.toMatch(/create policy .* on public\.wochenbericht_texte/i)
  })

  it('reserviert je person atomar und kuehlt auch fehlversuche zwei minuten ab', () => {
    const reservierung = funktion('reserviere_wochenbericht_text')
    expect(reservierung).toMatch(/on conflict \(woche, person\) do update/i)
    expect(reservierung).toMatch(/where \(p_erzwingen or public\.wochenbericht_texte\.texte is null\)/i)
    expect(reservierung).toMatch(/versuch < pg_catalog\.now\(\) - interval '2 minutes'/i)
    expect(reservierung).toMatch(/if p_person not in \('erijon', 'koray'\) then return false; end if;/i)
    expect(sql).toMatch(/grant execute on function public\.reserviere_wochenbericht_text\(date, text, boolean\) to service_role/i)
  })
})
