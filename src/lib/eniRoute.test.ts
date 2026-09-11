/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ENI_HASH, oeffneEni, routeZuruecksetzen, schliesseEni } from './eniRoute'

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
})
