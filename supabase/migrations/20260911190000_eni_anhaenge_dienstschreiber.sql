-- Wer die Anhaenge schreibt, und warum nicht der Client.
--
-- `eni_anhaenge` gibt `authenticated` bewusst kein Insert: was ENI gesehen hat,
-- soll kein Client nachtraeglich behaupten koennen. Die Regel war richtig — nur
-- stand die Edge Function auf derselben Seite von ihr. Sie laeuft mit dem Token
-- des Aufrufers und damit unter genau der Rolle, der das Insert verwehrt ist.
-- Jedes Foto endete deshalb mit
--
--   42501: permission denied for table eni_anhaenge
--
-- und ENI bekam es nie zu sehen. Es fehlte nicht die Erlaubnis fuer den Client,
-- sondern ein Schreiber, der ueber ihr steht.
--
-- Der Schreiber ist service_role; die Function nimmt dafuer einen eigenen
-- Klienten und ausschliesslich fuer dieses eine Insert (siehe
-- `dienstDatenbank` in supabase/functions/_shared/eniModell.ts). Diese Rechte
-- hat die Rolle in Supabase schon von Haus aus. Hier stehen sie trotzdem
-- ausdruecklich: eine Absicht, die nur in einer Voreinstellung lebt, ist beim
-- naechsten `db reset` eine Annahme und keine Zusage.
grant insert on table public.eni_anhaenge to service_role;

-- Und ausdruecklich weiterhin nicht: fuer angemeldete Konten bleibt es bei
-- select und delete. Ein No-op, solange die urspruengliche Migration gilt —
-- aber die Zeile sagt, dass das kein Versehen ist.
revoke insert, update on table public.eni_anhaenge from authenticated;
