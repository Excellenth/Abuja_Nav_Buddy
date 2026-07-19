import os
import sys

# db/ is a sibling of etl/ (Transportation/db, Transportation/etl), holding
# the SQLAlchemy models + crud functions shared with backend/ -- see
# db/README.md. Add the Transportation/ root to sys.path here, in the
# package's own __init__.py, so `import db...` resolves no matter which
# etl entry point runs first.
_TRANSPORTATION_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _TRANSPORTATION_ROOT not in sys.path:
    sys.path.insert(0, _TRANSPORTATION_ROOT)
