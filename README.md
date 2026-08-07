<div align="center">

# Letterboxd Graph

**Turn your Letterboxd diary into a contribution graph and shareable cards.**<br>
Runs as a GitHub Action, commits the finished SVGs back to your repository.

[![Workflow](https://img.shields.io/github/actions/workflow/status/nichtlegacy/letterboxd-graph/update-graph.yml?label=action&style=flat-square)](https://github.com/nichtlegacy/letterboxd-graph/actions)
[![Release](https://img.shields.io/github/release/nichtlegacy/letterboxd-graph.svg?style=flat-square)](https://github.com/nichtlegacy/letterboxd-graph/releases)
[![Node](https://img.shields.io/badge/node-%E2%89%A520.9-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Reusable Action](https://img.shields.io/badge/GitHub_Action-reusable-2088FF?style=flat-square&logo=githubactions&logoColor=white)](#quick-start)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

[Quick Start](#quick-start) • [What It Generates](#what-it-generates) • [Configuration](#configuration) • [CLI](#cli) • [How It Works](#how-it-works) • [Pages Site](#pages-site) • [License](#license)

<a href="https://letterboxd.com/nichtlegacy/">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nichtlegacy/letterboxd-graph/main/images/github-letterboxd-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/nichtlegacy/letterboxd-graph/main/images/github-letterboxd-light.svg">
    <img alt="Letterboxd contribution graph" src="https://raw.githubusercontent.com/nichtlegacy/letterboxd-graph/main/images/github-letterboxd-light.svg" width="100%">
  </picture>
</a>

</div>

## Overview

Letterboxd Graph reads a public Letterboxd diary and renders it as SVG: a
GitHub-style activity calendar, a review card per year and per month, and a card
for the profile itself. It also writes a JSON export so you can build your own
widgets from the same figures.

It is meant to be embedded — in a GitHub profile README, a blog post, or a
social preview. Everything is a self-contained SVG with the fonts subset and
inlined, so there is nothing to host and nothing to load at view time.

It needs no Letterboxd account, API key, or server. It reads public profile
pages only, and cannot see anything your profile does not show a logged-out
visitor.

## Quick Start

Add one workflow file to any repository. No fork, no copied scripts.

```yaml
# .github/workflows/letterboxd.yml
name: Update Letterboxd Graph

on:
  schedule:
    - cron: "0 0 * * *"   # daily at midnight UTC
  workflow_dispatch:

permissions:
  contents: write

jobs:
  update-graph:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: nichtlegacy/letterboxd-graph@v2
        with:
          username: YOUR_LETTERBOXD_USERNAME
          years: "2026,2025"        # optional, defaults to the current year
```

Run it once from the **Actions** tab. A healthy first run logs the diary pages
it fetched, then commits into `images/`:

```
Found 599 film entries, 456 in 2026, 2025
   Posters: 10/10, favourites 4/4
   ✓ images/github-letterboxd-dark.svg
   ✓ images/letterboxd-review-2026-dark.svg
   ✓ images/letterboxd-review-current-month-dark.svg
   ✓ images/letterboxd-profile-dark.svg
```

`actions/checkout` is required so the action has a repository to write into. To
handle the files yourself instead of committing them, set `commit: 'false'`.

## What It Generates

Every run writes the same set of files into `images/`, each in a dark and a
light variant. Use `<picture>` so GitHub serves the one matching the reader's
theme — see [Embedding](#embedding).

### Contribution Graph

`github-letterboxd-{dark,light}.svg` — the activity calendar, one block of weeks
per requested year.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/github-letterboxd-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="images/github-letterboxd-light.svg">
    <img alt="Letterboxd contribution graph" src="images/github-letterboxd-light.svg" width="100%">
  </picture>
</p>

Hovering reveals more than the graph shows at rest:

| Hover target | Reveals |
|--------------|---------|
| Year label | Films grouped by release decade |
| Film count | Rating distribution, average rating, rewatch and like totals |
| Days Active | Weekday distribution |
| Day Streak | Date range, film count, and the streak highlighted in the grid |
| Any day cell | The films watched, `↻` for rewatches and `♥` for likes |

<table>
  <tr>
    <th>Day Streak Highlight</th>
    <th>Days Active Tooltip</th>
    <th>Film Count Tooltip</th>
  </tr>
  <tr>
    <td><img src=".github/assets/hover-streak.png" width="250"></td>
    <td><img src=".github/assets/hover-days-active.png" width="250"></td>
    <td><img src=".github/assets/hover-films.png" width="250"></td>
  </tr>
</table>

> [!NOTE]
> GitHub embeds SVGs through an `<img>` tag, which receives no mouse events, and
> serves raw files with a `sandbox` CSP, so hover states and links are dead in a
> README. They work on the [Pages site](#pages-site), which embeds each card as
> an `<object>`. The cell reveal animation is declarative CSS and *does* play
> inside a README.

### Year in Review

`letterboxd-review-<year>-{dark,light}.svg` — one card per year in `years`.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/letterboxd-review-2026-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="images/letterboxd-review-2026-light.svg">
    <img alt="Letterboxd year in review card" src="images/letterboxd-review-2026-light.svg" width="100%">
  </picture>
</p>

1200×630, the Open Graph default, so it works as a social preview as it stands.
Headline figures on the left, top rated films on the right with poster art,
runtime and the Letterboxd community rating.

What the list ranks is a choice, because "the best I saw in 2026" and "the best
of 2026" are different claims:

| `top-films` | The list holds |
|-------------|----------------|
| `watched` (default) | Everything watched that year, whatever year it came out |
| `released` | Only the films released that year |

It applies to year cards only. A month is far too small a window to also demand
the film came out that year — one month of new releases is a handful of titles
at best and often none, so a month card always ranks everything watched.

The card above is set to `released`, which is why it carries a **TOP 2026
RELEASES** heading. The default needs no heading — everything watched is not a
restriction, so there is nothing to announce. The heading takes its space out of
the rows rather than off the bottom, so both columns end on the same line either
way.

<details>
<summary><b><code>top-films: watched</code></b> — the default, for comparison</summary>

<p align="center">
  <img alt="Year in review card ranking everything watched" src=".github/assets/year-card-watched-dark.png" width="100%">
</p>

Same year, same diary. A five star film from 1977 outranks everything released
that year, which is true but says nothing about the year itself.

</details>

### Month in Review

`letterboxd-review-current-month-{dark,light}.svg` and
`letterboxd-review-previous-month-{dark,light}.svg`.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/letterboxd-review-previous-month-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="images/letterboxd-review-previous-month-light.svg">
    <img alt="Letterboxd month in review card" src="images/letterboxd-review-previous-month-light.svg" width="100%">
  </picture>
</p>

The same card narrowed to a single month. A month with nothing logged says so
rather than rendering an empty list.

Its film list always ranks everything watched that month, whatever
[`top-films`](#year-in-review) is set to.

The files are named by how recent the month is, not by its date, so an embed
keeps working when the month turns over and old cards do not pile up.

### Profile Card

`letterboxd-profile-{dark,light}.svg` — not tied to a year.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/letterboxd-profile-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="images/letterboxd-profile-light.svg">
    <img alt="Letterboxd profile card" src="images/letterboxd-profile-light.svg" width="100%">
  </picture>
</p>

The headline is your all-time films watched, taken from the profile page. The
right column shows the favourites pinned on your Letterboxd profile. What the
figures below it cover depends on [Diary Scope](#diary-scope).

### Member Badges

Pro and Patron members get their badge over the avatar, on the graph and on both
cards.

| Status | Badge color | Placement |
|--------|-------------|-----------|
| **Patron** | Cyan `#40bcf4` | Bottom-left of the profile picture |
| **Pro** | Orange `#ff8000` | Bottom-left of the profile picture |

<details>
<summary><b>Patron example</b> — <a href="https://letterboxd.com/BeHaind/">@BeHaind</a></summary>

<p align="center">
  <img alt="Profile card for a Patron member" src=".github/assets/profile-card-patron-dark.svg" width="100%">
</p>
<p align="center">
  <img alt="Contribution graph for a Patron member" src=".github/assets/graph-patron-dark.svg" width="100%">
</p>

</details>

<details>
<summary><b>Pro example</b> — <a href="https://letterboxd.com/Rufus_Firefly/">@Rufus_Firefly</a></summary>

<p align="center">
  <img alt="Profile card for a Pro member" src=".github/assets/profile-card-pro-dark.svg" width="100%">
</p>
<p align="center">
  <img alt="Contribution graph for a Pro member" src=".github/assets/graph-pro-dark.svg" width="100%">
</p>

</details>

### JSON Export

`letterboxd-data.json` — every figure the cards use, for building your own
widgets. See [JSON Export](#json-export-1) below.

## Configuration

All options are action inputs. Only `username` is required.

| Input | Description | Default |
|-------|-------------|---------|
| `username` | Letterboxd username (**required**) | – |
| `years` | Comma-separated years, e.g. `2026,2025` | current year |
| `scope` | Diary scope: `all` or `years` | `all` |
| `month-cards` | Recent months to also make cards for, `0` to skip | `2` |
| `top-films` | Year card film list: `watched` or `released` | `watched` |
| `mode` | Cell coloring: `count` or `rating` | `count` |
| `week-start` | `sunday` or `monday` | `sunday` |
| `gradient` | Gradient text: `true`, `false`, `name` or `year` | `true` |
| `animate` | Cell reveal animation | `true` |
| `export-png` | Also write PNG files | `false` |
| `output` | Output path without extension | `images/github-letterboxd` |
| `commit` | Commit and push the generated files | `true` |
| `commit-message` | Commit message (branch and UTC timestamp appended) | `Update Letterboxd graph` |
| `node-version` | Node.js version | `20` |
| `install-browser-deps` | Install Puppeteer system libraries (Ubuntu runners) | `true` |

Outputs `svg-dark`, `svg-light` and `data-json` carry the paths written, for
chaining into an upload or deploy step.

<details>
<summary><b>Alternative: fork and run the CLI directly</b></summary>

To own the whole workflow instead, fork this repository and edit
`.github/workflows/update-graph.yml`. Its `env` block is the configuration:

```yaml
env:
  LETTERBOXD_USERNAME: "YOUR_USERNAME"
  YEARS: "2026,2025"                   # empty for the current year
  SCOPE: "all"                         # "all" (whole diary) or "years"
  MONTH_CARDS: "2"                     # recent months to card, 0 to skip
  TOP_FILMS: "watched"                 # "watched" or "released" film list
  WEEK_START: "sunday"                 # "sunday" or "monday"
  GRADIENT: "true"                     # "true", "false", "name" or "year"
  ANIMATE: "true"                      # "false" disables the reveal animation
  EXPORT_PNG: "false"                  # "true" also writes PNGs
```

This is the path this repository uses itself, except that it calls the action
through `uses: ./` so every scheduled run doubles as an end-to-end test of what
external consumers get.

</details>

## CLI

```bash
npm install
node src/cli.js <username> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `-y <years>` | Year(s), comma-separated, e.g. `2026,2025` | current year |
| `-s <scope>` | Diary scope: `all` or `years` | `all` |
| `-c <count>` | Recent months to also card, `0` to skip | `2` |
| `-r <scope>` | Year card film list: `watched` or `released` | `watched` |
| `-m <mode>` | Graph mode: `count` or `rating` | `count` |
| `-w <day>` | Week start: `sunday` or `monday` | `sunday` |
| `-g <targets>` | Gradient text: `true`, `false`, `name` or `year` | `true` |
| `-a <bool>` | Cell reveal animation | `true` |
| `-p` | Also export PNG files | off |
| `-o <path>` | Output path without extension | `images/github-letterboxd` |

```bash
# Two years
node src/cli.js nichtlegacy -y 2026,2025

# Only the requested year, no month cards
node src/cli.js nichtlegacy -y 2025 -s years -c 0

# Only that year's releases in the card list
node src/cli.js nichtlegacy -y 2025 -r released

# Rating mode, week starting Monday, plain text, with PNGs
node src/cli.js nichtlegacy -m rating -w monday -g false -p
```

## How It Works

### Diary Scope

By default the complete diary is fetched, so the profile card can report
all-time figures. Paginating it costs one request per 50 entries:

| Profile | Films watched | Diary entries | Requests |
|---------|---------------|---------------|----------|
| [@nichtlegacy](https://letterboxd.com/nichtlegacy/) | 626 | 599 | 12 |
| [@BeHaind](https://letterboxd.com/BeHaind/) | 3,653 | 1,254 | 26 |
| [@Rufus_Firefly](https://letterboxd.com/Rufus_Firefly/) | 5,848 | 3,783 | 76 |

The two counts differ because they measure different things:

- **Films watched** is the profile's own figure, linking to `/<user>/films/`. It
  counts every film marked watched, whether or not it was ever given a date.
- **Diary entries** are dated log entries. Only these carry a rating, a rewatch
  flag or a like, so everything on the cards below the headline comes from them.

@BeHaind has 3,653 films watched against 1,253 distinct films in the diary, so
roughly two thirds were ticked off without a diary entry. Only the diary drives
the request count, which is why a large library can still be cheap to fetch.

### Rewatches

A viewing counts as a rewatch if Letterboxd's flag is set **or** the same film
appears earlier in the diary. Neither signal alone is enough:

- The flag is set by hand, so a repeat logged without ticking it is missed. On
  [@nichtlegacy](https://letterboxd.com/nichtlegacy/) that is 30 of 83 rewatches.
- Repeats alone miss a film first seen before the diary begins, which has only
  one entry in it. On [@Rufus_Firefly](https://letterboxd.com/Rufus_Firefly/)
  that is 761 viewings — every rewatch they have.

Films are identified by the slug in their diary link, not by title. Titles are
not unique, and neither is title plus year: two different 2023 films are both
called *Leo*. @Rufus_Firefly has 55 titles that are actually different films, so
matching on the title alone would invent rewatches and merge unrelated films in
the [ranking](#film-ranking).

The graph and the year cards still only cover the years in `years`; the rest is
filtered out of the same fetch rather than requested again. Set `scope: years`
to fetch only those years — cheaper on a large diary, but it leaves the profile
card scoped to them and labelled with the range.

### Film Ranking

Films on the cards are ranked by rating first. Likes and rewatches only decide
the order *within* a rating:

```
score = rating + 0.30 if liked + 0.08 per extra viewing, capped at 0.16
```

The bonuses total less than a half-star step, so a film can never overtake one
rated higher. This matters more than it sounds: a typical year has a handful of
films at the top rating and a dozen tied one step below, so without it the last
slots would be filled in whatever order the diary returned. Repeat viewings of
one film merge into a single entry at its best rating.

### Graph Modes

**`count`** — intensity from how many films you watched that day, scaled to your
busiest day. The legend reads *Less* to *More*.

<p align="center">
  <img alt="Graph in count mode" src=".github/assets/mode-count-dark.png" width="100%">
</p>

**`rating`** — colour from the average rating of that day's films. The legend
reads *Low* to *High*, and a quiet day you loved outranks a busy one you did
not.

<p align="center">
  <img alt="Graph in rating mode" src=".github/assets/mode-rating-dark.png" width="100%">
</p>

| Average that day | Step |
|------------------|------|
| under 2.5★ | lowest |
| 2.5★ to 3★ | second |
| 3.5★ to 4★ | third |
| 4.5★ and up | highest |

The average covers the films you rated. An unrated film sharing the day does not
drag it down, and a day where you rated nothing sits on the lowest step — it has
no rating to show, but it is still visibly a day with films on it.

### JSON Export

`images/letterboxd-data.json` holds the same figures the cards use, so a Glance
`custom-api` widget needs no extra backend:

```
https://raw.githubusercontent.com/<github-user>/letterboxd-graph/main/images/letterboxd-data.json
```

<details>
<summary><b>Payload shape</b></summary>

```json
{
  "user": "nichtlegacy",
  "year": 2026,
  "stats": { "films": 123, "daysActive": 80, "streak": 7, "streakFilms": 11, "rewatches": 18, "liked": 19 },
  "cells": [
    {
      "date": "2026-02-16",
      "count": 2,
      "ratingAvg": 3.5,
      "films": [
        { "title": "Film A", "year": "2024", "rating": 3.5, "rewatch": false, "liked": true, "url": "https://letterboxd.com/..." }
      ],
      "url": "https://letterboxd.com/<user>/films/diary/for/2026/02/16/"
    }
  ],
  "recent": [
    { "date": "2026-02-16", "title": "Film A", "year": "2024", "rating": 3.5, "rewatch": false, "liked": true, "url": "https://letterboxd.com/..." }
  ],
  "allTime": {
    "scope": "all",
    "films": 626, "entries": 599, "distinctFilms": 517,
    "firstEntry": "2019-05-05", "lastEntry": "2026-07-30", "spanDays": 2644,
    "daysActive": 427, "rewatches": 83, "liked": 76, "rated": 540, "averageRating": 3.3,
    "perDay": 0.23, "perWeek": 1.6, "perMonth": 6.9,
    "streak": { "length": 34, "startDate": "2025-01-27", "endDate": "2025-03-01", "films": 47 },
    "busiestDay": { "date": "2025-04-16", "count": 5 },
    "longestGap": { "days": 61, "from": "2021-02-03", "to": "2021-04-05" },
    "perYear": [{ "year": 2025, "films": 381, "days": 263 }],
    "perWeekday": [65, 65, 55, 59, 62, 69, 81],
    "perMonthOfYear": [51, 44, 39, 47, 38, 30, 41, 33, 29, 36, 34, 37],
    "monthSeries": [{ "month": "2026-02", "count": 12 }],
    "ratings": [{ "rating": 3.5, "count": 125 }],
    "decades": [{ "decade": 2020, "label": "2020s", "count": 89 }],
    "mostRewatched": [{ "title": "Half Baked", "year": "1998", "url": "https://letterboxd.com/...", "views": 5 }],
    "milestones": [{ "n": 100, "date": "2025-03-08", "title": "Film B", "year": "2004", "rating": 3, "url": "https://letterboxd.com/..." }]
  }
}
```

`stats` and `cells` are scoped to the years in `years`, the same window the graph
draws. `allTime` covers everything the run fetched, which under the default
`scope: all` is the whole diary — `films` is the profile's own count, `entries`
the dated ones. It is aggregates only, so it stays a few kilobytes whatever the
diary weighs, and `scope` says which of the two it was built from.

</details>

## Embedding

Point at the raw file, not the `blob` URL — GitHub serves `blob` as HTML and the
image will not render.

```html
<a href="https://letterboxd.com/YOUR_LETTERBOXD_USERNAME/">
  <picture>
    <source media="(prefers-color-scheme: dark)"
            srcset="https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/letterboxd-graph/main/images/github-letterboxd-dark.svg">
    <source media="(prefers-color-scheme: light)"
            srcset="https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/letterboxd-graph/main/images/github-letterboxd-light.svg">
    <img alt="Letterboxd contribution graph"
         src="https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/letterboxd-graph/main/images/github-letterboxd-light.svg">
  </picture>
</a>
```

Swap the filename for `letterboxd-review-2026`, `letterboxd-review-current-month`
or `letterboxd-profile` to embed a card instead.

## Pages Site

A README has room for one card, maybe two, and a card has room for a headline
and ten films. The same files are also published as a page, which has neither
limit — the cards at full size, and the figures behind them read out at length.

<div align="center">

**[nichtlegacy.github.io/letterboxd-graph](https://nichtlegacy.github.io/letterboxd-graph/)**

<img alt="The generated cards on the Pages site" src=".github/assets/pages-dark.png" width="100%">

</div>

| Section | What is on it |
|---------|---------------|
| **The diary in numbers** | Films, days active and average rating, then distinct films, rewatches, likes, longest streak — and a bar per year |
| **When you watched** | A column per month, empty ones included; weekday distribution, weekly and monthly averages, busiest day, longest streak, longest quiet stretch |
| **How you rated** | The half-star histogram, empty steps kept, beside the average, the most given rating and how much is rated or liked at all |
| **What you reached for** | Films by release decade, and the five you went back to most |
| **Where it turned over** | The first entry, every hundredth after it, and the latest |
| **The cards** | Graph, a tab per year, a tab per month, profile — each with **Open SVG** and **Copy embed** |
| **Recent diary** | The last ten entries, out of the JSON export |

The figures cover whatever the run fetched — the whole diary under `scope: all`,
the graph years under `scope: years`, which the page says out loud rather than
passing narrow numbers off as all-time.

It is also the one place where the cards work as drawn: GitHub serves an SVG
through an `<img>` tag, which gets no mouse events, while the page embeds each
one as an `<object>`, so tooltips, links and the reveal animation all behave.
The rest follows from the same build — themes swap the file rather than filter
it, sections come and go with whatever the last run wrote, embeds load as they
scroll into view, and type is served from `fonts/`, so nothing is fetched from a
third party.

<details>
<summary><b>Publishing it for your own profile</b></summary>

Which route you take depends on which [Quick Start](#quick-start) you took.

**If you forked this repository**, everything is already in place. Set
`LETTERBOXD_USERNAME` in `.github/workflows/update-graph.yml`, then open
**Settings → Pages** and set **Source** to **GitHub Actions**. Run **Update
Letterboxd Graph + JSON Export** once from the **Actions** tab; the deploy
follows on its own, and the site lands at
`https://<github-user>.github.io/<repository>/`.

**If you added the action to a repository of your own**, copy four things
across:

| Copy | Why |
|------|-----|
| `site/` | the page: one HTML file, one stylesheet, one module |
| `scripts/build-site.mjs` | assembles `_site/` and writes the two files the page reads |
| `src/stats.js` | the aggregates behind the figures; the build imports it |
| `fonts/` | Inter as `.woff2`, plus its license |
| `.github/workflows/pages.yml` | builds and deploys on every generator run |

Then:

1. In `pages.yml`, set the `workflows:` list under `workflow_run` to the `name:`
   of your own generator workflow. GitHub matches it by name, not by filename,
   and a name that matches nothing simply never fires. Check `branches:` against
   your default branch while you are in there.
2. Your `package.json` needs `"type": "module"` — `build-site.mjs` imports
   `src/stats.js`, and without it Node reads that file as CommonJS and the build
   dies on the `export` keyword.
3. Leave `commit` at its default. The build reads `images/` out of the
   repository and fetches nothing, so the files have to be committed for it to
   have anything to publish.
4. **Settings → Pages → Source → GitHub Actions**, then run the generator once.

A private repository needs a paid plan for Pages; a public one does not.

To preview any of it locally, generate the images once and serve the build:

```bash
npm run build:site     # writes _site/
npm run serve:site     # builds, then serves it on :8080
```

The build only reads `images/`, so previewing costs no requests against
Letterboxd. Deploys can also be triggered by hand from the **Actions** tab,
which is how a branch gets published before it is merged.

</details>

## Requirements

Running through the action needs nothing on your side; the runner provides it
all. For local runs:

| Requirement | Why |
|-------------|-----|
| **Node.js ≥ 20.9** | Required by `sharp` v0.35, which rasterises the PNG exports |
| **Python 3 with `curl_cffi`** | The primary fetcher, and needed for the Python tests — `pip install curl_cffi` |
| **A public Letterboxd profile** | Only pages a logged-out visitor can see are read |

Without `curl_cffi` the fetcher falls back to Puppeteer, which is bundled but
markedly slower and more prone to being challenged.

## Development

<details>
<summary><b>Project structure</b></summary>

- [`src/cli.js`](src/cli.js) — argument parsing and the run order
- [`src/fetcher.js`](src/fetcher.js) — diary, profile and film page scraping
- [`src/fetch_with_curl_cffi.py`](src/fetch_with_curl_cffi.py) — primary fetcher, Puppeteer is the fallback
- [`src/generator.js`](src/generator.js) — contribution graph SVG
- [`src/cards.js`](src/cards.js) — review and profile card SVGs
- [`src/svg-utils.js`](src/svg-utils.js) — font subsetting, text measurement, theme colors
- [`src/stats.js`](src/stats.js) — streaks, distributions, JSON export
- [`src/exporter.js`](src/exporter.js) — PNG rasterisation and poster thumbnails
- [`site/`](site/) — the Pages front end: one page, one stylesheet, one module
- [`scripts/build-site.mjs`](scripts/build-site.mjs) — assembles `_site/`, writes the manifest the page reads
- [`action.yml`](action.yml) — the reusable action
- [`tests/`](tests/) — `node:test` for the JavaScript, `unittest` for the fetcher

</details>

```bash
npm test          # both suites
npm run test:js   # statistics, cards and layout
npm run test:py   # the curl_cffi fetcher
```

The layout tests read geometry out of the generated markup rather than asserting
on fixed coordinates, so padding and column changes do not break them
spuriously.

## Contributing

Issues and pull requests are welcome.

- **Bugs** — include the username, the flags or inputs used, and the run log.
  Scraping breaks when Letterboxd changes its markup, and the log usually points
  straight at the selector that stopped matching.
- **Features** — open an issue first if it changes the output. The cards are
  tightly laid out and most additions cost space somewhere else.
- **Pull requests** — run `npm test` first. New behaviour needs a test; layout
  changes should assert on measured geometry, not on coordinates.

## License

Released under the [MIT License](./LICENSE).

Not affiliated with, endorsed by, or connected to Letterboxd. It reads public
profile pages, so it depends on their markup and can break when that changes. Be
considerate with `scope: all` on a large diary — it is one request per 50 entries
against someone else's servers.
