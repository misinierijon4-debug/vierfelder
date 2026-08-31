-- Deckt den Fremdschluessel ab und vermeidet einen sequentiellen Scan, wenn
-- ein Profil in der Zukunft entfernt oder seine Wettzeilen geprüft werden.
create index if not exists duell_wetten_updated_by_idx
  on public.duell_wetten (updated_by);
