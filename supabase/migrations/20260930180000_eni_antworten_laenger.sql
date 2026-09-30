-- ENI darf laenger antworten. Ein Lernzettel, ein Trainingsplan ueber vier
-- Wochen oder eine ausfuehrliche Erklaerung passen nicht in 8000 Zeichen. Der
-- Deckel fuer die Modellausgabe steigt von 2500 auf 6000 Token, das sind grob
-- 24 000 Zeichen. Die Spalte muss das speichern koennen; sonst endet genau die
-- lange Antwort, um die es ging, mit „ENIs antwort wurde nicht gespeichert“.
--
-- Nur die Obergrenze aendert sich, keine Zeile wird angefasst (alle bestehenden
-- liegen unter 8000 und bestehen die neue Pruefung). Eigene Vorlagen begrenzt
-- weiter die Function (4000 Zeichen), das Bearbeiten weiter
-- `eni_nachricht_bearbeiten` (8000).
alter table public.eni_nachrichten drop constraint eni_nachrichten_text_check;
alter table public.eni_nachrichten
  add constraint eni_nachrichten_text_check check (char_length(text) <= 32000);
