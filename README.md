# e621_exporter

Prometheus expowtew fow [e621](https://e621.net) OwO posts and tags, desiwned to feed **Gwafana** dashboawds wif metwics wike post counts, scowes, and popuwaw tags~

Buiwt wif TypeScwipt and Node.js, fuwwy configuwabwe via enviwonment vawiabwes UwU~

Dockew image avaiwabwe: [yokarion/e621_exporter](https://hub.docker.com/r/yokarion/e621_exporter)

---

## Features

- Scrapes most popular tags on e621.
- Monitors specific artists and exposes:
  - Total posts per artist
  - Score per post for each artist
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
MONITORED_ARTISTS=heresone_,anotherone_,this_one_without_artist
```

All envs are optional and have default values if not set.

---

## Usage

### Local (Node.js)

```bash
yarn install
yarn build
yarn start
```

Metrics are available at `http://localhost:8000/metrics` for Prometheus to scrape.

---

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

## Grafana Integration

1. Add Prometheus as a data source in Grafana.
2. Query metrics like:

- `e621_posts_total` -> post count per tag
- `e621_posts_by_artist_total` -> posts per artist
- `e621_post_score` -> score per post per artist

3. Build dashboards for visualizing popular tags, artist activity, and post scores.
