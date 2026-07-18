/* MAN2026 — E1 codec / editor in-browser
 * Trasformazione additiva del formato E1 (codifica reversibile):
 *   key = "1E1eBa59$eCf8$4F7d$9bD2$e7EEbba02393$12f"  (40 byte ASCII)
 *   decode: plain[i] = (e1[i] - key[i mod 40]) mod 256
 *   encode: e1[i]    = (plain[i] + key[i mod 40]) mod 256
 *
 * Tutto avviene client-side: il file E1 dell'utente NON viene mai inviato al server.
 */
(function () {
  'use strict';

  // ============================================================
  // ALGORITMO E1
  // ============================================================
  var E1_KEY_STRING = '1E1eBa59$eCf8$4F7d$9bD2$e7EEbba02393$12f';
  var E1_KEY = (function () {
    var k = new Uint8Array(E1_KEY_STRING.length);
    for (var i = 0; i < E1_KEY_STRING.length; i++) k[i] = E1_KEY_STRING.charCodeAt(i) & 0xff;
    return k;
  })();
  var KEY_LEN = E1_KEY.length; // 40

  function decodeE1(bytes) {
    var out = new Uint8Array(bytes.length);
    for (var i = 0; i < bytes.length; i++) {
      out[i] = (bytes[i] - E1_KEY[i % KEY_LEN]) & 0xff;
    }
    return out;
  }
  function encodeE1(bytes) {
    var out = new Uint8Array(bytes.length);
    for (var i = 0; i < bytes.length; i++) {
      out[i] = (bytes[i] + E1_KEY[i % KEY_LEN]) & 0xff;
    }
    return out;
  }

  window.MAN2026_E1 = {
    decode: decodeE1,
    encode: encodeE1,
    key: E1_KEY,
    keyString: E1_KEY_STRING
  };

  // ============================================================
  // UTIL
  // ============================================================
  function bytesToString(bytes) {
    var s = '', chunk = 0x4000;
    for (var i = 0; i < bytes.length; i += chunk) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(bytes.length, i + chunk)));
    }
    return s;
  }
  function stringToBytes(str) {
    var out = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
    return out;
  }
  function downloadBlob(data, filename, mime) {
    try {
      // Normalizza input: Uint8Array, ArrayBuffer, string → Blob
      var blob;
      if (data instanceof Blob) {
        blob = data;
      } else if (data && data.buffer instanceof ArrayBuffer) {
        // Uint8Array o simili: passo direttamente l'oggetto, NON il .buffer,
        // perché il .buffer può essere oversize rispetto a Uint8Array.length
        blob = new Blob([data], { type: mime || 'application/octet-stream' });
      } else {
        blob = new Blob([data], { type: mime || 'application/octet-stream' });
      }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename || 'download.bin';
      a.rel = 'noopener';
      a.style.position = 'fixed';
      a.style.left = '-9999px';
      a.style.top = '-9999px';
      a.style.opacity = '0';
      a.style.pointerEvents = 'none';
      document.body.appendChild(a);
      console.info('[MAN2026] downloadBlob:', filename, 'size=', blob.size, 'type=', blob.type);
      // Click sintetico — deve avvenire nello stesso tick dell'evento utente
      a.click();
      // Cleanup ritardato (alcuni browser hanno bisogno di tempo per fetchare il blob URL)
      setTimeout(function () {
        try { if (a.parentNode) a.parentNode.removeChild(a); } catch (e) {}
        try { URL.revokeObjectURL(url); } catch (e) {}
      }, 1500);
      return true;
    } catch (err) {
      console.error('[MAN2026] downloadBlob error:', err);
      try { alert('Download fallito: ' + (err && err.message ? err.message : err)); } catch (e) {}
      return false;
    }
  }
  function prettyXml(xmlStr) {
    try {
      var xml = xmlStr.replace(/>\s+</g, '><').trim();
      var formatted = '', indent = 0;
      var lines = xml.replace(/></g, '>\n<').split('\n');
      for (var i = 0; i < lines.length; i++) {
        var trimmed = lines[i].trim();
        if (!trimmed) continue;
        if (/^<\/[^>]+>/.test(trimmed)) indent = Math.max(0, indent - 1);
        formatted += '  '.repeat(indent) + trimmed + '\n';
        if (/^<[^!?\/][^>]*[^\/]>$/.test(trimmed) && !trimmed.startsWith('<?')) {
          var openMatch = trimmed.match(/^<([^\s>\/]+)/);
          if (openMatch) {
            var tag = openMatch[1];
            if (!new RegExp('</' + tag + '>$').test(trimmed)) indent++;
          }
        }
      }
      return formatted.trim();
    } catch (e) { return xmlStr; }
  }
  function parseXml(xmlStr) {
    try {
      var parser = new DOMParser();
      var doc = parser.parseFromString(xmlStr, 'application/xml');
      var errNode = doc.querySelector('parsererror');
      if (errNode) return { ok: false, error: errNode.textContent };
      return { ok: true, doc: doc };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }


  // ============================================================
  // EC FLAT-FILE PARSER — il file .EC esportato da Carpe
  // è un flat ASCII a posizioni fisse (non XML).
  // Layout dedotto sperimentalmente:
  //   0..2864     header / totali / flag
  //   2864..3128  anagrafica fissa (Cognome 30 + Nome 30 + GGMMAAAA + sesso 1 +
  //               LuogoNascita 30 + ProvinciaNascita 2 + CF 16 + Indirizzo 50 +
  //               Comune 30 + Provincia 2 + CAP 5)
  //   3128..7253  blocco accessori (CodARCA, ecc.)
  //   da 7253 in poi: record contributivi da 361 byte ciascuno, che iniziano con
  //   "S0[12]" + dataDal(GGMMAAAA) + dataAl(GGMMAAAA) + Fondo(5) + CodContrib(3) +
  //   UnitaMisura(1) + NumContributi(6) + ContribUtiliDiritto(6) +
  //   ContribUtiliMisura(12) + ContribNonUtili(6) + filler(7) + CodAzienda(10) +
  //   filler(10) + RetribuzioneEuro(9, /100) + AltroImporto(9, /100) + ...
  //
  //   In coda al file: tabelle decodifica codici contribuzione + denominazione aziende.
  // ============================================================
  function ecParseAnagrafica(text, baseOff) {
    function chunk(off, ln) { return text.substring(off, off + ln).trim(); }
    var off = baseOff;
    var ana = {};
    ana.cognome      = chunk(off, 30); off += 30;
    ana.nome         = chunk(off, 30); off += 30;
    var dn           = text.substring(off, off + 8); off += 8;
    if (dn.length === 8 && /^\d{8}$/.test(dn)) {
      ana.dataNascita = dn.substring(0,2) + '/' + dn.substring(2,4) + '/' + dn.substring(4,8);
    } else { ana.dataNascita = ''; }
    ana.sesso        = chunk(off, 1); off += 1;
    ana.luogoNascita = chunk(off, 30); off += 30;
    ana.provNascita  = chunk(off, 2);  off += 2;
    ana.codFiscale   = chunk(off, 16); off += 16;
    ana.indirizzo    = chunk(off, 50); off += 50;
    ana.comune       = chunk(off, 30); off += 30;
    ana.provincia    = chunk(off, 2);  off += 2;
    ana.cap          = chunk(off, 5);  off += 5;
    return ana;
  }

  function ecParseRecord(rec) {
    function gd(s) { return /^\d{8}$/.test(s) ? s.substring(0,2)+'/'+s.substring(2,4)+'/'+s.substring(4,8) : ''; }
    function n(s) { var v = parseInt(s, 10); return isNaN(v) ? 0 : v; }
    function eur(s) { var v = parseInt(s, 10); return isNaN(v) ? 0 : v / 100; }
    var um = rec.charAt(27);
    function umScale(v) { return um === 'M' ? v / 100 : (um === 'A' ? v / 10000 : v); }

    // Layout 361 byte completo (verificato sperimentalmente):
    // +0   tag(1)            +1   gestione(2)        +3   dataDal(8)         +11  dataAl(8)
    // +19  fondo(5)           +24  codContrib(3)      +27  unitaMisura(1)
    // +28  numContrib(6)      +34  ctrUtDir(6)        +40  ctrUtMis(12)       +52  ctrNonU(6)
    // +58  filler1(7)         +65  codAzienda(10)     +75  filler2(10)
    // +85  retribEuro(9)      +94  altroImporto(9)    +103 ctrNUEuro(12)
    // +115 filler(6)          +121 codIndiv(16)       +137 mesiLav(13)
    // +150 segnal(3)          +153 categoria(4)       +157 qualifica(3)
    // +160 filler/spazi fino a inizio dati mensili (variabile per record breve)
    // Cerca dataMensili: 12 blocchi di 13 byte negli ultimi 156 byte del record (361-156=205).
    // Layout blocco: giorni(2) + retribTeorica(10, /100) + assenze(1).
    var datiMensili = [];
    var DM_START = 205; // standard per record annuale completo
    // Per record che parte a metà anno, alcuni blocchi sono zeri/spazi all'inizio.
    for (var k = 0; k < 12; k++) {
      var off = DM_START + k * 13;
      if (off + 13 > rec.length) break;
      var blk = rec.substring(off, off + 13);
      if (/^\s+$/.test(blk) || /^0+$/.test(blk)) {
        datiMensili.push({ giorniUtili: 0, retribTeorica: 0, assenze: 0, raw: blk });
      } else {
        var g = blk.substring(0, 2);
        var r = blk.substring(2, 12);
        var a = blk.substring(12, 13);
        datiMensili.push({
          giorniUtili: /^\d+$/.test(g) ? parseInt(g, 10) : 0,
          retribTeorica: /^\d+$/.test(r) ? parseInt(r, 10) / 100 : 0,
          assenze: /^\d+$/.test(a) ? parseInt(a, 10) : 0,
          raw: blk
        });
      }
    }

    return {
      tag:                rec.charAt(0),
      gestione:           rec.substring(1, 3),
      dataDal:            gd(rec.substring(3, 11)),
      dataAl:             gd(rec.substring(11, 19)),
      fondo:              rec.substring(19, 24).trim(),
      codiceContrib:      rec.substring(24, 27).trim(),
      unitaMisura:        um,
      numeroContributi:   umScale(n(rec.substring(28, 34))),
      contribUtiliDiritto:umScale(n(rec.substring(34, 40))),
      contribUtiliMisura: n(rec.substring(40, 52)) / 1000,
      contribNonUtili:    n(rec.substring(52, 58)),
      codiceAzienda:      rec.substring(65, 75).trim(),
      retribuzione:       eur(rec.substring(85, 94)),
      altroImporto:       eur(rec.substring(94, 103)),
      contribNonUtiliEuro:eur(rec.substring(103, 115).substring(0, 9)),
      codiceIndividuale:  rec.substring(121, 137).trim(),
      mesiLavorati:       rec.substring(137, 150).trim(),
      segnalazione:       rec.substring(150, 153).trim(),
      categoria:          rec.substring(153, 157).trim(),
      qualifica:          rec.substring(157, 160).trim(),
      datiMensili:        datiMensili
    };
  }

  function ecParseLookups(text) {
    // Cerca blocchi tipo "075fondi speciali           076Retrib. pensionabili     ..."
    // e "1600537039S.D.F. CALO' LUIGI..."
    var lookupContrib = {};
    var lookupAziende = {};
    // codici contribuzione: 3 cifre + descrizione 25 chars, ripetuti
    var rxContrib = /(\d{3})([A-Za-z][A-Za-z .,'&\/\-]{2,24})/g;
    // Cerco solo nelle ultime ~10K caratteri (lookup tables sono in coda)
    var tail = text.substring(Math.max(0, text.length - 20000));
    var m;
    while ((m = rxContrib.exec(tail)) !== null) {
      var code = m[1];
      var descr = m[2].trim();
      if (descr.length >= 3 && code.length === 3 && !lookupContrib[code]) {
        lookupContrib[code] = descr;
      }
    }
    // codici azienda: 10 cifre + ragione sociale fino a 70 chars
    var rxAz = /(\d{10})([A-Z][A-Z .,'&\/\-]{3,70})/g;
    while ((m = rxAz.exec(tail)) !== null) {
      var ac = m[1];
      var an = m[2].trim();
      if (!lookupAziende[ac] && an.length >= 5) lookupAziende[ac] = an;
    }
    return { contrib: lookupContrib, aziende: lookupAziende };
  }

  // Cerca l\'offset dell\'anagrafica in modo dinamico:
  // pattern = 30 char di Cognome (lettere/spazi) + 30 char Nome + 8 cifre data + 1 sesso (M/F).
  // Funziona indipendentemente dalla posizione nel file.
  function findAnagraficaOffset(text) {
    // Regex robusta: 60 caratteri ASCII print + 8 cifre + M/F + 30 luogo + 2 prov + CF 16 char alfanumerici
    var rx = /([A-Z][A-Z\u00C0-\u017F\' .\-]{1,29}\s*)([A-Z][A-Z\u00C0-\u017F\' .\-]{1,29}\s*)(\d{8})([MF])/;
    var m = rx.exec(text);
    if (m && m.index >= 0) {
      // L\'offset di inizio Cognome è m.index, ma il campo è di 30 char giustificato a sinistra.
      // Verifica che a (offset + 60) ci siano 8 cifre poi M/F: già garantito dal regex.
      // Però voglio essere sicuro che (offset + 101) sia un CF di 16 char alfanumerici.
      var start = m.index;
      var cf = text.substring(start + 101, start + 117);
      if (/^[A-Z0-9]{16}$/.test(cf)) {
        return start;
      }
    }
    return -1;
  }

  function ecToXml(text) {
    var REC_LEN = 361;
    var anaOff = findAnagraficaOffset(text);
    if (anaOff < 0) {
      throw new Error('Anagrafica non riconosciuta nel file (formato EC non supportato o file corrotto)');
    }
    var ana = ecParseAnagrafica(text, anaOff);

    // Trova tutti i record contributivi
    var rxRec = /S0[12]\d{8}\d{8}/g;
    var matches = [];
    var m;
    while ((m = rxRec.exec(text)) !== null) {
      matches.push(m.index);
    }
    var records = [];
    for (var i = 0; i < matches.length; i++) {
      var rec = text.substring(matches[i], matches[i] + REC_LEN);
      if (rec.length >= 200) records.push(ecParseRecord(rec));
    }

    var lookups = ecParseLookups(text);

    // Costruisci XML formattato (umano-leggibile, simile alla struttura UNEX)
    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<EstrattoCarpe formato="EC" generato-da="MAN2026">\n';
    xml += '  <Anagrafica>\n';
    xml += '    <Cognome>' + esc(ana.cognome) + '</Cognome>\n';
    xml += '    <Nome>' + esc(ana.nome) + '</Nome>\n';
    xml += '    <CodiceFiscale>' + esc(ana.codFiscale) + '</CodiceFiscale>\n';
    xml += '    <Sesso>' + esc(ana.sesso) + '</Sesso>\n';
    xml += '    <DataNascita>' + esc(ana.dataNascita) + '</DataNascita>\n';
    xml += '    <LuogoNascita prov="' + esc(ana.provNascita) + '">' + esc(ana.luogoNascita) + '</LuogoNascita>\n';
    xml += '    <Indirizzo>' + esc(ana.indirizzo) + '</Indirizzo>\n';
    xml += '    <Comune prov="' + esc(ana.provincia) + '" cap="' + esc(ana.cap) + '">' + esc(ana.comune) + '</Comune>\n';
    xml += '  </Anagrafica>\n';
    xml += '  <PeriodiContributivi totale="' + records.length + '">\n';
    for (var j = 0; j < records.length; j++) {
      var p = records[j];
      var azDescr = lookups.aziende[p.codiceAzienda] || '';
      var ccDescr = lookups.contrib[p.codiceContrib] || '';
      xml += '    <Periodo n="' + (j + 1) + '">\n';
      xml += '      <Dal>' + esc(p.dataDal) + '</Dal>\n';
      xml += '      <Al>' + esc(p.dataAl) + '</Al>\n';
      xml += '      <Fondo>' + esc(p.fondo) + '</Fondo>\n';
      xml += '      <CodiceContribuzione descr="' + esc(ccDescr) + '">' + esc(p.codiceContrib) + '</CodiceContribuzione>\n';
      xml += '      <UnitaMisura>' + esc(p.unitaMisura) + '</UnitaMisura>\n';
      xml += '      <NumeroContributi>' + (Number.isInteger(p.numeroContributi) ? p.numeroContributi : p.numeroContributi.toFixed(2)) + '</NumeroContributi>\n';
      xml += '      <ContributiUtiliDiritto>' + (Number.isInteger(p.contribUtiliDiritto) ? p.contribUtiliDiritto : p.contribUtiliDiritto.toFixed(2)) + '</ContributiUtiliDiritto>\n';
      xml += '      <ContributiUtiliMisura>' + p.contribUtiliMisura.toFixed(3) + '</ContributiUtiliMisura>\n';
      xml += '      <ContributiNonUtili>' + p.contribNonUtili + '</ContributiNonUtili>\n';
      xml += '      <CodiceAzienda descr="' + esc(azDescr) + '">' + esc(p.codiceAzienda) + '</CodiceAzienda>\n';
      xml += '      <RetribuzioneEuro>' + p.retribuzione.toFixed(2) + '</RetribuzioneEuro>\n';
      xml += '      <AltroImporto>' + p.altroImporto.toFixed(2) + '</AltroImporto>\n';
      xml += '      <ContribNonUtiliEuro>' + (p.contribNonUtiliEuro || 0).toFixed(2) + '</ContribNonUtiliEuro>\n';
      xml += '      <CodiceIndividuale>' + esc(p.codiceIndividuale) + '</CodiceIndividuale>\n';
      xml += '      <MesiLavorati>' + esc(p.mesiLavorati) + '</MesiLavorati>\n';
      xml += '      <Segnalazione>' + esc(p.segnalazione) + '</Segnalazione>\n';
      xml += '      <Categoria>' + esc(p.categoria) + '</Categoria>\n';
      xml += '      <Qualifica>' + esc(p.qualifica) + '</Qualifica>\n';
      // 12 blocchi DatiMensili
      if (p.datiMensili && p.datiMensili.length > 0) {
        xml += '      <DatiMensili>\n';
        for (var dm = 0; dm < p.datiMensili.length; dm++) {
          var b = p.datiMensili[dm];
          xml += '        <Mese n="' + (dm + 1) + '">' +
                 '<GiorniUtili>' + b.giorniUtili + '</GiorniUtili>' +
                 '<RetribuzioneTeorica>' + b.retribTeorica.toFixed(2) + '</RetribuzioneTeorica>' +
                 '<Assenze>' + b.assenze + '</Assenze>' +
                 '</Mese>\n';
        }
        xml += '      </DatiMensili>\n';
      }
      xml += '    </Periodo>\n';
    }
    xml += '  </PeriodiContributivi>\n';
    if (Object.keys(lookups.contrib).length > 0) {
      xml += '  <CodiciContribuzione>\n';
      var ks1 = Object.keys(lookups.contrib).sort();
      for (var k1 = 0; k1 < ks1.length; k1++) {
        xml += '    <Voce codice="' + esc(ks1[k1]) + '">' + esc(lookups.contrib[ks1[k1]]) + '</Voce>\n';
      }
      xml += '  </CodiciContribuzione>\n';
    }
    if (Object.keys(lookups.aziende).length > 0) {
      xml += '  <Aziende>\n';
      var ks2 = Object.keys(lookups.aziende).sort();
      for (var k2 = 0; k2 < ks2.length; k2++) {
        xml += '    <Azienda codice="' + esc(ks2[k2]) + '">' + esc(lookups.aziende[ks2[k2]]) + '</Azienda>\n';
      }
      xml += '  </Aziende>\n';
    }
    xml += '</EstrattoCarpe>\n';
    return xml;
  }

  // ============================================================
  // .AG — formato anagrafico AGO Carpe (ASCII flat-file, NON cifrato).
  // Struttura osservata sul file Goldani 2027:
  //   - Header 321 byte: magic "AG " + CF(16) + Cognome+Nome(30) + spazi(6) +
  //     sesso(1) + dataNascita(8 ddmmaaaa) + 4 date a 8 cifre + 4 cifre + zeri
  //   - Record annuale 255 byte: anno(4) + spazi(9) + 242 byte di dati
  //   - 42 record annuali (2027 → 1984), poi padding/sezioni accessorie
  //
  // Round-trip esatto: ricostruiamo posizionalmente, niente trasformazioni
  // numeriche (le cifre vengono passate as-is).
  // ============================================================
  function agToXml(text) {
    if (text.length < 321) {
      throw new Error('File .AG troppo corto (' + text.length + ' byte, atteso ≥321)');
    }
    if (text.substring(0, 3) !== 'AG ') {
      throw new Error('Magic "AG " non riconosciuto all\'inizio del file');
    }
    var hdr = text.substring(0, 321);
    // Trova tutti i record annuali via regex (anno YYYY + 9 spazi consecutivi)
    var rxYear = /(19\d{2}|20\d{2}) {9}/g;
    var matches = [];
    var m;
    while ((m = rxYear.exec(text)) !== null) matches.push({ off: m.index, year: m[1] });
    // Filtra solo quelli che fanno parte della tabella annuale (dopo header)
    matches = matches.filter(function (x) { return x.off >= 320; });
    var REC = 255;

    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    var ana = {
      magic:        hdr.substring(0, 3),
      codFiscale:   hdr.substring(3, 19).trim(),
      cognomeNome:  hdr.substring(19, 49).trim(),
      // hdr.substring(49,55) = 6 spazi
      sesso:        hdr.substring(55, 56),
      dataNascita:  hdr.substring(56, 64),
      campoData1:   hdr.substring(64, 72),
      campoData2:   hdr.substring(72, 80),
      campoNum1:    hdr.substring(80, 88),
      campoNum2:    hdr.substring(88, 96),
      campoNum3:    hdr.substring(96, 100),
      // hdr.substring(100,321) = padding zeri/spazi
      padding:      hdr.substring(100, 321)
    };

    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<EstrattoAGO formato="AG" generato-da="MAN2026">\n';
    xml += '  <Anagrafica>\n';
    xml += '    <CodiceFiscale>' + esc(ana.codFiscale) + '</CodiceFiscale>\n';
    xml += '    <CognomeNome>' + esc(ana.cognomeNome) + '</CognomeNome>\n';
    xml += '    <Sesso>' + esc(ana.sesso) + '</Sesso>\n';
    xml += '    <DataNascita>' + esc(ana.dataNascita) + '</DataNascita>\n';
    xml += '    <CampoData1>' + esc(ana.campoData1) + '</CampoData1>\n';
    xml += '    <CampoData2>' + esc(ana.campoData2) + '</CampoData2>\n';
    xml += '    <CampoNum1>' + esc(ana.campoNum1) + '</CampoNum1>\n';
    xml += '    <CampoNum2>' + esc(ana.campoNum2) + '</CampoNum2>\n';
    xml += '    <CampoNum3>' + esc(ana.campoNum3) + '</CampoNum3>\n';
    xml += '    <HeaderPadding>' + esc(ana.padding) + '</HeaderPadding>\n';
    xml += '  </Anagrafica>\n';

    xml += '  <PeriodiAnnui totale="' + matches.length + '">\n';
    for (var i = 0; i < matches.length; i++) {
      var rec = text.substring(matches[i].off, matches[i].off + REC);
      var year = rec.substring(0, 4);
      var dati = rec.substring(13);  // 242 byte di payload numerico

      // Decoder dei blocchi quota retributiva: ogni blocco è
      //   3 cifre settimane + 11 cifre importo in decimi di euro
      // Esempio 2025: "052" + "00000778740" = 52 sett, 77874,00 €
      // Decoder validato sul file Goldani: 2025/2024/2026 corrispondono
      // ai valori R.pond.annuo AGO mostrati nel pannello Pens.Retrib.
      var blocchi = [];
      var BLOCK = 14;          // 3 + 11
      var N_BLOCKS = 5;        // i primi 5 blocchi sono le quote principali
      for (var k = 0; k < N_BLOCKS; k++) {
        var b = dati.substring(k * BLOCK, (k + 1) * BLOCK);
        if (b.length < BLOCK) break;
        blocchi.push({
          settimane: b.substring(0, 3),
          importo:   b.substring(3, 14)   // 11 char in decimi di euro
        });
      }

      xml += '    <Anno valore="' + esc(year) + '">\n';
      xml += '      <Quote>\n';
      for (var qq = 0; qq < blocchi.length; qq++) {
        xml += '        <Q n="' + (qq + 1) + '">' +
               '<Sett>' + esc(blocchi[qq].settimane) + '</Sett>' +
               '<Imp>' + esc(blocchi[qq].importo) + '</Imp>' +
               '</Q>\n';
      }
      xml += '      </Quote>\n';
      // Payload completo (round-trip esatto): stocchiamo i 242 byte raw
      xml += '      <Payload>' + esc(dati) + '</Payload>\n';
      xml += '    </Anno>\n';
    }
    xml += '  </PeriodiAnnui>\n';

    // Eventuale coda dopo l'ultimo record annuale
    if (matches.length > 0) {
      var lastEnd = matches[matches.length - 1].off + REC;
      var tail = text.substring(lastEnd);
      if (tail.length > 0) {
        xml += '  <Coda lunghezza="' + tail.length + '">' + esc(tail) + '</Coda>\n';
      }
    }
    xml += '</EstrattoAGO>\n';
    return xml;
  }

  // RIENCODE AG — XML → flat-file ASCII .AG
  function xmlToAg(xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    var perr = doc.querySelector('parsererror');
    if (perr) throw new Error('XML non valido: ' + perr.textContent);
    var root = doc.documentElement;
    if (!root || root.nodeName !== 'EstrattoAGO') {
      throw new Error('Atteso <EstrattoAGO> come root, trovato <' + (root ? root.nodeName : '?') + '>');
    }

    function txt(parent, sel) {
      var el = parent ? parent.querySelector(sel) : null;
      return el ? el.textContent : '';
    }
    function padRight(s, n) {
      s = String(s || '');
      while (s.length < n) s += ' ';
      return s.substring(0, n);
    }
    function padLeft(s, n, ch) {
      s = String(s || '');
      ch = ch || '0';
      while (s.length < n) s = ch + s;
      return s.substring(s.length - n);
    }
    function padDigits(s, n) { return padLeft(s, n, '0'); }

    var ana = root.querySelector('Anagrafica');
    if (!ana) throw new Error('<Anagrafica> mancante');

    var hdr = '';
    hdr += 'AG ';                                      // 0..3
    hdr += padRight(txt(ana, 'CodiceFiscale'), 16);    // 3..19
    hdr += padRight(txt(ana, 'CognomeNome'), 30);      // 19..49
    hdr += '      ';                                    // 49..55 (6 spazi)
    hdr += padRight(txt(ana, 'Sesso') || ' ', 1);      // 55..56
    hdr += padDigits(txt(ana, 'DataNascita'), 8);      // 56..64
    hdr += padDigits(txt(ana, 'CampoData1'), 8);       // 64..72
    hdr += padDigits(txt(ana, 'CampoData2'), 8);       // 72..80
    hdr += padDigits(txt(ana, 'CampoNum1'), 8);        // 80..88
    hdr += padDigits(txt(ana, 'CampoNum2'), 8);        // 88..96
    hdr += padDigits(txt(ana, 'CampoNum3'), 4);        // 96..100
    var hp = txt(ana, 'HeaderPadding');
    hdr += padRight(hp, 221);                          // 100..321
    if (hdr.length !== 321) {
      // Garantisce 321
      hdr = hdr.length > 321 ? hdr.substring(0, 321) : padRight(hdr, 321);
    }

    var out = hdr;
    var anni = root.querySelectorAll('PeriodiAnnui > Anno');
    for (var i = 0; i < anni.length; i++) {
      var an = anni[i];
      var year = padDigits(an.getAttribute('valore') || '', 4);
      var payload = txt(an, 'Payload');
      // Se non c'è payload completo, prova a ricostruire dai blocchi Quote
      if (!payload) {
        var qs = an.querySelectorAll('Quote > Q');
        var rebuilt = '';
        for (var k = 0; k < qs.length; k++) {
          rebuilt += padDigits(txt(qs[k], 'Sett'), 5);
          rebuilt += padDigits(txt(qs[k], 'Imp'), 7);
        }
        payload = padRight(rebuilt, 242);
      } else {
        payload = padRight(payload, 242).substring(0, 242);
      }
      out += year + '         ' + payload;  // 4 + 9 + 242 = 255
    }

    var coda = root.querySelector('Coda');
    if (coda) out += coda.textContent;

    return out;
  }

  // ============================================================
  // RIENCODE EC — converte l\'XML strutturato (output di ecToXml o XML modificato
  // dall\'utente) in formato .EC ASCII a posizioni fisse compatibile con Carpe.
  // ============================================================
  function pad(s, ln, leftAlign) {
    s = String(s == null ? '' : s);
    if (s.length > ln) return s.substring(0, ln);
    return leftAlign ? s + ' '.repeat(ln - s.length) : ' '.repeat(ln - s.length) + s;
  }
  function padNum(num, ln) {
    var s = String(Math.round(num));
    if (s.length > ln) s = s.substring(s.length - ln); // tronca in testa
    return '0'.repeat(ln - s.length) + s;
  }
  function ddmmyyyy(slashed) {
    // input "DD/MM/YYYY" → "DDMMYYYY"
    if (!slashed) return '00000000';
    var clean = slashed.replace(/[^0-9]/g, '');
    if (clean.length < 8) clean = clean + '0'.repeat(8 - clean.length);
    return clean.substring(0, 8);
  }
  function getElText(parent, tag) {
    if (!parent) return '';
    var els = parent.getElementsByTagName(tag);
    return els.length > 0 ? (els[0].textContent || '').trim() : '';
  }
  function getElAttr(parent, tag, attr) {
    if (!parent) return '';
    var els = parent.getElementsByTagName(tag);
    return els.length > 0 ? els[0].getAttribute(attr) || '' : '';
  }

  function buildEcRecord(periodo) {
    var um = (getElText(periodo, 'UnitaMisura') || 'S').charAt(0);
    var rawNumContrib = parseFloat(getElText(periodo, 'NumeroContributi')) || 0;
    var rawCtrUtDir   = parseFloat(getElText(periodo, 'ContributiUtiliDiritto')) || 0;
    var ctrUtMis      = parseFloat(getElText(periodo, 'ContributiUtiliMisura')) || 0;
    // Riapplica scala UM-aware
    function scaleUM(v) {
      if (um === 'M') return Math.round(v * 100);
      if (um === 'A') return Math.round(v * 10000);
      return Math.round(v);
    }
    var numContribRaw = scaleUM(rawNumContrib);
    var ctrUtDirRaw   = scaleUM(rawCtrUtDir);
    var ctrUtMisRaw   = Math.round(ctrUtMis * 1000);
    var ctrNonU       = parseInt(getElText(periodo, 'ContributiNonUtili')) || 0;
    var retrib        = parseFloat(getElText(periodo, 'RetribuzioneEuro')) || 0;
    var altroImp      = parseFloat(getElText(periodo, 'AltroImporto')) || 0;
    var fondo         = (getElText(periodo, 'Fondo') || '').toUpperCase();
    var codContr      = getElText(periodo, 'CodiceContribuzione');
    var codAzienda    = getElText(periodo, 'CodiceAzienda');
    var qualifica     = getElText(periodo, 'Qualifica');
    var dal           = getElText(periodo, 'Dal');
    var al            = getElText(periodo, 'Al');

    // Costruzione del record (361 byte)
    var rec = '';
    rec += 'S';                                  // +0   tag
    rec += pad('02', 2, false);                  // +1   gestione (default 02 — può essere personalizzato in futuro)
    // override gestione se presente
    var gestAttr = periodo.getAttribute('gestione');
    if (gestAttr && gestAttr.length === 2) rec = rec.substring(0, 1) + gestAttr;
    rec += ddmmyyyy(dal);                        // +3   data dal
    rec += ddmmyyyy(al);                         // +11  data al
    rec += pad(fondo, 5, true);                  // +19  fondo (left-aligned)
    rec += pad(codContr, 3, false);              // +24  cod contrib
    rec += um;                                   // +27  UM
    rec += padNum(numContribRaw, 6);             // +28  NumeroContributi
    rec += padNum(ctrUtDirRaw, 6);               // +34  ContribUtiliDiritto
    rec += padNum(ctrUtMisRaw, 12);              // +40  ContribUtiliMisura
    rec += padNum(ctrNonU, 6);                   // +52  ContribNonUtili
    rec += pad('', 7, true);                     // +58  filler (7 spazi)
    rec += pad(codAzienda, 10, false);           // +65  codice azienda (zeropad o spaces?)
    // In realtà nei sample il codAzienda è zero-padded: "1600537039" sono già 10 cifre.
    // Sostituiamo eventuali spazi iniziali con zeri se è puramente numerico:
    var lastAz = rec.length - 10;
    var azChunk = rec.substring(lastAz);
    if (/^\s*\d+$/.test(azChunk)) {
      rec = rec.substring(0, lastAz) + '0'.repeat(10 - azChunk.trim().length) + azChunk.trim();
    }
    rec += pad('', 10, true);                    // +75  filler (10 spazi)
    rec += padNum(Math.round(retrib * 100), 9);  // +85  retribuzione (in centesimi)
    rec += padNum(Math.round(altroImp * 100), 9);// +94  altro importo (in centesimi)
    var ctrNUE   = parseFloat(getElText(periodo, 'ContribNonUtiliEuro')) || 0;
    var codIndiv = getElText(periodo, 'CodiceIndividuale');
    var mesiLav  = getElText(periodo, 'MesiLavorati');
    var segn     = getElText(periodo, 'Segnalazione');
    var categ    = getElText(periodo, 'Categoria');
    rec += padNum(Math.round(ctrNUE * 100), 12); // +103 ContribNonUtiliEuro (12 cifre, 2 decimali)
    rec += pad('', 6, true);                     // +115 filler
    rec += pad(codIndiv, 16, true);              // +121 CodiceIndividuale
    rec += pad(mesiLav, 13, true);               // +137 MesiLavorati
    rec += pad(segn, 3, true);                   // +150 Segnalazione
    rec += pad(categ, 4, true);                  // +153 Categoria
    rec += pad(qualifica, 3, true);              // +157 Qualifica
    // +160 filler 45 byte spazi → fino a +205 (inizio DatiMensili)
    while (rec.length < 205) rec += ' ';
    // 12 DatiMensili (giorni 2 + retrib 10 + assenze 1 = 13 byte ciascuno = 156 byte totali)
    var mesiNodes = periodo.getElementsByTagName('Mese');
    for (var mi = 0; mi < 12; mi++) {
      if (mi < mesiNodes.length) {
        var mn = mesiNodes[mi];
        var g = parseInt(getElText(mn, 'GiorniUtili')) || 0;
        var rt = parseFloat(getElText(mn, 'RetribuzioneTeorica')) || 0;
        var as = parseInt(getElText(mn, 'Assenze')) || 0;
        rec += padNum(g, 2);
        rec += padNum(Math.round(rt * 100), 10);
        rec += padNum(as, 1);
      } else {
        rec += '0000000000000';
      }
    }
    // Padding finale a 361 byte
    while (rec.length < REC_LEN_CONST) rec += ' ';
    if (rec.length > REC_LEN_CONST) rec = rec.substring(0, REC_LEN_CONST);
    return rec;
  }
  var REC_LEN_CONST = 361;

  function xmlToEc(xmlStr) {
    var r = parseXml(xmlStr);
    if (!r.ok) throw new Error('XML non valido: ' + (r.error || ''));
    var doc = r.doc;
    var anaNode = doc.getElementsByTagName('Anagrafica')[0];
    if (!anaNode) throw new Error('Tag <Anagrafica> non trovato');

    // Costruisce il blocco anagrafica (264 byte fissi)
    var dn = getElText(anaNode, 'DataNascita');
    var dnRaw = ddmmyyyy(dn);
    var luogoNode = anaNode.getElementsByTagName('LuogoNascita')[0];
    var comuneNode = anaNode.getElementsByTagName('Comune')[0];
    var anaBlock = '';
    anaBlock += pad(getElText(anaNode, 'Cognome'), 30, true);
    anaBlock += pad(getElText(anaNode, 'Nome'), 30, true);
    anaBlock += dnRaw;
    anaBlock += pad(getElText(anaNode, 'Sesso') || 'M', 1, true);
    anaBlock += pad(luogoNode ? luogoNode.textContent.trim() : '', 30, true);
    anaBlock += pad(luogoNode ? luogoNode.getAttribute('prov') || '' : '', 2, true);
    anaBlock += pad(getElText(anaNode, 'CodiceFiscale'), 16, true);
    anaBlock += pad(getElText(anaNode, 'Indirizzo'), 50, true);
    anaBlock += pad(comuneNode ? comuneNode.textContent.trim() : '', 30, true);
    anaBlock += pad(comuneNode ? comuneNode.getAttribute('prov') || '' : '', 2, true);
    anaBlock += pad(comuneNode ? comuneNode.getAttribute('cap') || '' : '', 5, true);

    // Header standard 2864 byte di filler/zeri (replica struttura osservata)
    // Iniziamo con 8 spazi + dati standard, poi zeri di riempimento.
    var header = '        '; // 8 spazi iniziali tipici
    var oggi = new Date();
    var ddmm = String(oggi.getDate()).padStart(2,'0') + String(oggi.getMonth()+1).padStart(2,'0') + oggi.getFullYear();
    header += ddmm + '0000000' + ddmm + '0000000000101010000000100  00000000 ';
    // Riempi fino a 2864 byte con zeri/spazi
    while (header.length < 2864) header += '0';
    header = header.substring(0, 2864);

    // Blocco accessori (3128..7253 = 4125 byte) — riempito con spazi/zeri standard
    var accessori = pad('GLD0002014861000000', 30, true);
    while (accessori.length < (7253 - 2864 - 264)) accessori += ' ';
    accessori = accessori.substring(0, 7253 - 2864 - 264);

    // Costruisci tutti i record
    var periodi = doc.getElementsByTagName('Periodo');
    var records = '';
    for (var i = 0; i < periodi.length; i++) {
      records += buildEcRecord(periodi[i]);
    }

    // Tabelle lookup in coda
    var tail = '';
    var voci = doc.getElementsByTagName('Voce');
    if (voci.length > 0) {
      // Padding spazi prima delle voci (replicato dal sample)
      tail += ' '.repeat(80);
      for (var v = 0; v < voci.length; v++) {
        tail += pad(voci[v].getAttribute('codice') || '', 3, true);
        tail += pad(voci[v].textContent.trim(), 25, true);
      }
    }
    var aziende = doc.getElementsByTagName('Azienda');
    if (aziende.length > 0) {
      tail += ' '.repeat(80);
      for (var a = 0; a < aziende.length; a++) {
        tail += pad(aziende[a].getAttribute('codice') || '', 10, true);
        tail += pad(aziende[a].textContent.trim(), 80, true);
      }
    }

    var full = header + anaBlock + accessori + records + tail;
    // Aggiungi NUL byte finale come da formato osservato
    full += '\x00';
    return full;
  }



  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
// ==========================================
  // UI E1 TOOL
  // ==========================================
  ready(function () {
    var tool = document.getElementById('e1-tool');
    if (!tool) return;

    var dropzone     = document.getElementById('e1-dropzone');
    var fileInput    = document.getElementById('e1-file-input');
    var pickBtn      = document.getElementById('e1-pick-btn');
    var status       = document.getElementById('e1-status');
    var fileMeta     = document.getElementById('e1-file-meta');
    var editorSec    = document.getElementById('e1-editor-section');
    var editor       = document.getElementById('e1-xml-editor');
    var btnPretty    = document.getElementById('e1-btn-pretty');
    var btnValidate  = document.getElementById('e1-btn-validate');
    var btnCopy      = document.getElementById('e1-btn-copy');
    var btnDownXml   = document.getElementById('e1-btn-download-xml');
    var btnDownE1    = document.getElementById('e1-btn-download-e1');
    var btnReset     = document.getElementById('e1-btn-reset');
    var keyAscii     = document.getElementById('e1-key-ascii');
    var keyHex       = document.getElementById('e1-key-hex');

    var originalFilename = 'estratto';

    // ============================================================
    // setStatus → ora apre un TOAST fissato in alto al viewport con
    // countdown 10s, pulsante X per chiudere subito, colore in base
    // al tipo (ok=verde, info=blu, warn=arancio, error=rosso).
    // ============================================================
    function setStatus(msg, type) {
      // Aggiorno anche il div statico (per accessibilità / fallback)
      if (status) {
        status.classList.remove('is-ok', 'is-error', 'is-info', 'is-warn');
        if (type) status.classList.add('is-' + type);
        status.textContent = msg;
      }
      showToast(msg, type || 'info');
    }

    // Container globale dei toast (creato lazy, una sola volta)
    function getToastContainer() {
      var c = document.getElementById('e1-toast-container');
      if (c) return c;
      c = document.createElement('div');
      c.id = 'e1-toast-container';
      c.setAttribute('aria-live', 'polite');
      c.setAttribute('aria-atomic', 'false');
      document.body.appendChild(c);
      return c;
    }

    function showToast(msg, type) {
      var container = getToastContainer();
      var t = document.createElement('div');
      t.className = 'e1-toast e1-toast--' + (type || 'info');
      t.setAttribute('role', type === 'error' ? 'alert' : 'status');
      var icon = '';
      if (type === 'ok')         icon = '✓';
      else if (type === 'error') icon = '✗';
      else if (type === 'warn')  icon = '⚠';
      else                       icon = 'ℹ';
      t.innerHTML =
        '<span class="e1-toast__icon">' + icon + '</span>' +
        '<span class="e1-toast__msg"></span>' +
        '<button type="button" class="e1-toast__close" aria-label="Chiudi notifica">×</button>' +
        '<span class="e1-toast__bar"></span>';
      // Imposta il messaggio come testo per evitare HTML injection
      t.querySelector('.e1-toast__msg').textContent = msg;
      container.appendChild(t);

      // Slide-in
      requestAnimationFrame(function () {
        t.classList.add('is-visible');
      });

      // Auto-close dopo 10s, con barra di countdown animata
      var DURATION = 10000;
      var bar = t.querySelector('.e1-toast__bar');
      if (bar) {
        bar.style.transition = 'transform ' + DURATION + 'ms linear';
        requestAnimationFrame(function () {
          bar.style.transform = 'scaleX(0)';
        });
      }

      var closed = false;
      function close() {
        if (closed) return;
        closed = true;
        t.classList.remove('is-visible');
        t.classList.add('is-leaving');
        setTimeout(function () {
          if (t.parentNode) t.parentNode.removeChild(t);
        }, 320);
      }
      var timer = setTimeout(close, DURATION);
      t.querySelector('.e1-toast__close').addEventListener('click', function () {
        clearTimeout(timer);
        close();
      });
    }

    // Gutter line-numbers per la textarea editor.
    var gutterEl = document.getElementById('e1-editor-gutter');
    function updateGutter() {
      if (!gutterEl || !editor) return;
      var n = (editor.value.match(/\n/g) || []).length + 1;
      var html = '';
      for (var i = 1; i <= n; i++) html += '<div>' + i + '</div>';
      gutterEl.innerHTML = html;
      // sync scroll
      gutterEl.scrollTop = editor.scrollTop;
    }
    if (editor) {
      editor.addEventListener('input', updateGutter);
      editor.addEventListener('scroll', function () {
        if (gutterEl) gutterEl.scrollTop = editor.scrollTop;
      });
    }

    function showEditor(xmlStr) {
      if (editorSec) editorSec.style.display = '';
      if (!editor) return;
      editor.value = xmlStr;
      updateGutter();
      var r = parseXml(xmlStr);
      if (r.ok) {
        var all = r.doc.getElementsByTagName('*');
        var root = r.doc.documentElement.tagName;
        setStatus('✓ XML valido. Root: ' + root + ' · ' + all.length + ' elementi.', 'ok');
      } else {
        setStatus('XML decodificato ma non sintatticamente valido: ' + (r.error || ''), 'error');
      }
      try { editorSec.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
    }

    function processFile(file) {
      if (!file) return;
      originalFilename = (file.name || 'estratto').replace(/\.(e1|ec|ag|xml|txt)$/i, '');
      if (fileMeta) fileMeta.textContent = file.name + '  ·  ' + (file.size / 1024).toFixed(1) + ' KB';

      var reader = new FileReader();
      reader.onload = function (e) {
        var buf = new Uint8Array(e.target.result);
        var lower = (file.name || '').toLowerCase();
        // Detection robusta:
        // - estensione .ec/.xml/.txt → MAI E1 (anche con BOM)
        // - estensione .e1 → sempre E1
        // - senza estensione: euristica sui primi byte (skippando BOM)
        var firstByte = buf.length > 0 ? buf[0] : 0;
        var skipBom = (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) ? 3 : 0;
        var firstReal = buf.length > skipBom ? buf[skipBom] : 0;
        var isPlainText = (firstReal === 0x3C || firstReal === 0x09 || firstReal === 0x20 || firstReal === 0x0A || firstReal === 0x0D);
        var isE1 = false;
        // Il file .EC NON è XML — è un flat file a record fissi proprietario INPS (esportato da Carpe).
        // Quindi se l'utente carica un .EC mostriamo un avviso e NON proviamo a parsarlo come XML.
        var isEcFlat = lower.endsWith('.ec');
        // Il file .AG è un flat file ASCII anagrafico AGO (Carpe)
        var isAgFlat = lower.endsWith('.ag');
        // Detection by magic se senza estensione utile
        if (!isAgFlat && !isEcFlat && !lower.endsWith('.e1') && !lower.endsWith('.xml') && !lower.endsWith('.txt')) {
          // Magic AG: prima 3 byte "AG "
          if (buf.length >= 3 && buf[0] === 0x41 && buf[1] === 0x47 && buf[2] === 0x20) isAgFlat = true;
        }
        if (isAgFlat) {
          isE1 = false;
        } else if (isEcFlat) {
          isE1 = false;
        } else if (lower.endsWith('.xml') || lower.endsWith('.txt')) {
          isE1 = false;
        } else if (lower.endsWith('.e1')) {
          isE1 = true;
        } else {
          // senza estensione: se il primo byte (skip BOM) è un carattere XML plausibile, è in chiaro
          isE1 = !isPlainText;
        }
        // Strip BOM se presente per i file in chiaro
        var workBuf = (skipBom > 0 && !isE1) ? buf.subarray(skipBom) : buf;
        try {
          if (isE1) {
            var decoded = decodeE1(buf);
            showEditor(prettyXml(bytesToString(decoded)));
            setStatus('✓ File .E1 decodificato in XML. Ora puoi modificarlo qui sotto.', 'ok');
          } else if (isEcFlat) {
            // I file .EC sono flat-file ASCII a posizioni fisse: li parsiamo
            // e li riformattiamo come XML strutturato sintetico.
            var ecText = bytesToString(workBuf).replace(/^\x00+/, '').replace(/\x00+$/, '');
            try {
              var generatedXml = ecToXml(ecText);
              showEditor(prettyXml(generatedXml));
              setStatus('✓ File .EC parsato. Il file flat-file INPS è stato convertito in XML strutturato leggibile (Anagrafica + ' +
                'Periodi contributivi + lookup codici e aziende). Per il formato originale completo carica il .E1.', 'ok');
            } catch (ecErr) {
              if (editorSec) editorSec.style.display = '';
              if (editor) editor.value = ecText;
              setStatus('⚠ File .EC caricato come testo grezzo (parsing fallito: ' + ecErr.message + '). ' +
                'Il formato .EC INPS è proprietario; per XML completo carica il .E1.', 'error');
              try { editorSec.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
            }
          } else if (isAgFlat) {
            // I file .AG sono flat-file ASCII anagrafici AGO Carpe (NON cifrati).
            var agText = bytesToString(workBuf).replace(/^\x00+/, '').replace(/\x00+$/, '');
            try {
              var generatedAgXml = agToXml(agText);
              showEditor(prettyXml(generatedAgXml));
              setStatus('✓ File .AG parsato. Il file anagrafico AGO Carpe è stato convertito in XML strutturato (Anagrafica + ' +
                'Periodi annui con quote settimane/importo + payload completo per il round-trip).', 'ok');
            } catch (agErr) {
              if (editorSec) editorSec.style.display = '';
              if (editor) editor.value = agText;
              setStatus('⚠ File .AG caricato come testo grezzo (parsing fallito: ' + agErr.message + ').', 'error');
              try { editorSec.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
            }
          } else {
            // .xml / .txt / no-ext con primo byte testuale → tratta come XML
            var rawXml = bytesToString(workBuf);
            rawXml = rawXml.replace(/^\x00+/, '').replace(/\x00+$/, '');
            showEditor(prettyXml(rawXml));
            setStatus('✓ File XML caricato. Puoi modificarlo o riencoderlo in .E1.', 'info');
          }
        } catch (err) {
          setStatus('Errore in lettura: ' + err.message, 'error');
        }
      };
      reader.onerror = function () { setStatus('Errore lettura file', 'error'); };
      reader.readAsArrayBuffer(file);
    }

    if (fileInput) fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) processFile(fileInput.files[0]);
    });
    if (pickBtn) pickBtn.addEventListener('click', function (e) {
      e.stopPropagation(); if (fileInput) fileInput.click();
    });

    if (dropzone) {
      dropzone.addEventListener('dragover', function (e) { e.preventDefault(); dropzone.classList.add('is-dragover'); });
      dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('is-dragover'); });
      dropzone.addEventListener('drop', function (e) {
        e.preventDefault(); dropzone.classList.remove('is-dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
      });
      dropzone.addEventListener('click', function (e) {
        if (e.target.closest('#e1-pick-btn')) return;
        if (fileInput) fileInput.click();
      });
      dropzone.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (fileInput) fileInput.click(); }
      });
    }

    if (btnPretty) btnPretty.addEventListener('click', function () {
      editor.value = prettyXml(editor.value);
      updateGutter();
      setStatus('✓ XML re-indentato.', 'ok');
    });

    // Bottone "Formatta codice" — pulisce spazi anomali e errori comuni
    var btnFormat = document.getElementById('e1-btn-format');
    if (btnFormat) btnFormat.addEventListener('click', function () {
      var t = editor.value;
      if (!t) { setStatus('Editor vuoto.', 'info'); return; }

      /* 1) Spazi DOPO < o </ (incluso slash di chiusura)
            Es. "</   Categoria>" → "</Categoria>"
                "<     nome>"     → "<nome>"               */
      t = t.replace(/<\s+/g, '<');
      t = t.replace(/<\/\s+/g, '</');
      /* 2) Spazi PRIMA di > o /> */
      t = t.replace(/\s+(\/?)>/g, '$1>');
      /* 2b) Spazi dentro il NOME del tag (errore comune di OCR/incolla):
              "<Provincia Nascita>"   → "<ProvinciaNascita>"
              "</Provincia Nascita>"  → "</ProvinciaNascita>"
              "<DataDi  Nascita>"     → "<DataDiNascita>"
            La regola: se la prima sequenza di "parole" dentro un tag è
            composta da SOLO lettere/cifre/_-: separate da spazi (cioè
            prima di un eventuale '=' che indicherebbe un attributo),
            uniamole. Si usano due passate: una per i nomi singoli,
            una per i nomi di chiusura.                              */
      // Apertura: <NameA NameB ...> (senza '=' = nessun attributo vero)
      t = t.replace(
        /<([a-zA-Z][a-zA-Z0-9\-:_]*(?:\s+[a-zA-Z][a-zA-Z0-9\-:_]*)+)(\s*\/?\s*)>/g,
        function (m, parts, tail) {
          // se contiene '=' è un attributo vero, non toccarlo
          if (/=/.test(parts)) return m;
          var fused = parts.replace(/\s+/g, '');
          return '<' + fused + tail.replace(/\s/g, '') + '>';
        }
      );
      // Chiusura: </NameA NameB> → </NameANameB>
      t = t.replace(
        /<\/([a-zA-Z][a-zA-Z0-9\-:_]*(?:\s+[a-zA-Z][a-zA-Z0-9\-:_]*)+)\s*>/g,
        function (m, parts) {
          var fused = parts.replace(/\s+/g, '');
          return '</' + fused + '>';
        }
      );
      /* 3) Spazi multipli DENTRO un tag (fra attributi): <a   b="c"   d="e"> */
      t = t.replace(/(<[a-zA-Z!?\/][a-zA-Z0-9\-:_]*)([^>]*)>/g, function (m, head, attrs) {
        // collassa whitespace multipli (spazi + newline) a singolo spazio
        var clean = attrs.replace(/\s+/g, ' ').replace(/\s+\/$/, '/');
        return head + clean + '>';
      });
      /* 4) Trimma SOLO whitespace iniziale e finale del contenuto fra
            apertura e chiusura tag dello stesso nome.
            Esempi:
              "<X>  O  </X>"                     → "<X>O</X>"
              "<X> questa è una frase 112  </X>" → "<X>questa è una frase 112</X>"
                                                   (gli spazi interni fra le parole RESTANO)
            La regex matcha solo se il contenuto NON contiene altri tag
            (evita di rovinare contenitori annidati). */
      t = t.replace(
        /(<([a-zA-Z][a-zA-Z0-9\-:_]*)(?:\s[^>]*)?>)([^<]*)(<\/\2>)/g,
        function (m, openTag, name, content, closeTag) {
          // SOLO trim ai bordi: gli spazi fra parole interne restano intatti.
          // Niente .replace(/\s+/g, ' ') che collasserebbe anche gli interni.
          var trimmed = content.replace(/^\s+/, '').replace(/\s+$/, '');
          return openTag + trimmed + closeTag;
        }
      );
      /* 5) Trim spazi finali su ogni riga */
      t = t.split('\n').map(function (l) {
        return l.replace(/[ \t]+$/g, '');
      }).join('\n');
      /* 6) Righe vuote multiple → max 1 vuota */
      t = t.replace(/\n{3,}/g, '\n\n');
      /* 7) CRLF/CR → LF */
      t = t.replace(/\r\n?/g, '\n');
      /* 8) Newline finale garantito */
      if (!t.endsWith('\n')) t += '\n';
      /* 9) Re-indentazione */
      try { t = prettyXml(t); } catch (e) {}

      editor.value = t;
      updateGutter();
      setStatus('✓ Codice formattato: tag normalizzati, spazi interni puliti, righe normalizzate, indentazione applicata.', 'ok');
    });
    if (btnValidate) btnValidate.addEventListener('click', function () {
      var r = parseXml(editor.value);
      if (r.ok) {
        var root = r.doc.documentElement.tagName;
        var all = r.doc.getElementsByTagName('*').length;
        setStatus('✓ XML valido — Root: ' + root + ' · ' + all + ' elementi.', 'ok');
      } else {
        setStatus('✗ XML non valido: ' + (r.error || 'errore parser'), 'error');
      }
    });
    if (btnCopy) btnCopy.addEventListener('click', function () {
      var text = editor.value;
      if (!text) { setStatus('Editor vuoto, niente da copiare.', 'info'); return; }
      var ok = function () { setStatus('✓ Testo copiato negli appunti.', 'ok'); };
      var fb = function () {
        try { editor.select(); document.execCommand('copy'); editor.setSelectionRange(0, 0); ok(); }
        catch (err) { setStatus('Errore copia: ' + err.message, 'error'); }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fb);
      else fb();
    });
    if (btnDownXml) btnDownXml.addEventListener('click', function () {
      var text = editor.value;
      if (!text) { setStatus('Editor vuoto, niente da scaricare.', 'info'); return; }
      downloadBlob(text, originalFilename + '.xml', 'application/xml');
      setStatus('✓ XML scaricato come "' + originalFilename + '.xml".', 'ok');
    });
    if (btnDownE1) btnDownE1.addEventListener('click', function () {
      var text = editor.value;
      if (!text) { setStatus('Editor vuoto, niente da codificare.', 'info'); return; }
      var r = parseXml(text);
      if (!r.ok) { if (!confirm("L'XML non e' sintatticamente valido. Vuoi codificare comunque?")) return; }
      var bytes = stringToBytes(text);
      var encoded = encodeE1(bytes);
      downloadBlob(encoded, originalFilename + '.modificato.e1', 'application/octet-stream');
      setStatus('✓ File .E1 scaricato come "' + originalFilename + '.modificato.e1".', 'ok');
    });
    if (btnReset) btnReset.addEventListener('click', function () {
      if (editor) editor.value = '';
      if (editorSec) editorSec.style.display = 'none';
      if (fileMeta) fileMeta.textContent = '';
      if (fileInput) fileInput.value = '';
      clearOverlay();
      findState.matches = [];
      findState.current = -1;
      if (findCounter) findCounter.textContent = '0 / 0';
      setStatus('Reset completato. Carica un nuovo file.', 'info');
    });

    if (keyAscii) keyAscii.textContent = E1_KEY_STRING;
    if (keyHex) {
      var hex = '';
      for (var i = 0; i < E1_KEY.length; i++) {
        hex += E1_KEY[i].toString(16).padStart(2, '0').toUpperCase();
        if ((i + 1) % 8 === 0) hex += ' ';
      }
      keyHex.textContent = hex.trim();
    }


    // ============================================================
    // FEEDBACK VISIVO (lampeggio verde 320ms su un bottone)
    // ============================================================
    function flashBtn(btn) {
      if (!btn) return;
      btn.classList.remove('is-pressed');
      // forza reflow per ri-triggerare animazione
      void btn.offsetWidth;
      btn.classList.add('is-pressed');
      setTimeout(function () { btn.classList.remove('is-pressed'); }, 360);
    }
    // wrap di tutti i bottoni dell'editor per dargli feedback visivo
    [btnPretty, btnValidate, btnCopy, btnDownXml, btnDownE1, btnReset].forEach(function (b) {
      if (!b) return;
      b.addEventListener('click', function () { flashBtn(b); });
    });

    // ============================================================
    // ESTRAZIONE CODICE FISCALE (per nomenclatura file scaricati)
    // ============================================================
    var CF_REGEX = /[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]/;
    function extractCF(xmlText) {
      // 1) prova nel DOM XML
      try {
        var p = new DOMParser().parseFromString(xmlText, 'application/xml');
        var nodes = p.getElementsByTagName('*');
        for (var i = 0; i < nodes.length; i++) {
          var n = nodes[i];
          var name = (n.nodeName || '').toLowerCase();
          if (name.indexOf('codicefiscale') >= 0 || name === 'cf') {
            var t = (n.textContent || '').trim().toUpperCase();
            if (CF_REGEX.test(t)) return t.match(CF_REGEX)[0];
          }
          // anche attributi
          if (n.attributes) {
            for (var j = 0; j < n.attributes.length; j++) {
              var a = n.attributes[j];
              if ((a.name || '').toLowerCase().indexOf('codicefiscale') >= 0 || a.name.toLowerCase() === 'cf') {
                var v = (a.value || '').trim().toUpperCase();
                if (CF_REGEX.test(v)) return v.match(CF_REGEX)[0];
              }
            }
          }
        }
      } catch (e) {}
      // 2) fallback: regex su tutto il testo
      var m = (xmlText || '').toUpperCase().match(CF_REGEX);
      return m ? m[0] : null;
    }
    function buildFilename(ext) {
      var cf = extractCF(editor ? editor.value : '');
      var stamp = (function () {
        var d = new Date();
        function pad(n){ return n < 10 ? '0' + n : '' + n; }
        return d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate());
      })();
      // Prefisso in base all'estensione: EstrattoAGO per .ag, EstrattoCarpe per gli altri
      var prefix = (ext === 'ag') ? 'EstrattoAGO' : 'EstrattoCarpe';
      if (cf) {
        return prefix + '_' + cf + '_' + stamp + '.' + ext;
      }
      return (originalFilename || 'estratto') + '.' + (ext === 'e1' ? 'modificato.e1' : ext);
    }

    // Sovrascrivo i nomi file dei download con la nomenclatura standard CF
    if (btnDownXml) {
      // rimuovo i listener vecchi sostituendo tramite cloneNode? No, semplicemente
      // riassegno la callback usando capture true.
      var newDownXmlHandler = function (ev) {
        ev.stopImmediatePropagation();
        ev.preventDefault();
        var text = editor.value;
        if (!text) { setStatus('Editor vuoto, niente da scaricare.', 'info'); return; }
        var fname = buildFilename('xml');
        downloadBlob(text, fname, 'application/xml');
        setStatus('✓ XML scaricato come "' + fname + '".', 'ok');
        flashBtn(btnDownXml);
      };
      btnDownXml.addEventListener('click', newDownXmlHandler, true);
    }
    if (btnDownE1) {
      var newDownE1Handler = function (ev) {
        ev.stopImmediatePropagation();
        ev.preventDefault();
        var text = editor ? editor.value : '';
        console.info('[MAN2026] click .E1: text length =', (text || '').length);
        if (!text) { setStatus('Editor vuoto, niente da codificare.', 'info'); return; }
        var r = parseXml(text);
        if (!r.ok) {
          if (!confirm("L'XML non e' sintatticamente valido. Vuoi codificare comunque?")) return;
        }
        var bytes, encoded;
        try {
          bytes = stringToBytes(text);
          encoded = encodeE1(bytes);
        } catch (err) {
          console.error('[MAN2026] encodeE1 error:', err);
          setStatus('Errore codifica .E1: ' + (err && err.message ? err.message : err), 'error');
          return;
        }
        if (!encoded || !encoded.length) {
          setStatus('Codifica .E1 vuota — niente da scaricare.', 'error');
          return;
        }
        var fname = buildFilename('e1');
        console.info('[MAN2026] encoded bytes =', encoded.length, 'filename =', fname);
        var ok = downloadBlob(encoded, fname, 'application/octet-stream');
        if (ok) {
          setStatus('✓ File .E1 scaricato come "' + fname + '" (' + encoded.length + ' byte).', 'ok');
        } else {
          setStatus('Download fallito — controlla la console del browser (F12).', 'error');
        }
        flashBtn(btnDownE1);
      };
      btnDownE1.addEventListener('click', newDownE1Handler, true);
    }

    // ====== Download .EC ======
    var btnDownEc = document.getElementById('e1-btn-download-ec');
    if (btnDownEc) {
      btnDownEc.addEventListener('click', function (ev) {
        ev.preventDefault();
        var text = editor.value;
        if (!text) { setStatus('Editor vuoto, niente da scaricare in .EC.', 'info'); return; }
        try {
          var ec = xmlToEc(text);
          var fname = buildFilename('ec');
          downloadBlob(stringToBytes(ec), fname, 'application/octet-stream');
          setStatus('✓ File .EC scaricato come "' + fname + '" (' + ec.length + ' byte).', 'ok');
        } catch (err) {
          setStatus('Errore generazione .EC: ' + err.message + ' — assicurati che l\'XML sia <EstrattoCarpe>.', 'error');
        }
        flashBtn(btnDownEc);
      });
    }

    // ====== Download .AG ======
    var btnDownAg = document.getElementById('e1-btn-download-ag');
    if (btnDownAg) {
      btnDownAg.addEventListener('click', function (ev) {
        ev.preventDefault();
        var text = editor.value;
        if (!text) { setStatus('Editor vuoto, niente da scaricare in .AG.', 'info'); return; }
        try {
          var ag = xmlToAg(text);
          var fname = buildFilename('ag');
          downloadBlob(stringToBytes(ag), fname, 'application/octet-stream');
          setStatus('✓ File .AG scaricato come "' + fname + '" (' + ag.length + ' byte).', 'ok');
        } catch (err) {
          setStatus('Errore generazione .AG: ' + err.message + ' — assicurati che l\'XML sia <EstrattoAGO>.', 'error');
        }
        flashBtn(btnDownAg);
      });
    }

    // ============================================================
    // CERCA / SOSTITUISCI (pannello toggle, navigazione e replace)
    // ============================================================
    var findToggle = document.getElementById('e1-btn-find-toggle');
    var findPanel  = document.getElementById('e1-find-panel');
    var findInput  = document.getElementById('e1-find-input');
    var findCounter= document.getElementById('e1-find-counter');
    var findPrev   = document.getElementById('e1-find-prev');
    var findNext   = document.getElementById('e1-find-next');
    var findCase   = document.getElementById('e1-find-case');
    var findWord   = document.getElementById('e1-find-word');
    var findRegex  = document.getElementById('e1-find-regex');
    var replaceInput = document.getElementById('e1-replace-input');
    var replaceOne = document.getElementById('e1-replace-one');
    var replaceAll = document.getElementById('e1-replace-all');
    var findClose  = document.getElementById('e1-find-close');
    var overlayEl  = document.getElementById('e1-editor-overlay');
    var overlayWrap = overlayEl ? overlayEl.parentNode : null;

    var findState = { matches: [], current: -1 };

    // ----- Overlay highlight: render mark sopra il textarea -----
    function escapeHtmlOverlay(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
    function renderOverlay() {
      if (!overlayEl || !editor) return;
      if (!findState.matches.length) {
        overlayEl.innerHTML = '';
        if (overlayWrap) overlayWrap.classList.remove('has-overlay');
        return;
      }
      if (overlayWrap) overlayWrap.classList.add('has-overlay');
      var text = editor.value;
      var html = '';
      var pos = 0;
      for (var i = 0; i < findState.matches.length; i++) {
        var m = findState.matches[i];
        if (m.start > pos) html += escapeHtmlOverlay(text.substring(pos, m.start));
        var cls = (i === findState.current) ? ' class="is-current"' : '';
        html += '<mark' + cls + '>' + escapeHtmlOverlay(text.substring(m.start, m.end)) + '</mark>';
        pos = m.end;
      }
      if (pos < text.length) html += escapeHtmlOverlay(text.substring(pos));
      // Assicurati che newline finale sia preservato
      overlayEl.innerHTML = html + '\n';
      syncOverlayScroll();
    }
    function syncOverlayScroll() {
      if (!overlayEl || !editor) return;
      overlayEl.scrollTop = editor.scrollTop;
      overlayEl.scrollLeft = editor.scrollLeft;
    }
    function clearOverlay() {
      if (overlayEl) overlayEl.innerHTML = '';
      if (overlayWrap) overlayWrap.classList.remove('has-overlay');
    }
    if (editor) {
      editor.addEventListener('scroll', syncOverlayScroll);
      // Aggiorna overlay anche su input dell'utente nell'editor (testo cambia)
      editor.addEventListener('input', function () {
        if (findState.matches.length > 0) {
          // ricalcola le matches rispetto al nuovo testo
          updateFindResults({ preserveCurrent: true });
        }
      });
    }

    function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    function buildSearchRegex() {
      if (!findInput) return null;
      var q = findInput.value;
      if (!q) return null;
      var flags = 'g' + (findCase && findCase.checked ? '' : 'i');
      var pattern;
      try {
        if (findRegex && findRegex.checked) {
          pattern = q;
        } else {
          pattern = escapeRegex(q);
          if (findWord && findWord.checked) pattern = '\\b' + pattern + '\\b';
        }
        return new RegExp(pattern, flags);
      } catch (e) {
        return null;
      }
    }

    function updateFindResults(opts) {
      if (!findInput || !editor) return;
      var rx = buildSearchRegex();
      findState.matches = [];
      if (!rx) {
        if (findCounter) findCounter.textContent = '0 / 0';
        findInput.classList.remove('is-nomatch');
        return;
      }
      var text = editor.value, m;
      while ((m = rx.exec(text)) !== null) {
        if (m.index === rx.lastIndex) rx.lastIndex++;
        findState.matches.push({ start: m.index, end: m.index + m[0].length });
        if (findState.matches.length > 50000) break;  // safety cap, in pratica copre file enormi
      }
      if (findState.matches.length === 0) {
        findState.current = -1;
        findInput.classList.add('is-nomatch');
        if (findCounter) findCounter.textContent = '0 / 0';
        return;
      }
      findInput.classList.remove('is-nomatch');
      if (opts && opts.preserveCurrent && findState.current >= 0 && findState.current < findState.matches.length) {
        // ok, mantieni
      } else {
        findState.current = 0;
      }
      if (findCounter) findCounter.textContent = (findState.current + 1) + ' / ' + findState.matches.length;
      renderOverlay();
      highlightCurrent();
    }

    function highlightCurrent() {
      if (!editor || findState.current < 0 || findState.current >= findState.matches.length) return;
      var m = findState.matches[findState.current];
      // Memorizza dove era il focus per ripristinarlo (NON rubarlo all'input di ricerca)
      var hadInputFocus = (document.activeElement === findInput || document.activeElement === replaceInput);
      // Imposta la selezione SENZA dare focus al textarea se l'input di ricerca lo ha
      try {
        editor.setSelectionRange(m.start, m.end);
      } catch (e) {}
      // Ridai focus all'input se ce l'aveva, altrimenti al textarea
      if (hadInputFocus) {
        if (document.activeElement === findInput) findInput.focus();
        else if (document.activeElement === replaceInput) replaceInput.focus();
      }
      // Scroll the textarea so the selection is visible
      try {
        // approssimazione: imposta scrollTop in base al numero di righe prima del match
        var before = editor.value.substring(0, m.start);
        var line = before.split('\n').length;
        var lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 20;
        var target = (line - 5) * lineHeight;
        if (target < 0) target = 0;
        if (Math.abs(editor.scrollTop - target) > 200) editor.scrollTop = target;
      } catch (e) {}
      if (findCounter) findCounter.textContent = (findState.current + 1) + ' / ' + findState.matches.length;
      // Aggiorna l'overlay per evidenziare quale match è "current"
      if (overlayEl) {
        var marks = overlayEl.querySelectorAll('mark');
        for (var k = 0; k < marks.length; k++) {
          if (k === findState.current) marks[k].classList.add('is-current');
          else marks[k].classList.remove('is-current');
        }
      }
      syncOverlayScroll();
    }
    function findNextMatch() {
      if (findState.matches.length === 0) { updateFindResults(); return; }
      findState.current = (findState.current + 1) % findState.matches.length;
      highlightCurrent();
    }
    function findPrevMatch() {
      if (findState.matches.length === 0) { updateFindResults(); return; }
      findState.current = (findState.current - 1 + findState.matches.length) % findState.matches.length;
      highlightCurrent();
    }

    function toggleFindPanel(show) {
      if (!findPanel) return;
      var visible = (typeof show === 'boolean') ? show : (findPanel.style.display === 'none');
      findPanel.style.display = visible ? 'flex' : 'none';
      findPanel.style.flexDirection = 'column';
      if (!visible) {
        // chiusura: pulisci overlay e stato
        clearOverlay();
        findState.matches = [];
        findState.current = -1;
        if (findCounter) findCounter.textContent = '0 / 0';
      }
      if (visible && findInput) {
        // Pre-popola con la selezione corrente dell'editor (se presente)
        if (editor && editor.selectionStart !== editor.selectionEnd) {
          var sel = editor.value.substring(editor.selectionStart, editor.selectionEnd);
          if (sel && sel.length < 200) findInput.value = sel;
        }
        setTimeout(function () { findInput.focus(); findInput.select(); }, 50);
        updateFindResults();
      }
    }

    if (findToggle) findToggle.addEventListener('click', function () { flashBtn(findToggle); toggleFindPanel(); });
    if (findClose)  findClose.addEventListener('click',  function () { toggleFindPanel(false); editor.focus(); });
    if (findInput) {
      findInput.addEventListener('input', function (ev) {
        ev.stopPropagation();
        updateFindResults();
      });
      findInput.addEventListener('keydown', function (ev) {
        // Stop propagation per evitare che il listener Ctrl+F sul tool intercetti
        // o che altri handler agiscano sui tasti normali.
        ev.stopPropagation();
        if (ev.key === 'Enter') {
          ev.preventDefault();
          if (ev.shiftKey) findPrevMatch(); else findNextMatch();
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          toggleFindPanel(false); editor.focus();
        }
        // tutti gli altri tasti vanno normalmente nell'input — niente preventDefault
      });
      findInput.addEventListener('keyup', function (ev) {
        ev.stopPropagation();
      });
    }
    if (replaceInput) {
      replaceInput.addEventListener('keydown', function (ev) { ev.stopPropagation(); });
      replaceInput.addEventListener('keyup', function (ev) { ev.stopPropagation(); });
      replaceInput.addEventListener('input', function (ev) { ev.stopPropagation(); });
    }
    if (findCase)  findCase.addEventListener('change',  function () { updateFindResults(); });
    if (findWord)  findWord.addEventListener('change',  function () { updateFindResults(); });
    if (findRegex) findRegex.addEventListener('change', function () { updateFindResults(); });
    if (findNext)  findNext.addEventListener('click',   function () { flashBtn(findNext); findNextMatch(); });
    if (findPrev)  findPrev.addEventListener('click',   function () { flashBtn(findPrev); findPrevMatch(); });

    if (replaceOne) replaceOne.addEventListener('click', function () {
      flashBtn(replaceOne);
      if (findState.current < 0 || findState.matches.length === 0) { updateFindResults(); return; }
      var m = findState.matches[findState.current];
      var rep = replaceInput ? replaceInput.value : '';
      var v = editor.value;
      editor.value = v.substring(0, m.start) + rep + v.substring(m.end);
      // ricalcola
      var prev = findState.current;
      updateFindResults();
      // mantieni vicino
      if (findState.matches.length > 0) {
        findState.current = Math.min(prev, findState.matches.length - 1);
        highlightCurrent();
      }
      setStatus('✓ Sostituita 1 occorrenza.', 'ok');
    });
    if (replaceAll) replaceAll.addEventListener('click', function () {
      flashBtn(replaceAll);
      var rx = buildSearchRegex();
      if (!rx) { setStatus('Inserisci un termine di ricerca valido.', 'info'); return; }
      var rep = replaceInput ? replaceInput.value : '';
      var before = editor.value;
      var after = before.replace(rx, rep);
      var n = (before.match(rx) || []).length;
      editor.value = after;
      updateFindResults();
      setStatus('✓ Sostituite ' + n + ' occorrenze.', 'ok');
    });

    // Scorciatoia tastiera Ctrl+F (o Cmd+F) all'interno del tool
    tool.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'f' || ev.key === 'F')) {
        ev.preventDefault();
        toggleFindPanel(true);
      }
    });

    // ============================================================
    // GENERA REPORT (apre nuova finestra con tabella + grafici dei dati)
    // ============================================================
    function fmtNum(n) { return (typeof n === 'number') ? n.toLocaleString('it-IT') : n; }
    function escapeHtml(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
      });
    }
    function buildReport() {
      var text = editor ? editor.value : '';
      if (!text) { setStatus('Editor vuoto, niente da analizzare.', 'info'); return; }
      var r = parseXml(text);
      if (!r.ok) { setStatus('XML non valido, impossibile generare report. ' + (r.error || ''), 'error'); return; }
      var doc = r.doc;
      var cf = extractCF(text) || '';

      // Rileva il formato: E1 (RispostaEstrattoConto INPS-UNEX) vs EC (EstrattoCarpe sintetico) vs AG (EstrattoAGO)
      var rootName = doc.documentElement.tagName;
      var isEcXml = (rootName === 'EstrattoCarpe');
      var isE1Xml = (rootName === 'RispostaEstrattoConto');
      var isAgXml = (rootName === 'EstrattoAGO');

      function txt(parent, tagName) {
        if (!parent) return '';
        var el = parent.getElementsByTagName(tagName);
        if (el.length === 0) return '';
        return (el[0].textContent || '').trim();
      }
      function composeDate(parent) {
        if (!parent) return '';
        var g = txt(parent, 'Giorno'), me = txt(parent, 'Mese'), a = txt(parent, 'Anno');
        if (!g && !me && !a) return '';
        function p(s) { return s.length === 1 ? '0' + s : s; }
        return (g ? p(g) : '??') + '/' + (me ? p(me) : '??') + '/' + (a || '????');
      }
      function getYear(parent) {
        if (!parent) return null;
        var a = txt(parent, 'Anno');
        return a ? parseInt(a, 10) : null;
      }
      function yearFromSlashed(d) {
        if (!d) return null;
        var m = d.match(/(\d{4})/);
        return m ? parseInt(m[1], 10) : null;
      }

      var ana = { cognome:'', nome:'', cf: cf || '', sesso:'', nascita:'', luogoNascita:'', provNascita:'', via:'', comune:'', prov:'', cap:'' };
      var aggDate = '';
      var presMontante = '';
      var presPensione = '';
      var periodi = [];
      var aziende = {};
      var contribLookup = {};

      if (isE1Xml) {
        // ===== Formato E1 (XML INPS-UNEX) =====
        var anaNode = doc.getElementsByTagName('DatiAnagrafici')[0];
        var indNode = anaNode ? anaNode.getElementsByTagName('Indirizzo')[0] : null;
        var dataNasc = anaNode ? anaNode.getElementsByTagName('DataNascita')[0] : null;
        if (anaNode) {
          ana.cognome = txt(anaNode, 'Cognome');
          ana.nome    = txt(anaNode, 'Nome');
          ana.cf      = txt(anaNode, 'CodiceFiscale') || cf;
          ana.sesso   = txt(anaNode, 'Sesso');
          ana.nascita = dataNasc ? composeDate(dataNasc) : '';
          ana.luogoNascita = txt(anaNode, 'LuogoNascita');
          ana.provNascita  = txt(anaNode, 'ProvinciaNascita');
        }
        if (indNode) {
          ana.via = txt(indNode, 'Via');
          ana.comune = txt(indNode, 'Comune');
          ana.prov = txt(indNode, 'Provincia');
          ana.cap = txt(indNode, 'Cap');
        }

        var aggNode = doc.getElementsByTagName('Aggiornamento')[0];
        if (aggNode) {
          var dt = aggNode.getElementsByTagName('Data')[0];
          if (dt) aggDate = composeDate(dt);
        }
        var pm = doc.getElementsByTagName('PresenzaMontante')[0];
        if (pm) presMontante = txt(pm, 'Descrizione') || txt(pm, 'Codice');
        var pp = doc.getElementsByTagName('PresenzaCalcoloPensione')[0];
        if (pp) presPensione = txt(pp, 'Descrizione') || txt(pp, 'Codice');

        var dettagli = doc.getElementsByTagName('DettaglioContributivo');
        for (var i = 0; i < dettagli.length; i++) {
          var d = dettagli[i];
          var fisso = d.getElementsByTagName('Fisso')[0];
          if (!fisso) continue;
          var dal = fisso.getElementsByTagName('Dal')[0];
          var al  = fisso.getElementsByTagName('Al')[0];
          periodi.push({
            dalDate: dal ? composeDate(dal) : '',
            alDate:  al  ? composeDate(al)  : '',
            dalAnno: dal ? getYear(dal) : null,
            alAnno:  al  ? getYear(al)  : null,
            fondo:        txt(fisso, 'Fondo'),
            contrib:      txt(fisso, 'CodiceContribuzione'),
            unitaMisura:  txt(fisso, 'UnitaDiMisura'),
            numContrib:   parseInt(txt(fisso, 'NumeroContributi') || '0', 10),
            contribDir:   parseFloat((txt(fisso, 'ContributiUtiliDiritto') || '0').replace(',', '.')),
            contribMis:   parseFloat((txt(fisso, 'ContributiUtiliMisura') || '0').replace(',', '.')),
            contribNonU:  parseInt(txt(fisso, 'ContributiNonUtili') || '0', 10),
            retribuzione: parseFloat((txt(fisso, 'RetribuzioneEuro') || '0').replace(',', '.')),
            codAzienda:   txt(fisso, 'CodiceAzienda'),
            qualifica:    txt(fisso, 'Qualifica').trim(),
            annoComp:     txt(fisso, 'AnnoCompetenza')
          });
        }
        var denom = doc.getElementsByTagName('DenominazioneAzienda');
        for (var k = 0; k < denom.length; k++) {
          var c = txt(denom[k], 'Codice');
          var dscr = txt(denom[k], 'Descrizione');
          if (c) aziende[c] = dscr;
        }
        var datiAz = doc.getElementsByTagName('DatiAzienda')[0];
        if (datiAz) {
          var matr = txt(datiAz, 'Matricola');
          var den = txt(datiAz, 'Denominazione');
          if (matr && den && !aziende[matr]) aziende[matr] = den;
        }
        var contribNodes = doc.getElementsByTagName('Contribuzione');
        for (var ci = 0; ci < contribNodes.length; ci++) {
          var cc = txt(contribNodes[ci], 'Codice');
          var cd = txt(contribNodes[ci], 'Descrizione');
          if (cc) contribLookup[cc] = cd;
        }
      } else if (isEcXml) {
        // ===== Formato EC (XML strutturato sintetico) =====
        var anaNode2 = doc.getElementsByTagName('Anagrafica')[0];
        if (anaNode2) {
          ana.cognome = txt(anaNode2, 'Cognome');
          ana.nome    = txt(anaNode2, 'Nome');
          ana.cf      = txt(anaNode2, 'CodiceFiscale') || cf;
          ana.sesso   = txt(anaNode2, 'Sesso');
          ana.nascita = txt(anaNode2, 'DataNascita');
          var lnNode = anaNode2.getElementsByTagName('LuogoNascita')[0];
          if (lnNode) {
            ana.luogoNascita = (lnNode.textContent || '').trim();
            ana.provNascita = lnNode.getAttribute('prov') || '';
          }
          ana.via = txt(anaNode2, 'Indirizzo');
          var cmNode = anaNode2.getElementsByTagName('Comune')[0];
          if (cmNode) {
            ana.comune = (cmNode.textContent || '').trim();
            ana.prov = cmNode.getAttribute('prov') || '';
            ana.cap = cmNode.getAttribute('cap') || '';
          }
        }
        var periodNodes = doc.getElementsByTagName('Periodo');
        for (var p2 = 0; p2 < periodNodes.length; p2++) {
          var pn = periodNodes[p2];
          var dalDate = txt(pn, 'Dal');
          var alDate  = txt(pn, 'Al');
          var ccNode  = pn.getElementsByTagName('CodiceContribuzione')[0];
          var azNode  = pn.getElementsByTagName('CodiceAzienda')[0];
          periodi.push({
            dalDate: dalDate,
            alDate:  alDate,
            dalAnno: yearFromSlashed(dalDate),
            alAnno:  yearFromSlashed(alDate),
            fondo:        txt(pn, 'Fondo'),
            contrib:      ccNode ? (ccNode.textContent || '').trim() : '',
            unitaMisura:  txt(pn, 'UnitaMisura'),
            numContrib:   Math.round(parseFloat(txt(pn, 'NumeroContributi') || '0')),
            contribDir:   parseFloat(txt(pn, 'ContributiUtiliDiritto') || '0'),
            contribMis:   parseFloat(txt(pn, 'ContributiUtiliMisura') || '0'),
            contribNonU:  parseInt(txt(pn, 'ContributiNonUtili') || '0', 10),
            retribuzione: parseFloat(txt(pn, 'RetribuzioneEuro') || '0'),
            codAzienda:   azNode ? (azNode.textContent || '').trim() : '',
            qualifica:    txt(pn, 'Qualifica').trim()
          });
          // Lookup azienda dall'attributo descr
          if (azNode) {
            var azC = (azNode.textContent || '').trim();
            var azD = azNode.getAttribute('descr') || '';
            if (azC && azD && !aziende[azC]) aziende[azC] = azD;
          }
          // Lookup contribuzione
          if (ccNode) {
            var cContr = (ccNode.textContent || '').trim();
            var cDesc  = ccNode.getAttribute('descr') || '';
            if (cContr && cDesc && !contribLookup[cContr]) contribLookup[cContr] = cDesc;
          }
        }
        // Lookup espliciti dal blocco <CodiciContribuzione> e <Aziende>
        var voci = doc.getElementsByTagName('Voce');
        for (var vi = 0; vi < voci.length; vi++) {
          var vc = voci[vi].getAttribute('codice') || '';
          var vd = (voci[vi].textContent || '').trim();
          if (vc && vd) contribLookup[vc] = vd;
        }
        var azNodes = doc.getElementsByTagName('Azienda');
        for (var ai = 0; ai < azNodes.length; ai++) {
          var aC = azNodes[ai].getAttribute('codice') || '';
          var aD = (azNodes[ai].textContent || '').trim();
          if (aC && aD) aziende[aC] = aD;
        }
      } else if (isAgXml) {
        // ===== Formato AG (EstrattoAGO Carpe) =====
        var anaAg = doc.getElementsByTagName('Anagrafica')[0];
        if (anaAg) {
          var cnAg = txt(anaAg, 'CognomeNome');
          var parts = cnAg.split(/\s+/);
          ana.cognome = parts[0] || '';
          ana.nome    = parts.slice(1).join(' ') || '';
          ana.cf      = txt(anaAg, 'CodiceFiscale') || cf;
          ana.sesso   = txt(anaAg, 'Sesso');
          var dn = txt(anaAg, 'DataNascita'); // ddmmaaaa
          if (dn && dn.length >= 8) {
            ana.nascita = dn.substring(0,2) + '/' + dn.substring(2,4) + '/' + dn.substring(4,8);
          }
        }
        // Periodi annui: per ogni Anno, prendiamo il PRIMO blocco Q
        // (Q1 contiene la quota principale: settimane utili e retribuzione annua).
        // Settimane: 3 cifre dirette (es. 052 = 52)
        // Importo: 11 cifre in DECIMI di euro (divide per 10 per ottenere €)
        var anni = doc.getElementsByTagName('Anno');
        for (var ya = 0; ya < anni.length; ya++) {
          var an = anni[ya];
          var year = parseInt(an.getAttribute('valore') || '0', 10);
          if (!year) continue;
          var qNodes = an.getElementsByTagName('Q');
          var settAnno = 0, impAnno = 0;
          if (qNodes.length > 0) {
            var sN = qNodes[0].getElementsByTagName('Sett')[0];
            var iN = qNodes[0].getElementsByTagName('Imp')[0];
            var sStr = sN ? (sN.textContent || '0').trim() : '0';
            var iStr = iN ? (iN.textContent || '0').trim() : '0';
            var s = parseInt(sStr.replace(/^0+/, '') || '0', 10);
            var im = parseInt(iStr.replace(/^0+/, '') || '0', 10);
            settAnno = s;
            impAnno  = im / 10;   // 11 cifre = decimi di euro → / 10 = €
          }
          periodi.push({
            dalAnno: year, alAnno: year,
            unitaMisura: 'S',
            contribDir: settAnno,
            retribuzione: impAnno,
            categoria: 'AGO',
            codiceContrib: 'AG',
            codiceAzienda: ''
          });
        }
      } else {
        setStatus('Formato XML non riconosciuto: root="' + rootName + '". Atteso <RispostaEstrattoConto>, <EstrattoCarpe> o <EstrattoAGO>.', 'error');
        return;
      }

      // ===== Aggregati per anno =====
      // Conta settimane utili come "ContributiUtiliDiritto" se UnitaDiMisura=='S' (settimane)
      // se 'M' moltiplica per ~4.33; se 'A' (anni) per 52
      function settimaneOf(p) {
        if (p.unitaMisura === 'S') return p.contribDir || p.numContrib;
        if (p.unitaMisura === 'M') return Math.round((p.contribDir || p.numContrib) * 4.33);
        if (p.unitaMisura === 'A') return Math.round((p.contribDir || p.numContrib) * 52);
        return p.contribDir || p.numContrib || 0;
      }

      var perAnno = {};
      periodi.forEach(function (p) {
        var anno = p.dalAnno || p.alAnno || (p.annoComp ? parseInt(p.annoComp, 10) : null);
        if (!anno) anno = 'n.d.';
        var key = String(anno);
        if (!perAnno[key]) perAnno[key] = { settimane: 0, retrib: 0, n: 0 };
        perAnno[key].settimane += settimaneOf(p);
        perAnno[key].retrib    += isNaN(p.retribuzione) ? 0 : p.retribuzione;
        perAnno[key].n         += 1;
      });
      var anni = Object.keys(perAnno).filter(function(a){return a!=='n.d.'}).sort();
      if (perAnno['n.d.']) anni.push('n.d.');

      // KPI totali
      var totSet = 0, totRet = 0, totPeriodi = periodi.length;
      periodi.forEach(function(p){ totSet += settimaneOf(p); totRet += isNaN(p.retribuzione) ? 0 : p.retribuzione; });

      // Fondi distinti
      var fondi = {};
      periodi.forEach(function(p){
        if (p.fondo) {
          if (!fondi[p.fondo]) fondi[p.fondo] = { settimane: 0, retrib: 0, n: 0 };
          fondi[p.fondo].settimane += settimaneOf(p);
          fondi[p.fondo].retrib    += isNaN(p.retribuzione) ? 0 : p.retribuzione;
          fondi[p.fondo].n         += 1;
        }
      });

      function fmtNum(n) { return (typeof n === 'number') ? n.toLocaleString('it-IT', {maximumFractionDigits: 0}) : n; }
      function fmtEur(n) { return '€ ' + fmtNum(Math.round(n)); }
      function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
          return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
        });
      }

      // ===== HTML report =====
      var rootCss = '<style>' +
        'body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f5efe4;color:#2c2418;margin:0;padding:24px;line-height:1.55}' +
        'h1{font-family:Georgia,serif;color:#1e3a5f;margin:0 0 8px}' +
        'h2{font-family:Georgia,serif;color:#1e3a5f;margin:32px 0 12px;border-bottom:2px solid #d4c8ad;padding-bottom:6px}' +
        '.report-wrap{max-width:1180px;margin:0 auto}' +
        '.report-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:16px 0}' +
        '.meta-card{background:#faf5e9;border:1px solid #d4c8ad;border-radius:8px;padding:12px}' +
        '.meta-label{font-size:11px;font-weight:700;color:#6b5d47;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}' +
        '.meta-value{font-size:15px;font-weight:600;color:#1e3a5f;font-variant-numeric:tabular-nums;word-break:break-word}' +
        'table{width:100%;border-collapse:collapse;margin:14px 0;font-size:12.5px}' +
        'th,td{border:1px solid #d4c8ad;padding:6px 9px;text-align:left;vertical-align:top}' +
        'th{background:#ede5d4;font-weight:700;color:#1e3a5f;font-size:11.5px;text-transform:uppercase;letter-spacing:.04em}' +
        'tr:nth-child(even) td{background:#faf5e9}' +
        '.numeric{text-align:right;font-variant-numeric:tabular-nums}' +
        '.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:14px 0}' +
        '.kpi{background:linear-gradient(135deg,#1e3a5f,#2a5285);color:#fff;border-radius:10px;padding:14px}' +
        '.kpi-label{font-size:11px;text-transform:uppercase;letter-spacing:.07em;opacity:.85}' +
        '.kpi-val{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;margin-top:4px}' +
        '.kpi-sub{font-size:11px;opacity:.75;margin-top:2px}' +
        '.chart{margin:18px 0;background:#faf5e9;border:1px solid #d4c8ad;border-radius:10px;padding:14px}' +
        '.bar-row{display:grid;grid-template-columns:64px 1fr 110px;gap:10px;align-items:center;margin:3px 0;font-size:12px}' +
        '.bar-bg{background:#ede5d4;border-radius:4px;height:18px;position:relative}' +
        '.bar-fill{background:linear-gradient(90deg,#1e3a5f,#b8541e);height:100%;border-radius:4px}' +
        '.no-data{padding:14px;background:#ede5d4;border-radius:8px;color:#6b5d47;font-style:italic}' +
        '.footer-note{margin-top:32px;padding:12px 16px;background:#ede5d4;border-left:4px solid #b8541e;border-radius:4px;font-size:12px;color:#4a3f2e}' +
        '.print-btn{position:fixed;top:18px;right:18px;background:#1e3a5f;color:#fff;border:0;padding:10px 18px;border-radius:8px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2);font-size:13px}' +
        '.print-btn:hover{background:#2a5285}' +
        '@media print{.print-btn{display:none}body{background:#fff;padding:8px}}' +
        '</style>';

      var html = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Report estratto contributivo' + (ana.cf?' — '+ana.cf:'') + '</title>' + rootCss + '</head><body><button class="print-btn" onclick="window.print()">Stampa / PDF</button><div class="report-wrap">';
      html += '<h1>Report estratto contributivo INPS</h1>';
      var fmtLabel = isE1Xml ? 'E1 (RispostaEstrattoConto INPS-UNEX)'
                    : isEcXml ? 'EC (EstrattoCarpe sintetico)'
                    : isAgXml ? 'AG (EstrattoAGO Carpe)'
                    : 'XML generico';
      html += '<p style="color:#6b5d47;font-size:13px">';
      html += 'Generato il ' + new Date().toLocaleString('it-IT');
      html += ' · Formato sorgente: <strong>' + fmtLabel + '</strong></p>';

      // ===== Anagrafica =====
      function escH(s) {
        return String(s == null ? '' : s)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
      function metaCard(lbl, val) {
        return '<div class="meta-card"><div class="meta-label">' + lbl
             + '</div><div class="meta-value">' + escH(val || '—') + '</div></div>';
      }
      html += '<h2>Anagrafica assicurato</h2><div class="report-meta">';
      html += metaCard('Cognome', ana.cognome);
      html += metaCard('Nome', ana.nome);
      html += metaCard('Codice Fiscale', ana.cf);
      html += metaCard('Sesso', ana.sesso);
      html += metaCard('Data nascita', ana.nascita);
      if (ana.luogoNascita) {
        var ln = ana.luogoNascita + (ana.provNascita ? ' (' + ana.provNascita + ')' : '');
        html += metaCard('Luogo nascita', ln);
      }
      if (ana.via) html += metaCard('Indirizzo', ana.via);
      if (ana.comune) {
        var co = ana.comune
                + (ana.prov ? ' (' + ana.prov + ')' : '')
                + (ana.cap ? ' ' + ana.cap : '');
        html += metaCard('Comune', co);
      }
      if (aggDate) html += metaCard('Aggiornato al', aggDate);
      if (presMontante) html += metaCard('Montante contributivo', presMontante);
      if (presPensione) html += metaCard('Calcolo pensione', presPensione);
      html += '</div>';

      // ===== KPI =====
      var totSett = 0, totRetrib = 0;
      periodi.forEach(function (p) {
        totSett   += settimaneOf(p) || 0;
        totRetrib += p.retribuzione || 0;
      });
      var anniKeys = Object.keys(perAnno)
                      .filter(function (k) { return k !== 'n.d.'; })
                      .sort();
      var spanAnni = 0;
      if (anniKeys.length > 0) {
        spanAnni = parseInt(anniKeys[anniKeys.length-1], 10)
                 - parseInt(anniKeys[0], 10) + 1;
      }
      var spanLabel = anniKeys.length > 0
                    ? anniKeys[0] + '–' + anniKeys[anniKeys.length-1]
                    : '—';
      var fmtNum = function (n) {
        return n.toLocaleString('it-IT', {
          minimumFractionDigits: 2, maximumFractionDigits: 2
        });
      };
      html += '<h2>Indicatori chiave</h2><div class="kpi-grid">';
      html += '<div class="kpi"><div class="kpi-label">Periodi totali</div>';
      html += '<div class="kpi-val">' + periodi.length + '</div>';
      html += '<div class="kpi-sub">record contributivi</div></div>';
      html += '<div class="kpi"><div class="kpi-label">Settimane totali</div>';
      html += '<div class="kpi-val">' + totSett + '</div>';
      html += '<div class="kpi-sub">' + (totSett/52).toFixed(1) + ' anni equiv.</div></div>';
      html += '<div class="kpi"><div class="kpi-label">Retribuzione totale</div>';
      html += '<div class="kpi-val">€ ' + fmtNum(totRetrib) + '</div>';
      html += '<div class="kpi-sub">somma retribuzioni</div></div>';
      html += '<div class="kpi"><div class="kpi-label">Span temporale</div>';
      html += '<div class="kpi-val">' + spanLabel + '</div>';
      html += '<div class="kpi-sub">' + spanAnni + ' anni di carriera</div></div>';
      html += '</div>';

      // ===== Tabella per anno =====
      html += '<h2>Riepilogo per anno</h2>';
      if (anniKeys.length === 0) {
        html += '<div class="no-data">Nessun periodo annuale ricavabile.</div>';
      } else {
        html += '<table><thead><tr>';
        html += '<th>Anno</th><th>N. periodi</th>';
        html += '<th class="numeric">Settimane</th>';
        html += '<th class="numeric">Retribuzione (€)</th>';
        html += '</tr></thead><tbody>';
        for (var ak = 0; ak < anniKeys.length; ak++) {
          var k = anniKeys[ak];
          var v = perAnno[k];
          html += '<tr><td>' + escH(k) + '</td>';
          html += '<td>' + v.n + '</td>';
          html += '<td class="numeric">' + v.settimane + '</td>';
          html += '<td class="numeric">' + fmtNum(v.retrib) + '</td></tr>';
        }
        html += '</tbody></table>';

        // Grafico a barre delle settimane
        var maxSett = 0;
        anniKeys.forEach(function (k) {
          if (perAnno[k].settimane > maxSett) maxSett = perAnno[k].settimane;
        });
        if (maxSett > 0) {
          html += '<h2>Settimane utili per anno</h2><div class="chart">';
          for (var bk = 0; bk < anniKeys.length; bk++) {
            var bk_k = anniKeys[bk];
            var bk_v = perAnno[bk_k];
            var pct = Math.max(2, Math.round(bk_v.settimane / maxSett * 100));
            html += '<div class="bar-row">';
            html += '<div>' + escH(bk_k) + '</div>';
            html += '<div class="bar-bg"><div class="bar-fill" style="width:' + pct + '%"></div></div>';
            html += '<div class="numeric">' + bk_v.settimane + ' sett</div>';
            html += '</div>';
          }
          html += '</div>';
        }
      }

      // ===== Dettaglio periodi =====
      if (periodi.length > 0) {
        html += '<h2>Dettaglio periodi contributivi</h2>';
        html += '<table><thead><tr>';
        html += '<th>Dal</th><th>Al</th><th>Categoria</th><th>UM</th>';
        html += '<th class="numeric">Contrib.</th>';
        html += '<th class="numeric">Retrib. (€)</th>';
        html += '<th>Cod. contrib.</th><th>Azienda</th>';
        html += '</tr></thead><tbody>';
        for (var pi = 0; pi < periodi.length; pi++) {
          var p = periodi[pi];
          var dal = p.dataDal || (p.dalAnno ? p.dalAnno : '');
          var al  = p.dataAl  || (p.alAnno  ? p.alAnno  : '');
          var ccD = contribLookup[p.codiceContrib] || '';
          var azD = aziende[p.codiceAzienda] || '';
          var cn  = p.contribDir || p.numContrib || 0;
          html += '<tr><td>' + escH(dal) + '</td><td>' + escH(al) + '</td>';
          html += '<td>' + escH(p.categoria || p.fondo || '') + '</td>';
          html += '<td>' + escH(p.unitaMisura || '') + '</td>';
          html += '<td class="numeric">' + cn + '</td>';
          html += '<td class="numeric">' + fmtNum(p.retribuzione || 0) + '</td>';
          html += '<td>' + escH(p.codiceContrib || '');
          if (ccD) html += ' <em style="color:#6b5d47;font-size:11px">' + escH(ccD) + '</em>';
          html += '</td><td>' + escH(p.codiceAzienda || '');
          if (azD) html += ' <em style="color:#6b5d47;font-size:11px">' + escH(azD) + '</em>';
          html += '</td></tr>';
        }
        html += '</tbody></table>';
      }

      html += '<div class="footer-note">';
      html += '<strong>Avviso.</strong> Report generato dall\'XML caricato. ';
      html += 'Solo a scopo di consultazione, nessun valore ufficiale.';
      html += '</div></div></body></html>';

      // Apri in nuova finestra
      var w = window.open('', '_blank');
      if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
        setStatus('✓ Report aperto in nuova finestra.', 'ok');
      } else {
        downloadBlob(html, 'report_estratto_' + (ana.cf || 'no-cf') + '.html', 'text/html');
        setStatus('✓ Report HTML scaricato (popup bloccato).', 'ok');
      }
    }

    var btnReport = document.getElementById('e1-btn-report');
    if (btnReport) {
      btnReport.addEventListener('click', function () {
        try { buildReport(); }
        catch (err) { setStatus('Errore: ' + err.message, 'error'); }
        flashBtn(btnReport);
      });
    }
    initCodeCanvas();
  });


  function initCodeCanvas() {
    var cc = document.getElementById('e1-cc');
    if (!cc) return;
    var codeEl = document.getElementById('e1-cc-code');
    var copyBtn = document.getElementById('e1-cc-copy');
    var tabs = cc.querySelectorAll('.e1-cc-tab');
    var snippets = cc.querySelectorAll('script[type="text/x-e1-snippet"]');

    function getSnippet(lang) {
      for (var i = 0; i < snippets.length; i++) {
        if (snippets[i].getAttribute('data-lang') === lang) {
          return snippets[i].textContent;
        }
      }
      return '';
    }
    function escHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function renderCode(lang) {
      var raw = getSnippet(lang);
      if (!raw) return;
      var lines = raw.split('\n');
      var html = '';
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i] || ' ';
        // NIENTE \n fra span: dentro <pre> diventerebbe una riga vuota in più
        html += '<span class="e1-cc-line">' + escHtml(line) + '</span>';
      }
      codeEl.innerHTML = html;
      cc.setAttribute('data-active', lang);
      for (var t = 0; t < tabs.length; t++) {
        var isAct = tabs[t].getAttribute('data-lang') === lang;
        tabs[t].classList.toggle('is-active', isAct);
        tabs[t].setAttribute('aria-selected', isAct ? 'true' : 'false');
      }
    }

    var initial = cc.getAttribute('data-active') || 'python';
    renderCode(initial);

    for (var t = 0; t < tabs.length; t++) {
      (function (btn) {
        btn.addEventListener('click', function (ev) {
          ev.preventDefault();
          var lang = btn.getAttribute('data-lang');
          if (lang) renderCode(lang);
        });
      })(tabs[t]);
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var lang = cc.getAttribute('data-active') || 'python';
        var raw = getSnippet(lang);
        var ta = document.createElement('textarea');
        ta.innerHTML = raw;
        var txt = ta.value;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(txt).then(function () {
            copyBtn.classList.add('is-copied');
            var lbl = copyBtn.querySelector('.e1-cc-copy-label');
            var orig = lbl ? lbl.textContent : 'Copia raw';
            if (lbl) lbl.textContent = '✓ Copiato!';
            setTimeout(function () {
              copyBtn.classList.remove('is-copied');
              if (lbl) lbl.textContent = orig;
            }, 1800);
          });
        }
      });
    }
  }
})();
