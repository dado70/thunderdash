# Unanswered Emails Dashboard Pro

Estensione per **Thunderbird 128 e successivi** che mostra in una dashboard le email ricevute a cui **non hai ancora risposto**, con giorni di attesa, tag di Thunderbird e note personali.

*English summary at the end of this page.*

---

## Funzionalità

- **Rilevamento preciso delle risposte**
  - confronta il `Message-ID` di ogni email ricevuta con le intestazioni `In-Reply-To` / `References` delle email inviate;
  - in mancanza di queste intestazioni (opzionale) riconosce la risposta dall'oggetto, ripulito dai prefissi `Re:`, `R:`, `Rif:`, `Fwd:`, `I:`, `AW:`… anche ripetuti, purché inviata **dopo** l'email ricevuta e **indirizzata al mittente**.
- **Tutti gli account**, con selezione delle cartelle
  - di base: Posta in arrivo con le sue sottocartelle (ricevute) e Inviati di tutti gli account (risposte, anche se inviate da un altro account);
  - nelle Opzioni puoi aggiungere o togliere qualsiasi cartella (es. un Archivio);
  - Spam, Cestino, Bozze, Modelli e Posta in uscita sono **sempre esclusi**.
- **Dashboard** in una scheda di Thunderbird, aperta dal pulsante nella barra degli strumenti
  - periodo personalizzabile e scorciatoie 7 / 30 / 90 giorni / 1 anno;
  - riepilogo: in attesa, critiche, in attenzione, transazionali (cliccabili come filtro);
  - ricerca su mittente, oggetto e note; filtri per account, tipo e tag; ordinamento per colonna;
  - badge colorati per i giorni di attesa, con soglie configurabili (predefinite 2 e 5 giorni).
- **Azioni su ogni email**
  - **Apri** il messaggio in Thunderbird o **Rispondi** direttamente;
  - **Tag** di Thunderbird (Importante, Lavoro, Da fare… e i tuoi tag): le modifiche sono quelle reali, visibili ovunque in Thunderbird. Al primo avvio viene creato il tag **"Rispondere"**, se non esiste già;
  - **Nota personale** su ogni email;
  - **Ignora** ("non serve risposta"): l'email esce dalla lista ed è ricordata; puoi ripristinarla in qualsiasi momento dalla vista **Ignorate**.
- **Email transazionali**: newsletter, no-reply, notifiche… sono riconosciute tramite parole chiave modificabili, più le tue parole o indirizzi aggiuntivi. Puoi evidenziarle o nasconderle.
- **Esportazione CSV** delle righe visualizzate (apribile con LibreOffice Calc o altri fogli di calcolo).
- **Cache**: le intestazioni delle email inviate già lette vengono memorizzate, quindi le scansioni successive sono molto più veloci anche su caselle grandi. L'ultimo risultato viene mostrato subito all'apertura.
- **Backup** in JSON di impostazioni, note ed email ignorate, con importazione (unione o sostituzione).
- Interfaccia in **italiano e inglese** (segue la lingua di Thunderbird), tema chiaro e scuro automatico.

## Requisiti

- Thunderbird **128 ESR o successivo** (Manifest V3).
- Su Thunderbird 153 e successivi la lettura delle intestazioni usa `messages.getHeaders()`, più veloce; sulle versioni precedenti viene usato `messages.getFull()`.

## Installazione

1. Scarica il file `thunderdash-X.Y.Z.xpi` dalla pagina **Releases** del repository.
2. In Thunderbird apri il menu **☰ → Componenti aggiuntivi e temi** (oppure **Strumenti → Componenti aggiuntivi e temi**).
3. Clicca l'ingranaggio ⚙️ → **Installa componente aggiuntivo da file…** e seleziona il file `.xpi`.
4. Conferma i permessi richiesti (vedi sotto).
5. Nella barra degli strumenti compare il pulsante **Email senza risposta**. Se non lo vedi: tasto destro sulla barra degli strumenti → **Personalizza…** e trascinalo nella posizione desiderata.

### Aggiornamento

Installa il nuovo `.xpi` con la stessa procedura: impostazioni, note ed email ignorate vengono mantenute.

### Prova senza installare (sviluppatori)

`about:debugging` → **Questo Thunderbird** → **Carica componente aggiuntivo temporaneo…** e seleziona `manifest.json`.

## Utilizzo

1. Clicca il pulsante **Email senza risposta**: si apre la dashboard.
2. Scegli il periodo e premi **Analizza**. Durante la scansione puoi **annullare**.
3. Usa le icone a destra di ogni riga: apri, rispondi, tag, nota, ignora.
4. Le impostazioni (soglie, parole chiave, cartelle, backup) sono nel pulsante **Opzioni** della dashboard o in **Componenti aggiuntivi → Unanswered Emails Dashboard Pro → Opzioni**.

## Permessi richiesti

| Permesso | Perché |
|---|---|
| Leggere account e cartelle (`accountsRead`) | elencare account, cartelle e le tue identità (per non considerare le email inviate da te) |
| Leggere i messaggi (`messagesRead`) | leggere intestazioni di email ricevute e inviate |
| Modificare i messaggi (`messagesUpdate`) | assegnare/togliere i tag |
| Gestire ed elencare i tag (`messagesTags`, `messagesTagsList`) | mostrare i tag e creare il tag "Rispondere" |
| Comporre messaggi (`compose`) | aprire la finestra di risposta |
| Archiviazione (`storage`) | salvare impostazioni, note, email ignorate e cache |
| Download (`downloads`) | salvare l'esportazione CSV e il backup |

## Privacy

L'estensione **non invia alcun dato all'esterno** e non usa servizi di terze parti. Tutto viene elaborato e salvato localmente nel profilo di Thunderbird. Per riconoscere le risposte vengono usate solo le intestazioni delle email; il testo delle email non viene analizzato né salvato. (Su Thunderbird precedenti alla 153 l'API `getFull()` restituisce anche il corpo, che viene ignorato.)

Note ed email ignorate restano su questo computer. Se reinstalli l'estensione o cambi PC, esporta prima un **backup** dalle Opzioni.

## Limiti noti

- Una risposta viene riconosciuta solo se l'email inviata si trova in una delle cartelle "Inviate" selezionate. Se archivi le email inviate, aggiungi la cartella di archivio come cartella "Inviate" nelle Opzioni.
- Con account IMAP non sincronizzati offline, la lettura delle intestazioni delle email inviate richiede il server. Se non è raggiungibile, quelle email vengono valutate solo tramite l'oggetto e la dashboard ne indica il numero.
- Il riconoscimento delle email transazionali è basato su parole chiave e va considerato indicativo.

## Compilare dal sorgente

Requisiti: `bash`, `zip`, Node.js 20 o successivo (solo per test e lint).

```bash
node --test tests/          # test automatici
bash scripts/build.sh       # crea dist/thunderdash-<versione>.xpi
```

I rilasci sono automatici: creando un tag `vX.Y.Z` uguale alla versione in `manifest.json`, GitHub Actions esegue test e lint, crea il `.xpi` e lo allega alla Release.

## Licenza

Copyright © 2026 Alessandro (dado) Scapuzzi &lt;dado70@gmail.com&gt;

Questo programma è software libero, distribuito secondo i termini della **GNU Affero General Public License versione 3** o successiva. Vedi il file [LICENSE](LICENSE).

### Componenti di terze parti

- Icone: [Tabler Icons](https://github.com/tabler/tabler-icons) 3.49.0, © 2020-2026 Paweł Kuna, licenza MIT (vedi `icons/LICENSE-tabler-icons.txt`).

---

## English summary

**Unanswered Emails Dashboard Pro** is a Thunderbird 128+ (Manifest V3) extension that lists the received emails you have not replied to yet.

- Replies are detected by matching each message's `Message-ID` against the `In-Reply-To` / `References` headers of your sent mail, with an optional fallback on the normalized subject (later message addressed to the sender).
- All accounts; Inbox and subfolders plus every Sent folder by default, fully configurable; Junk, Trash, Drafts, Templates and Outbox are always excluded.
- Dashboard tab with date range, waiting-time badges (configurable thresholds), search, filters, sorting and CSV export.
- Per-message actions: open, reply, Thunderbird tags (a "To reply" tag is created on first install), personal notes, ignore/restore.
- Header cache for fast rescans, JSON backup/restore, Italian and English UI, light/dark theme.
- No data ever leaves your computer.

Install: download the `.xpi` from **Releases**, then in Thunderbird open **Add-ons and Themes → ⚙️ → Install Add-on From File…**.

License: AGPL-3.0-or-later.
