# kadkerja

**Job cards for a small car workshop: check-in, quote, approval, repair, collection.**

*Kad kerja* is Malay for "job card". Many small workshops still run on handwritten job cards and WhatsApp:
the front desk writes down the complaint, the mechanic finds the problem, someone phones the customer with a
price, and nobody is quite sure which car is waiting for what. kadkerja is a web system for that workshop.

Status: **work in progress** (increment 1 of 6: the backend API). Plan in [Roadmap](#roadmap).

## What it does (so far)

- **Check-in**: customer, car and complaint in one request. Plates are normalised however they are typed
  (`pkr1234`, `PKR  1234` -> `PKR 1234`), a known plate reuses the car, a different phone number means the car
  has a new owner (phone numbers compare by digits, so `012-345 6789` = `0123456789`), an old job card keeps
  the customer who brought the car that time, and a car can only have one open job card at a time.
- **Job card flow, enforced on the server**:

  ```
  RECEIVED -> INSPECTING -> QUOTED -> APPROVED -> IN_PROGRESS -> READY -> COLLECTED
                  ^            |
                  +- redo -----+-> DECLINED -> READY (car returned unrepaired)
  CANCELLED from RECEIVED, INSPECTING or QUOTED
  ```

  Every other move is refused with a message that says why. Each move is kept with its time and an optional note
  (the timeline). The API returns the moves allowed next, so a UI never has to repeat the rules.
- **Quotes**: labour and part lines in whole sen (no floating point), quantity x unit price, SST on taxable lines
  (rate is a setting, 8% by default; illustrative, not tax advice), rounded half up per line. The quote can only
  be changed before it is sent; sending it again after a redo bumps the quote version (so an approval of an old
  quote can be refused in increment 3). A quote cannot be sent with no lines.
- **Errors** are RFC 9457 `application/problem+json`: `409` for a rule (with the reason), `404`, and `400` with
  a message per field. Concurrent edits are caught with optimistic locking.
- Each job card gets an unguessable token for the customer's progress link (increment 3). It is never returned
  by the staff API.

## API

| Method | Path | What |
| --- | --- | --- |
| `GET` | `/api/jobs?status=QUOTED` | Job board rows, newest first (optional status filter) |
| `POST` | `/api/jobs` | Check in a car (creates the job card) |
| `GET` | `/api/jobs/{id}` | Job card with vehicle, customer, quote lines, totals, timeline, next moves |
| `POST` | `/api/jobs/{id}/lines` | Add a quote line `{kind: LABOUR/PART, description, quantity, unitPriceSen, taxable}` |
| `DELETE` | `/api/jobs/{id}/lines/{lineId}` | Remove a quote line |
| `POST` | `/api/jobs/{id}/moves` | Move the job `{to, note?}` |

```bash
curl -s localhost:8080/api/jobs/1
# {"id":1,"number":"KK-2026-0001","status":"QUOTED","next":["INSPECTING","APPROVED","DECLINED","CANCELLED"],
#  "vehicle":{"plate":"PKR 1234","make":"Perodua","model":"Myvi",...},"subtotalSen":30300,"taxSen":2424,
#  "totalSen":32724,"sstRatePercent":8,"events":[...]}
```

## Run it

Needs Java 21. No database setup for trying it: it uses in-memory H2 (PostgreSQL mode) by default.

```bash
cd backend
./mvnw spring-boot:run -Dspring-boot.run.profiles=demo   # with made-up demo jobs
./mvnw verify                                             # tests
```

With PostgreSQL: create a database and run with the `postgres` profile (`DB_URL`, `DB_USER`, `DB_PASSWORD`;
defaults `jdbc:postgresql://localhost:5432/kadkerja`, `kadkerja`/`kadkerja` for local use only). Flyway creates
the schema.

## How it is built

- Java 21, Spring Boot 4.2 (Spring MVC, Data JPA, Bean Validation, Flyway), PostgreSQL 17 / H2.
- The rules live in the domain (`JobStatus`, `JobCard`): every change goes through methods that check them, so
  no caller can skip a step. Views are built inside the service transaction (`open-in-view` is off).
- Tests (22): every one of the 81 status pairs is checked against an independent table, every status is
  reachable and none is a dead end; 2,000 random quotes add up exactly (lines, tax, total) and per-line tax is
  never more than half a sen off; the whole flow through the HTTP API with MockMvc; refused moves and edits
  change nothing; field-by-field validation; plate reuse, owner changes and the one-open-job rule; the token never leaks; demo
  data seeds once.
- GitHub Actions runs the tests twice on every push and pull request: on H2 and on a real PostgreSQL 17 service
  (Flyway migration + API tests).

## Roadmap

1. ✅ Backend: job cards, status flow, quotes with SST, REST API, validation, tests on H2 and PostgreSQL, CI.
2. React + TypeScript frontend: job board by status, check-in form, job card page with quote editor.
3. Customer progress link (no login): timeline, quote, approve/decline with a stale-quote guard, WhatsApp text.
4. Staff login (Spring Security; advisor and technician roles), technician assignment, "my jobs".
5. Before/after photos, parts stock deducted on approval.
6. Bahasa Melayu and 简体中文, accessibility pass, Docker Compose, Playwright end-to-end tests, demo GIF.

## Privacy

All names, phone numbers and plates in the demo data and tests are made up.

## License

MIT
