# Documentazione del progetto

Guida completa a **cosa contiene** e **come si usa** il manuale restaurato Ca.R.Pe.
Per l'avviso legale completo vedi **[DISCLAIMER](../DISCLAIMER.md)**; per diritti e
attribuzioni dei contenuti vedi **[NOTICE](../NOTICE.md)**.

- **Apri online:** <https://davidebr90.github.io/carpe-manuale-restaurato/>
- **In locale:** scarica il repository e apri `index.html` (funziona offline).

> ⚠️ Progetto **individuale e non ufficiale**, a scopo informativo e di studio.
> Non è collegato a INPS. Per qualsiasi aspetto ufficiale fa fede solo INPS.

---

## Indice

1. [Come è organizzato](#come-è-organizzato)
2. [Funzionalità dell'interfaccia](#funzionalità-dellinterfaccia)
3. [Le sezioni, una per una](#le-sezioni-una-per-una)
4. [Lo strumento file E1/EC](#lo-strumento-file-e1ec)
5. [Struttura tecnica del progetto](#struttura-tecnica-del-progetto)
6. [Licenza, contenuti e responsabilità](#licenza-contenuti-e-responsabilità)

---

## Come è organizzato

Il manuale è un **ipertesto statico** (solo HTML/CSS/JavaScript, nessun server).
La navigazione è divisa in due grandi aree, visibili nella barra laterale:

- **Ca.r.Pe. — Aggiornamento 2026** → tutto ciò che riguarda il *software* Ca.R.Pe.:
  download, guide pratiche, strumenti e manuali ufficiali.
- **GdM — Gente di Mare** → il *dominio previdenziale* dei lavoratori marittimi:
  norme, procedura del software, documentazione tecnica, circolari e manuali PDF.

## Funzionalità dell'interfaccia

| Funzione | Come si usa |
|---|---|
| **Ricerca offline** | Premi `Ctrl K` (o `/`). Usa le virgolette per la frase esatta: `"calcolo retributivo"`. L'indice è locale, nessuna chiamata a internet. |
| **Tema chiaro/scuro** | Pulsante in alto a destra. La scelta è ricordata tra le pagine. |
| **Barra laterale collassabile** | Ogni sezione si espande/richiude singolarmente; su mobile si apre col pulsante ☰. |
| **Lightbox immagini** | Clic su un'immagine per ingrandirla; doppio clic o rotella per lo zoom. |
| **Viewer PDF integrato** | I manuali PDF si aprono nella pagina (PDF.js, offline), senza scaricarli. |
| **Torna indietro / Indice sezione** | In cima a ogni pagina interna, per risalire rapidamente. |

## Le sezioni, una per una

### Ca.R.Pe. — il software

- **Download Carpe** — a cosa serve il software, informativa ufficiale di
  distribuzione e **link ufficiale INPS** per scaricarlo (il software non è incluso
  nel repository, vedi [NOTICE](../NOTICE.md)).
- **Download File E1** — come ottenere il proprio file `.E1` dal Fascicolo
  Previdenziale INPS (accesso SPID/CIE/CNS).
- **Guida: simulazione pensione** — come usare i dati importati per proiettare la
  rata futura e impostare ipotesi di calcolo.
- **Guida utilizzo file E1** — come importare l'`.E1` in Ca.R.Pe., struttura del
  file, come leggere i propri dati e ambito d'uso personale.
- **Codifica / Decodifica / Modifica .E1 .EC .AG .XML** — lo strumento in-browser
  (vedi sezione dedicata sotto).
- **Manuali Ufficiali** — versioni consultabili dei manuali INPS: *Errori*,
  *Info uso file E1*, *Utilizzo*, *Installazione*.

### GdM — Gente di Mare

**Le Norme** — il quadro normativo della previdenza marinara:
Fonti normative · Contribuzione · Posizione assicurativa · Prestazioni ·
Ricostituzioni e Riliquidazioni · Quesiti alla Direzione ·
Legge 413/1984 (testo, articoli, indice) · Schema compatibilità classe-qualifica.

**La Procedura** — l'uso operativo del software, menu per menu:
Barra dei menu · File · Calcola · Visualizza (+ dettagli) · Cambia · Comunicazione ·
Aiuto · Funzioni A (+ dettagli) · Funzioni R · Note esplicative · Informazioni
Aiuto · Stato del sistema · Tabella messaggi.

**Documentazione GdM** — riferimenti tecnici:
Qualifiche marittimi · Codifica contribuzione marittima · Limite massimo ML ·
Sentenze sul calcolo pensioni · Indice circolari (originale).

**Raccolta Circolari** — le circolari INPS storiche sulla previdenza marinara,
consultabili e ricercabili.

**Manuali PDF GdM** — manuali tecnici visualizzabili inline:
Carpe GdM 60500 · Ricognizione · Guida operativa · Raccolta norme ·
Analisi tecniche · Legge 413/1984.

## Lo strumento file E1/EC

La pagina **Codifica / Decodifica / Modifica** converte il proprio file `.E1`/`.EC`
nel corrispondente **XML leggibile** e viceversa. Punti chiave:

- Gira **interamente nel browser**: nessun dato viene inviato ad alcun server.
- Serve a **consultare** la propria posizione e a preparare **simulazioni
  personali** («what-if») da ricaricare in Ca.R.Pe. sul proprio PC.
- Un file modificato ha valore **solo come simulazione personale**: non va mai
  presentato come documento autentico né usato al posto dell'estratto ufficiale.
  Le variazioni con effetto ufficiale vanno richieste esclusivamente a INPS.

Dettagli d'uso nella pagina **Guida utilizzo file E1**.

## Struttura tecnica del progetto

Sito statico, nessuna build necessaria per l'uso: si apre così com'è.

| Percorso | Contenuto |
|---|---|
| `index.html`, `LEGGIMI.html` | Ingresso e istruzioni |
| `assets/css/style.css` | Design system: palette "carta antica", tema chiaro/scuro, responsive |
| `assets/js/` | `app.js` (navigazione, ricerca, tabelle), `lightbox.js`, `pdf-viewer.js`, `e1-codec.js` (strumento E1), `search-index.js` (indice) |
| `assets/images/`, `assets/vendor/pdfjs/` | Immagini e libreria PDF.js (offline) |
| `pages/norme/`, `pages/procedura/`, `pages/documentazione/`, `pages/circolari/` | Le sezioni del manuale |
| `pdf/` | Manuali PDF (contenuti INPS — vedi [NOTICE](../NOTICE.md)) |
| `mht/` | Risorse estratte dai manuali HTML originali |

Note per la manutenzione:

- L'**indice di ricerca** (`assets/search-index.json` + `assets/js/search-index.js`)
  è generato dal testo delle pagine: se si modifica il contenuto, va rigenerato.
- I contenuti INPS originali, convertiti da vecchio HTML/Word, sono stati
  normalizzati nel design system (sottotitoli tematici, niente sottolineature
  che sembrano link, grassetti alleggeriti) **senza alterare il testo**.
- Nessun dato personale è presente nel repository (nessun estratto conto, nessun
  file `.E1`/`.EC` reale).

## Licenza, contenuti e responsabilità

- **Codice e interfaccia originali** → licenza [MIT](../LICENSE) © 2026 Davide Pica.
- **Contenuti INPS e di terzi** (manuali, circolari, testi, PDF, immagini) →
  © dei rispettivi titolari, riprodotti a fini informativi e di studio; **non**
  licenziati dall'autore. Base giuridica e attribuzioni in [NOTICE](../NOTICE.md).
- **Richieste di rimozione (takedown):** apri una issue e il contenuto segnalato
  sarà rimosso tempestivamente.
- **Nessuna garanzia:** i contenuti possono essere incompleti o superati e non
  hanno valore ufficiale. Leggi il **[DISCLAIMER](../DISCLAIMER.md)** completo.
