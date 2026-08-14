# Weekplan

Týdenní plánovač práce nad JIRA. Tasky přiřazené v JIRA si přetáhneš na konkrétní dny v týdnu,
aplikace si plán pamatuje ve vlastní databázi a hlídá, kolik hodin ti ve dni zbývá po odečtení
režie ze schůzek v Outlook / Teams kalendáři.

> Do JIRA se **nikdy nic nezapisuje** — aplikace ji jen čte.

## Co to umí

- **Týdenní kalendář**, defaultně aktuální ISO týden, pondělí–pátek (víkend volitelně).
- **Panel s tasky z JIRA**, kde se sprint vybírá podle zobrazeného týdne — skok na další týden přepne
  i sprint. Ostatní sprinty a backlog se dají dozaškrtnout, jednotlivé tasky skrýt a naplánované
  odfiltrovat. Nabízí se jen běžící řada sprintů: uzavřené ani „odpadkové koše" (sprinty bez dat,
  kam se odkládají staré tasky) aplikace nezobrazuje.
- **Drag & drop** tasku na den. Výchozí počet hodin = zbývající odhad, oříznutý volnou kapacitou dne.
- **Plán je perzistentní** — žije v Postgresu, přežije restart kontejnerů i změny v JIRA.
- **Rozdělení tasku přes víc dní** (2 h ve středu, 3 h ve čtvrtek) a přesun mezi dny tažením.
- **Kapacita 8 h / den**, konfigurovatelná, plus pracovní dny, dovolená/půlden na konkrétní den
  a české státní svátky (kapacita 0).
- **Režie z kalendáře**: publikovaný ICS feed z Outlooku, včetně opakovaných schůzek, výjimek
  a přesunutých instancí. Celodenní událost typu „mimo kancelář" srazí kapacitu dne na nulu,
  událost označená jako _volno_ se do režie nepočítá. Překrývající se schůzky se počítají jednou.
- **Ruční bloky režie** přímo ve dni, když něco v kalendáři ještě není.
- **Co jsi reálně odpracoval** — u každého dne seznam tasků a hodin vykázaných v JIRA (přes Tempo),
  v hlavičce součet za aktuální měsíc a celkový objem práce, který na tebe v JIRA čeká.
- **Přeplánovaný den** je vidět na první pohled (červený pruh + varování v součtech).
- **Multi-user datový model** — plány, kapacity i kalendáře jsou vázané na uživatele; UI zatím
  zobrazuje jednoho.

## Rychlý start

Potřebuješ Docker a přístup do JIRA (Server / Data Center).

```bash
git clone <repo> weekplan && cd weekplan
cp .env.example .env      # vyplň JIRA_URL, JIRA_USERNAME, JIRA_PASSWORD
make up
```

Pak otevři **http://weekplan.localhost:8090**.

Doména `*.localhost` se na macOS i Linuxu překládá na 127.0.0.1 sama, není potřeba nic zapisovat
do `/etc/hosts`. Pokud by to tvůj systém neuměl, přidej si řádek `127.0.0.1 weekplan.localhost`.

Když máš `JIRA_URL`, `JIRA_USERNAME` a `JIRA_PASSWORD` už exportované v shellu (`~/.zshrc`),
`.env` vůbec nepotřebuješ — docker compose si je vezme z prostředí.

### Aplikace na čistém `http://weekplan.localhost` (port 80)

Docker Desktop na macOS neumí mapovat porty pod 1024, dokud nedoinstaluješ privilegovaného pomocníka:
**Settings → Advanced → Allow privileged port mapping** (chce heslo správce). Pak stačí v `.env`
nastavit `PROXY_PORT=80` a `make up`.

### Příkazy

| Příkaz                        | Co dělá                                     |
| ----------------------------- | ------------------------------------------- |
| `make up`                     | postaví a nastartuje celý stack             |
| `make down`                   | zastaví stack                               |
| `make logs` / `make logs-api` | logy                                        |
| `make sync`                   | vynutí synchronizaci JIRA i kalendářů       |
| `make status`                 | stav kontejnerů a poslední synchronizace    |
| `make studio`                 | Prisma Studio nad databází                  |
| `make psql`                   | psql do databáze                            |
| `make reset-db`               | smaže databázi včetně plánu a postaví znovu |

## Režie z Outlook / Teams kalendáře

1. Outlook Web → **Nastavení → Kalendář → Sdílené kalendáře → Publikovat kalendář**.
2. Vyber kalendář, oprávnění **Zobrazit všechny podrobnosti**, publikuj a zkopíruj **ICS** odkaz.
3. V aplikaci ozubené kolo → **Kalendáře s režií** → vlož odkaz.

Publikovaný feed z Outlooku se aktualizuje se zpožděním — klidně i několik hodin. Aplikace proto
ukazuje stáří dat a schůzku, která ve feedu ještě není, si můžeš přidat jako ruční blok režie.
Odkaz na ICS ber jako heslo: kdo ho má, přečte si tvůj kalendář.

## Architektura

```
weekplan/
├── backend/     Node 22 + Fastify + Prisma + Postgres   (port 3010)
├── frontend/    React 19 + Vite + Tailwind + dnd-kit    (port 5180)
├── proxy/       nginx — sloučí obojí pod jednu doménu   (port 8090)
└── docker-compose.yml
```

- **JIRA se čte ve třech vlnách**: aktivní sprint a čerstvě změněné tasky každých 5 minut,
  naplánované tasky se dotahují podle klíčů (aby bylo poznat, že se task dokončil nebo přeřadil),
  plná synchronizace každých 6 hodin. Panel čte vždy jen lokální cache, nikdy JIRA přímo.
- **Kapacita se počítá na serveru** a každá změna plánu vrací přepočítaný celý týden, takže se
  frontend nikdy nerozejde se serverem.
- Špatné heslo se **neopakuje** — po odmítnutí se plánovaná synchronizace zastaví, aby se
  doménový účet nezamkl.

Podrobnosti k vývoji jsou v [CLAUDE.md](CLAUDE.md).

## Testy

```bash
cd backend && npm install && npm test    # datumy vč. přechodu na letní čas, parsování sprintu, ICS
cd frontend && npm install && npm test   # tvar požadavků na API
make e2e                                 # Playwright nad celým stackem proti falešné JIRA
```

E2E testy si nastartují vlastní stack (jiný compose projekt, porty 3011/5181) proti mocku JIRA,
takže běží offline a nesáhnou na tvoje data ani na produkční JIRA. Úklid: `make e2e-down`.

CI na GitHubu hlídá typy, testy, build frontendu, formátování a to, že se do repa nedostane `.env`
ani konkrétní JIRA instance.

## Co zatím neumí

Zápis do JIRA (Due Date, worklogy), Microsoft Graph místo ICS, přepínání uživatelů v UI
a týmový pohled, přihlašování (běží lokálně na `127.0.0.1`).
