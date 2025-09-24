# e621_exporter

Prometheus exporter for [e621](https://e621.net) OwO posts and tags, designed to feed **Gwafana** dashbowards with mewtics wike post counts, scowes, and popular tags~

Buiwt with TypeScwipt and Node.js, furry configuwabwe via enviwonment vawiabwes UwU~

Docker image avaiwable: [yokarion/e621_exporter](https://hub.docker.com/r/yokarion/e621_exporter)

---

## Features

- Scrapes the most popular tags on e621.
- Monitors specific artists and exposes:
  - Total posts per artist (`e621_posts_by_artist_total`)
  - Score per post for each artist (`e621_artist_posts_score`)
  - Favorite count per post for each artist (`e621_artist_posts_fav`)
  - Score and favorite count of the latest post per artist (`e621_latest_post_score`, `e621_latest_post_fav`)
- Configurable scrape intervals, page limits, and user agent.
- Containerized in Docker.

---

## Environment Variables

Create a `.env` file in your project root:

```dotenv
PORT=8000
ITEMS_PER_PAGE=10
PAGES_TO_SCAN=3
SCRAPE_INTERVAL_SECONDS=60
SCRAPE_USER_AGENT=prometheus-e621-exporter/1.0
MONITORED_ARTISTS=heresone_(artist),anotherone_(artist),this_one_without_artist
```

---

## Usage

### Docker

#### Run latest Docker image

```bash
docker run --env-file .env -p 8000:8000 yokarion/e621_exporter:latest
```

#### Docker Compose example

```yaml
version: "3.9"

services:
  e621_exporter:
    image: yokarion/e621_exporter:latest
    container_name: e621_exporter
    ports:
      - "8000:8000"
    env_file:
      - .env
```

- Exposes metrics on port 8000.
- Environment variables are passed via `.env`.

---

## Develop

### Local (Node.js)

```bash
yarn install
yarn dev
```

Metrics are available at `http://localhost:8000/metrics` for Prometheus to scrape.

## Grafana Integration

This exporter exposes Prometheus metrics that can be visualized in Grafana.

### 1. Add Prometheus as a Datasource

- In Grafana, go to **Connections → Data Sources → Add data source**.
- Select **Prometheus**.
- Set the URL to your Prometheus endpoint (e.g. `http://localhost:9090`).
- Save & Test.

### 2. Example Metrics

These metrics are exported:

- `e621_post_count_tags{tag="..."}`
  - Total number of posts tagged with a specific tag.

- `e621_posts_by_artist_total{artist="..."}`
  - Total number of posts made by a specific artist.

- `e621_artist_posts_score{artist="...", post_id="..."}`
  - Score of an individual post by an artist.

- `e621_latest_post_score{artist="...", post_id="..."}`
  - Score of the most recent post by an artist.

- `e621_artist_posts_fav{artist="...", post_id="..."}`
  - Favorite count of an individual post by an artist.

- `e621_latest_post_fav{artist="...", post_id="..."}`
  - Favorite count of the most recent post by an artist.

(See implementation in `src/exporter.service.ts`)
