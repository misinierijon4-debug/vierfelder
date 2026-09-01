import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Minus, Plus, Trash, X } from '@phosphor-icons/react'
import type { Fach, Note, Notenart } from '../../lib/types'
import { EASE } from '../../lib/motion'
import { fachSchnitt, punkteKurz } from '../../lib/noten'
import { Schritt } from '../Schritt'

type Props = {
  fach: Fach
  noten: Note[]
  heute: string
  onSchliessen: () => void
  onFach: (fach: Fach) => void
  onFachLoeschen: (id: string) => void
  onNote: (punkte: number, art: Notenart, titel: string) => void
  onNoteAendern: (note: Note) => void
  onNoteLoeschen: (id: string) => void
}

export function Fachdetail({ fach, noten, heute, onSchliessen, onFach, onFachLoeschen, onNote, onNoteAendern, onNoteLoeschen }: Props) {
  const reduced = useReducedMotion()
  const schliessen = useRef<HTMLButtonElement>(null)
  const [name, setName] = useState(fach.name)
  const [art, setArt] = useState<Notenart>('klausur')
  const [titel, setTitel] = useState('')
  const [loeschen, setLoeschen] = useState(false)
  const liste = noten.filter((note) => note.fachId === fach.id).sort((a, b) => b.datum.localeCompare(a.datum))
  const schnitt = fachSchnitt(noten, fach)

  useEffect(() => {
    schliessen.current?.focus()
    const taste = (e: KeyboardEvent) => e.key === 'Escape' && onSchliessen()
    document.addEventListener('keydown', taste)
    return () => document.removeEventListener('keydown', taste)
  }, [onSchliessen])

  const speichereName = () => {
    const sauber = name.trim().toLocaleLowerCase('de-DE')
    if (!sauber) setName(fach.name)
    else if (sauber !== fach.name) onFach({ ...fach, name: sauber })
  }

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.16, ease: EASE }}>
      <button type="button" aria-label="fach schließen" onClick={onSchliessen} className="absolute inset-0 block bg-black/55" />
      <motion.section
        role="dialog" aria-modal="true" aria-labelledby="fachdetail-titel"
        initial={reduced ? false : { y: 18 }} animate={{ y: 0 }} exit={reduced ? undefined : { y: 18 }}
        transition={{ duration: reduced ? 0 : 0.18, ease: EASE }}
        className="relative max-h-[92dvh] w-full max-w-[420px] overflow-y-auto rounded-t-[6px] border-t border-linie-hell bg-grund px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+20px)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-kreide-52">fach</p>
            <input id="fachdetail-titel" value={name} maxLength={24} onChange={(e) => setName(e.currentTarget.value.toLocaleLowerCase('de-DE'))} onBlur={speichereName} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="display mt-1 w-full bg-transparent text-[22px] font-semibold lowercase leading-none outline-none" aria-label="fachname" />
            <p className="mt-1.5 text-[11px] text-kreide-52">
              {schnitt.gesamt === null ? 'noch keine note' : `${schnitt.gesamt.toFixed(1).replace('.', ',')} punkte · ${liste.length} noten`}
            </p>
          </div>
          <button ref={schliessen} type="button" onClick={onSchliessen} aria-label="fach schließen" className="flex size-11 shrink-0 items-center justify-center rounded-[2px] border border-linie text-kreide-60"><X size={14} weight="bold" /></button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="kursart">
          {(['lf', 'gf'] as const).map((kursart) => <button key={kursart} type="button" aria-pressed={fach.kursart === kursart} onClick={() => onFach({ ...fach, kursart })} className={`min-h-11 rounded-[2px] border text-[12px] ${fach.kursart === kursart ? 'border-linie-hell bg-flaeche text-kreide' : 'border-linie text-kreide-52'}`}>{kursart === 'lf' ? 'leistungsfach' : 'grundfach'}</button>)}
        </div>

        <div className="mt-4 flex min-h-11 items-center justify-between border-y border-linie py-2">
          <div><p className="text-[12px]">klausuranteil</p><p className="text-[10px] text-kreide-52">rest mündlich</p></div>
          <div className="flex items-center gap-2">
            <Schritt label="klausuranteil verringern" disabled={fach.klausurAnteil <= 0} onClick={() => onFach({ ...fach, klausurAnteil: fach.klausurAnteil - 5 })}><Minus size={11} weight="bold" /></Schritt>
            <span className="tnum w-10 text-center text-[13px]">{fach.klausurAnteil}%</span>
            <Schritt label="klausuranteil erhöhen" disabled={fach.klausurAnteil >= 100} onClick={() => onFach({ ...fach, klausurAnteil: fach.klausurAnteil + 5 })}><Plus size={11} weight="bold" /></Schritt>
          </div>
        </div>

        {fach.kursart === 'gf' ? (
          <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
            <span className="text-[12px]">prüfungsfach</span>
            <div className="flex gap-1" role="group" aria-label="prüfungsfach">
              {[null, 4, 5].map((nr) => <button key={nr ?? 'kein'} type="button" aria-pressed={fach.pruefungsfach === nr} onClick={() => onFach({ ...fach, pruefungsfach: nr })} className={`flex size-11 items-center justify-center rounded-[2px] border text-[12px] ${fach.pruefungsfach === nr ? 'border-linie-hell bg-flaeche' : 'border-linie text-kreide-52'}`}>{nr ?? '–'}</button>)}
            </div>
          </div>
        ) : <p className="mt-3 text-[11px] text-kreide-52">leistungsfächer sind schriftliche prüfungsfächer.</p>}

        <section aria-labelledby="neue-note" className="mt-6 border-t border-linie pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 id="neue-note" className="display text-[18px] font-semibold">note eintragen</h3>
            <span className="tnum text-[10px] text-kreide-52">{heute}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="notenart">
            {(['klausur', 'muendlich'] as Notenart[]).map((wert) => <button key={wert} type="button" aria-pressed={art === wert} onClick={() => setArt(wert)} className={`min-h-11 rounded-[2px] border text-[12px] ${art === wert ? 'border-linie-hell bg-flaeche' : 'border-linie text-kreide-52'}`}>{wert === 'muendlich' ? 'mündlich' : wert}</button>)}
          </div>
          <input value={titel} maxLength={40} onChange={(e) => setTitel(e.currentTarget.value.toLocaleLowerCase('de-DE'))} placeholder="titel optional" aria-label="titel der note" className="mt-2 min-h-11 w-full rounded-[2px] border border-linie bg-flaeche px-3 text-[12px] outline-none placeholder:text-kreide-52" />
          <div className="mt-2 grid grid-cols-4 gap-1" aria-label="notenpunkte">
            {Array.from({ length: 16 }, (_, i) => 15 - i).map((punkte) => <button key={punkte} type="button" onClick={() => { onNote(punkte, art, titel); setTitel('') }} aria-label={`${punkte} ${punkte === 1 ? 'punkt' : 'punkte'}, ${punkteKurz(punkte)}`} className="flex min-h-11 min-w-0 flex-col items-center justify-center rounded-[2px] border border-linie bg-flaeche active:scale-[0.98]"><span className="tnum text-[14px] font-semibold">{punkte}</span><span className="text-[8px] text-kreide-52">{punkteKurz(punkte)}</span></button>)}
          </div>
          <p className="mt-2 text-[10px] text-kreide-52">tippen trägt sofort ein. kein speichern nötig.</p>
        </section>

        <section aria-labelledby="notenliste" className="mt-6 border-t border-linie pt-4">
          <h3 id="notenliste" className="display text-[18px] font-semibold">eingetragen</h3>
          {liste.length === 0 ? <p className="mt-3 text-[12px] text-kreide-52">noch keine note</p> : <ul className="mt-2">{liste.map((note) => <li key={note.id} className="flex min-h-12 items-center gap-2 border-b border-linie"><span className="tnum w-7 text-[18px] font-semibold">{note.punkte}</span><span className="min-w-0 flex-1 truncate text-[11px] text-kreide-60">{note.art === 'muendlich' ? 'mündlich' : 'klausur'} · {note.datum}{note.titel ? ` · ${note.titel}` : ''}</span><button type="button" onClick={() => onNoteAendern({ ...note, gewicht: note.gewicht === 10 ? 20 : 10 })} aria-label={`${note.punkte} ${note.punkte === 1 ? 'punkt' : 'punkte'} ${note.gewicht === 10 ? 'doppelt' : 'einfach'} gewichten`} className="tnum flex size-11 shrink-0 items-center justify-center text-[11px] text-kreide-52">{note.gewicht / 10}×</button><button type="button" onClick={() => onNoteLoeschen(note.id)} aria-label={`${note.punkte} ${note.punkte === 1 ? 'punkt' : 'punkte'} löschen`} className="flex size-11 shrink-0 items-center justify-center text-kreide-52"><Trash size={14} /></button></li>)}</ul>}
        </section>

        <div className="mt-6 border-t border-linie pt-4">
          {loeschen ? <div className="flex items-center justify-between gap-3"><span className="text-[11px] text-kreide-52">fach und alle noten löschen?</span><button type="button" onClick={() => { onFachLoeschen(fach.id); onSchliessen() }} className="min-h-11 px-3 text-[12px] underline decoration-linie-hell underline-offset-4">wirklich löschen</button></div> : <button type="button" onClick={() => setLoeschen(true)} className="min-h-11 text-[12px] text-kreide-52 underline decoration-linie underline-offset-4">fach löschen</button>}
        </div>
      </motion.section>
    </motion.div>
  )
}
