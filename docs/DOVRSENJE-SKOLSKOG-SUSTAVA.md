# Dovršavanje školskih postupaka i pouzdanosti — 27. listopada 2026.

## Implementirano

- Operativna pomoćna pohrana više ne koristi datoteke na lokalnom disku ili Vercelovu `/tmp`. Postojeći API ugovori koriste snimku podataka dostupnih prijavljenom korisniku i atomsku predaju promjena u PostgreSQL. Provjeravaju se škola, razred, učenik, povezani zapisi prakse, ovlasti i zastarjela verzija. Neuspješno spremanje ne vraća uspješan odgovor. Upiti su ograničeni na potrebne evidencije i zadani učenik/razred/zapis; zaštitna granica iznosi 10.000 dostupnih zapisa po evidenciji i zahtjevu.
- Uplate provjeravaju pozitivan iznos s najviše dvije decimale. Ponovljeno slanje istog obrasca koristi isti identifikator. Evidencijski broj nije bankovna potvrda. Praksa ne dobiva izmišljene ocjene ako nisu poslane; oznaka potvrde škole ne predstavlja elektronički potpis vanjskog mentora.
- Centar **Obavijesti i zadaci** dostupan je iz zaglavlja djelatničkog i obiteljskog portala. Podržava pročitano/nepročitano, straničenje bez preskakanja jednakih vremena, ispravno dijete/razred i otvaranje postupka. Poruke otvaraju ovlašteni razgovor; suglasnosti, rezervacije, zamjene i ispitne obavijesti otvaraju pripadajuću karticu i zapis.
- **e-Matica → Izvješća → Zadaci i potpunost podataka** prikazuje aktivne upise bez adrese, datuma rođenja, programa, potvrđenog statusa ili matične poveznice. Povezan roditelj/skrbnik provjerava se za potvrđeno maloljetnog učenika. Otvaranje učenika vodi u postojeći matični urednik. Pregled ima straničenje i odbacuje zakašnjele odgovore prethodne škole.
- **Zdravlje i spremnost sustava** prikazuje stvarne odgovore i instalirane funkcije. Uklonjeni su izmišljeni podaci o uspješnoj kopiji, veličini kopije i ukupnoj produkcijskoj spremnosti. Poslije provjere i uspješnog učitavanja šifrirane kopije postojeći backup workflow bilježi stvarni artefakt i njegov SHA-256. Oporavak se ne prikazuje kao provjeren ako za njega nema dokaza.
- Upisi, ispisi i premještaji provode se kroz postojeće provjerene postupke e-Matice. Uklonjen je stari prečac koji je prepisivao status svih školskih članstava. Dosje prikazuje zabilježenu matičnu povijest, a prazna povijest ne tvrdi da je status aktivan.
- Završni radovi koriste matičnu tablicu, čuvaju podatke urudžbiranja i odjave te koriste korisničku DB sesiju. RLS i trigger štite ocjene, pripadnost, ovlasti mentora, zaključenu godinu i službene odluke. Učenik ne ocjenjuje vlastiti rad. Promjene ostaju u povijesti.
- Uklonjeno je automatsko popravljanje podataka, korisnika i sheme pri podizanju web-poslužitelja. Uklonjeni su demo gumb i netočna tvrdnja o certifikatu na prijavi. Poslužiteljski zahtjevi bilježe identifikator, putanju bez upita, status i trajanje.

## Aktivacija prije objave

Postojeći sustav mora već imati aktivirane e-Maticu/Referadu, stručnog suradnika i komunikacijske usluge. Sačuvati provjerenu kopiju baze i privatnih datoteka. Zatim primijeniti **AKTIVACIJA-POUZDANOST-SUSTAVA.sql** kao jednu transakciju. Uključuje dopunu zahtjeva iz prethodnog PR-a i ove migracije. Ne ponavljati stare velike aktivacije kao zamjenu za preduvjete.

Za novu instalaciju ažurirana je objedinjena **AKTIVACIJA-KOMUNIKACIJA-I-USLUGE.sql**. Generiranje: `node scripts/build-school-services-activation.mjs --write`; nadogradnja postojeće instalacije: `node scripts/build-reliability-activation.mjs --write`.

U stvarnoj bazi pronađene su tri stare prijave završnog rada bez školske godine i bez spremljenog razreda. Čuvaju se u istoj matičnoj tablici i ostaju dostupne za čitanje vlasniku, imenovanom mentoru s aktivnom ulogom i glavnom administratoru. Izmjene su blokirane dok se pripadnost ne uskladi prema stvarnom izvorniku. Ne pridružuje se automatski današnji razred ili godina i podaci se ne brišu.

Prije objave pregledati preostale datoteke prethodnog hosta. `node scripts/import-legacy-records.mjs /putanja/do/izvoza` ispisuje samo brojeve zapisa, bez pisanja. `--apply` koristi ovlaštenu administratorsku korisničku sesiju iz varijabli okruženja i predaje jednu transakciju; izvorne datoteke ostaju sačuvane. Sukob postojećeg sadržaja ili nedostajuća pripadnost prekida cijeli uvoz. U ovom workspaceu operativne datoteke obuhvaćene uvozom bile su prazne; to ne dokazuje stanje drugih instanci starog hosta. Već izgubljena privremena datoteka ne rekonstruira se izmišljenim podacima.

Nakon aktivacije objaviti e-Dnevnik/obiteljski portal/Referadu i e-Maticu te provjeriti prvi postupak zasebnim stvarnim testnim računima. Ne zaključivati stvarnu godinu niti izdavati stvarne dokumente za potrebe tehničkog testa.

## Vanjske stavke koje nisu lažno označene dovršenima

1. Dodatak Supabase naknadno je povezan i omogućio pregled sheme te primjenu migracija. HTTP ključ aplikacije sam nema ovlasti za DDL. HEAD/limit(0) nije dovoljan dokaz postojanja tablice. Prethodna aktivacija i objava su potvrđene niže; nova sigurnosna migracija čeka zasebno odobrenje.
2. Automatske kopije zahtijevaju četiri ranije dokumentirane GitHub tajne i `BACKUP_ENABLED=true`, uspješan prvi prolaz i provjeru zadržavanja. Stvarni oporavak treba provesti u zasebnom projektu. Upute: **SIGURNOSNE-KOPIJE.md**. Konfiguracija Supabase PITR-a nije potvrđena.
3. Kvalificirano elektroničko pečatiranje zahtijeva izabranog pružatelja, ugovor/certifikat i pristupne podatke. Grafička ovjera ostaje jasno odvojena. Postojeći katalog izvornih obrazaca nije tvrdnja o potpunosti svih zakonskih obrazaca za sve vrste ustanova.
4. Službene integracije, e-mail i push dostava zahtijevaju stvarne ovlasti/usluge. Ova verzija ne predstavlja zamjenu za službene nacionalne sustave niti potvrdu pravne usklađenosti svake ustanove.

## Provjere

- e-Dnevnik: `npm test`, `npm run lint`, `npm run build`.
- Preglednik: postojeći `test:family`, `test:roles`, `test:principal`, `test:browser`, `test:services`; novi `node tests/browser-reliability.mjs` (e-Matica checkout u susjednom direktoriju ili `EMATICA_SOURCE_DIR`).
- e-Matica: `npm test`, `npm run build`, `npm run test:browser`, `npm run test:layout`.
- Testovi koriste ogledne podatke. Izolirani PostgreSQL test izvršava objedinjenu SQL aktivaciju dva puta i provjerava opseg škola, atomsku pohranu, sukobe verzija, ovlasti, povijest i zaštite završnih radova. Preglednik provjerava obavijesti s jednakim vremenima, filtriranje, otvaranje pravog konteksta, nepostojanje izmišljenog backupa, kvalitetu podataka i uske prikaze.

## Stvarno stanje aktivacije

Povezan je Supabase projekt `hkqlbeetlvrplaeubncc`, PostgreSQL 17.6, plan Free. Kopija prethodnih definicija izmijenjenih funkcija i pravila završnih radova sačuvana je izvan repozitorija; to je evidencija za povrat sheme, ne cjelovita sigurnosna kopija podataka.

Korisnik je zatim ručno uspješno primijenio SQL i zatražio objavu. Provjereno je postojanje trajne pohrane, evidencije oporavka, pregleda potpunosti, zaštite završnih radova i dopune zahtjeva. Sve tri stare prijave su sačuvane. Anonimni pristup novoj pohrani i pregledu spremnosti je zabranjen, a RLS završnih radova uključen.

PR #32 e-Dnevnika spojen je u `5ffb2b11a1df06634c6105b72dceaeb7664008df`, a PR #11 e-Matice u `e83dc97d9cc9a258a425a3add9fbeebc523045bb`. Vercel je potvrdio uspješnu produkcijsku objavu e-Dnevnika, roditeljskog/učenikovog portala, Referade i e-Matice. Ta aktivacija i objava više nisu blokirane.

Osnovni Supabase sigurnosni pregled zabilježio je i 12 postojećih pogleda sa statusom SECURITY DEFINER te starija upozorenja o izvršavanju funkcija i search_path. Ta upozorenja nisu dokaz da svaki navedeni RPC ima ranjivost: više postojećih funkcija provodi vlastite provjere ovlasti. Ova nadogradnja nije slijepo prepisivala stare upisne module; taj dio zahtijeva zasebnu provjeru prije tvrdnje da je cijeli projekt sigurnosno certificiran. [Opis provjere pogleda](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view).

Za Free projekte ne treba pretpostavljati automatske dnevne kopije pružatelja; [službene upute za sigurnosne kopije](https://supabase.com/docs/guides/platform/backups) navode raspoloživost po planovima. Dodatni workflow nije označen aktivnim bez potvrđene konfiguracije i uspješnog prolaza. Plaćeni plan ili nova grana nisu uključeni niti naručeni.

## Završna dorada — 28. listopada 2026.

- Pripremljena je dodatna migracija `20261028170521_enforce_view_rls.sql`, identična datoteci `AKTIVACIJA-SIGURNOST-POGLEDA.sql`. Dvanaest naslijeđenih pogleda primjenjuje postojeća RLS pravila pozivatelja (`security_invoker=true`), a PUBLIC/anon gube pristup tim pogledima. Ne prepisuju se definicije upita ni školski podaci. Administrativni i obiteljski opseg više se ne zaobilazi kroz pogled. Opcionalni pogledi koji ne postoje preskaču se.
- Konstantna interna funkcija `school_aux_collections()` dobiva fiksni `search_path=pg_catalog`; funkcija okidača `school_thesis_guard()` više nema nepotrebno izravno pravo izvršavanja za authenticated. Okidač ostaje aktivan.
- Test s postojećom obiteljskom SQL aktivacijom potvrđuje 48-satnu odgodu roditeljskog prikaza zaključne ocjene i kroz agregirani pogled, neposredni pristup učeniku i ovlaštenom nastavniku te zabranu nastavniku druge škole. Zasebni PostgreSQL test provjerava svih 12 imena pogleda i anonimnu zabranu te ponovnu primjenu migracije.
- Kopiranje provjerava da PostgreSQL i privatni dokumenti pripadaju istom projektu, zahtijeva TLS, odbija transaction pooling i prepisivanje hosta kroz parametre veze. Format ključa provjerava se bez ispisivanja tajni.
- Nova evidencija `snapshot-integrity.json` povezuje SHA-256 i veličinu baze i manifesta dokumenata. Provjera odbija skraćenu bazu, promijenjen manifest i neispravne datoteke prije oporavka. Stare kopije bez evidencije nisu prikazane kao da imaju tu provjeru.
- Alat `prepare-restore-list.mjs` priprema popis povrata, isključuje metapodatke Storagea koji nastaju stvarnim API prijenosom, a čuva definicije, politike, ovlasti i školske podatke. Ne spaja se na odredišnu bazu. Upute povrata koriste jednu transakciju i odvojeni prazni projekt; sva postojeća odredišna Storage spremišta moraju biti prazna.
- Proveden je i pravi `pg_dump`/`pg_restore` test PostgreSQL 17 u mrežno izoliranom Docker kontejneru, s oglednim hrvatskim podacima, šifriranjem, provjerom integriteta i izostavljanjem Storage metapodataka. Test je dodan CI-u. To ne predstavlja povrat stvarnih školskih podataka ni validaciju svih Supabase ekstenzija i korisničkih sesija.

Automatska provjera odobrenja odbila je primjenu ove dodatne produkcijske migracije: promjena načina izvršavanja pogleda i prava pristupa kroz više osjetljivih pogleda zahtijeva izričito odobrenje točnog opsega zbog mogućeg utjecaja na pristup i dostupnost. Migracija nije primijenjena drugim putem. Prethodne definicije i ovlasti sačuvane su izvan repozitorija; nisu kopija učeničkih podataka. SQL ostaje spreman za odobrenje nakon dovršene provjere koda.

Aktivacija automatskih kopija i stvarna proba povrata i dalje zahtijevaju četiri GitHub tajne, sačuvan vanjski ključ te zaseban projekt. Dostupni HTTP service-role ključ nije PostgreSQL zaporka niti ključ šifriranja; ne zamjenjuje ih. Izvorni razred i godina triju starih završnih radova ostaju pitanje izvornika, a elektroničko pečatiranje zahtijeva stvarnog pružatelja. Te stavke nisu označene gotovima bez dokaza.
