import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { hatNeustartBlocker } from './pwaBlocker'
import { PwaSteuerung } from './pwaSteuerung'
import type { PwaRegistrieren, PwaUmgebung } from './pwaSteuerung'

const umgebung: PwaUmgebung = {
  online: () => navigator.onLine,
  sichtbar: () => document.visibilityState === 'visible',
  jetzt: () => Date.now(),
  beiFenster: (art, fn) => window.addEventListener(art, fn),
  ohneFenster: (art, fn) => window.removeEventListener(art, fn),
  beiDokument: (art, fn) => document.addEventListener(art, fn),
  ohneDokument: (art, fn) => document.removeEventListener(art, fn),
  setzeIntervall: (fn, ms) => window.setInterval(fn, ms),
  loescheIntervall: (id) => window.clearInterval(id),
  setzeTimer: (fn, ms) => window.setTimeout(fn, ms),
  loescheTimer: (id) => window.clearTimeout(id),
  neuLaden: () => window.location.reload(),
}

const steuerung = new PwaSteuerung(umgebung, hatNeustartBlocker)

export function registrierePwa() {
  steuerung.registriere(registerSW as PwaRegistrieren)
}

export function usePwaStand() {
  return useSyncExternalStore(steuerung.abonnieren, steuerung.snapshot, steuerung.snapshot)
}

export const aktivierePwaUpdate = () => steuerung.aktiviereUpdate()
export const pruefePwaUpdate = () => steuerung.pruefeUpdate(true)
export const ladePwaNeu = () => steuerung.neuLaden()
