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

1. Dodatak Supabase naknadno je povezan i omogućio pregled sheme te primjenu migracija. HTTP ključ aplikacije sam nema ovlasti za DDL. HEAD/limit(0) nije dovoljan dokaz postojanja tablice. Stvarni rezultat aktivacije i provjere zabilježit će se nakon primjene.
2. Automatske kopije zahtijevaju četiri ranije dokumentirane GitHub tajne i `BACKUP_ENABLED=true`, uspješan prvi prolaz i provjeru zadržavanja. Stvarni oporavak treba provesti u zasebnom projektu. Upute: **SIGURNOSNE-KOPIJE.md**. Konfiguracija Supabase PITR-a nije potvrđena.
3. Kvalificirano elektroničko pečatiranje zahtijeva izabranog pružatelja, ugovor/certifikat i pristupne podatke. Grafička ovjera ostaje jasno odvojena. Postojeći katalog izvornih obrazaca nije tvrdnja o potpunosti svih zakonskih obrazaca za sve vrste ustanova.
4. Službene integracije, e-mail i push dostava zahtijevaju stvarne ovlasti/usluge. Ova verzija ne predstavlja zamjenu za službene nacionalne sustave niti potvrdu pravne usklađenosti svake ustanove.

## Provjere

- e-Dnevnik: `npm test`, `npm run lint`, `npm run build`.
- Preglednik: postojeći `test:family`, `test:roles`, `test:principal`, `test:browser`, `test:services`; novi `node tests/browser-reliability.mjs` (e-Matica checkout u susjednom direktoriju ili `EMATICA_SOURCE_DIR`).
- e-Matica: `npm test`, `npm run build`, `npm run test:browser`, `npm run test:layout`.
- Testovi koriste ogledne podatke. Izolirani PostgreSQL test izvršava objedinjenu SQL aktivaciju dva puta i provjerava opseg škola, atomsku pohranu, sukobe verzija, ovlasti, povijest i zaštite završnih radova. Preglednik provjerava obavijesti s jednakim vremenima, filtriranje, otvaranje pravog konteksta, nepostojanje izmišljenog backupa, kvalitetu podataka i uske prikaze.
