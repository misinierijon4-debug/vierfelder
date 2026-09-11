/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { diktatFehlertext, diktatMoeglich, fuegeAn, useDiktat } from './eniDiktat'

/** eine attrappe der browser-erkennung, gesteuert von aussen */
class Attrappe {
  static letzte: Attrappe | null = null
  lang = ''
  continuous = false
  interimResults = false
  gestartet = false
  gestoppt = false
  onresult: ((ereignis: unknown) => void) | null = null
  onerror: ((ereignis: { error: string }) => void) | null = null
  onend: (() => void) | null = null

  constructor() {
    Attrappe.letzte = this
  }
  start() {
    this.gestartet = true
  }
  stop() {
    this.gestoppt = true
  }
  abort() {
    this.gestoppt = true
  }

  /** ein erkanntes stück hereingeben, wie es der browser täte */
  sag(text: string, endgueltig: boolean) {
    this.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal: endgueltig, 0: { transcript: text } } },
    })
  }
}

function mitErkennung() {
  ;(window as unknown as Record<string, unknown>).SpeechRecognition = Attrappe
  return () => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition
  }
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).SpeechRecognition
  Attrappe.letzte = null
})

describe('erkanntes an getipptes anhängen', () => {
  it('setzt ein leerzeichen dazwischen, aber keins an den anfang', () => {
    expect(fuegeAn('', 'guten morgen')).toBe('guten morgen')
    expect(fuegeAn('ich habe', 'heute trainiert')).toBe('ich habe heute trainiert')
  })

  it('klebt nichts an ein feld, das schon auf ein leerzeichen endet', () => {
    expect(fuegeAn('ich habe ', 'trainiert')).toBe('ich habe trainiert')
  })

  it('lässt den bestand in ruhe, wenn nichts erkannt wurde', () => {
    expect(fuegeAn('ich habe', '   ')).toBe('ich habe')
  })
})

describe('was ein abbruch der erkennung bedeutet', () => {
  it('schweigt, wo nichts kaputt ist', () => {
    expect(diktatFehlertext('aborted')).toBeNull()
    expect(diktatFehlertext('no-speech')).toBeNull()
  })

  it('sagt bei gesperrtem mikrofon, was zu tun ist', () => {
    expect(diktatFehlertext('not-allowed')).toContain('erlaub es')
  })

  it('nennt fehlendes netz beim namen, statt vom mikrofon zu reden', () => {
    expect(diktatFehlertext('network')).toContain('netz')
  })
})

describe('das diktat', () => {
  it('zeigt sich nicht auf einem gerät, das keine spracherkennung hat', () => {
    expect(diktatMoeglich()).toBe(false)
    const { result } = renderHook(() => useDiktat(() => {}))
    expect(result.current.moeglich).toBe(false)
  })

  it('reicht nur fertige stücke weiter und zeigt den rest als vorläufig', () => {
    const zurueck = mitErkennung()
    const stuecke: string[] = []
    const { result } = renderHook(() => useDiktat((stueck) => stuecke.push(stueck)))

    act(() => result.current.starte())
    expect(result.current.laeuft).toBe(true)
    expect(Attrappe.letzte?.lang).toBe('de-DE')
    expect(Attrappe.letzte?.continuous).toBe(true)

    act(() => Attrappe.letzte!.sag('ich habe heute', false))
    expect(stuecke).toEqual([])
    expect(result.current.vorlaeufig).toBe('ich habe heute')

    act(() => Attrappe.letzte!.sag('ich habe heute trainiert', true))
    expect(stuecke).toEqual(['ich habe heute trainiert'])
    expect(result.current.vorlaeufig).toBe('')

    zurueck()
  })

  it('behält das zuletzt gesagte beim beenden, statt es wegzuwerfen', () => {
    const zurueck = mitErkennung()
    const { result } = renderHook(() => useDiktat(() => {}))

    act(() => result.current.starte())
    act(() => result.current.stoppe())

    // `stop` liefert noch ein letztes ergebnis, `abort` wirft es weg
    expect(Attrappe.letzte?.gestoppt).toBe(true)
    expect(result.current.laeuft).toBe(false)
    zurueck()
  })

  it('lässt den knopf nicht leuchten, wenn der browser von selbst abschaltet', () => {
    const zurueck = mitErkennung()
    const { result } = renderHook(() => useDiktat(() => {}))

    act(() => result.current.starte())
    act(() => Attrappe.letzte!.onend?.())

    expect(result.current.laeuft).toBe(false)
    zurueck()
  })

  it('sagt hin, wenn das mikrofon gesperrt ist', () => {
    const zurueck = mitErkennung()
    const { result } = renderHook(() => useDiktat(() => {}))

    act(() => result.current.starte())
    act(() => Attrappe.letzte!.onerror?.({ error: 'not-allowed' }))

    expect(result.current.fehler).toContain('mikrofon')
    zurueck()
  })

  it('lässt kein offenes mikrofon zurück, wenn die ansicht geht', () => {
    const zurueck = mitErkennung()
    const { result, unmount } = renderHook(() => useDiktat(() => {}))

    act(() => result.current.starte())
    const erkennung = Attrappe.letzte!
    unmount()

    expect(erkennung.gestoppt).toBe(true)
    zurueck()
  })

  it('startet nicht zweimal auf denselben knopfdruck', () => {
    const zurueck = mitErkennung()
    const bauer = vi.spyOn(Attrappe.prototype, 'start')
    const { result } = renderHook(() => useDiktat(() => {}))

    act(() => result.current.starte())
    act(() => result.current.starte())

    expect(bauer).toHaveBeenCalledTimes(1)
    bauer.mockRestore()
    zurueck()
  })
})
