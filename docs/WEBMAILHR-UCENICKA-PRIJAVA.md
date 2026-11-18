# WebmailHR — učenička prijava

Serverski adapter: `POST https://e-ocjene.skolehr.xyz/api/auth/webmail/student`.

## Serverske postavke

| Projekt / Production | Varijabla | Vrijednost |
| --- | --- | --- |
| e-dnevnikskoleme | `WEBMAILHR_STUDENT_LOGIN_TOKEN` | Nasumična serverska tajna, spremljena kao Secret/Sensitive |
| webmail | `EDNEVNIK_USERNAME_LOGIN_TOKEN` | Ista tajna kao u e-Dnevniku |
| webmail | `EDNEVNIK_USERNAME_LOGIN_URL` | `https://e-ocjene.skolehr.xyz/api/auth/webmail/student` |

Nijedna tajna nema `VITE_` prefiks. Vrijednosti se ne spremaju u repozitorij, dokumentaciju ni odgovore prijave. Poslije promjene konfiguracije ponovno objaviti oba produkcijska projekta. Preview ima vlastitu konfiguraciju; produkcijski token nije dodan u Preview.

## Ugovor i zaštita

Zahtjev šalje `Authorization: Bearer <serverska tajna>`, `Content-Type: application/json` i tijelo `{"username":"korisnicko.ime","password":"lozinka"}`. Uspjeh vraća isključivo `{"user_id":"Supabase Auth UUID"}`. To nije lokalni `user_profiles.id`. Sesijski i refresh tokeni ne vraćaju se WebmailHR-u.

Izuzeće općeg session guarda vrijedi samo za točan POST na navedenoj putanji. Metode GET/PUT/PATCH/DELETE, podputanje i susjedne auth rute zadržavaju postojeću zaštitu. Vlastita provjera serverskog tokena prethodi upitima u bazu i provjeri lozinke; ne koristi Supabase korisnički JWT kao zamjenu za tajnu. Odgovori nose `Cache-Control: no-store`.

Korisničko ime koristi isti lookup kao postojeća e-Dnevnik prijava; SQL LIKE zamjenski znakovi tretiraju se kao doslovni znakovi. Lozinka se provjerava postojećim `signInWithPasswordDirect`, bez promjene lozinke, generiranja korisnika ili PIN/TOTP prečaca. Profil mora pripadati potvrđenom Auth ID-u i imati učenički identitet. Djelatnički, roditeljski, miješani i opozvani učenički identiteti odbijaju se.

- 200: potvrđeni učenik; samo `user_id`.
- 400: neispravno tijelo zahtjeva.
- 401: nedostajući/nevaljan serverski token ili nevaljana lozinka.
- 403: potvrđen račun nema učeničko pravo za ovaj adapter.
- 429: Supabase je ograničio pokušaje.
- 503: nedostaje serverska konfiguracija ili provjera identiteta nije dostupna.

## Provjera

`npx tsx --test tests/webmail-student.test.ts` pokreće handler iza stvarnog `apiAccessGuard` s oglednim providerom. Provjerava točan opseg izuzeća, obavezni token, lozinku bez uklanjanja razmaka, isključivo Auth ID u odgovoru, zabranu djelatnika/roditelja/miješanih/opozvanih uloga, identitet starog profila i odbijanje pri greškama pružatelja. `npm test`, `npm run lint` i `npm run build` provjeravaju postojeću aplikaciju.

Produkcijski test zahtijeva probnog učenika s poznatom lozinkom i već dodijeljenim WebmailHR sandučićem. U WebmailHR-u `source_project` mora odgovarati Supabase project ref-u, a `source_user_id` Auth UUID-u iz ovog adaptera. Stvarni sandučić zahtijeva radni WebmailHR API, njegovu PostgreSQL bazu i poštansku konfiguraciju. Sama konfiguracija URL-a i tokena ne dokazuje da je sandučić dostupan. Ne mijenjati lozinke ni dodjele stvarnih korisnika radi tehničkog testa.
