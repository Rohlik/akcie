## Nasazení (Linux systemd + Apache2 reverse proxy)

Tahle složka obsahuje ukázkové produkční konfigurace pro spuštění Flask aplikace za **Gunicornem** (spravovaným přes **systemd**) a zpřístupnění přes **Apache2 reverse proxy**.

### 1) Připrav adresář aplikace

- Umísti projekt někam „natrvalo“, např. do `/var/www/html/akcie`
- Vytvoř virtuální prostředí a nainstaluj závislosti:

```bash
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

### 2) Prostředí (SECRET_KEY apod.)

Zkopíruj ukázkový env soubor a uprav si ho:

```bash
sudo cp deploy/systemd/akcie-web.env.example /etc/akcie-web.env
sudo nano /etc/akcie-web.env
```

Minimálně nastav **SECRET_KEY** na nějakou silnou náhodnou hodnotu.

### 3) systemd unit

Zkopíruj unit soubor a případně uprav cesty / uživatele podle svého:

```bash
sudo cp deploy/systemd/akcie-web.service /etc/systemd/system/akcie-web.service
sudo systemctl daemon-reload
sudo systemctl enable --now akcie-web
sudo systemctl status akcie-web
```

Logy:

```bash
journalctl -u akcie-web -f
```

### 4) Apache2 reverse proxy

#### Debian/Ubuntu

Zapni potřebné moduly:

```bash
sudo a2enmod proxy proxy_http headers
sudo systemctl restart apache2
```

Pokud chceš nastavit TLS (HTTPS), zapni také SSL modul:

```bash
sudo a2enmod ssl
```

Zkopíruj ukázkový vhost config, uprav `ServerName` a (volitelně) autentizaci/TLS:

```bash
sudo cp deploy/apache/akcie-web.conf /etc/apache2/sites-available/akcie-web.conf
sudo a2ensite akcie-web
sudo systemctl reload apache2
```

#### CentOS/RHEL

Otevři hlavní konfigurační soubor:

```bash
sudo nano /etc/httpd/conf/httpd.conf
```

A ujisti se, že jsou tyto řádky odkomentované (nebo je přidej):

```apache
LoadModule proxy_module modules/mod_proxy.so
LoadModule proxy_http_module modules/mod_proxy_http.so
LoadModule headers_module modules/mod_headers.so
```

Pokud chceš nastavit TLS (HTTPS), přidej také:

```apache
LoadModule ssl_module modules/mod_ssl.so
```

Zkopíruj ukázkový vhost config přímo do `conf.d` adresáře (není potřeba `a2ensite`):

```bash
sudo cp deploy/apache/akcie-web.conf /etc/httpd/conf.d/akcie-web.conf
```

Uprav `ServerName` a (volitelně) autentizaci/TLS v souboru:

```bash
sudo nano /etc/httpd/conf.d/akcie-web.conf
```

A restartuj Apache:

```bash
sudo systemctl restart httpd
```

### Poznámky

- Gunicorn je nastavený tak, aby bindoval na `127.0.0.1:5000` (jen lokálně) a Apache na něj proxyuje.
- Databáze je v `instance/portfolio.db` v adresáři projektu (ujisti se, že uživatel definovaný v systemd unit souboru do ní může zapisovat).

