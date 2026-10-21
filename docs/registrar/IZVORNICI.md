# Pregled izvornika i implementacijske odluke

Pregledani tekstovi i slike svih 59 kontaktnih listova (sve PDF stranice) te tekst i ugrađeni logotipi oba DOCX obrasca. Izvornici su u manifest.json, SHA256 i broj stranica; visual-index.json bilježi pokrivenost stranica. DOCX obrasci su isključivo za predškolske ustanove, ručni s M.P. i potpisom, digitalni bez M.P.; ne primjenjuju se na škole.

ZET dva primjerka imaju isti SHA256 f46b2d64a7c3; tjedna zaduženja dva primjerka isti SHA256 5b1b47e04d17. HŽPP skenirani i digitalni učenički imaju različite rasporede, zasebna mapa ili koristi kvalitetniji digitalni predložak.

## Pravila izvornika

- Ustanove: osnovni/adrese/komunikacija, O ustanovi, temeljna dokumentacija, infrastruktura, programi, fakultativni, djelatnici, ostalo, svjedodžbe. Službeni naziv/OIB/šifra/status samo sustavski administrator. Točno jedno aktivno sjedište. Zaposlenja i imenovanja ravnatelja s poviješću.
- Djelatnici: jedan postojeći profil može biti povezan s više škola. Lokalna OIB pretraga nije državni OIB servis. Ugovori + radna mjesta imaju datume, tjednu satnicu, stručnost. Odvojeno stručna sprema/zvanje, predmeti, napredovanja, stručni ispit, pedagoška grupa, županijsko vijeće. Jedan aktivni ravnatelj. Dodijeljeni administrator ustanove ne delegira dalje prava.
- Početak godine: stvarni razredi, OOS, kombinirane razine, razrednik. Upis ili dodavanje postojećeg učenika bez dupliciranja osobe. Promjena programa zatvara prethodni dan prije novoga. Paralelni umjetnički programi uz jedan matični. Prijenos u viši razred samo kad završne ocjene/podaci potpuni; sačuvati povijest. Ispis s datumom/razlogom.
- Obrazovanje: vlastita povijest programa/upisa, izvannastavne i izvanškolske aktivnosti, kućna nastava/produljeno/akceleracija; osnovna 1–3 s jednom negativnom ocjenom zahtijeva stvarnu odluku vijeća. Nastavak obrazovanja: dva dokumenta navode neusklađeni rok (365 dana vs dvije godine); ne hardkodirati pravni rok bez usklađene konfiguracije.
- Umjetnička matična škola: program 770004 u općeobrazovnoj ne izdaje svjedodžbu, samo dijeljene zaključane ocjene. Jedan matični program u umjetničkoj. Ne dopustiti opći pristup tuđoj školi zbog zajedničkog učenika.
- Kraj godine: redoslijed/status predmeta, stvarne završne ocjene; dopunski rad tek uz nedovoljan, popravni uz negativan dopunski rad, predmetni/razredni uz neocijenjen. Ostali ispiti datum/predmet/razred/ocjena. Svjedodžbe probni pregled, metapodaci, zaključavanje, izdavanje, storniranje/otključavanje uz razlog i upravni predmet kad primjenjivo.
- Digitalni pečat: kvalificirana vanjska usluga, ELM/e-Registar zasebni stvarni statusi; nikakva simulacija mobilnog odobravanja ili uspješnog pečaćenja. Priprema/grupni odabir mogu raditi bez usluge, dovršetak ne.
- Tjedno: datum/godina/djelatnik, redovna/ostala/praktična/laboratorijske/zdravstvene, sati tjedno/godišnje/u školi/broj grupa, aktivni/neaktivni, izvješća. Ugovor satnica odvojena od nastavne norme.
- Prijevoz: matična škola, putnik, kategorija subvencije, valjanost, dom/poseban/kombinirani, relacije uključuju praksu, 100% cijene i km u jednom smjeru, više prijevoznika, izvješće.
- Izvoz: CSV/XLSX samo dopušteni filtrirani podaci; zaštita formula. Potvrde svrha + ostalo/propisi, trajno čuvanje, kontrolirano poništenje prema korisničkom zahtjevu umjesto brisanja iz službenog arhiva.

## Dopuštene ovjere

ZET redovni p1 donje lijevo samo škola/fakultet. Grad/općina i podnositelj netaknuti, p2 napomene ostaju; e-Matica/ISSP iznimke informativne. ZET opći bez školske ovjere.

HŽPP učenik/student p2 ovjera obrazovne ustanove u sredini; donja trećina POPUNJAVA HŽPP netaknuta. Prazna crta uz 'REDOVNI UČENIK' služi imenu učenika, naziv škole u školskom području. Studentski samo vlastito visoko učilište/potvrđeni redovni status/akademska godina. P1 vlastiti potpis i marketinška privola prazni.

Subvencije tri odvojene mape: 75 škola p1 gore/sredina, roditelj p1 dolje, prijevoznici p2. 100 minimum škola p1 gore, CZSS p1 dolje; roditelj i prijevoznici p2. 100 branitelji škola pomaknuta p1 gore, županija p1 dolje; roditelj/prijevoznici p2. Nema školskih ovjera trećih tijela niti automatskog odobravanja prava.

## Postojeća baza

Snapshot database-openapi.json: schools/classes/subjects ID text, user_profiles/registry_students/programs/school_years UUID. Postoje weekly_assignments, student_education_records, student_transport_records i school_document_records — proširiti, ne duplicirati. student_school_enrollments i student_class_enrollments su upisi. grades/final_grades te enrollment_final_grades su stvarne ocjene, provjeriti povezivanje učenika. final_thesis već sadrži application_registry_number/application_classification_number/accepted_at/by — koristiti ih. Privatni arhiv proširuje school_document_records. PIN/TOTP/registrar_verified_sessions i registrar_require_school ostaju autoritativni.

Rizik: postojeći opći permisivni authenticated RLS i definer views nisu dovoljni za školsku izolaciju. Novi RPC moraju strogo provjeriti školu i sve povezane ID-e; dodatni restrictive RLS i security_invoker na relevantnim pogledima. Nikakva promjena postojeće autentifikacije.
