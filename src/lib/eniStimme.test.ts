/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// die Function wird nicht gerufen: was sie antwortet, sagt hier der Test.
const ruf = vi.hoisted(() => vi.fn())
vi.mock('./eniAntwort', () => ({ rufeEniFunktion: ruf }))

/** was das audio-element abzuspielen bekommen haette */
const gespielt: string[] = []
import {
  bewerteStimme,
  MAX_STUECK,
  TON_FRIST_MS,
  stimmeMoeglich,
  teileFuerStimme,
  useStimme,
  waehleStimme,
} from './eniStimme'

const stimme = (name: string, lang = 'de-DE', localService = true) => ({
  name,
  lang,
  localService,
})

/** eine attrappe der sprachausgabe, die mitschreibt statt zu sprechen */
class Ausgabe {
  gesprochen: Array<{ text: string; pitch: number; rate: number; stimme: unknown }> = []
  abgebrochen = 0
  speaking = false
  paused = false
  private zuhoerer: (() => void)[] = []
  private stimmen: unknown[] = []

  speak(a: {
    text: string
    pitch: number
    rate: number
    voice: unknown
    onend?: () => void
    onerror?: () => void
  }) {
    this.gesprochen.push({ text: a.text, pitch: a.pitch, rate: a.rate, stimme: a.voice })
    this.speaking = true
    ;(this as unknown as { letzte?: typeof a }).letzte = a
  }
  cancel() {
    this.abgebrochen += 1
    this.speaking = false
  }
  pause() {}
  resume() {}
  getVoices() {
    return this.stimmen
  }
  addEventListener(_: string, hoerer: () => void) {
    this.zuhoerer.push(hoerer)
  }
  removeEventListener() {}

  /** die stimmen kommen bei Chrome erst nach, wie im echten browser */
  liefereStimmen(stimmen: unknown[]) {
    this.stimmen = stimmen
    for (const hoerer of this.zuhoerer) hoerer()
  }
  /** das letzte stück zu ende sprechen lassen */
  beendeLetztes() {
    const letzte = (this as unknown as { letzte?: { onend?: () => void } }).letzte
    this.speaking = false
    letzte?.onend?.()
  }
}

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

function mitAusgabe() {
  const synth = new Ausgabe()
  const fenster = window as unknown as Record<string, unknown>
  fenster.speechSynthesis = synth
  fenster.SpeechSynthesisUtterance = Aeusserung
  return synth
}

beforeEach(() => {
  gespielt.length = 0
  ruf.mockReset()
  // ohne eingerichtete stimme antwortet die pruefung mit nein
  ruf.mockResolvedValue({ status: 200, inhalt: { bereit: false } })
  // jsdom spielt nichts ab. hier zaehlt nur, was es bekommen haette.
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

describe('welche stimme zu ENI passt', () => {
  it('schliesst alles aus, was kein deutsch spricht', () => {
    expect(bewerteStimme(stimme('Daniel', 'en-GB'))).toBe(-1)
    expect(waehleStimme([stimme('Daniel', 'en-GB'), stimme('Samantha', 'en-US')])).toBeNull()
  })

  it('nimmt die erweiterte fassung vor der kompakten, auch quer über das geschlecht', () => {
    // das war der fehler der ersten fassung: einer blechernen stimme hört
    // niemand zu, egal wem sie gehört
    const gewaehlt = waehleStimme([
      stimme('Markus (kompakt)', 'de-DE', true),
      stimme('Anna (Erweitert)', 'de-DE', true),
    ])
    expect(gewaehlt?.name).toBe('Anna (Erweitert)')
  })

  it('nimmt eine gute stimme aus dem netz vor einer blechernen vom gerät', () => {
    const gewaehlt = waehleStimme([
      stimme('Microsoft Stefan', 'de-DE', true),
      stimme('Microsoft Conrad Online (Natural)', 'de-DE', false),
    ])
    expect(gewaehlt?.name).toBe('Microsoft Conrad Online (Natural)')
  })

  it('nimmt bei gleicher güte die stimme vom gerät', () => {
    const gewaehlt = waehleStimme([
      stimme('Markus', 'de-DE', false),
      stimme('Markus', 'de-DE', true),
    ])
    expect(gewaehlt?.localService).toBe(true)
  })

  it('nimmt unter gleich lokalen die männerstimme', () => {
    const gewaehlt = waehleStimme([
      stimme('Anna', 'de-DE', true),
      stimme('Markus', 'de-DE', true),
    ])
    expect(gewaehlt?.name).toBe('Markus')
  })

  it('bevorzugt de-DE vor de-AT', () => {
    const gewaehlt = waehleStimme([stimme('Petra', 'de-AT'), stimme('Petra', 'de-DE')])
    expect(gewaehlt?.lang).toBe('de-DE')
  })

  it('bleibt bei der ersten, wenn zwei gleich gut sind', () => {
    const gewaehlt = waehleStimme([stimme('Stefan'), stimme('Conrad')])
    expect(gewaehlt?.name).toBe('Stefan')
  })
})

describe('einen langen text sprechbar schneiden', () => {
  it('lässt einen kurzen text in einem stück', () => {
    expect(teileFuerStimme('Das reicht nicht.')).toEqual(['Das reicht nicht.'])
  })

  it('schneidet an satzenden, nicht mitten im satz', () => {
    const text = `${'a'.repeat(150)}. ${'b'.repeat(150)}.`
    const stuecke = teileFuerStimme(text)
    expect(stuecke).toHaveLength(2)
    expect(stuecke[0]!.endsWith('.')).toBe(true)
  })

  it('fasst kurze sätze zusammen, statt jeden einzeln zu sprechen', () => {
    const stuecke = teileFuerStimme('Gut. Das war heute. Leg morgen dasselbe hin.')
    expect(stuecke).toEqual(['Gut. Das war heute. Leg morgen dasselbe hin.'])
  })

  it('trennt einen absatz, aber verliert ihn nicht', () => {
    const stuecke = teileFuerStimme('Erster Absatz\n\nZweiter Absatz')
    expect(stuecke.join(' ')).toContain('Erster Absatz')
    expect(stuecke.join(' ')).toContain('Zweiter Absatz')
  })

  it('bricht einen satz, der allein schon zu lang ist, an einem leerzeichen', () => {
    const lang = Array.from({ length: 60 }, () => 'wort').join(' ')
    const stuecke = teileFuerStimme(lang)
    expect(stuecke.length).toBeGreaterThan(1)
    for (const stueck of stuecke) expect(stueck.length).toBeLessThanOrEqual(MAX_STUECK)
    // kein wort geht dabei verloren und keins wird zerschnitten
    expect(stuecke.join(' ')).toBe(lang)
  })

  it('gibt für leeren text nichts zurück, statt ein leeres stück zu sprechen', () => {
    expect(teileFuerStimme('   \n  ')).toEqual([])
  })
})

describe('das vorlesen', () => {
  it('gibt es nicht auf einem gerät ohne sprachausgabe', () => {
    expect(stimmeMoeglich()).toBe(false)
    const { result } = renderHook(() => useStimme())
    expect(result.current.moeglich).toBe(false)
  })

  it('nimmt die stimmen an, die Chrome erst nachliefert', () => {
    const synth = mitAusgabe()
    const { result } = renderHook(() => useStimme())

    expect(result.current.name).toBeNull()
    act(() => synth.liefereStimmen([stimme('Anna'), stimme('Markus')]))
    expect(result.current.name).toBe('Markus')
    expect(result.current.oertlich).toBe(true)
  })

  it('spricht in stücken, tiefer und langsamer als die voreinstellung', () => {
    const synth = mitAusgabe()
    const { result } = renderHook(() => useStimme())
    act(() => synth.liefereStimmen([stimme('Markus')]))

    const lang = `${'a'.repeat(150)}. ${'b'.repeat(150)}.`
    act(() => result.current.sprich('zeile-1', lang))

    expect(synth.gesprochen).toHaveLength(2)
    expect(synth.gesprochen[0]!.pitch).toBeLessThan(1)
    expect(synth.gesprochen[0]!.rate).toBeLessThan(1)
    expect(result.current.spricht).toBe('zeile-1')
  })

  it('meldet erst still, wenn das letzte stück durch ist', () => {
    const synth = mitAusgabe()
    const { result } = renderHook(() => useStimme())
    act(() => result.current.sprich('zeile-1', 'Das reicht nicht.'))

    expect(result.current.spricht).toBe('zeile-1')
    act(() => synth.beendeLetztes())
    expect(result.current.spricht).toBeNull()
  })

  it('bricht das laufende ab, wenn eine zweite zeile drankommt', () => {
    const synth = mitAusgabe()
    const { result } = renderHook(() => useStimme())

    act(() => result.current.sprich('zeile-1', 'Erstens.'))
    act(() => result.current.sprich('zeile-2', 'Zweitens.'))

    expect(synth.abgebrochen).toBeGreaterThan(0)
    expect(result.current.spricht).toBe('zeile-2')
  })

  it('lässt ein spätes ende der vorigen zeile die neue nicht abwürgen', () => {
    const synth = mitAusgabe()
    const { result } = renderHook(() => useStimme())

    act(() => result.current.sprich('zeile-1', 'Erstens.'))
    const ersteEnde = (synth as unknown as { letzte: { onend: () => void } }).letzte.onend
    act(() => result.current.sprich('zeile-2', 'Zweitens.'))
    act(() => ersteEnde())

    expect(result.current.spricht).toBe('zeile-2')
  })

  it('hält auf verlangen sofort an', () => {
    mitAusgabe()
    const { result } = renderHook(() => useStimme())
    act(() => result.current.sprich('zeile-1', 'Das reicht nicht.'))
    act(() => result.current.halt())
    expect(result.current.spricht).toBeNull()
  })

  it('lässt keine stimme weiterreden, wenn die ansicht geht', () => {
    const synth = mitAusgabe()
    const { result, unmount } = renderHook(() => useStimme())
    act(() => result.current.sprich('zeile-1', 'Das reicht nicht.'))
    unmount()
    expect(synth.abgebrochen).toBeGreaterThan(0)
  })
})

describe('die echte stimme vor der eingebauten', () => {
  const ECHTE_ID = '11111111-2222-4333-8444-555555555555'

  it('holt den ton vom server und spielt ihn ab, statt selbst zu sprechen', async () => {
    const synth = mitAusgabe()
    ruf.mockResolvedValueOnce({ status: 200, inhalt: { bereit: true, stimme: 'Charon' } })
    ruf.mockResolvedValueOnce({ status: 200, inhalt: { adresse: 'https://bucket/ton.wav' } })

    const { result } = renderHook(() => useStimme())
    await act(async () => {})
    await act(async () => {
      result.current.sprich(ECHTE_ID, 'Das reicht nicht.')
    })

    expect(result.current.art).toBe('server')
    expect(gespielt).toContain('https://bucket/ton.wav')
    // die eingebaute stimme bleibt still, wenn die echte durchkommt
    expect(synth.gesprochen).toHaveLength(0)
  })

  it('fällt auf die eingebaute stimme zurück, wenn kein ton kommt', async () => {
    const synth = mitAusgabe()
    ruf.mockResolvedValueOnce({ status: 200, inhalt: { bereit: true } })
    ruf.mockResolvedValueOnce({ status: 502, inhalt: { error: 'stimme kam nicht durch' } })

    const { result } = renderHook(() => useStimme())
    await act(async () => {})
    await act(async () => {
      result.current.sprich(ECHTE_ID, 'Das reicht nicht.')
    })

    expect(synth.gesprochen).toHaveLength(1)
    expect(result.current.art).toBe('browser')
    expect(result.current.spricht).toBe(ECHTE_ID)
  })

  it('fällt zurück, wenn das netz beim holen wegbricht', async () => {
    const synth = mitAusgabe()
    ruf.mockResolvedValueOnce({ status: 200, inhalt: { bereit: true } })
    ruf.mockRejectedValueOnce(new Error('kein netz'))

    const { result } = renderHook(() => useStimme())
    await act(async () => {})
    await act(async () => {
      result.current.sprich(ECHTE_ID, 'Das reicht nicht.')
    })

    expect(synth.gesprochen).toHaveLength(1)
  })

  it('fragt gar nicht erst nach für eine zeile, die noch nicht gespeichert ist', async () => {
    const synth = mitAusgabe()
    ruf.mockResolvedValueOnce({ status: 200, inhalt: { bereit: true } })

    const { result } = renderHook(() => useStimme())
    await act(async () => {})
    await act(async () => {
      result.current.sprich('vorlaeufig-1757530000000', 'Das reicht nicht.')
    })

    // nur die eine pruefung beim aufgehen, kein zweiter ruf
    expect(ruf).toHaveBeenCalledTimes(1)
    expect(synth.gesprochen).toHaveLength(1)
  })

  it('weiß vor dem ersten ton, dass eine echte stimme eingerichtet ist', async () => {
    // der hinweis im kopf hängt daran und muss vorher stehen, nicht hinterher
    mitAusgabe()
    ruf.mockResolvedValueOnce({ status: 200, inhalt: { bereit: true } })

    const { result } = renderHook(() => useStimme())
    await act(async () => {})

    expect(result.current.serverBereit).toBe(true)
    expect(result.current.spricht).toBeNull()
  })

  it('holt dieselbe adresse kein zweites mal', async () => {
    mitAusgabe()
    ruf.mockResolvedValueOnce({ status: 200, inhalt: { bereit: true } })
    ruf.mockResolvedValue({ status: 200, inhalt: { adresse: 'https://bucket/ton.wav' } })

    const { result } = renderHook(() => useStimme())
    await act(async () => {})
    await act(async () => {
      result.current.sprich(ECHTE_ID, 'Das reicht nicht.')
    })
    act(() => result.current.halt())
    await act(async () => {
      result.current.sprich(ECHTE_ID, 'Das reicht nicht.')
    })

    // die prüfung beim aufgehen und genau ein ruf nach dem ton
    expect(ruf).toHaveBeenCalledTimes(2)
    expect(gespielt.filter((quelle) => quelle === 'https://bucket/ton.wav')).toHaveLength(2)
  })

  it('lässt den browser reden, wenn die echte stimme zu lange braucht', async () => {
    // eine halbe minute stille ist kein warten mehr, sondern ein defekt
    vi.useFakeTimers()
    const synth = mitAusgabe()
    ruf.mockResolvedValueOnce({ status: 200, inhalt: { bereit: true } })
    ruf.mockReturnValueOnce(new Promise(() => {}))

    const { result } = renderHook(() => useStimme())
    await act(async () => {})
    await act(async () => {
      result.current.sprich(ECHTE_ID, 'Das reicht nicht.')
    })
    expect(synth.gesprochen).toHaveLength(0)

    await act(async () => {
      vi.advanceTimersByTime(TON_FRIST_MS + 1)
    })

    expect(synth.gesprochen).toHaveLength(1)
    expect(result.current.art).toBe('browser')
    expect(result.current.spricht).toBe(ECHTE_ID)
  })

  it('redet nicht zweimal übereinander, wenn der ton nach der frist doch kommt', async () => {
    vi.useFakeTimers()
    const synth = mitAusgabe()
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
    await act(async () => {
      liefere?.({ status: 200, inhalt: { adresse: 'https://bucket/spaet.wav' } })
    })

    // der späte ton wird nicht mehr abgespielt ...
    expect(gespielt).not.toContain('https://bucket/spaet.wav')
    expect(synth.gesprochen).toHaveLength(1)

    // ... aber er ist gemerkt, und beim nächsten mal ist er sofort da
    act(() => result.current.halt())
    await act(async () => {
      result.current.sprich(ECHTE_ID, 'Das reicht nicht.')
    })
    expect(gespielt).toContain('https://bucket/spaet.wav')
  })

  it('nimmt die eingebaute, solange keine echte stimme eingerichtet ist', async () => {
    const synth = mitAusgabe()
    ruf.mockResolvedValueOnce({ status: 200, inhalt: { bereit: false } })

    const { result } = renderHook(() => useStimme())
    await act(async () => {})
    await act(async () => {
      result.current.sprich(ECHTE_ID, 'Das reicht nicht.')
    })

    expect(ruf).toHaveBeenCalledTimes(1)
    expect(synth.gesprochen).toHaveLength(1)
    expect(result.current.serverBereit).toBe(false)
  })
})
