# Manuale Ca.R.Pe. — Edizione restaurata (progetto informativo non ufficiale)

Ipertesto **statico e offline** che riorganizza e modernizza l'interfaccia di
documentazione **INPS storica** relativa al software **Ca.R.Pe.** (**Ca**lcolo
della **R**etribuzione media **Pe**nsionabile e ipotesi di rata pensione) e alla
**previdenza dei lavoratori marittimi** ("Gente di Mare").

> ⚠️ **Progetto individuale, non ufficiale, a scopo informativo e di studio.**
> Non è collegato a INPS. Leggi il [DISCLAIMER](DISCLAIMER.md) prima dell'uso.

## Cos'è

Una raccolta consultabile — con **ricerca offline**, tema chiaro/scuro,
navigazione collassabile, lightbox immagini e viewer PDF integrato — che copre:

- **Software Ca.R.Pe.**: procedura d'uso (menu File, Calcola, Visualizza, Cambia,
  Comunicazione, Aiuto), funzioni e riferimenti operativi.
- **Norme & contributi**: fonti normative, contribuzione, posizione assicurativa,
  prestazioni, ricostituzioni, Legge 413/1984.
- **Documentazione**: qualifiche marittimi, codifiche, sentenze, raccolta
  circolari INPS storiche.
- **Manuali PDF** e archivi HTML dei manuali "Utilizzo" e "Installazione".
- **Guide pratiche** sul file `.E1`/`.EC` e uno **strumento in-browser** per
  convertire il proprio estratto tra formato E1/EC e XML leggibile (i dati **non
  lasciano mai il dispositivo**).

## Come si usa

1. Apri `index.html` con un browser moderno (Chrome, Edge, Firefox, Safari).
2. Naviga dalla sidebar o usa la ricerca (`Ctrl K`).
3. Tutto è **relativo e offline**: la cartella funziona anche senza internet.

## Struttura

| Percorso | Contenuto |
|---|---|
| `index.html`, `LEGGIMI.html` | Ingresso e istruzioni |
| `assets/css`, `assets/js` | Stile e script originali (ricerca, lightbox, viewer PDF, codec E1) |
| `assets/images`, `assets/vendor/pdfjs` | Immagini e libreria PDF.js (offline) |
| `pages/norme`, `pages/procedura`, `pages/documentazione`, `pages/circolari` | Sezioni del manuale |
| `pdf/` | Manuali PDF (contenuti INPS, vedi NOTICE) |
| `mht/` | Risorse estratte dai manuali HTML |

## Licenza

Progetto a **doppia titolarità**:

- **Codice e interfaccia originali** → [MIT](LICENSE) © 2026 Davide Pica.
- **Contenuti INPS e di terzi** (manuali, circolari, testi, PDF, immagini) →
  © rispettivi titolari, **non licenziati** dall'autore, riprodotti a fini
  informativi e di studio. Dettagli e base giuridica in [NOTICE.md](NOTICE.md).

## Software ufficiale (non incluso qui)

Il software **Ca.R.Pe. non è ridistribuibile** e va scaricato solo da INPS:

- Ca.R.Pe. PC: [pagina ufficiale INPS del software](https://www.inps.it/it/it/software/dettaglio-software.software.2025.06.704.software-carpe-pc-(ca-r-pe)---software-per-il-calcolo-della-retribuzione-media-pensionabile-ed-ipotesi-di-rata-pensione.html)
- Aggiornamento procedura "Gente di Mare" — file `GdMrilPM.exe`: distribuito da
  INPS con la procedura Ca.R.Pe. ([catalogo software INPS](https://www.inps.it/it/it/software.html)).

## Rimozione contenuti (takedown)

Se un titolare di diritti ritiene che un contenuto non debba essere pubblicato,
apra una issue: sarà rimosso tempestivamente. Vedi [NOTICE.md](NOTICE.md).

## Crediti

- **Manuale originale** (maggio 2005): R. Codeglia, R.A. Milocani — INPS.
- **Riadattamento** (2026): Davide Pica — riorganizzazione e modernizzazione
  UI/UX, a uso personale e informativo.
