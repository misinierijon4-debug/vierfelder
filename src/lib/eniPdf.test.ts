// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { bereiteVor } from './eniAnhang'
import { liesPdf } from './eniPdf'
vi.mock('./eniPdf', () => ({ liesPdf: vi.fn() }))
afterEach(() => vi.clearAllMocks())

it('uebergibt PDF-Text mit Seitenangaben als modellunabhaengigen Anhang', async () => {
  vi.mocked(liesPdf).mockResolvedValue('[Seite 1]\nDie Antwort ist 42.')
  const datei = new File(['pdf'], 'aufgabe.pdf', { type: 'application/pdf' })
  const anhang = await bereiteVor(datei)
  expect(anhang.art).toBe('text')
  expect(anhang.name).toBe('aufgabe.pdf')
  expect(anhang.inhalt).toContain('[Seite 1]')
  expect(anhang.inhalt).toContain('42')
})

it('haelt auch lange PDFs innerhalb des serverseitigen Zeichenlimits', async () => {
  vi.mocked(liesPdf).mockResolvedValue('a'.repeat(25_000))
  const anhang = await bereiteVor(new File(['pdf'], 'SCAN.PDF'))
  expect(anhang.gekuerzt).toBe(true)
  expect(anhang.inhalt!.length).toBeLessThanOrEqual(20_000)
})

it('zeigt Lesefehler statt einen leeren PDF-Anhang zu senden', async () => {
  vi.mocked(liesPdf).mockRejectedValue(new Error('Das PDF ist passwortgeschützt.'))
  await expect(bereiteVor(new File(['pdf'], 'aufgabe.pdf'))).rejects.toThrow('passwortgeschützt')
})
