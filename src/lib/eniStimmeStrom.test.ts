/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Der weg über den tonstrom, der auf dem telefon der normale ist. Er steht in
 * einer eigenen datei, weil er eine attrappe für `AudioContext` braucht: in
 * jsdom gibt es keinen, und die andere prüfung lebt genau davon.
 */

const ruf = vi.hoisted(() => vi.fn())
vi.mock('./eniAntwort', () => ({ rufeEniFunktion: ruf }))

const warteschlange = vi.hoisted(() => ({
  anhaengen: vi.fn(),
  abschliessen: vi.fn(),
  halt: vi.fn(),
}))
vi.mock('./eniAudioStrom', () => ({
  weckeAudioStrom: () => ({ resume: () => Promise.resolve() }),
  audioWarteschlange: () => warteschlange,
}))

import { TON_FRIST_MS, useStimme } from './eniStimme'

/** eine nachricht, die es in der datenbank geben könnte */
const ECHTE_ID = '11111111-2222-4333-8444-555555555555'

/** was das audio-element abzuspielen bekommen hätte */
const gespielt: string[] = []

class Aeusserung {
  pitch = 1
  rate = 1
  volume = 1
  lang = ''
  voice: unknown = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public text: string) {}
}

class Ausgabe {
  gesprochen: string[] = []
  speaking = false
  paused = false
  speak(a: { text: string }) {
    this.gesprochen.push(a.text)
  }
  cancel() {
    this.speaking = false
  }
  pause() {}
  resume() {}
  getVoices() {
    return []
  }
  addEventListener() {}
  removeEventListener() {}
}

let synth: Ausgabe

beforeEach(() => {
  gespielt.length = 0
  ruf.mockReset()
  warteschlange.anhaengen.mockReset()
  warteschlange.abschliessen.mockReset()
  warteschlange.halt.mockReset()
  synth = new Ausgabe()
  const fenster = window as unknown as Record<string, unknown>
  fenster.speechSynthesis = synth
  fenster.SpeechSynthesisUtterance = Aeusserung
  Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value(this: HTMLMediaElement) {
      gespielt.push(this.src)
      return Promise.resolve()
    },
  })
  Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value() {},
  })
})

afterEach(() => {
  const fenster = window as unknown as Record<string, unknown>
  delete fenster.speechSynthesis
  delete fenster.SpeechSynthesisUtterance
  vi.useRealTimers()
})

describe('wenn die eigene stimme zu lange braucht', () => {
  it('bricht die aufnahme nicht ab, sondern lässt sie ins regal laufen', async () => {
    // das war der fehler, an dem ENI immer mit der gerätestimme sprach: der
    // abbruch nahm der Function die aufnahme weg, also lag beim nächsten mal
    // wieder nichts bereit und es ging wieder von vorn los.
    vi.useFakeTimers()
    let liefere: ((wert: unknown) => void) | null = null
    ruf.mockResolvedValueOnce({ status: 200, inhalt: { bereit: true } })
    ruf.mockReturnValueOnce(new Promise((fertig) => (liefere = fertig)))

    const { result } = renderHook(() => useStimme())
    await act(async () => {})
    await act(async () => {
      result.current.sprich(ECHTE_ID, 'Das reicht nicht.')
    })

    await act(async () => {
      vi.advanceTimersByTime(TON_FRIST_MS + 1)
    })

    // der browser springt ein ...
    expect(synth.gesprochen).toHaveLength(1)
    expect(result.current.art).toBe('browser')
    // ... aber die anfrage läuft weiter
    const signal = ruf.mock.calls[1]?.[2] as AbortSignal | undefined
    expect(signal?.aborted).toBe(false)

    await act(async () => {
      liefere?.({ status: 200, inhalt: { adresse: 'https://bucket/spaet.wav' } })
    })

    // der späte ton redet nicht dazwischen ...
    expect(gespielt).not.toContain('https://bucket/spaet.wav')
    expect(warteschlange.anhaengen).not.toHaveBeenCalled()

    // ... und beim nächsten antippen ist er sofort da, ohne neuen ruf
    act(() => result.current.halt())
    await act(async () => {
      result.current.sprich(ECHTE_ID, 'Das reicht nicht.')
    })
    expect(gespielt).toContain('https://bucket/spaet.wav')
    expect(ruf).toHaveBeenCalledTimes(2)
  })

  it('hält die späten tonstücke zurück, statt sie nachträglich abzuspielen', async () => {
    vi.useFakeTimers()
    let sendeEreignis: ((event: Record<string, unknown>) => void) | null = null
    ruf.mockResolvedValueOnce({ status: 200, inhalt: { bereit: true } })
    ruf.mockImplementationOnce(
      (_name, _rumpf, _signal, onEvent) =>
        new Promise(() => {
          sendeEreignis = onEvent
        })
    )

    const { result } = renderHook(() => useStimme())
    await act(async () => {})
    await act(async () => {
      result.current.sprich(ECHTE_ID, 'Das reicht nicht.')
    })
    await act(async () => {
      vi.advanceTimersByTime(TON_FRIST_MS + 1)
    })

    await act(async () => {
      sendeEreignis?.({ typ: 'audio', pcm: 'AAAA' })
    })

    expect(warteschlange.anhaengen).not.toHaveBeenCalled()
    expect(result.current.art).toBe('browser')
  })
})
