# CLAUDE.md — weekplan

Kontext pro práci na tomhle projektu. Co je pro uživatele, je v [README.md](README.md).

## Co to je

Osobní týdenní plánovač práce nad JIRA. Tasky přiřazené uživateli se přetahují na konkrétní dny,
plán se ukládá lokálně do Postgresu. Kapacita dne = 8 h mínus režie ze schůzek (ICS feed z Outlooku).

**Do JIRA se nikdy nezapisuje.** Žádné worklogy, žádné transitions, žádný Due Date. Kdyby přišel
požadavek na zápis, je to vědomá změna kontraktu, ne drobnost.

## Stack a porty

| Služba  | Technologie                                             | Host port           |
| ------- | ------------------------------------------------------- | ------------------- |
| `api`   | Node 22, Fastify 5, Prisma 6, zod, node-cron, ical.js   | 3010                |
| `web`   | React 19, Vite 6, Tailwind 4, TanStack Query 5, dnd-kit | 5180                |
| `db`    | Postgres 16                                             | 5442                |
| `proxy` | nginx — `/` → web, `/api` → api                         | 8090 (`PROXY_PORT`) |

Aplikace běží na `http://weekplan.localhost:8090`. Port 80 vyžaduje v Docker Desktopu
„Allow privileged port mapping", proto default 8090. Všechny porty jsou schválně mimo rozsahy,
které zabírají ostatní projekty v `~/Dev` (5432, 5173, 3000, 8000, 8080).

Kontejnery běží s `TZ=Europe/Prague` — datumová logika na tom staví.

## Konvence

- Komentáře v kódu **anglicky a jen tam, kde vysvětlují PROČ**. Co je vidět z kódu, se nekomentuje.
- Uživatelské texty (UI, chybové hlášky vracené do UI) česky, logy anglicky.
- Bez `else` — guard clause a early return.
- Formátování prettier (`.prettierrc.json`, bez pluginů), kontroluje to CI.

## JIRA — na co si dát pozor

Instance je **Jira Server / Data Center 8.13**, tedy REST **v2**, wiki markup (ne ADF), HTTP Basic.
PAT tokeny přišly až v 8.14, takže heslo je jediná možnost. Konfigurace jen přes env
`JIRA_URL` / `JIRA_USERNAME` / `JIRA_PASSWORD` — v repu nesmí být konkrétní instance ani heslo.

- **401/403 se nikdy neopakuje.** Heslo je doménové, opakované pokusy zamykají účet. Po odmítnutí se
  do `SyncState.jira.authFailed` uloží příznak a plánovaná synchronizace se přeskakuje, dokud
  nepřijde ruční sync (`POST /api/sync/jira`). Viz `services/jira/client.ts` a `jobs/scheduler.ts`.
- **Heslo se redaktuje** ze všech chybových hlášek (`redact()`), protože chyby končí v UI.
- **`issue.key` není stabilní** — mění se při přesunu tasku mezi projekty. Upsert klíč je proto
  `jiraId`. `Assignment` navíc drží `issueKeySnapshot`, aby plán nikdy neztratil popisek.
- **Sprint (`customfield_10004`) přijde jako serializovaný java `toString`.** Nikdy ho nesplituj
  po čárkách — názvy sprintů obsahují `/`, `()` i čárky. Bere se z něj jen `[id=(\d+)` a zbytek se
  dotáhne z `/rest/agile/1.0/sprint/{id}` (čistý JSON) a cachuje do tabulky `Sprint`.
  Aktivní sprint se mění každý týden, proto se stav nikde nefixuje a cache pro ne-CLOSED sprinty
  expiruje po hodině.
- Další custom fieldy: `customfield_10009` = Rank (řazení backlogu), `customfield_10002` = Story Points.
- Odhady: `timetracking.originalEstimateSeconds` / `remainingEstimateSeconds`. **Zbývající odhad 0
  neznamená „nula práce"**, ale „všechno je odpracované" — proto se všude používá
  `remaining || original || fallback`, ne `??`.
- Synchronizace má tři vlny (`services/jira/sync.ts`):
  - `syncHot` — aktivní sprint + změněné za posledních 7 dní, každých 5 minut,
  - `syncPlanned` — tasky, které mají assignment, dotahované **podle klíčů**; jen tak se pozná,
    že se task dokončil nebo přeřadil na někoho jiného,
  - `syncFull` — celý pracovní set podle uživatelského JQL, každých 6 hodin. **Jen tato vlna smí
    označovat issues jako `isOrphaned`** — kdyby to dělala `syncHot`, označí 100 tasků za osiřelé.
- Panel v UI čte vždy jen lokální cache, nikdy JIRA přímo.
- Default JQL: `assignee = "{user}" AND statusCategory != Done ORDER BY Rank ASC` (`{user}` i
  `currentUser()` se nahrazují uživatelovým JIRA jménem — kvůli budoucímu plánování pro víc lidí).

## Kalendář / režie

- Parser je `services/calendar/ics.ts` nad **ical.js**. Řeší VTIMEZONE, RRULE, EXDATE i přesunuté
  instance přes `RECURRENCE-ID`. Expanze je vždy omezená oknem (−21 / +90 dní) a tvrdým stropem
  výskytů — feed může obsahovat nekonečné RRULE.
- Zda se událost počítá do režie, se rozhoduje **při importu** (`countsToCapacity`):
  `X-MICROSOFT-CDO-BUSYSTATUS` má přednost před `TRANSP` (Outlook ho plní spolehlivěji),
  `STATUS:CANCELLED` se ignoruje, celodenní BUSY/OOF sráží kapacitu dne na nulu.
- Outlook publikuje ICS se zpožděním klidně hodin — proto stáří feedu v UI a ruční bloky režie
  (`CalendarEvent.manual = true`, `sourceId = null`).
- Změna URL zdroje maže `contentHash`, jinak by se nový feed vyhodnotil jako „beze změny".

## Datumy a kapacita

- Dny se všude nosí jako `YYYY-MM-DD` string, v DB jako `@db.Date`. **Nikdy neposílej JS `Date`.**
  `dbDateToKey()` čte přes UTC (Prisma vrací UTC půlnoc), `localDateKey()` přes lokální čas.
- Hranice dne = `new Date(y, m, d + 1)`, **nikdy `+24 h`** — Europe/Prague má 23h a 25h den.
  Testy jsou napevno na `2026-03-29` a `2026-10-25`.
- Výpočet (`services/week.ts`):
  ```
  capacity  = override ?? (svátek ? 0 : pracovní den ? denní kapacita : 0)   // celodenní OOF → 0
  režie     = min(capacity, součet SLOUČENÝCH busy intervalů oříznutých na den)
  available = capacity − režie
  free      = max(0, available − plán);  overbooked = max(0, plán − available)
  ```
  Intervaly se **slučují** (`mergeIntervals`), aby dvě překrývající se schůzky nesnížily kapacitu dvakrát.
- Každá mutace plánu vrací **přepočítaný celý týden** a frontend jím přepíše cache
  (`hooks/planner.tsx`). Díky tomu neexistuje rozjezd optimistického a serverového stavu a korektně
  se zobrazí i serverový merge.

## Multi-user

Všechno plánovatelné (`Assignment`, `CalendarSource`, `CalendarEvent`, `DayOverride`) visí na
`userId`. UI zatím ukazuje jednoho uživatele, ale rozšíření je jen práce na UI — datová vrstva už
je připravená. Uživatel se rozlišuje v `routes/context.ts` (`currentUser`), volitelně hlavičkou
`x-user-id`; přidání přepínače nebo přihlášení se dotkne jen téhle funkce.

`User.jiraKey` je primární identita (nemění se při přejmenování účtu), `jiraUsername` je to,
co jde do JQL.

## Práce s projektem

```bash
make up            # build + start, http://weekplan.localhost:8090
make logs-api
make sync          # ruční synchronizace JIRA i kalendáře
docker compose exec api npx vitest run          # testy
docker compose exec api npx prisma migrate dev --name <nazev>   # změna schématu
```

Migrace se v běžícím stacku aplikují přes `prisma migrate deploy` (v `command` služby `api`),
novou migraci vytvoř `migrate dev`. `node_modules` se z hostu **nemountují** — jinak by se rozbil
Prisma engine (darwin vs linux).

## Testy

`backend/src/**/*.test.ts` (vitest, `TZ=Europe/Prague` je vynucené v `vitest.config.ts`):
datumy včetně přechodů na letní/zimní čas, slučování intervalů, svátky, parsování sprintu
a expanze ICS. Testy nejdou na síť ani do DB.

## CI

`.github/workflows/ci.yml`: typecheck + testy backendu, build frontendu, prettier, docker build
a kontrola, že se do repa nedostane `.env`, heslo ani konkrétní JIRA hostname.

## Vědomě mimo rozsah

Zápis do JIRA, Tempo worklogy, Microsoft Graph (jen připravený `CalendarSource.kind = MS_GRAPH`),
přepínač uživatelů a týmový pohled v UI, autentizace aplikace, mobilní layout.
