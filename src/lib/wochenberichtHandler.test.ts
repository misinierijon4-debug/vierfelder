import { describe, expect, it, vi } from 'vitest'
import { abgeschlosseneBerichtWoche, behandleBericht, fasseBerichtWocheZusammen } from '../../supabase/functions/_shared/wochenberichtHandler'
import type { BerichtArchiv, BerichtDienste } from '../../supabase/functions/_shared/wochenberichtHandler'
import { pruefeTexte, pruefeWochenberichtText } from './wochenberichtTexte'

const texte = { ueberschrift: 'Drangeblieben', lief: 'Erijon und Koray waren aktiv.', muster: 'Die Tage waren unterschiedlich.', naechste: ['Erijon: Lesen einplanen.', 'Koray: Lernen einplanen.'] }
function umgebung() {
  const archiv: BerichtArchiv = { woche: '2026-09-14', daten: { woche: '2026-09-14' }, eingefroren: '2026-09-20T22:00:00Z', quelle: 'montag', texte: null, modell: null, text_erstellt: null }
  const dienste: BerichtDienste = {
    mitglied: vi.fn(async () => true), laden: vi.fn(async () => ({ ...archiv })),
    reservieren: vi.fn(async () => true), schreiben: vi.fn(async () => ({ texte, modell: 'test' })),
    speichern: vi.fn(async (_w, t, m) => { archiv.texte = t; archiv.modell = m }),
    jetzt: () => new Date('2026-09-20T22:00:00Z'),
  }
  return { archiv, dienste }
}
const anfrage = (body: unknown, token = 'Bearer test') => new Request('https://example.test', { method: 'POST', headers: { authorization: token }, body: JSON.stringify(body) })

describe('wochenbericht zugriff und generation', () => {
  it('friert erst am Berliner Montag ein, auch an beiden Zeitumstellungen', () => {
    expect(abgeschlosseneBerichtWoche('2026-09-14', new Date('2026-09-20T21:59:59Z'))).toBe(false)
    expect(abgeschlosseneBerichtWoche('2026-09-14', new Date('2026-09-20T22:00:00Z'))).toBe(true)
    expect(abgeschlosseneBerichtWoche('2026-10-19', new Date('2026-10-25T22:59:59Z'))).toBe(false)
    expect(abgeschlosseneBerichtWoche('2026-10-19', new Date('2026-10-25T23:00:00Z'))).toBe(true)
    expect(abgeschlosseneBerichtWoche('2027-03-22', new Date('2027-03-28T22:00:00Z'))).toBe(true)
    for (const wert of ['2026-02-31', '2026-09-15', '2026-09-21', null]) expect(abgeschlosseneBerichtWoche(wert, new Date('2026-09-21'))).toBe(false)
  })
  it('liest ohne Mitgliedschaft weder Archiv noch Modell', async () => {
    const { dienste } = umgebung()
    expect((await behandleBericht(anfrage({}, ''), dienste)).status).toBe(401)
    vi.mocked(dienste.mitglied).mockResolvedValue(false)
    expect((await behandleBericht(anfrage({ woche: '2026-09-14', aktion: 'text' }), dienste)).status).toBe(403)
    expect(dienste.laden).not.toHaveBeenCalled()
    expect(dienste.schreiben).not.toHaveBeenCalled()
  })
  it('liefert zuerst das Archiv, ohne das Modell abzuwarten', async () => {
    const { dienste } = umgebung()
    expect((await behandleBericht(anfrage({ woche: '2026-09-14', aktion: 'laden' }), dienste)).status).toBe(200)
    expect(dienste.schreiben).not.toHaveBeenCalled()
  })
  it('schreibt einmal fuer beide und verwendet nur serverseitige Daten', async () => {
    const { dienste, archiv } = umgebung()
    const req = () => anfrage({ woche: '2026-09-14', aktion: 'text', daten: 'manipuliert' })
    expect((await behandleBericht(req(), dienste)).status).toBe(200)
    expect((await behandleBericht(req(), dienste)).status).toBe(200)
    expect(dienste.schreiben).toHaveBeenCalledExactlyOnceWith(archiv.daten)
    expect(dienste.speichern).toHaveBeenCalledTimes(1)
  })
  it('reserviert parallele Versuche und speichert keine kaputten Antworten', async () => {
    const { dienste } = umgebung()
    vi.mocked(dienste.reservieren).mockResolvedValueOnce(false)
    expect((await behandleBericht(anfrage({ woche: '2026-09-14', aktion: 'text' }), dienste)).status).toBe(202)
    expect(dienste.schreiben).not.toHaveBeenCalled()
    vi.mocked(dienste.schreiben).mockResolvedValue({ texte: {}, modell: 'test' })
    expect((await behandleBericht(anfrage({ woche: '2026-09-14', aktion: 'text' }), dienste)).status).toBe(502)
    expect(dienste.speichern).not.toHaveBeenCalled()
  })
  it('liefert bei Modellfehlern keine Geheimnisse', async () => {
    const { dienste } = umgebung()
    vi.mocked(dienste.schreiben).mockRejectedValue(new Error('secret-key'))
    const res = await behandleBericht(anfrage({ woche: '2026-09-14', aktion: 'text' }), dienste)
    expect(res.status).toBe(503)
    expect(await res.text()).not.toContain('secret-key')
  })
})

describe('ENI textschema', () => {
  it('akzeptiert nur genau zwei vollstaendige Vorschlaege', () => {
    expect(pruefeTexte(texte)).toEqual(texte)
    for (const naechste of [[], ['eins'], ['eins', 'zwei', 'drei'], ['', 'zwei']]) expect(pruefeTexte({ ...texte, naechste })).toBeNull()
    expect(pruefeTexte({ ...texte, lief: 'x'.repeat(401) })).toBeNull()
  })
  it('erfindet keine Zeitangabe und lehnt falsche Wochen ab', () => {
    expect(pruefeWochenberichtText({ texte, woche: '2026-09-14' })).toBeNull()
    expect(pruefeWochenberichtText({ texte, woche: '2026-02-31', erstellt: '2026-09-21' })).toBeNull()
    expect(pruefeWochenberichtText({ texte, woche: '2026-09-14', erstellt: '2026-09-21T00:00:00Z' })).not.toBeNull()
  })
  it('fasst die Aktivitaeten aller sechs Bereiche gleichwertig zusammen', () => {
    const daten = {
      woche: '2026-09-07',
      zustand: {
        einheiten: {
          'koray|boxen|2026-09-09': [{ id: '1', user: 'koray', area: 'boxen', tag: '2026-09-09' }],
        },
        aufenthalte: [
          { user: 'erijon', bereich: 'lernen', ankunft: '2026-09-09T17:00:00Z' },
          { user: 'erijon', bereich: 'lernen', ankunft: '2026-09-13T16:00:00Z' },
          { user: 'koray', bereich: 'boxen', ankunft: '2026-09-10T20:00:00Z' },
          { user: 'koray', bereich: 'lesen', ankunft: '2026-09-11T09:00:00Z' },
        ],
        gewichte: {
          'erijon|2026-09-10': 69,
          'koray|2026-09-09': 74.5,
          'koray|2026-09-10': 74.2,
          'koray|2026-09-11': 73.5,
        },
      },
      naechte: [
        { user: 'erijon', nacht: '2026-09-09' },
        { user: 'erijon', nacht: '2026-09-10' },
        { user: 'erijon', nacht: '2026-09-11' },
        { user: 'koray', nacht: '2026-09-09' },
        { user: 'koray', nacht: '2026-09-10' },
        { user: 'koray', nacht: '2026-09-11' },
      ],
    }
    const res = fasseBerichtWocheZusammen(daten) as any
    expect(res.berichtswoche).toBe('2026-09-07 bis 2026-09-13')
    expect(res.personen.erijon.vierFelder.lernen).toContain('Mittwoch')
    expect(res.personen.erijon.vierFelder.lernen).toContain('Sonntag')
    expect(res.personen.erijon.vierFelder.gym).toBe('keine Aktivitaet')
    expect(res.personen.erijon.gewicht).toBe('vereinzelt gewogen')
    expect(res.personen.erijon.schlaf).toBe('regelmaessig erfasst')
    expect(res.personen.koray.vierFelder.boxen).toContain('Mittwoch')
    expect(res.personen.koray.vierFelder.boxen).toContain('Donnerstag')
    expect(res.personen.koray.vierFelder.lesen).toContain('Freitag')
    expect(res.personen.koray.vierFelder.gym).toBe('keine Aktivitaet')
    expect(res.personen.koray.gewicht).toBe('oft gewogen')
    expect(res.personen.koray.schlaf).toBe('regelmaessig erfasst')
  })
})
