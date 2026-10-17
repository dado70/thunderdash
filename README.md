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
  - nelle Opzioni puoi aggiungere o togliere qualsiasi cartella (es. un Archivio): l'elenco è comprimibile per account e cartella, con pulsanti per selezionare/deselezionare tutte le Posta in arrivo o tutte le Posta inviata e per **ripristinare la selezione predefinita**;
  - Spam, Cestino, Bozze, Modelli, Posta in uscita e le cartelle di ricerca salvate sono **sempre esclusi** (accanto a ciascuna è indicato il motivo).
- **Dashboard** in una scheda di Thunderbird, aperta dal pulsante nella barra degli strumenti
  - periodo personalizzabile e scorciatoie 7 / 30 / 90 giorni / 1 anno;
  - riepilogo: in attesa, critiche, in attenzione, transazionali (cliccabili come filtro);
  - ricerca su mittente, oggetto e note; filtri per account, tipo e tag; ordinamento per colonna;
  - badge colorati per i giorni di attesa, con soglie configurabili (predefinite 2 e 5 giorni);
  - pannello **Corrispondenti a cui rispondere**: ogni mittente con il numero di email in attesa, quante sono critiche e da quanto aspetta la più vecchia, con ricerca; un clic sul nome filtra l'elenco su quel mittente.
- **Riepilogo programmato via email** (HTML): giornaliero, settimanale o mensile, a te e/o ad altri destinatari (es. un collega), ognuno con la propria pianificazione. Vedi [Riepilogo programmato](#riepilogo-programmato).
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

## Riepilogo programmato

Nelle **Opzioni → Riepilogo programmato** puoi creare una o più pianificazioni. Per ciascuna scegli:

- **destinatari**: uno o più indirizzi **separati da virgola** (es. `io@esempio.it, collega@esempio.it`), e **identità** di Thunderbird da cui inviare. Se un destinatario deve ricevere il riepilogo con una frequenza o impostazioni diverse, **aggiungi un'altra pianificazione**;
- **frequenza**: giornaliera, settimanale (giorno della settimana) o mensile (giorno del mese; nei mesi più corti viene usato l'ultimo giorno), e **ora**;
- se inviare **anche quando non ci sono email in attesa** e se **escludere le email transazionali**.

Il riepilogo contiene i contatori (in attesa, critiche, in attenzione) e l'elenco delle **email critiche raggruppate per account**, con tag e note personali. Analizza gli **ultimi N giorni** (impostabile, predefinito 30) usando account e cartelle selezionati nelle Opzioni; le email ignorate non compaiono. Il pulsante **Salva e invia ora** permette di provarlo subito.

L'invio usa il tuo account di Thunderbird (server SMTP e copia negli Inviati come da impostazioni dell'identità). Su Thunderbird **153 e successivi** avviene in background; sulle versioni **128–152** si apre per un istante una finestra di composizione che si invia da sola. Se sei offline, il messaggio resta nella Posta in uscita e parte appena torni online. Ogni riepilogo ha l'intestazione `X-Thunderdash-Report: 1`, utile per creare un filtro.

### Thunderbird deve essere aperto

Un'estensione funziona solo mentre Thunderbird è in esecuzione. Per questo:

- se all'ora prevista Thunderbird era chiuso, il riepilogo viene **inviato una sola volta al successivo avvio** (recupero automatico);
- per ricevere i riepiloghi in orario conviene **avviare Thunderbird automaticamente all'accesso**:
  - **Linux** (GNOME, KDE, XFCE…): aggiungi Thunderbird alle *Applicazioni d'avvio* della tua sessione, oppure crea il file `~/.config/autostart/thunderbird.desktop` con:
    ```ini
    [Desktop Entry]
    Type=Application
    Name=Thunderbird
    Exec=thunderbird
    X-GNOME-Autostart-enabled=true
    ```
  - **Windows**: premi `Win + R`, digita `shell:startup` e incolla nella cartella un collegamento a Thunderbird;
  - **macOS**: *Impostazioni di Sistema → Generali → Elementi login* → aggiungi Thunderbird.

Un servizio esterno, indipendente da Thunderbird, è previsto nella [roadmap](#roadmap).

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
3. Nel pannello **Corrispondenti a cui rispondere** vedi chi aspetta una tua risposta: cerca un nome o un indirizzo e cliccalo per vedere solo le sue email; per togliere il filtro usa la ✕ sull'etichetta *Mittente* sopra l'elenco.
4. Usa le icone a destra di ogni riga: apri, rispondi, tag, nota, ignora (le email ignorate restano nella vista **Ignorate**, da cui puoi ripristinarle).
5. Le impostazioni sono nel pulsante **Opzioni** della dashboard o in **Componenti aggiuntivi → Unanswered Emails Dashboard Pro → Opzioni**:
   - **Generale**: soglie dei giorni, periodo predefinito, riconoscimento dall'oggetto;
   - **Email transazionali**: parole chiave e indirizzi da considerare transazionali;
   - **Cartelle**: quali cartelle analizzare come *Ricevute* e come *Inviate*, con espandi/comprimi, selezione rapida di tutte le Posta in arrivo / Posta inviata e **Ripristina selezione predefinita**;
   - **Riepilogo programmato**: le pianificazioni dei riepiloghi via email (vedi sopra);
   - **Dati e backup**: esportazione/importazione del backup, svuotamento della cache, creazione del tag "Rispondere".

   Le modifiche vengono applicate premendo **Salva**.

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
| Allarmi (`alarms`) | programmare l'invio dei riepiloghi |
| Inviare messaggi (`compose.send`, `messages.send`) | inviare il riepilogo programmato dal tuo account (`messages.send` esiste da Thunderbird 153 ed è ignorato dalle versioni precedenti) |

## Privacy

L'estensione **non invia dati allo sviluppatore né a servizi di terze parti**. Tutto viene elaborato e salvato localmente nel profilo di Thunderbird. L'unico invio è il **riepilogo programmato**, solo se lo configuri tu: parte dal tuo account di posta verso i destinatari che hai indicato, e contiene mittenti, oggetti, tag e note delle email critiche (tienine conto se lo invii a un collega). Per riconoscere le risposte vengono usate solo le intestazioni delle email; il testo delle email non viene analizzato né salvato. (Su Thunderbird precedenti alla 153 l'API `getFull()` restituisce anche il corpo, che viene ignorato.)

Note ed email ignorate restano su questo computer. Se reinstalli l'estensione o cambi PC, esporta prima un **backup** dalle Opzioni.

## Limiti noti

- Una risposta viene riconosciuta solo se l'email inviata si trova in una delle cartelle "Inviate" selezionate. Se archivi le email inviate, aggiungi la cartella di archivio come cartella "Inviate" nelle Opzioni.
- Con account IMAP non sincronizzati offline, la lettura delle intestazioni delle email inviate richiede il server. Se non è raggiungibile, quelle email vengono valutate solo tramite l'oggetto e la dashboard ne indica il numero.
- Il riconoscimento delle email transazionali è basato su parole chiave e va considerato indicativo.

## Roadmap

- Canali di notifica aggiuntivi per il riepilogo: **Telegram** (bot) e **ntfy** (notifiche push open source, anche su server proprio).
- **Servizio compagno** indipendente da Thunderbird (avviato da un timer di sistema sul PC Linux): legge la posta via IMAP e invia il riepilogo via SMTP anche quando Thunderbird è chiuso.

Le modifiche di ogni versione sono descritte nel [CHANGELOG](CHANGELOG.md).

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
- All accounts; Inbox and subfolders plus every Sent folder by default, fully configurable (collapsible tree, select/deselect all Inboxes or Sent folders, restore defaults); Junk, Trash, Drafts, Templates, Outbox and saved searches are always excluded.
- Dashboard tab with date range, waiting-time badges (configurable thresholds), search, filters, sorting and CSV export.
- Per-message actions: open, reply, Thunderbird tags (a "To reply" tag is created on first install), personal notes, ignore/restore.
- "Correspondents to reply to" panel with search; click a sender to filter.
- Scheduled HTML summary e-mails (daily / weekly / monthly, several schedules and recipients), sent from your Thunderbird account; a summary missed while Thunderbird was closed is sent once at the next start-up.
- Header cache for fast rescans, JSON backup/restore, Italian and English UI, light/dark theme.
- No data is sent to the developer or to third parties; the only outgoing data is the scheduled summary, if you configure it, sent from your own account to the recipients you choose.

Install: download the `.xpi` from **Releases**, then in Thunderbird open **Add-ons and Themes → ⚙️ → Install Add-on From File…**.

License: AGPL-3.0-or-later.
