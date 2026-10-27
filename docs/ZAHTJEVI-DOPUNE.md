# Dopune zahtjeva referadi

Zahtjev prolazi kroz Zaprimljen → U obradi → Potrebna dopuna → ponovno Zaprimljen ili završava statusom Spremno za preuzimanje / Odbijen.

Referada traži dopunu uz obvezno obrazloženje. Izvorni podnositelj, ako i dalje ima pravo pristupa učeniku, dopunjava svrhu i napomenu na istom zahtjevu. Drugi roditelj ili učenik ne može dopunjavati tuđi zahtjev. Stare i dvostruke predaje se odbijaju. Prethodna i nova vrijednost te stvarni akter ostaju u postojećoj povijesti promjena. Obavijest referade otvara karticu zahtjeva za odgovarajuće dijete i razred.

Spremno za preuzimanje znači da je povezan već izdani PDF provjerenog učenika, razreda i škole. Postojeće provjere izdavanja, privatnosti i poništenja ostaju obvezne.

## Aktivacija

Ako su komunikacija i školske usluge već aktivirane, jednom pokrenuti samo `migrations/20261027000000_document_request_supplements.sql` u Supabase SQL Editoru. Nova instalacija koristi regeneriranu `docs/AKTIVACIJA-KOMUNIKACIJA-I-USLUGE.sql`. Obje su ponovljive. Aktivacija ne šalje obavijesti i ne mijenja postojeće zahtjeve; nove obavijesti nastaju tek pri stvarnoj obradi.

Automatske provjere koriste izoliranu PostgreSQL bazu s oglednim podacima. Produkcijska SQL aktivacija i provjera stvarnim računima nisu provedene kroz ovu promjenu.
