import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Trash, X } from '@phosphor-icons/react'
import type { Fach, Note, Notenart } from '../../lib/types'
import { user } from '../../lib/types'
import { EASE } from '../../lib/motion'
import { fachSchnitt, istNotenDatum, klausurAnteil, punkteKurz } from '../../lib/noten'
import { useScrollSperre } from '../../lib/scrollsperre'
import { useNeustartBlocker } from '../../lib/pwaBlocker'
import { useDialogFokus } from '../../lib/dialogFokus'

type Props = {
  fach: Fach
  noten: Note[]
  heute: string
  onSchliessen: () => void
  onPruefungsfach: (fachId: string) => void
  onNote: (punkte: number, art: Notenart, titel: string, datum: string) => Note | null
  onNoteLoeschen: (id: string) => Note | null
  onNoteWiederherstellen: (note: Note) => boolean
}

const notenartLabel: Record<Notenart, string> = {
  klausur: 'klausur',
  epo: 'epo',
  hue: 'hü',
}

export function Fachdetail({ fach, noten, heute, onSchliessen, onPruefungsfach, onNote, onNoteLoeschen, onNoteWiederherstellen }: Props) {
  const reduced = useReducedMotion()
  const schliessen = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLElement>(null)
  const [art, setArt] = useState<Notenart>('klausur')
  const [titel, setTitel] = useState('')
  const [datum, setDatum] = useState(heute)
  const [geloeschteNote, setGeloeschteNote] = useState<Note | null>(null)
  const undoRef = useRef<HTMLButtonElement>(null)
  useNeustartBlocker(titel.length > 0 || datum !== heute || art !== 'klausur')
  const datumGueltig = istNotenDatum(datum, heute)
  const liste = noten.filter((note) => note.fachId === fach.id).sort((a, b) => b.datum.localeCompare(a.datum))
  const schnitt = fachSchnitt(noten, fach)
  const anteil = klausurAnteil(fach.kursart)
  const istPruefung = fach.pruefungsfach !== null
  const istSport = fach.name.trim().toLocaleLowerCase('de-DE') === 'sport'
  const klausuren = liste.filter((note) => note.art === 'klausur')
  const muendlich = liste.filter((note) => note.art === 'epo' || note.art === 'hue')
  // die farbe der person markiert, was gerade ausgewählt ist
  const farbe = user(fach.user).farbe
  const hinweis: Record<Notenart, string> = {
    klausur: `eine klausur zählt ${anteil}% der fachnote.`,
    epo: `eine epo zählt doppelt im mündlichen teil, also in den ${100 - anteil}%.`,
    hue: `eine hü zählt einfach im mündlichen teil, also in den ${100 - anteil}%.`,
  }

  const undoBeenden = () => {
    setGeloeschteNote(null)
    window.requestAnimationFrame(() => dialog.current?.focus())
  }

  useEffect(() => {
    if (!geloeschteNote) return
    const timer = window.setTimeout(() => {
      setGeloeschteNote(null)
      window.requestAnimationFrame(() => dialog.current?.focus())
    }, 7000)
    return () => window.clearTimeout(timer)
  }, [geloeschteNote])

  const loescheNote = (note: Note) => {
    const geloescht = onNoteLoeschen(note.id)
    if (!geloescht) return
    setGeloeschteNote(geloescht)
    window.requestAnimationFrame(() => undoRef.current?.focus())
  }

  const zeile = (note: Note) => (
    <li key={note.id} className="flex min-h-12 items-center gap-2 border-b border-linie">
      <span className="tnum w-7 text-[18px] font-semibold">{note.punkte}</span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-kreide-60">{notenartLabel[note.art]} · {note.datum}{note.titel ? ` · ${note.titel}` : ''}</span>
      <button type="button" onClick={() => loescheNote(note)} aria-label={`${notenartLabel[note.art]} vom ${note.datum}${note.titel ? `, ${note.titel}` : ''}, ${note.punkte} ${note.punkte === 1 ? 'punkt' : 'punkte'} löschen`} className="flex size-11 shrink-0 items-center justify-center text-kreide-52"><Trash size={14} /></button>
    </li>
  )

  useScrollSperre(true)
  useDialogFokus(dialog, schliessen, onSchliessen)

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.16, ease: EASE }}>
      <button type="button" tabIndex={-1} aria-hidden="true" aria-label="fach schließen" onClick={onSchliessen} className="absolute inset-0 block bg-black/55" />
      <motion.section
        ref={dialog}
        role="dialog" aria-modal="true" aria-labelledby="fachdetail-titel"
        tabIndex={-1}
        initial={reduced ? false : { y: 18 }} animate={{ y: 0 }} exit={reduced ? undefined : { y: 18 }}
        transition={{ duration: reduced ? 0 : 0.18, ease: EASE }}
        className="relative max-h-[92dvh] w-full max-w-[420px] overflow-y-auto rounded-t-[6px] border-t border-linie-hell bg-grund px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+20px)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-kreide-52">fach</p>
            <h2 id="fachdetail-titel" className="display mt-1 truncate text-[22px] font-semibold lowercase leading-none">{fach.name}</h2>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 text-[11px] text-kreide-52">
                {schnitt.gesamt === null ? 'noch keine note' : `${schnitt.gesamt.toFixed(1).replace('.', ',')} punkte · ${liste.length} noten`}
              </p>
              {(schnitt.klausur !== null || schnitt.muendlich !== null) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {schnitt.klausur !== null && (
                    <span className="text-[10px] text-kreide-52">klausur-schnitt<span className="tnum ml-1.5 text-[13px] text-kreide">{schnitt.klausur.toFixed(1).replace('.', ',')}</span></span>
                  )}
                  {schnitt.muendlich !== null && (
                    <span className="text-[10px] text-kreide-52">mündlich-schnitt<span className="tnum ml-1.5 text-[13px] text-kreide">{schnitt.muendlich.toFixed(1).replace('.', ',')}</span></span>
                  )}
                </div>
              )}
            </div>
          </div>
          <button ref={schliessen} type="button" onClick={onSchliessen} aria-label="fach schließen" className="flex size-11 shrink-0 items-center justify-center rounded-[2px] border border-linie text-kreide-60"><X size={14} weight="bold" /></button>
        </div>

        <div className="mt-4 border-y border-linie py-3">
          <p className="text-[12px]">{fach.kursart === 'lk' ? 'leistungskurs' : 'grundkurs'}</p>
          <p className="mt-1 text-[10px] text-kreide-52">{anteil}% klausur · {100 - anteil}% mündlich</p>
        </div>

        {/* vier prüfungen: die drei lk schriftlich, dazu genau ein mündlicher gk */}
        {fach.kursart === 'gk' && istSport ? (
          <p className="mt-3 text-[11px] leading-relaxed text-kreide-52">
            sport ist in der hinterlegten abiturregel nicht als viertes prüfungsfach zulässig.
          </p>
        ) : fach.kursart === 'gk' ? (
          <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
            <span className="min-w-0 text-[12px]">mündliches prüfungsfach</span>
            {istPruefung ? (
              <span
                role="status"
                aria-label={`${fach.name} ist als mündliches prüfungsfach gewählt`}
                style={{ borderColor: farbe, color: farbe }}
                className="flex min-h-11 shrink-0 items-center rounded-[2px] border bg-flaeche px-4 text-[12px] font-semibold"
              >
                gewählt
              </span>
            ) : (
              <button
                type="button"
                aria-label={`${fach.name} als mündliches prüfungsfach wählen`}
                onClick={() => onPruefungsfach(fach.id)}
                className="min-h-11 shrink-0 rounded-[2px] border border-linie px-4 text-[12px] text-kreide-52 transition-colors"
              >
                wählen
              </button>
            )}
          </div>
        ) : <p className="mt-3 text-[11px] text-kreide-52">leistungskurse sind schriftliche prüfungsfächer.</p>}

        <section aria-labelledby="neue-note" className="mt-6 border-t border-linie pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 id="neue-note" className="display text-[18px] font-semibold">note eintragen</h3>
            <label htmlFor="note-datum" className="sr-only">datum der note</label>
            <input id="note-datum" type="date" value={datum} max={heute} aria-invalid={!datumGueltig} onChange={(e) => setDatum(e.currentTarget.value)} className="tnum min-h-11 shrink-0 rounded-[2px] border border-linie bg-flaeche px-3 text-[12px] outline-none" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="notenart">
            {(['klausur', 'epo', 'hue'] as Notenart[]).map((wert) => {
              const gewaehlt = art === wert
              return (
                <button key={wert} type="button" aria-pressed={gewaehlt} onClick={() => setArt(wert)}
                  style={gewaehlt ? { borderColor: farbe, color: farbe } : undefined}
                  className={`min-h-11 rounded-[2px] border text-[12px] transition-colors ${gewaehlt ? 'bg-flaeche font-semibold' : 'border-linie text-kreide-52'}`}
                >{notenartLabel[wert]}</button>
              )
            })}
          </div>
          <p className="mt-2 text-[10px] text-kreide-52">{hinweis[art]}</p>
          <input value={titel} maxLength={40} onChange={(e) => setTitel(e.currentTarget.value.toLocaleLowerCase('de-DE'))} placeholder="titel optional" aria-label="titel der note" className="mt-2 min-h-11 w-full rounded-[2px] border border-linie bg-flaeche px-3 text-[12px] outline-none placeholder:text-kreide-52" />
          <div className="mt-2 grid grid-cols-2 gap-1 min-[280px]:grid-cols-4" aria-label="notenpunkte">
            {Array.from({ length: 16 }, (_, i) => 15 - i).map((punkte) => <button key={punkte} type="button" disabled={!datumGueltig} onClick={() => { if (onNote(punkte, art, titel, datum)) setTitel('') }} aria-label={`${punkte} ${punkte === 1 ? 'punkt' : 'punkte'}, ${punkteKurz(punkte)}`} className="flex min-h-11 min-w-0 flex-col items-center justify-center rounded-[2px] border border-linie bg-flaeche disabled:opacity-35 active:scale-[0.98]"><span className="tnum text-[14px] font-semibold">{punkte}</span><span className="text-[8px] text-kreide-52">{punkteKurz(punkte)}</span></button>)}
          </div>
          <p className="mt-2 text-[10px] text-kreide-52">tippen trägt sofort ein. kein speichern nötig.</p>
        </section>

        <section aria-labelledby="notenliste" className="mt-6 border-t border-linie pt-4">
          <h3 id="notenliste" className="display text-[18px] font-semibold">eingetragen</h3>
          <div className="mt-3">
            <h4 className="text-[10px] text-kreide-52">klausuren</h4>
            {klausuren.length === 0 ? <p className="mt-2 pb-1 text-[12px] text-kreide-52">noch keine</p> : <ul className="mt-1">{klausuren.map(zeile)}</ul>}
            <h4 className="mt-4 text-[10px] text-kreide-52">mündlich (epo + hü)</h4>
            {muendlich.length === 0 ? <p className="mt-2 pb-1 text-[12px] text-kreide-52">noch keine</p> : <ul className="mt-1">{muendlich.map(zeile)}</ul>}
          </div>
        </section>

        {geloeschteNote && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-[calc(env(safe-area-inset-bottom)+12px+var(--pwa-status-reserve,0px))] left-1/2 z-[60] flex min-h-12 w-[calc(100%_-_24px)] max-w-[396px] -translate-x-1/2 items-center justify-between gap-3 border border-linie-hell bg-grund px-3 text-[12px]"
          >
            <span>note gelöscht</span>
            <button
              ref={undoRef}
              type="button"
              onClick={() => {
                if (onNoteWiederherstellen(geloeschteNote)) undoBeenden()
              }}
              className="min-h-11 px-2 font-semibold underline decoration-linie-hell underline-offset-4"
            >
              rückgängig
            </button>
          </div>
        )}
      </motion.section>
    </motion.div>
  )
}
