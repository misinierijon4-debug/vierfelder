import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Plus } from '@phosphor-icons/react'
import type { Fach, Note, Notenart, Notenstand, UserId } from '../../lib/types'
import { NotenKopf } from './NotenKopf'
import { Fachzeile } from './Fachzeile'
import { Fachdetail } from './Fachdetail'
import { NotenVergleich } from './NotenVergleich'

type Props = {
  stand: Notenstand
  me: UserId
  heute: string
  onFachHinzu: (name: string) => Fach | null
  onFach: (fach: Fach) => void
  onFachLoeschen: (id: string) => void
  onNote: (fachId: string, punkte: number, art: Notenart, datum: string, titel?: string) => Note | null
  onNoteAendern: (note: Note) => void
  onNoteLoeschen: (id: string) => void
}

export function NotenTab({ stand, me, heute, onFachHinzu, onFach, onFachLoeschen, onNote, onNoteAendern, onNoteLoeschen }: Props) {
  const [offen, setOffen] = useState<string | null>(null)
  const [neuesFach, setNeuesFach] = useState<string | null>(null)
  const faecher = stand.faecher.filter((fach) => fach.user === me).sort((a, b) => a.sortierung - b.sortierung || a.name.localeCompare(b.name, 'de'))
  const detail = offen ? stand.faecher.find((fach) => fach.id === offen) ?? null : null
  const anlegen = () => {
    if (neuesFach === null) return
    const fach = onFachHinzu(neuesFach)
    if (fach) { setNeuesFach(null); setOffen(fach.id) }
  }
  return (
    <div>
      <NotenKopf stand={stand} me={me} />
      <section aria-labelledby="faecher-titel" className="mt-5">
        <h2 id="faecher-titel" className="display text-[18px] font-semibold">deine fächer</h2>
        {faecher.length === 0 ? <p className="mt-3 text-[12px] text-kreide-52">noch kein fach angelegt</p> : <ul className="mt-2 border-t border-linie">{faecher.map((fach) => <Fachzeile key={fach.id} fach={fach} noten={stand.noten} onOeffnen={() => setOffen(fach.id)} />)}</ul>}
        {neuesFach === null ? <button type="button" onClick={() => setNeuesFach('')} className="mt-2 flex min-h-11 items-center gap-2 text-[12px] text-kreide-60"><Plus size={13} weight="bold" />fach</button> : <div className="mt-2 flex items-center gap-2"><input autoFocus value={neuesFach} maxLength={24} onChange={(e) => setNeuesFach(e.currentTarget.value.toLocaleLowerCase('de-DE'))} onKeyDown={(e) => { if (e.key === 'Enter') anlegen(); if (e.key === 'Escape') setNeuesFach(null) }} placeholder="fachname" aria-label="neues fach" className="min-h-11 min-w-0 flex-1 rounded-[2px] border border-linie bg-flaeche px-3 text-[12px] outline-none placeholder:text-kreide-52" /><button type="button" onClick={anlegen} className="min-h-11 px-2 text-[12px] underline decoration-linie-hell underline-offset-4">anlegen</button></div>}
      </section>
      <NotenVergleich stand={stand} me={me} />
      <AnimatePresence>{detail && <Fachdetail key={detail.id} fach={detail} noten={stand.noten} heute={heute} onSchliessen={() => setOffen(null)} onFach={onFach} onFachLoeschen={onFachLoeschen} onNote={(punkte, art, titel) => { onNote(detail.id, punkte, art, heute, titel) }} onNoteAendern={onNoteAendern} onNoteLoeschen={onNoteLoeschen} />}</AnimatePresence>
    </div>
  )
}
