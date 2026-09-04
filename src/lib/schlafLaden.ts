import type { Schlafnacht, UserId } from './types'

export type PhasenLadezustand =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded' }
  | { status: 'empty' }
  | { status: 'error'; text: string }

export type PhasenTransportzustand = Extract<
  PhasenLadezustand,
  { status: 'loading' | 'error' }
>

export function phasenLadeKey(user: UserId, nacht: string): string {
  return `${user}|${nacht}`
}

/**
 * `phasen` bleibt die fachliche Wahrheit. Der Transportzustand beschreibt nur
 * einen laufenden oder fehlgeschlagenen Abruf und kann deshalb einen bereits
 * erfolgreich geladenen Verlauf nicht wieder zu "loading" machen.
 */
export function phasenLadezustand(
  nacht: Schlafnacht,
  transport?: PhasenTransportzustand
): PhasenLadezustand {
  if (nacht.phasen !== null) {
    return { status: nacht.phasen.length > 0 ? 'loaded' : 'empty' }
  }
  return transport ?? { status: 'idle' }
}
