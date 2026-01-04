# Prague Stock Exchange Tracker

Webová aplikace pro sledování osobních akcií z Pražské burzy s daňovou optimalizací podle českých zákonů.

## Funkce

- **Sledování transakcí**: Přidávání nákupů a prodejů akcií
  - Při prodeji automatický výběr z dostupných akcií v portfoliu
- **FIFO kalkulace**: Automatický výpočet držených akcií pomocí metody FIFO
- **Historie transakcí**: Rozklikávací historie transakcí pro každou akcii v portfoliu
- **Daňová optimalizace**:
  - Zobrazení zbývající daňově osvobozené kapacita (100 000 Kč ročně)
  - Zvýraznění akcií držených déle než 3 roky (vždy daňově osvobozené)
- **Aktuální ceny**: Načítání aktuálních cen z Yahoo Finance
- **Vizualizace zisků/ztrát**: 
  - Přehled zisků a ztrát pro každou akcii v portfoliu
  - Přehled zisků/ztrát podle kalendářního roku pro prodané akcie
- **Český kalendář**: Kalendářní výběr začíná pondělím (český standard)

## Požadavky

- **Python 3.8 nebo novější** (doporučeno Python 3.9+)

## Instalace

1. Klonujte nebo stáhněte tento repozitář

2. Vytvořte virtuální prostředí:
```bash
python3 -m venv venv
source venv/bin/activate  # Na Linuxu/Mac
# nebo
venv\Scripts\activate  # Na Windows
```

3. Nainstalujte závislosti:
```bash
pip install -r requirements.txt
```

## Spuštění

### Vývojové prostředí

1. Aktivujte virtuální prostředí (pokud ještě není aktivní)

2. Spusťte Flask aplikaci:
```bash
python app.py
```

3. Otevřete prohlížeč na adrese: `http://localhost:5000`

**Poznámka:** Flask zobrazí varování o vývojovém serveru. To je normální pro vývoj. Pro produkční nasazení použijte produkční WSGI server (viz níže).

### Produkční nasazení (trvalé spuštění)

Pro trvalé spuštění aplikace použijte systemd service. Vytvořte soubor `/etc/systemd/system/prague-stock-tracker.service`:

```ini
[Unit]
Description=Prague Stock Exchange Tracker
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/var/www/html/akcie
Environment="PATH=/var/www/html/akcie/venv/bin"
Environment="SECRET_KEY=superSecret007"
ExecStart=/var/www/html/akcie/venv/bin/gunicorn --bind 127.0.0.1:5000 --workers 1 app:app
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Nainstalujte gunicorn:
```bash
pip install gunicorn
```

Aktivujte a spusťte službu:
```bash
sudo systemctl daemon-reload
sudo systemctl enable prague-stock-tracker
sudo systemctl start prague-stock-tracker
```

Kontrola stavu:
```bash
sudo systemctl status prague-stock-tracker
```

**Alternativa:** Můžete také použít jiné WSGI servery jako uWSGI nebo Waitress.

**Tip:** Příklad produkčních konfiguračních souborů (systemd + gunicorn + Apache2 reverse proxy) najdete ve složce `deploy/`.

## Použití

### Přidání transakce

1. Vyplňte formulář:
   - Typ transakce (Nákup/Prodej)
     - Při výběru "Prodej" se zobrazí výběr dostupných akcií z portfolia
   - Název akcie (pro nákup zadejte ručně, pro prodej vyberte z rozbalovacího seznamu)
   - Datum transakce (kalendář začíná pondělím)
   - Cena v CZK
   - Množství

2. Klikněte na "Přidat transakci"

### Zobrazení historie transakcí

- Klikněte na název akcie v tabulce Portfolio pro zobrazení historie všech transakcí pro danou akcii
- Historie se zobrazí jako rozbalovací sekce pod řádkem akcie

### Aktualizace cen

1. Klikněte na tlačítko "Aktualizovat ceny"
2. Aplikace načte aktuální ceny ze Yahoo Finance pro všechny akcie v portfoliu

### Daňové informace

Aplikace automaticky zobrazuje:
- Celkové prodeje v aktuálním daňovém roce
- Zbývající daňově osvobozenou kapacitu (100 000 Kč - prodeje)
- Hodnotu akcií držených déle než 3 roky

Akcie držené déle než 3 roky jsou zvýrazněny zelenou barvou v tabulce portfolia.

## Databáze

Aplikace používá SQLite databázi uloženou v `instance/portfolio.db`. Databáze se vytvoří automaticky při prvním spuštění.

## Nasazení za Apache2 reverse proxy

1. Spusťte Flask aplikaci na localhost (např. port 5000)

2. Nakonfigurujte Apache2 reverse proxy. Příklad konfigurace:

```apache
<VirtualHost *:80>
    ServerName your-domain.com
    
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:5000/
    ProxyPassReverse / http://127.0.0.1:5000/
    
    # Basic authentication (volitelné)
    <Location />
        AuthType Basic
        AuthName "Restricted Access"
        AuthUserFile /path/to/.htpasswd
        Require valid-user
    </Location>
</VirtualHost>
```

3. Povolte potřebné moduly:
```bash
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo systemctl restart apache2
```

## Struktura projektu

```
akcie/
├── app.py                 # Hlavní Flask aplikace
├── models.py              # Databázové modely
├── tax_calculator.py      # FIFO a daňové kalkulace
├── yahoo_finance.py       # Načítání cen z Yahoo Finance
├── config.py              # Konfigurace
├── requirements.txt       # Python závislosti
├── static/
│   ├── css/
│   │   └── style.css      # Styly
│   └── js/
│       └── main.js        # JavaScript
├── templates/
│   ├── base.html          # Základní šablona
│   └── index.html         # Hlavní dashboard
└── instance/
    └── portfolio.db       # SQLite databáze
```

## České daňové zákony

Aplikace implementuje následující pravidla:

- **3leté osvobození**: Akcie koupené před více než 3 lety jsou vždy daňově osvobozené (bez ohledu na částku)
- **100k Kč osvobození**: Celkové prodeje v daňovém roce ≤ 100 000 Kč jsou daňově osvobozené
- **Nezávislá osvobození**: Tyto dvě osvobození jsou nezávislá - prodeje akcií držených >3 roky se NEpočítají do limitu 100 000 Kč
- **FIFO metoda**: Nejstarší nákupy jsou považovány za prodané jako první
- **Daňový rok**: 1. leden až 31. prosinec

## Poznámky

- Yahoo Finance API může mít omezení rychlosti. Při častém aktualizování cen může dojít k dočasným chybám.
- Ceny jsou ukládány do cache v databázi pro rychlejší načítání.
- Pokud není cena dostupná, zobrazí se jako "Nedostupné".

## Licence

Tento projekt je poskytován "tak jak je" pro osobní použití.

