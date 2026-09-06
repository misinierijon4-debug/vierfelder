import { describe, expect, it, vi } from 'vitest'
import {
  PWA_AKTIVIERUNG_FRIST_MS,
  PWA_EREIGNIS_DROSSEL_MS,
  PWA_NACHSEHEN_MS,
  PwaSteuerung,
} from './pwaSteuerung'
import type {
  PwaRegisterOptionen,
  PwaRegistrieren,
  PwaUmgebung,
} from './pwaSteuerung'

function szenario() {
  let online = true
  let sichtbar = true
  let jetzt = 1_000
  let optionen: PwaRegisterOptionen | null = null
  let intervall: (() => void) | null = null
  let timer: (() => void) | null = null
  let timerMs: number | null = null
  const fenster = new Map<string, () => void>()
  const dokument = new Map<string, () => void>()
  const neuLaden = vi.fn()
  const updateSW = vi.fn(async () => {})
  const update = vi.fn(async () => {})
  let blockiert = false

  const umgebung: PwaUmgebung = {
    online: () => online,
    sichtbar: () => sichtbar,
    jetzt: () => jetzt,
    beiFenster: (art, fn) => fenster.set(art, fn),
    ohneFenster: (art) => fenster.delete(art),
    beiDokument: (art, fn) => dokument.set(art, fn),
    ohneDokument: (art) => dokument.delete(art),
    setzeIntervall: (fn, ms) => {
      expect(ms).toBe(PWA_NACHSEHEN_MS)
      intervall = fn
      return 1
    },
    loescheIntervall: () => {
      intervall = null
    },
    setzeTimer: (fn, ms) => {
      timer = fn
      timerMs = ms
      return 2
    },
    loescheTimer: () => {
      timer = null
      timerMs = null
    },
    neuLaden,
  }
  const registrieren: PwaRegistrieren = (neu) => {
    optionen = neu
    return updateSW
  }
  const steuerung = new PwaSteuerung(umgebung, () => blockiert)
  steuerung.registriere(registrieren)

  return {
    steuerung,
    update,
    updateSW,
    neuLaden,
    optionen: () => {
      if (!optionen) throw new Error('nicht registriert')
      return optionen
    },
    registriert: () => ({ update }) as unknown as ServiceWorkerRegistration,
    setBlockiert: (wert: boolean) => { blockiert = wert },
    setOnline: (wert: boolean) => { online = wert },
    setSichtbar: (wert: boolean) => { sichtbar = wert },
    setJetzt: (wert: number) => { jetzt = wert },
    fensterEreignis: (art: 'online' | 'offline') => fenster.get(art)?.(),
    sichtbarkeitEreignis: () => dokument.get('visibilitychange')?.(),
    intervall: () => intervall?.(),
    timer: () => timer?.(),
    timerMs: () => timerMs,
    fenster,
    dokument,
  }
}

describe('PwaSteuerung', () => {
  it('aktiviert und lädt eine neue Fassung nur durch ausdrückliche, ungesperrte Aktionen', async () => {
    const s = szenario()
    s.optionen().onNeedRefresh?.()
    expect(s.steuerung.snapshot().update).toBe('bereit')

    s.setBlockiert(true)
    await expect(s.steuerung.aktiviereUpdate()).resolves.toBe(false)
    expect(s.updateSW).not.toHaveBeenCalled()

    s.setBlockiert(false)
    await expect(s.steuerung.aktiviereUpdate()).resolves.toBe(true)
    expect(s.updateSW).toHaveBeenCalledOnce()
    expect(s.updateSW).toHaveBeenCalledWith(false)
    expect(s.steuerung.snapshot().update).toBe('aktivierung')

    // Dieser Callback kann auch durch die Bestätigung in einem anderen Tab
    // kommen. Er meldet nur den Zustand und lädt nicht selbst neu.
    s.setBlockiert(true)
    s.optionen().onNeedReload?.()
    expect(s.steuerung.snapshot().update).toBe('neu-laden')
    expect(s.neuLaden).not.toHaveBeenCalled()
    expect(s.steuerung.neuLaden()).toBe(false)
    expect(s.neuLaden).not.toHaveBeenCalled()

    s.setBlockiert(false)
    expect(s.steuerung.neuLaden()).toBe(true)
    expect(s.neuLaden).toHaveBeenCalledOnce()
  })

  it('bietet nach ausbleibender Aktivierungsbestätigung einen manuellen Ausweg', async () => {
    const s = szenario()
    s.optionen().onNeedRefresh?.()

    await expect(s.steuerung.aktiviereUpdate()).resolves.toBe(true)
    expect(s.timerMs()).toBe(PWA_AKTIVIERUNG_FRIST_MS)
    s.timer()

    expect(s.steuerung.snapshot()).toMatchObject({
      update: 'neu-laden',
      fehler: 'aktivierung konnte nicht bestätigt werden.',
    })
    expect(s.neuLaden).not.toHaveBeenCalled()
  })

  it('verwirft die Aktivierungsfrist, sobald der Worker die Übernahme bestätigt', async () => {
    const s = szenario()
    s.optionen().onNeedRefresh?.()
    await s.steuerung.aktiviereUpdate()

    s.optionen().onNeedReload?.()
    expect(s.timerMs()).toBeNull()
    expect(s.steuerung.snapshot()).toMatchObject({ update: 'neu-laden', fehler: null })
  })

  it('prüft beim Sichtbarwerden und Reconnect gedrosselt und fängt Fehler ab', async () => {
    const s = szenario()
    s.optionen().onRegisteredSW?.('/sw.js', s.registriert())

    s.setJetzt(1_000 + PWA_EREIGNIS_DROSSEL_MS - 1)
    s.sichtbarkeitEreignis()
    await Promise.resolve()
    expect(s.update).not.toHaveBeenCalled()

    s.setJetzt(1_000 + PWA_EREIGNIS_DROSSEL_MS)
    s.sichtbarkeitEreignis()
    await Promise.resolve()
    expect(s.update).toHaveBeenCalledOnce()

    s.update.mockRejectedValueOnce(new Error('netz'))
    s.setJetzt(1_000 + PWA_EREIGNIS_DROSSEL_MS * 2)
    s.sichtbarkeitEreignis()
    await Promise.resolve()
    await Promise.resolve()
    expect(s.steuerung.snapshot().fehler).toBe('aktualisierung konnte nicht geprüft werden.')

    s.setOnline(false)
    s.fensterEreignis('offline')
    expect(s.steuerung.snapshot().online).toBe(false)
    await expect(s.steuerung.pruefeUpdate(true)).resolves.toBe(false)

    s.setOnline(true)
    s.setJetzt(1_000 + PWA_EREIGNIS_DROSSEL_MS * 3)
    s.fensterEreignis('online')
    await Promise.resolve()
    expect(s.steuerung.snapshot().online).toBe(true)
    expect(s.update).toHaveBeenCalledTimes(3)

    s.setSichtbar(false)
    s.setJetzt(1_000 + PWA_EREIGNIS_DROSSEL_MS * 4)
    s.intervall()
    await Promise.resolve()
    expect(s.update).toHaveBeenCalledTimes(3)
  })

  it('meldet nur die App-Oberfläche vorübergehend als offline verfügbar', () => {
    const s = szenario()
    s.optionen().onOfflineReady?.()
    expect(s.steuerung.snapshot().offlineBereit).toBe(true)
    s.timer()
    expect(s.steuerung.snapshot().offlineBereit).toBe(false)
  })

  it('räumt Browserbeobachter und Timer auf', () => {
    const s = szenario()
    s.optionen().onRegisteredSW?.('/sw.js', s.registriert())
    s.optionen().onOfflineReady?.()
    s.steuerung.zerstoere()
    expect(s.fenster.size).toBe(0)
    expect(s.dokument.size).toBe(0)
    expect(s.intervall()).toBeUndefined()
    expect(s.timer()).toBeUndefined()
  })

  it('ignoriert verspätete Registrierungs-Callbacks nach dem Abbau', () => {
    const s = szenario()
    const optionen = s.optionen()
    s.steuerung.zerstoere()

    optionen.onRegisteredSW?.('/sw.js', s.registriert())
    optionen.onOfflineReady?.()
    optionen.onNeedRefresh?.()

    expect(s.intervall()).toBeUndefined()
    expect(s.timer()).toBeUndefined()
    expect(s.steuerung.snapshot()).toMatchObject({
      offlineBereit: false,
      update: 'keins',
      pruefbar: false,
    })
  })
})
