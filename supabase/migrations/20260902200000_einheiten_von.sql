-- die durchführungszeit einer einheit. erfasst bleibt der zeitpunkt der
-- eintragung; von traegt die zeit der durchführung selbst, soweit sie der
-- nutzer kennt. altbestand und messungen haben keinen von.
alter table public.einheiten
  add column if not exists von timestamptz;

create index if not exists einheiten_von_idx
  on public.einheiten (user_id, von);
