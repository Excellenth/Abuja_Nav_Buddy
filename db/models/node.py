from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import ARRAY, BigInteger, DateTime, Enum, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base

node_type_enum = Enum(
    "loading_point", "junction", "transfer_point", "bridge",
    name="node_type", create_type=False,
)
data_source_enum = Enum(
    "osm", "manual", "crowdsourced", "estimated",
    name="data_source", create_type=False,
)


class Node(Base):
    """Real transport infrastructure only -- bus stops, taxi parks,
    junctions, bridges. See db/schema.sql for the full rationale."""

    __tablename__ = "nodes"

    node_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    aliases: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    node_type: Mapped[str] = mapped_column(node_type_enum, nullable=False)
    geom = mapped_column(Geography("POINT", srid=4326), nullable=False)
    osm_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    source: Mapped[str] = mapped_column(data_source_enum, nullable=False, default="manual")
    # Human-readable venue reference, e.g. "opposite Zenith Bank, Utako" --
    # always shown alongside the bare name so a commuter unfamiliar with
    # the formal name can still recognize the stop. Auto-filled from the
    # nearest named Overture place when not set manually (see
    # app/services/network.py:describe_landmark).
    landmark_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
