# Nadogradnja šest radnih tijekova

## Aktivacija

Nakon objave aplikacija jednom pokrenuti **docs/AKTIVACIJA-RADNI-TIJEKOVI.sql** u zajedničkom Supabase SQL Editoru. Temelji se na postojećoj roditeljskoj/Referada/e-Matica i Stručni suradnik aktivaciji. Uključuje kompatibilnu aktivaciju Ravnatelja, pa prethodnu RAVNATELJ datoteku nije potrebno posebno ponavljati. Ne ponavljati stare velike aktivacije. Skripta ne dodaje učenike, ne mijenja ocjene i ne zaključuje stvarne godine; nove zaštite primjenjuju se na buduće radnje.

## 1. Korisničke uloge

Zaštita rute više ne tretira školskog administratora kao glavnog administratora. Neaktivne uloge ne otvaraju zaštićene rute. Uklonjeno je automatsko stvaranje glavnog administratora prema e-mail adresi. U bazi su zaštićene izmjene vlastitih uloga, globalnih prava i tuđih vjerodajnica. Dopuštene promjene osobnih podataka, prilagodbi učenika i aktivne vlastite škole ostaju ograničene odgovarajućim pravima.

Administracijski API-ji i ključne školske izmjene zahtijevaju ovlasti za ustanovu, uključujući ustanovu zapisa iz URL-a. Administraciji bez odabrane škole automatski se primjenjuje aktivna vlastita škola. Grupni autentifikatori obrađuju aktivne djelatnike odgovarajuće škole; zajedničke račune i globalne račune obrađuje glavni administrator. Reset učeničke lozinke služi samo učeničkim računima.

Imenici nastavnika koriste izričito ograničen RPC s imenima, ulogama i identifikatorima; ne preuzimaju tuđi PIN ili tajnu autentifikatora. Obični računi ne čitaju tuđe djelatničke profile. Imena nastavnika uz ocjene, ispite, završne radove i kontakte dohvaćaju se kroz taj imenik. Učenici za redni broj i kontakte koriste popis imena vlastitog razreda, bez osobnih podataka svih drugih učenika. Postojeća prijava PIN-om i TOTP-om ostaje.

## 2. Opravdavanje izostanaka

Roditelj odabire dane i sate koji čekaju odluku, upisuje napomenu i po potrebi prilaže ispričnicu. Postojeća provjera vrste datoteke i obveznog priloga za više od tri uzastopna radna dana ostaje.

Razrednik/zamjenik može obraditi zahtjev po danima ili ga odbiti uz obvezno obrazloženje. Odbijanje ne mijenja službene izostanke. Roditelj dobiva obavijest, vidi razlog i može predati novi zahtjev. Obrada je zaključana verzijom zapisa; dvostruka ili zastarjela obrada odbija se. Promjena djeteta/razreda čisti stare rezultate i odbacuje zakašnjele odgovore.

## 3. Zadaci i obavijesti

**Zadaci za obradu** prikazuju se pri odabiru razreda, u školskoj administraciji, na ravnateljskoj ploči i u Referadi. U e-Matici postoji ista stavka izbornika. Prikazuje stvarne neobrađene roditeljske zahtjeve za razrede kojima korisnik upravlja, neprovjerene upise za administratora i pripremljene dokumente za verificiranu Referadu. Poveznice vode do pripadajuće evidencije. Čitanje obavijesti ograničeno je na vlastiti račun; podržani su i stručni suradnici i ravnatelji.

## 4. Povijest promjena

Korisnički izbornik administratora/ravnatelja → **Povijest promjena**. Ovlašteni voditelji razreda imaju i **Povijest promjena razreda**. U e-Matici je stavka pod Izvješćima, a ravnatelj ima zasebnu stavku.

Postojeća evidencija `registry_change_log` bilježi buduće promjene ocjena, zaključnih ocjena, izostanaka, upisa, razreda, godina i dokumenata, uz prije/poslije vrijednosti i stvarnog aktera kada je dostupan u DB sesiji. Obrazloženja iz zapisa i zaključivanja čuvaju se. Poslužiteljske promjene bez zabilježene korisničke DB sesije prikazuju se kao „Sustav / akter nije zabilježen”; ne izmišljaju se podaci ni razlozi. Stari događaji bez audita ne rekonstruiraju se. Dnevnik se ne može mijenjati kroz obični korisnički pristup. Strani razredi/škole nisu dostupni. Paginacija uključuje vrijeme i ID, pa ne preskače događaje s istim vremenom.

## 5. Završetak i nova školska godina

U e-Matici → Prijelaz školske godine → **Provjera i zaključivanje školske godine**. Prikazuju se razredi, učenici bez predmeta, nedostajuće zaključne ocjene, neriješeni izostanci i neobrađeni roditeljski zahtjevi. Nedostajući podaci blokiraju zaključivanje.

Administrator upisuje obrazloženje i potvrđuje zaključivanje. Nova akademska pisanja u toj godini odbija sama baza, uključujući izmjene kroz poslužiteljske funkcije. Zaključeni razred ne može se premjestiti u drugu godinu da bi se zaobišla zaštita. Za ponovno otvaranje potrebne su iste ovlasti i novo obrazloženje; postojeća ručna zaključavanja razrednih knjiga čuvaju se.

Kreiranje nove godine/razreda i provjereni prijelaz učenika ostaju postojeći postupci. Prijelaz čuva stare upise i provjerava pozitivne zaključne ocjene; zatvaranje godine samo provjerava potpunost podataka i ne tvrdi da je svaki učenik položio razred. Arhivirani podaci se ne brišu.

## 6. Kopije i oporavak

Pripremljena je šifrirana dnevna kopija cijele baze i Storage dokumenata. Namjerno nije uključena dok vlasnik ne konfigurira četiri GitHub tajne i ne potvrdi uspješan prvi prolaz. Točne postavke i postupak za izolirani oporavak opisani su u **SIGURNOSNE-KOPIJE.md**.

Lokalni test stvarno vraća oglednu PostgreSQL bazu i privatni dokument te provjerava integritet i pogrešan ključ. Nije provedeno vraćanje žive baze niti je potvrđena Supabase PITR konfiguracija jer nema upravljačkog/SQL pristupa za te postavke.

## Provjere

- e-Dnevnik: `npm test`, `npm run lint`, `npm run build`, `npm run test:family`, `npm run test:roles`, `npm run test:principal`, `npm run test:browser` (nakon dovršenog builda).
- e-Matica: `npm test`, `npm run build`, `npm run test:browser`, `npm run test:layout`.
- DB i preglednik koriste ogledne podatke, dvije škole i sve relevantne uloge. Ne mijenjaju stvarne učenike niti zaključuju živu godinu.
- Nakon SQL aktivacije provjeriti stvarnim zasebnim računima roditelja, razrednika, stručnog suradnika, ravnatelja i Referade. Isprobati zahtjev na testnom učeniku, pregled prije/poslije promjene i listu spremnosti bez zaključivanja aktivne stvarne godine.

Provjereno: 8 PostgreSQL/oporavak testova + 42 TypeScript testa, 50 kombinacija uloga i zaštićenih područja u pregledniku, roditeljski tijek, ravnatelj, Referada i e-Matica. SQL aktivacija testirana je i dvaput uzastopno. Preglednici rade s oglednim podacima; test oporavka nije proba oporavka produkcijskog Supabase projekta.
