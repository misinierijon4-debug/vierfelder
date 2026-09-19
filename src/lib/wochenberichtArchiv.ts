import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { baueWochenbericht, wochenMontag } from './wochenbericht'
import type { Wochenbericht } from './wochenbericht'
import type { Schlafnacht, Zustand } from './types'
import { pruefeWochenberichtText } from './wochenberichtTexte'
import type { WochenberichtTexte } from './wochenberichtTexte'

type Archiv = {
  woche: string
  daten: { zustand: Zustand; naechte: Schlafnacht[] }
  eingefroren: string
  quelle: 'montag' | 'nachgeholt' | 'lokal'
  texte: WochenberichtTexte | null
  modell: string | null
  text_erstellt: string | null
}
export type BerichtStand = {
  woche: string
  bericht: Wochenbericht | null
  texte: WochenberichtTexte | null
  status: 'aus' | 'laedt' | 'fehlt' | 'da' | 'offen'
  hinweis: string | null
}

/** Ein lokales Archiv wird erst nach vollstaendigem Laden des Zustands erstellt. */
export function lokalesBerichtArchiv(woche: string, zustand: Zustand, naechte: Schlafnacht[], speicher: Storage): Archiv {
  const key = `zweikampf:wochenbericht:v1:${woche}`
  const vorhanden = speicher.getItem(key)
  if (vorhanden) {
    try {
      const archiv = JSON.parse(vorhanden) as Archiv
      if (archiv.woche === woche && archiv.daten?.zustand && Array.isArray(archiv.daten.naechte)) return archiv
    } catch { /* beschaedigtes lokales archiv neu sichern */ }
  }
  const archiv: Archiv = { woche, daten: structuredClone({ zustand, naechte }),
    eingefroren: new Date().toISOString(), quelle: 'lokal', texte: null, modell: null, text_erstellt: null }
  speicher.setItem(key, JSON.stringify(archiv))
  return archiv
}

export function useWochenberichtArchiv(woche: string | null, zustand: Zustand, naechte: Schlafnacht[], heute: string, lokal: boolean, bereit: boolean) {
  const [stand, setStand] = useState<BerichtStand | null>(null)
  const [versuch, setVersuch] = useState(0)
  useEffect(() => {
    if (!woche || !bereit || woche >= wochenMontag(heute)) return
    let aktiv = true
    const controller = new AbortController()
    let archivStand: BerichtStand = { woche, bericht: null, texte: null, status: lokal ? 'aus' : 'laedt', hinweis: 'archiv wird geladen …' }
    setStand(archivStand)
    const uebernehmen = (archiv: Archiv) => {
      if (archiv.woche !== woche || !archiv.daten?.zustand || !Array.isArray(archiv.daten.naechte)) throw new Error('archiv ungueltig')
      const text = pruefeWochenberichtText({ woche, texte: archiv.texte, erstellt: archiv.text_erstellt, modell: archiv.modell })
      archivStand = { woche, bericht: baueWochenbericht(woche, archiv.daten.zustand, archiv.daten.naechte, heute),
        texte: text?.texte ?? null, status: lokal ? 'aus' : text ? 'da' : 'laedt',
        hinweis: archiv.quelle === 'montag' ? 'am montag eingefroren' : archiv.quelle === 'lokal'
          ? 'auf diesem gerät gesichert' : 'nachträglich gesichert' }
      if (aktiv) setStand(archivStand)
      return Boolean(text)
    }
    const laden = async () => {
      if (lokal) { uebernehmen(lokalesBerichtArchiv(woche, zustand, naechte, localStorage)); return }
      if (!supabase) throw new Error('verbindung fehlt')
      const aufruf = async (aktion: 'laden' | 'text') => {
        const { data, error } = await supabase!.functions.invoke('wochenbericht', {
          body: { woche, aktion }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55_000)]),
        })
        if (error) throw error
        return data as Archiv
      }
      if (uebernehmen(await aufruf('laden')) || !aktiv) return
      uebernehmen(await aufruf('text'))
      if (aktiv) setStand({ ...archivStand, status: archivStand.texte ? 'da' : 'fehlt' })
    }
    void laden().catch(() => {
      if (aktiv) setStand({ ...archivStand, status: lokal ? 'aus' : 'fehlt',
        hinweis: archivStand.bericht ? archivStand.hinweis : 'archiv nicht erreichbar · aktueller datenstand' })
    })
    return () => { aktiv = false; controller.abort() }
    // Rohdaten sind nur beim ersten vollstaendig geladenen lokalen Archiv relevant.
    // Realtime-Aenderungen duerfen ein geoeffnetes Archiv weder ersetzen noch neu anfordern.
  }, [woche, heute, lokal, bereit, versuch])
  const abgeschlossen = Boolean(woche && woche < wochenMontag(heute))
  const aktuell = stand?.woche === woche && abgeschlossen ? stand : null
  return { bericht: aktuell?.bericht ?? null, texte: aktuell?.texte ?? null,
    status: abgeschlossen ? aktuell?.status ?? (lokal ? 'aus' : 'laedt') : lokal ? 'aus' : 'offen',
    hinweis: abgeschlossen ? aktuell?.hinweis ?? 'archiv wird geladen …' : null,
    erneut: () => setVersuch(v => v + 1) } as const
}
