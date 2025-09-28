from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship
from app.core.db import Base
from datetime import datetime
import enum

class RideStatus(str, enum.Enum):
    requested = "requested"
    accepted = "accepted"
    in_progress = "in_progress"
    completed = "completed"
    canceled = "canceled"

class Ride(Base):
    __tablename__ = "rides"

    id = Column(Integer, primary_key=True, index=True)
    passenger_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    driver_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    pickup_location = Column(String, nullable=False)
    dropoff_location = Column(String, nullable=False)
    status = Column(Enum(RideStatus), default=RideStatus.requested, nullable=False)
    fare = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    fare = Column(Float, nullable=True, default=0.0)


    passenger = relationship("User", foreign_keys=[passenger_id])
    driver = relationship("User", foreign_keys=[driver_id])
    payments = relationship("Payment", back_populates="ride")


    def __repr__(self):
        return f"<Ride id={self.id} passenger={self.passenger_id} driver={self.driver_id} status={self.status}>"