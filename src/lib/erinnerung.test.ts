import { describe, expect, it } from 'vitest'
import { istFaellig, lokaleMinute } from '../../supabase/functions/_shared/erinnerung'
import { istErlaubteErinnerungszeit } from './erinnerung'

describe('gewicht-erinnerung: deutsche ortszeit', () => {
  it('rechnet winterzeit als UTC plus eins', () => {
    expect(lokaleMinute(new Date('2026-01-14T19:00:00Z'))).toEqual({
      tag: '2026-01-14',
      minute: '20:00',
    })
  })

  it('rechnet sommerzeit als UTC plus zwei', () => {
    expect(lokaleMinute(new Date('2026-09-02T18:00:00Z'))).toEqual({
      tag: '2026-09-02',
      minute: '20:00',
    })
  })

  it('nimmt den deutschen kalendertag und nicht den UTC-tag', () => {
    expect(lokaleMinute(new Date('2026-09-02T22:30:00Z'))).toEqual({
      tag: '2026-09-03',
      minute: '00:30',
    })
  })
})

describe('gewicht-erinnerung: faelligkeit', () => {
  it('ist ab der persoenlichen minute faellig', () => {
    expect(istFaellig('19:59', '20:00:00')).toBe(false)
    expect(istFaellig('20:00', '20:00:00')).toBe(true)
    expect(istFaellig('20:47', '20:00:00')).toBe(true)
  })

  it('schickt ab 22 uhr nichts mehr nach', () => {
    expect(istFaellig('21:59', '20:00')).toBe(true)
    expect(istFaellig('22:00', '20:00')).toBe(false)
    expect(istFaellig('23:30', '20:00')).toBe(false)
  })
})

describe('persoenliche uhrzeit', () => {
  it('erlaubt die zeit vor der nachtruhe', () => {
    expect(istErlaubteErinnerungszeit('06:00')).toBe(true)
    expect(istErlaubteErinnerungszeit('20:00')).toBe(true)
    expect(istErlaubteErinnerungszeit('21:59')).toBe(true)
  })

  it('weist ungueltige und spaete zeiten ab', () => {
    expect(istErlaubteErinnerungszeit('05:59')).toBe(false)
    expect(istErlaubteErinnerungszeit('22:00')).toBe(false)
    expect(istErlaubteErinnerungszeit('8:00')).toBe(false)
  })
})
