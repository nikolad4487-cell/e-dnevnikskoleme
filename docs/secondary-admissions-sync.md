# Povlačenje iz e-Matice u razred

U **Učenici škole → Povuci učenike iz e-Matice u razred** administrator bira razred i učenike iz aktivnih matičnih upisa iste škole, programa i godine. Potvrđeni upisi iz srednjih e-Upisa ulaze u prvi razred. Koristi se postojeći račun učenika; čuvaju se prethodne godine, razredi i postavke prijave.

Implementacija baze i detaljne upute nalaze se u repozitoriju `eskolehr-ematica`, u `docs/secondary-admissions-sync.md` i migraciji `20261103192115_secondary_admissions_registry_class_sync.sql`. Migracija je već primijenjena na zajednički Supabase projekt 3. 11. 2026.; ne primjenjivati zasebne kopije iz drugih repozitorija.

Potrebno je objaviti sučelja e-Upisa, e-Matice i e-Dnevnika. `list_ematica_students_for_class` dohvaća kandidate, a `import_ematica_students_to_class` provodi skupni transakcijski prijenos s provjerom ovlasti i zaštitom od duplikata. Učenik bez postojećeg povezanog profila dobiva poruku da se račun prvo poveže u e-Matici.

Provjereni su TypeScript, produkcijska izgradnja i zajednički browser test identične komponente u repozitoriju e-Matice (desktop/mobitel, odabir razreda, pogreške, ponavljanje i nepovezani računi).
