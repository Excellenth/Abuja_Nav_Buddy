from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Numeric, SmallInteger, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base
from db.models.node import data_source_enum

transport_mode_enum = Enum(
    "shared_taxi", "okada", "keke_napep", "minibus", "walk",
    name="transport_mode", create_type=False,
)
edge_direction_enum = Enum("bidirectional", "one_way", name="edge_direction", create_type=False)


class Edge(Base):
    """A transport link between two nodes. See db/schema.sql -- cost is
    computed per-query (fastest/cheapest/fewest_transfers), not stored."""

    __tablename__ = "edges"

    edge_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    source: Mapped[int] = mapped_column(BigInteger, ForeignKey("nodes.node_id"), nullable=False)
    target: Mapped[int] = mapped_column(BigInteger, ForeignKey("nodes.node_id"), nullable=False)
    mode: Mapped[str] = mapped_column(transport_mode_enum, nullable=False)
    fare_min: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    fare_max: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    avg_time_min: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    reliability: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    operating_hours: Mapped[str | None] = mapped_column(Text, nullable=True)
    direction: Mapped[str] = mapped_column(edge_direction_enum, nullable=False, default="one_way")
    road_condition: Mapped[str | None] = mapped_column(Text, nullable=True)
    geom = mapped_column(Geography("LINESTRING", srid=4326), nullable=True)
    source_data: Mapped[str] = mapped_column(data_source_enum, nullable=False, default="manual")
    sample_count: Mapped[int] = mapped_column(default=1)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
