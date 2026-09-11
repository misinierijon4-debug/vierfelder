import { describe, expect, it, vi } from 'vitest'
import { audioWarteschlange } from './eniAudioStrom'
describe('PCM playback queue', () => {
  it('ordnet geteilte Samples zeitlich und stoppt alle geplanten Quellen', () => {
    const quellen: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null; playbackRate: { value: number }; buffer?: unknown }> = []
    const samples: Float32Array[] = []
    const ctx = {
      currentTime: 1,
      destination: {},
      createBuffer: (_: number, anzahl: number, rate: number) => {
        const werte = new Float32Array(anzahl)
        samples.push(werte)
        return { duration: anzahl / rate, getChannelData: () => werte }
      },
      createBufferSource: () => {
        const q = { start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), onended: null, playbackRate: { value: 1 } }
        quellen.push(q)
        return q
      },
    } as unknown as AudioContext
    const fertig = vi.fn()
    const queue = audioWarteschlange(ctx, fertig)
    queue.anhaengen(btoa(String.fromCharCode(0)))
    expect(quellen).toHaveLength(0)
    queue.anhaengen(btoa(String.fromCharCode(64, 0, 128)))
    expect(Array.from(samples[0]!)).toEqual([0.5, -1])
    queue.anhaengen(btoa(String.fromCharCode(0, 0)))
    expect(quellen[1]!.start.mock.calls[0]![0]).toBeGreaterThan(quellen[0]!.start.mock.calls[0]![0])
    queue.halt()
    expect(quellen.every((q) => q.stop.mock.calls.length === 1)).toBe(true)
    expect(fertig).not.toHaveBeenCalled()
  })
})
