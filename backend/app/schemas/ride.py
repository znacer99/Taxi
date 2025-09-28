from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.ride import RideStatus

# -----------------------------
# Base ride info
# -----------------------------
class RideBase(BaseModel):
    pickup_location: str
    dropoff_location: str

# -----------------------------
# Input model for creating a ride
# -----------------------------
class RideCreate(RideBase):
    fare: Optional[float] = None

# -----------------------------
# Output model for reading a ride
# -----------------------------
class RideRead(RideBase):
    id: int
    passenger_id: int
    driver_id: Optional[int]
    status: RideStatus
    fare: Optional[float]
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True  # Needed to read SQLAlchemy objects directly
