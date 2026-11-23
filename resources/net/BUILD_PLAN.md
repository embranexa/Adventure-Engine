# Net zone build plan

Expanding the Net zone (the harvesters' side of the signal chain): two Instagram harvesters,
the Enricher and the Sieve. Ideas from `upgrades.md` in this folder.

## 0. Status and resume guide

| Phase | What | Status |
|---|---|---|
| N0 | Placeholders on the signal chain | **done** (locked: `ig-collection`, `ig-profiles`, Enricher, Sieve) |
| N1 | Event extractor (reads captions and flyers) | not started (needs a Claude API key, see §8) |
| N2 | `ig-collection` harvester (Telegram inbox) | not started (needs a Telegram bot, see §8) |
| N3 | Enricher (fills in missing fields; absorbs the geocoder) | not started |
| N4 | `ig-profiles` harvester (watched accounts) | not started (needs the Meta setup, see §8) |
| N5 | Sieve (autonomous filter) | not started |
| N6 | Cross-source duplicates | not started |

Order: N1 → N2 first (useful at once, no Meta setup), N3 next (helps every source),
then N4 once the Meta app is ready, then N5 and N6.

Already in place, for reference:
- 19hz harvester ([backend/crawlers/nineteenhz.py](../../backend/crawlers/nineteenhz.py)), registered in [backend/crawlers/\_\_init\_\_.py](../../backend/crawlers/__init__.py).
- Geocoder ([backend/services/geocode.py](../../backend/services/geocode.py)): address → venue → city, cached in the `geocache` table, background runs at startup and after each harvest.
- Cover cache ([backend/services/covers.py](../../backend/services/covers.py)): images kept in `data/covers/`.
- Signal chain placeholders: `KNOWN_HARVESTERS`, `ENRICHER`, `SIEVE` in [frontend/js/lib/twinTopology.js](../../frontend/js/lib/twinTopology.js); positions in `twin/twinScene.js`; bodies in `twin/machines.js`. A harvester unlocks by itself once a crawler with its name is registered; the Enricher and Sieve unlock by setting `locked: false` (with an `action` to open their panel).

## 1. The shared problem: the event is in the flyer

19hz gives a table; Instagram gives a flyer image and a loose caption. Both Instagram
harvesters (and anything you send by hand) need the same step: turn caption text and/or an
image into event fields, or decide it isn't an event. This is the "LLM parser" rung of the
fallback ladder in `upgrades.md`, and here it earns its place.

## 2. N1: Event extractor

`backend/services/extract.py`: `extract(text, image_bytes | None) -> ExtractResult`

- Result: `is_event`, and if so the `EventIn` fields it can find (title, start, end, venue,
  address, city, price text, tags, hosts), plus `confidence` and `missing` (fields it
  couldn't find).
- A Claude model that reads images, asked for structured output (a JSON schema matching
  `EventIn`). Pick the model and check pricing when building.
- Cheap first: caption only. The image is sent only when the caption lacks a date or venue.
- Dates: a post rarely states the year; resolve relative to the post's timestamp (next
  occurrence), in `America/Los_Angeles`.
- The flyer becomes the event's cover: saved at once through the cover cache, because
  Instagram's image links expire.
- Test set: 20–30 real posts and screenshots with the expected fields, kept in
  `backend/tests/extract_cases/`, checked whenever the prompt changes.

## 3. N2: `ig-collection` harvester (Telegram inbox)

You find an event, share it to a Telegram bot, and it becomes an event in this harvester.

Why Telegram over Raindrop: the Instagram app's share sheet sends straight to the bot; it
takes links, screenshots and forwarded text; the bot can reply; no public server is needed
(the backend polls Telegram for new messages); and it doesn't need your Instagram login
(the `py-ig2raindrop` route automates your account).

Flow:
1. A background listener (Telegram long polling, `getUpdates`) stores each message in a new
   `inbox` table: chat, message id, kind (link / photo / text), payload, status
   (`pending` / `done` / `needs_info` / `failed`), the event it made.
   Only messages from your own chat id are accepted.
2. Processing, per message:
   - Instagram link: fetch the post's public page for caption and image. If Instagram
     blocks it, the bot asks for a screenshot.
   - Another event link (RA, DICE, ...): handed to the Enricher's resolvers (N3).
   - Photo or text: straight to the extractor.
3. The result is an event (`source = "ig-collection"`, `api_id` = the post URL or the
   message id) in the harvester vessel; it flows on through the Centrifuge as usual.
4. The bot replies: "✦ Harvested: *title* · Sat 9pm · *venue*", or "couldn't find a
   date: reply with it" (a reply to that message fills the field and retries).

Signal chain: the `ig-collection` harvester unlocks when its crawler module is registered.
Its Harvest button = process anything pending now (the listener normally does it at once).

## 4. N3: Enricher

Fills in what harvested events lack, for any source, retroactively. Runs in the background
after each harvest and at startup, and from an "Enrich" button on its panel. Harvests stay
fast: they never wait on it.

- Incomplete = missing cover, end time, exact location (none, or only a city centre), or
  description.
- Resolvers, by the ticket link's site:
  - general: schema.org event data in the page (any Event subtype), falling back to the
    page's title/image tags (worked for DICE, Eventbrite, LEAP, Eventim, Eventsta);
  - RA: its GraphQL endpoint (unofficial; can batch about 20 events per request);
  - Ticketmaster: Discovery API (later, needs a key, §8);
  - skipped (they block automated requests): TicketWeb, Tixr, AXS, Shotgun, Facebook.
- Then geocodes any new venue (the geocoder becomes part of the Enricher).
- Merge rules: the ticket page wins on cover, exact times, venue and coordinates; the
  source (19hz) keeps tags and organizers; hand-set adventure values always win.
  Provenance in `details.enriched_from`.
- Each attempt recorded (`details.enrich = {at, missing}`); failures retried after a few
  days, not every run. A geocoder miss gets retried too (today it never is).
- Pace: a few requests at once, about a second between requests to the same site. First
  full pass ~1.5–2 min; later runs only new events, seconds.
- Panel: per-field coverage (cover %, exact location %, end time %), the queue, last run.
- Signal chain: the machine works (light, motion) while running; no pipes (events don't
  pass through it; their review state never changes).

## 5. N4: `ig-profiles` harvester (watched accounts)

Combs the accounts you watch for recent posts that announce events.

- Access: Instagram's official Business Discovery API (through your own professional
  account; reads other Business/Creator accounts: captions, image links, permalinks,
  timestamps). Not personal or age-gated accounts. Not scraping (fragile, against
  Instagram's terms, risks your account).
- The watch list lives in the Codex: organizations and contacts get an `instagram` handle
  and a "watch" toggle. Adventures already link to organizations.
- Suggestions: 19hz's "Other links" already hold organizers' Instagram pages; offer those
  as accounts to watch.
- Each run: posts newer than the last one seen per account (post ids remembered); the
  extractor decides "upcoming event?" first and drops the rest cheaply. About one API call
  per account per run, far under the rate limits.

## 6. N5: Sieve (autonomous filter)

A tunable chain of rules that triages harvested events before you do, between the
harvesters and the Centrifuge.

- Rules use the existing facets and ranges (source, tag, place, price, date, ring...):
  "drop if region not Greater Los Angeles", "keep if tag is techno", "drop if price > $60".
  Saved filter sets from the Nexus could become rules.
- Each rule's action: pass to the Centrifuge, send to the Sump, or leave in the harvester.
- Runs on every harvest (and on demand); every move is logged, so the twin animates it and
  undo covers it.
- Panel: the ordered rule list, each with how many events it caught last run.
- Open question: does Feed go through the Sieve, or replace it? (Suggest: Feed goes
  through it; a "Feed all" bypasses it.)

## 7. N6: Cross-source duplicates

The same night can arrive from 19hz, Luma and Instagram. Match on start time (± 2 h) +
venue or coordinates (within ~100 m) + title similarity; keep one event, link the others,
merge their fields by the Enricher's rules. Fits inside the Enricher.

Smaller items:
- 19hz's weekly table ("Tuesdays 9pm–2am"): turn into weekly events (adventures already
  support weekly repeats).

## 8. Your actions

What only you can do, by phase. Secrets go in a `.env` file at the project root
(already in `.gitignore`; never commit it).

### Before N1: Claude API key
1. Create an API key in the Anthropic Console (console.anthropic.com → API keys).
2. Add a little credit, and set a spending limit you're comfortable with.
3. Put it in `.env` as `ANTHROPIC_API_KEY=...`.

### Before N2: Telegram bot
1. In Telegram, message **@BotFather** → `/newbot` → pick a name and a username.
2. Copy the token it gives you into `.env` as `TELEGRAM_BOT_TOKEN=...`.
3. Send your new bot any message (so it can find your chat id; the build will read and
   save it, and accept messages from that chat only).
4. On your phone, pin the bot in Instagram's share sheet for one-tap sending.

### Before N4: Meta / Instagram setup
1. Switch your Instagram account to a professional account (Creator is free:
   Settings → Account type and tools).
2. Link it to a Facebook Page (create a Page if you don't have one).
3. Create an app at developers.facebook.com, add Instagram (the "Instagram API with
   Facebook Login" product), and request the permissions the Business Discovery docs list.
4. Generate a long-lived access token and find your Instagram professional account's id;
   put them in `.env` as `IG_ACCESS_TOKEN=...` and `IG_USER_ID=...`.
5. List the accounts you want watched (handles), or mark them in the Codex once N4 adds
   the field.

### Optional: Ticketmaster (N3)
1. Get a free key at developer.ticketmaster.com; put it in `.env` as
   `TICKETMASTER_API_KEY=...`.

### Decisions
- [ ] Machine names: `ig-collection`, `ig-profiles`, Enricher, Sieve: keep or rename?
- [ ] Sieve and Feed (§6): does Feed go through the Sieve?
- [ ] Monthly budget for the extractor (sets how often images, not just captions, get read).
