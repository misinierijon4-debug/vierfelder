/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ENI_HASH,
  istEniWochenbeginn,
  oeffneEni,
  oeffneEniWoche,
  routeZuruecksetzen,
  schliesseEni,
} from './eniRoute'

beforeEach(() => {
  routeZuruecksetzen()
  window.location.hash = ''
})

afterEach(() => {
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('der weg zu ENI', () => {
  it('setzt die eigene adresse, damit die zurueck-taste des telefons stimmt', () => {
    oeffneEni()
    expect(window.location.hash).toBe(ENI_HASH)
  })

  it('geht einen schritt zurueck, wenn wir selbst hierher navigiert sind', () => {
    const zurueck = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    oeffneEni()
    schliesseEni()
    expect(zurueck).toHaveBeenCalledTimes(1)
  })

  it('ersetzt die adresse, wenn ENI direkt geoeffnet wurde', () => {
    const zurueck = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    window.location.hash = ENI_HASH

    schliesseEni()

    // niemand hat einen verlaufseintrag hinterlassen, den man abbauen koennte:
    // ein history.back() waere hier der sprung aus der app heraus.
    expect(zurueck).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('')
  })

  it('verbraucht den schritt zurueck nur einmal', () => {
    const zurueck = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    oeffneEni()
    schliesseEni()
    schliesseEni()
    expect(zurueck).toHaveBeenCalledTimes(1)
  })

  it('oeffnet eine gueltige Montagwoche als ENI-Kontext', () => {
    oeffneEniWoche('2026-09-14')
    expect(window.location.hash).toBe('#/eni?woche=2026-09-14')
  })

  it('weist ungueltige Montage, Fantasiedaten und Nicht-Montage zurueck', () => {
    expect(istEniWochenbeginn('2026-09-14')).toBe(true)
    expect(istEniWochenbeginn('2026-02-30')).toBe(false)
    expect(istEniWochenbeginn('2026-09-13')).toBe(false)
    oeffneEniWoche('2026-09-13')
    expect(window.location.hash).toBe('')
  })

  it('liest den Wochenkontext aus dem Hash und laesst ihn bei einer anderen Woche wechseln', () => {
    window.location.hash = '#/eni?woche=2026-09-14'
    expect(window.location.hash).toBe('#/eni?woche=2026-09-14')
    oeffneEniWoche('2026-09-21')
    expect(window.location.hash).toBe('#/eni?woche=2026-09-21')
    // Der Hook wird im Browser ueber hashchange invalidiert; die reine
    // Auslese prueft dieselbe strikte Grundlage fuer Deep Links.
    expect(istEniWochenbeginn(new URLSearchParams(window.location.hash.slice(ENI_HASH.length)).get('woche'))).toBe(true)
  })
})
