import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import type { Note, Notenart, Notenstand, UserId } from '../../lib/types'
import { NotenKopf } from './NotenKopf'
import { Fachzeile } from './Fachzeile'
import { Fachdetail } from './Fachdetail'
import { NotenVergleich } from './NotenVergleich'

type Props = {
  stand: Notenstand
  me: UserId
  heute: string
  onPruefungsfach: (fachId: string, nummer: number | null) => void
  onNote: (fachId: string, punkte: number, art: Notenart, datum: string, titel?: string) => Note | null
  onNoteLoeschen: (id: string) => void
}

export function NotenTab({ stand, me, heute, onPruefungsfach, onNote, onNoteLoeschen }: Props) {
  const [offen, setOffen] = useState<string | null>(null)
  const faecher = stand.faecher.filter((fach) => fach.user === me).sort((a, b) => a.sortierung - b.sortierung || a.name.localeCompare(b.name, 'de'))
  const detail = offen ? stand.faecher.find((fach) => fach.id === offen) ?? null : null
  return (
    <div>
      <NotenKopf stand={stand} me={me} />
      <section aria-labelledby="faecher-titel" className="mt-5">
        <h2 id="faecher-titel" className="display text-[18px] font-semibold">deine fächer</h2>
        {faecher.length === 0 ? <p className="mt-3 text-[12px] text-kreide-52">keine fächer geladen</p> : <ul className="mt-2 border-t border-linie">{faecher.map((fach) => <Fachzeile key={fach.id} fach={fach} noten={stand.noten} onOeffnen={() => setOffen(fach.id)} />)}</ul>}
      </section>
      <NotenVergleich stand={stand} me={me} />
      <AnimatePresence>{detail && <Fachdetail key={detail.id} fach={detail} noten={stand.noten} heute={heute} onSchliessen={() => setOffen(null)} onPruefungsfach={onPruefungsfach} onNote={(punkte, art, titel) => { onNote(detail.id, punkte, art, heute, titel) }} onNoteLoeschen={onNoteLoeschen} />}</AnimatePresence>
    </div>
  )
}
