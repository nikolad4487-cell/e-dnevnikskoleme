# Stručni suradnik

Uloga `EXPERT` prikazuje se kao **Stručni suradnik** (pedagog, psiholog, sociolog, edukacijski rehabilitator i srodna zanimanja). Dodjeljuje se kao zasebna uloga po školi; nije administrator.

## Aktivacija

Jednom u SQL Editoru postojećeg Supabase projekta pokrenuti **docs/AKTIVACIJA-STRUCNI-SURADNIK.sql**. To je ista transakcija kao migrations/20261021000000_expert_role.sql. Ne ponavljati raniju veliku aktivaciju Referade/e-Matice. Skripta ne dodaje učenike, ne mijenja ocjene i ne briše podatke. Ponovno koristi postojeće pedagoške tablice; kanonske tablice mjera, aktivnosti i audita dodaje samo ako nedostaju (u provjerenoj bazi nedostaju).

Nakon objave aplikacija i ove migracije administrator u e-Dnevniku ili e-Matici pri dodavanju korisnika odabire **Stručni suradnik** i školu. U e-Dnevniku je podržana i promjena uloge postojećeg korisnika. Poslužitelj sprječava stvaranje/dodjelu ove uloge dok SQL zaštita nije aktivirana. PIN i autentifikator ostaju dio postojeće prijave djelatnika.

## Prava

- Pregled svih razreda, učenika i predmeta ustanove u kojoj postoji aktivna dodjela. Strana škola nije dostupna.
- Ocjene, zaključne ocjene, predmeti, raspored i matični upisi ne mogu se mijenjati ovom ulogom.
- Vlastiti sat razrednika može se evidentirati u razredu škole, bez potrebe za predmetnom dodjelom. Predmet mora stvarno biti dodan razredu. Za izostanke na tom satu ostaju postojeće provjere autora, statusa i roka; stručni suradnik ne opravdava izostanke kao razrednik.
- Uređuje se trajni pedagoški karton, godišnje preporuke/bilješke/opažanja, pedagoške mjere i aktivnosti stručne službe. Prilagodba programa jest pedagoški podatak, ne promjena matičnog programa upisa.
- Promjene pedagoških tablica bilježe se u postojećoj evidenciji promjena s izvršiteljem i vremenom.

## Gdje se koristi

**e-Dnevnik:** odabir škole → svi razredi → imenik/predmeti za pregled; Dnevnik rada za Sat razrednika; Pedagoška dokumentacija za karton, godišnje podatke, mjere i aktivnosti.

**e-Matica:** nova stavka **Stručna služba** → škola/godina/razred/učenik → pregled osobnih podataka i popisa predmeta → trajni karton ili godišnja dokumentacija. Podaci su isti kao u e-Dnevniku.

## Provjere

Testovi pokrivaju različite Auth/profil identifikatore, vlastitu i stranu školu, izravne izmjene i pokušaj preko SECURITY DEFINER funkcije, zabranu promjene ocjene/uloge/predmeta, vlastiti Sat razrednika i njegovo prisustvo, pedagoško spremanje i audit, pogrešnog učenika/razred/godinu, opoziv uloge, te nastavak rada postojećih ovlasti i enrollment_final_grades kao tablice/pogleda. Browser test e-Matice provjerava izmjenu kartona, godišnje dokumentacije, promjenu učenika, pogreške i uski prikaz.
