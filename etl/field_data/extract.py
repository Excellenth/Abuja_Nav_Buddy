"""
EXTRACT: read a field-survey CSV (see data/field_data_template.csv) into
plain row dicts. No DB access here -- see etl/field_data/load.py.

FIELD WORKFLOW (this is the actual "how do we get data" answer for
informal transit, which OSM cannot give you for free):
1. Physically ride each leg of the pilot corridor. Do this at more than
   one time of day/week (morning rush, midday, evening, rainy day if you
   can) -- fares and travel times genuinely vary, and that variance is
   something the product should represent honestly (a fare RANGE), not
   average away.
2. At each boarding point and alighting point, get precise coordinates:
   in Google Maps, long-press the exact spot -> the lat,lng shown at the
   bottom is what you want. Do this at the actual spot, not a nearby
   landmark.
3. Copy data/field_data_template.csv and add one row per leg you rode.
"""

import csv


def read_csv(path: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))
