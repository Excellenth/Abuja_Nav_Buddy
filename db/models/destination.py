from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import BigInteger, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class Destination(Base):
    """Cache of geocoded free-text places, so the same Nominatim lookup
    doesn't fire twice for e.g. "OSGOF". See db/schema.sql for the flow."""

    __tablename__ = "destinations"

    destination_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    query_text: Mapped[str] = mapped_column(Text, nullable=False)
    resolved_name: Mapped[str] = mapped_column(Text, nullable=False)
    geom = mapped_column(Geography("POINT", srid=4326), nullable=False)
    resolved_via: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
