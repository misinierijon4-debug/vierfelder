import { describe, expect, it } from 'vitest'
import { eniSystemPrompt } from '../../supabase/functions/_shared/eniCharakter'

describe('ENIs Moduswahl', () => {
  const system = eniSystemPrompt({
    person: 'erijon',
    lage: 'LAGE. Wochenstand (Erijon : Koray): 2:4.',
  })

  it('setzt Alltag und Wissen als Standard, obwohl eine Duelllage beiliegt', () => {
    expect(system).toContain('ALLTAG UND WISSEN ist der Standard')
    expect(system).toContain('Die blosse Anwesenheit dieser LAGE aktiviert')
    expect(system).toContain('Diese Information allein aktiviert den Duellmodus nicht')
  })

  it('verbietet den ungefragten Sprung von Sachfragen zu Punkten oder Gym', () => {
    expect(system).toContain('Unterstelle niemals, eine normale Frage sei eine Ausrede')
    expect(system).toContain('Haenge keine Coach-Frage und keinen Vorwurf')
    expect(system).toContain('frage nicht nach einer Gym-Einheit')
  })

  it('aktiviert den Trainer nur bei echtem Duellbezug und schützt Sorgen', () => {
    expect(system).toContain('DUELL UND COACHING gilt nur')
    expect(system).toContain('FUERSORGE gilt bei Sorgen')
    expect(system).toContain('Bei Mehrdeutigkeit gilt ALLTAG UND WISSEN')
  })

  it('setzt die Moduswahl auch hinter dynamischen Kontext', () => {
    const mitKontext = eniSystemPrompt({
      person: 'koray',
      lage: 'LAGE.',
      zusatz: ['PERSOENLICHER KONTEXT', 'GEFUNDENE AUSZUEGE'],
    })

    expect(mitKontext.indexOf('PERSOENLICHER KONTEXT')).toBeLessThan(
      mitKontext.indexOf('MODUSWAHL FUER JEDE NEUE NACHRICHT')
    )
    expect(mitKontext.indexOf('GEFUNDENE AUSZUEGE')).toBeLessThan(
      mitKontext.indexOf('MODUSWAHL FUER JEDE NEUE NACHRICHT')
    )
  })
})
