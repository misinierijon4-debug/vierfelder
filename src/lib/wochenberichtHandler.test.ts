import { describe, expect, it, vi } from 'vitest'
import { abgeschlosseneBerichtWoche, behandleBericht, fasseBerichtWocheZusammen } from '../../supabase/functions/_shared/wochenberichtHandler'
import type { BerichtArchiv, BerichtDienste, BerichtPerson } from '../../supabase/functions/_shared/wochenberichtHandler'
import { pruefeTexte, pruefeWochenberichtText } from './wochenberichtTexte'

const texte = { ueberschrift: 'Drangeblieben', lief: 'Du warst aktiv.', muster: 'Die Tage waren unterschiedlich.', naechste: ['Lesen einplanen.', 'Lernen einplanen.'] as [string, string] }
/** Je Person eine eigene Textzeile — genau wie in `wochenbericht_texte`. */
function umgebung(wer: BerichtPerson = 'erijon') {
  const archiv: BerichtArchiv = { woche: '2026-09-14', daten: { woche: '2026-09-14' }, eingefroren: '2026-09-20T22:00:00Z', quelle: 'montag', texte: null, modell: null, text_erstellt: null }
  const zeilen: Record<string, Pick<BerichtArchiv, 'texte' | 'modell'>> = {}
  const dienste: BerichtDienste = {
    person: vi.fn(async () => wer),
    laden: vi.fn(async (_w, p) => ({ ...archiv, texte: zeilen[p]?.texte ?? null, modell: zeilen[p]?.modell ?? null })),
    reservieren: vi.fn(async () => true),
    schreiben: vi.fn(async (_d, p) => ({ texte: { ...texte, ueberschrift: `Woche von ${p}` }, modell: 'test' })),
    speichern: vi.fn(async (_w, p, t, m) => { zeilen[p] = { texte: t, modell: m } }),
    jetzt: () => new Date('2026-09-20T22:00:00Z'),
  }
  return { archiv, zeilen, dienste }
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
    vi.mocked(dienste.person).mockResolvedValue(null)
    expect((await behandleBericht(anfrage({ woche: '2026-09-14', aktion: 'text' }), dienste)).status).toBe(403)
    expect(dienste.laden).not.toHaveBeenCalled()
    expect(dienste.schreiben).not.toHaveBeenCalled()
  })
  it('liefert zuerst das Archiv, ohne das Modell abzuwarten', async () => {
    const { dienste } = umgebung()
    expect((await behandleBericht(anfrage({ woche: '2026-09-14', aktion: 'laden' }), dienste)).status).toBe(200)
    expect(dienste.schreiben).not.toHaveBeenCalled()
  })
  it('schreibt je person einmal und verwendet nur serverseitige Daten', async () => {
    const { dienste, archiv } = umgebung()
    const req = () => anfrage({ woche: '2026-09-14', aktion: 'text', daten: 'manipuliert' })
    expect((await behandleBericht(req(), dienste)).status).toBe(200)
    expect((await behandleBericht(req(), dienste)).status).toBe(200)
    expect(dienste.schreiben).toHaveBeenCalledExactlyOnceWith(archiv.daten, 'erijon')
    expect(dienste.speichern).toHaveBeenCalledTimes(1)
  })
  it('gibt jeder person ihren eigenen text und nie den der anderen', async () => {
    const meiner = umgebung('erijon')
    const req = () => anfrage({ woche: '2026-09-14', aktion: 'text' })
    const eigen = await (await behandleBericht(req(), meiner.dienste)).json()
    expect(eigen.texte.ueberschrift).toBe('Woche von erijon')

    // Dieselbe Woche, dasselbe Archiv, anderes Konto: eigene Zeile, eigener Lauf.
    const anderer = umgebung('koray')
    const fremd = await (await behandleBericht(req(), anderer.dienste)).json()
    expect(fremd.texte.ueberschrift).toBe('Woche von koray')
    expect(anderer.zeilen.erijon).toBeUndefined()
    expect(meiner.zeilen.koray).toBeUndefined()
    expect(anderer.dienste.schreiben).toHaveBeenCalledExactlyOnceWith(meiner.archiv.daten, 'koray')
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
  it('erzwingt mit aktion neu das neuschreiben des textes', async () => {
    const { dienste, zeilen } = umgebung()
    zeilen.erijon = { texte, modell: 'alt' }
    vi.mocked(dienste.reservieren).mockResolvedValue(true)
    const res = await behandleBericht(anfrage({ woche: '2026-09-14', aktion: 'neu' }), dienste)
    expect(res.status).toBe(200)
    expect(dienste.reservieren).toHaveBeenCalledWith('2026-09-14', 'erijon', true)
    expect(dienste.schreiben).toHaveBeenCalled()
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
  it('zeigt dem modell alle sechs Bereiche, aber nur die eigene person', () => {
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
    const meins = fasseBerichtWocheZusammen(daten, 'erijon') as any
    expect(meins.berichtswoche).toBe('2026-09-07 bis 2026-09-13')
    expect(meins.fuer).toBe('Erijon')
    expect(meins.vierFelder.lernen).toContain('Mittwoch')
    expect(meins.vierFelder.lernen).toContain('Sonntag')
    expect(meins.vierFelder.gym).toBe('keine Aktivitaet')
    expect(meins.gewicht).toBe('vereinzelt gewogen')
    expect(meins.schlaf).toBe('regelmaessig erfasst')

    const seins = fasseBerichtWocheZusammen(daten, 'koray') as any
    expect(seins.fuer).toBe('Koray')
    expect(seins.vierFelder.boxen).toContain('Mittwoch')
    expect(seins.vierFelder.boxen).toContain('Donnerstag')
    expect(seins.vierFelder.lesen).toContain('Freitag')
    expect(seins.vierFelder.gym).toBe('keine Aktivitaet')
    expect(seins.gewicht).toBe('oft gewogen')
    expect(seins.schlaf).toBe('regelmaessig erfasst')

    // Das Modell darf die andere Person nirgends sehen — auch nicht als Name.
    expect(JSON.stringify(meins)).not.toContain('oray')
    expect(JSON.stringify(seins)).not.toContain('rijon')
  })
})
