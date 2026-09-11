/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VorbereiteterAnhang } from '../../lib/eniAnhang'
import { EniEingabe } from './EniEingabe'

/** dieselbe attrappe wie in eniDiktat.test, hier fuer die ganze eingabe */
class Erkennung {
  static letzte: Erkennung | null = null
  lang = ''
  continuous = false
  interimResults = false
  onresult: ((ereignis: unknown) => void) | null = null
  onerror: ((ereignis: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  constructor() {
    Erkennung.letzte = this
  }
  start() {}
  stop() {}
  abort() {}
  sag(text: string, endgueltig: boolean) {
    this.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal: endgueltig, 0: { transcript: text } } },
    })
  }
}

afterEach(() => {
  cleanup()
  delete (window as unknown as Record<string, unknown>).SpeechRecognition
  Erkennung.letzte = null
})

const BILD: VorbereiteterAnhang = {
  id: 'a1',
  art: 'bild',
  name: 'raster.png',
  groesse: 40_960,
  vorschau: 'blob:vorschau-1',
}

const DATEI: VorbereiteterAnhang = {
  id: 'a2',
  art: 'text',
  name: 'woche.csv',
  groesse: 2048,
  inhalt: 'gym;3',
  gekuerzt: true,
}

function zeige(ueberschreibungen: Partial<Parameters<typeof EniEingabe>[0]> = {}) {
  const props = {
    gesperrt: false,
    onVorlegen: vi.fn(),
    anhaengenMoeglich: true,
    anhaenge: [] as VorbereiteterAnhang[],
    onAnhaengen: vi.fn(),
    onAnhangEntfernen: vi.fn(),
    ...ueberschreibungen,
  }
  render(<EniEingabe {...props} />)
  return props
}

const feld = () => screen.getByLabelText('was du ENI vorlegst')
const vorlegen = () => screen.getByRole('button', { name: 'vorlegen' })

describe('die büroklammer', () => {
  it('fehlt ganz, wo es keinen bucket gibt, statt grau dazustehen', () => {
    zeige({ anhaengenMoeglich: false })
    expect(screen.queryByLabelText('bild oder datei anhängen')).not.toBeInTheDocument()
  })

  it('steht bereit, sobald ein konto da ist', () => {
    zeige()
    expect(screen.getByLabelText('bild oder datei anhängen')).toBeInTheDocument()
  })

  it('sagt hin, wenn die vier voll sind, statt still nichts zu tun', () => {
    zeige({
      anhaenge: [BILD, { ...BILD, id: 'b' }, { ...BILD, id: 'c' }, { ...BILD, id: 'd' }],
    })
    expect(screen.getByLabelText('mehr als 4 anhänge gehen nicht')).toBeDisabled()
  })
})

describe('der streifen über dem feld', () => {
  it('zeigt ein bild als bild und eine datei mit größe', () => {
    zeige({ anhaenge: [BILD, DATEI] })

    expect(screen.getByAltText('raster.png')).toHaveAttribute('src', 'blob:vorschau-1')
    expect(screen.getByText('woche.csv')).toBeInTheDocument()
    // der schnitt steht dran, statt still zu passieren
    expect(screen.getByText('2 KB · gekürzt')).toBeInTheDocument()
  })

  it('gibt jeden anhang einzeln wieder her', () => {
    const props = zeige({ anhaenge: [BILD, DATEI] })
    fireEvent.click(screen.getByLabelText('woche.csv entfernen'))
    expect(props.onAnhangEntfernen).toHaveBeenCalledWith('a2')
  })
})

describe('was vorgelegt werden darf', () => {
  it('lässt ein leeres feld nicht durch', () => {
    zeige()
    expect(vorlegen()).toBeDisabled()
  })

  it('lässt ein bild ohne ein einziges wort durch', () => {
    const props = zeige({ anhaenge: [BILD] })
    expect(vorlegen()).toBeEnabled()
    fireEvent.click(vorlegen())
    expect(props.onVorlegen).toHaveBeenCalledWith('')
  })

  it('nimmt einen screenshot aus der zwischenablage an', () => {
    const props = zeige()
    const bild = new File(['x'], 'screenshot.png', { type: 'image/png' })
    fireEvent.paste(feld(), { clipboardData: { files: [bild] } })
    expect(props.onAnhaengen).toHaveBeenCalledWith([bild])
  })

  it('fasst eine eingefügte textzeile nicht an', () => {
    const props = zeige()
    fireEvent.paste(feld(), { clipboardData: { files: [] } })
    expect(props.onAnhaengen).not.toHaveBeenCalled()
  })
})

describe('das mikrofon', () => {
  it('fehlt auf einem gerät ohne spracherkennung', () => {
    zeige()
    expect(screen.queryByLabelText('diktieren')).not.toBeInTheDocument()
  })

  it('schreibt erkanntes ins feld, ohne getipptes zu verlieren', () => {
    ;(window as unknown as Record<string, unknown>).SpeechRecognition = Erkennung
    zeige()

    fireEvent.change(feld(), { target: { value: 'ich habe' } })
    act(() => {
      fireEvent.click(screen.getByLabelText('diktieren'))
    })
    act(() => Erkennung.letzte!.sag('heute trainiert', true))

    expect(feld()).toHaveValue('ich habe heute trainiert')
  })

  it('sagt während der aufnahme hin, wohin der ton geht', () => {
    ;(window as unknown as Record<string, unknown>).SpeechRecognition = Erkennung
    zeige()

    expect(screen.queryByText(/google oder apple/)).not.toBeInTheDocument()
    act(() => {
      fireEvent.click(screen.getByLabelText('diktieren'))
    })
    expect(screen.getByText(/google oder apple/)).toBeInTheDocument()
  })

  it('schaltet das mikrofon ab, wenn die vorlage abgeht', () => {
    ;(window as unknown as Record<string, unknown>).SpeechRecognition = Erkennung
    zeige()

    fireEvent.change(feld(), { target: { value: 'so weit' } })
    act(() => {
      fireEvent.click(screen.getByLabelText('diktieren'))
    })
    act(() => {
      fireEvent.click(vorlegen())
    })

    expect(screen.queryByLabelText('diktat beenden')).not.toBeInTheDocument()
    expect(screen.queryByText(/google oder apple/)).not.toBeInTheDocument()
  })
})
