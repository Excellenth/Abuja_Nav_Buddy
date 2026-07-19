# playground

Scratch space for exploring raw OSM data -- checking what's actually out
there before deciding whether/how it feeds `etl/`. Nothing here is
imported by `backend/` or `etl/`; it's disposable notebook code, not a
pipeline. If an exploration here turns into a real decision, the *logic*
gets ported into `etl/`, not this folder.

Own venv, on purpose -- same reasoning as `etl/README.md`: this doesn't need
to share a process or a deploy story with anything else.

## Setup

```
cd playground
python -m venv .venv
.venv\Scripts\activate      (Windows)   /   source .venv/bin/activate   (macOS/Linux)
pip install -r requirements.txt
copy .env.example .env      (Windows)   /   cp .env.example .env        (macOS/Linux)
jupyter lab
```

`.env` only needs `DATABASE_URL` if a notebook queries Postgres directly to
compare against what's already loaded -- it's the same local database
`backend/` and `etl/` use.

## What's here

- `notebooks/explore_osm.ipynb` -- pulls OSM transit-tagged points (same
  Overpass query as `etl/osm/extract.py`) for the FCT bbox, breaks them
  down by tag, and compares raw pull counts against what's actually been
  ingested into the live `transit` database.

Add more notebooks per question you're chasing (e.g. `explore_new_bbox.ipynb`
when scoping expansion beyond the current bbox) rather than growing one
notebook indefinitely.
