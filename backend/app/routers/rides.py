from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel, validator

from app.schemas.ride import RideCreate, RideRead
from app.models.ride import Ride, RideStatus
from app.models.user import User
from app.core.db import get_db
from app.core.dependencies import (
    get_current_user,
    get_current_passenger,
    get_current_driver,
)

router = APIRouter(
    prefix="/rides",
    tags=["rides"]
)

# -----------------------------
# Passenger: Create a ride
# -----------------------------
@router.post("/", response_model=RideRead)
def create_ride(
    ride_in: RideCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_passenger),
):
    """Passenger creates a new ride request"""
    # Prevent multiple concurrent rides
    existing_ride = db.query(Ride).filter(
        Ride.passenger_id == current_user.id,
        Ride.status.in_([RideStatus.requested, RideStatus.in_progress])
    ).first()
    if existing_ride:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot create a new ride while another ride is ongoing"
        )

    ride = Ride(
        passenger_id=current_user.id,
        pickup_location=ride_in.pickup_location,
        dropoff_location=ride_in.dropoff_location,
        fare=ride_in.fare,
        status=RideStatus.requested,
    )
    db.add(ride)
    db.commit()
    db.refresh(ride)
    return ride

# -----------------------------
# Any user: List their rides
# -----------------------------
@router.get("/me", response_model=List[RideRead])
def get_my_rides(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List rides for the logged-in user (passenger or driver)"""
    rides = db.query(Ride).filter(
        (Ride.passenger_id == current_user.id) | (Ride.driver_id == current_user.id)
    ).all()
    return rides

# -----------------------------
# Any user: Get ride details
# -----------------------------
@router.get("/{ride_id}", response_model=RideRead)
def get_ride(
    ride_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get ride details"""
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ride not found")
    if ride.passenger_id != current_user.id and ride.driver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to view this ride")
    return ride

# -----------------------------
# Passenger or Driver: Cancel ride
# -----------------------------
@router.post("/{ride_id}/cancel", response_model=RideRead)
def cancel_ride(
    ride_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cancel a ride (passenger or driver)"""
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ride not found")

    if ride.status in [RideStatus.completed, RideStatus.canceled]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot cancel a completed or already canceled ride")

    if current_user.role == "passenger":
        if ride.passenger_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your ride")
        if ride.status not in [RideStatus.requested, RideStatus.in_progress]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot cancel this ride")

    elif current_user.role == "driver":
        if ride.driver_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your assigned ride")
        if ride.status not in [RideStatus.accepted, RideStatus.in_progress]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot cancel this ride")

    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only passengers or drivers can cancel rides")

    ride.status = RideStatus.canceled
    db.commit()
    db.refresh(ride)
    return ride

# -----------------------------
# Driver: Accept a ride
# -----------------------------
@router.post("/{ride_id}/accept", response_model=RideRead)
def accept_ride(
    ride_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_driver),
):
    """Driver accepts a ride request"""
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ride not found")
    if ride.status != RideStatus.requested:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Ride cannot be accepted because it is {ride.status}")
    ride.driver_id = current_user.id
    ride.status = RideStatus.accepted
    db.commit()
    db.refresh(ride)
    return ride

# -----------------------------
# Driver: Update ride status
# -----------------------------
class RideStatusUpdate(BaseModel):
    status: RideStatus

    @validator("status")
    def allowed_status(cls, v):
        if v not in {RideStatus.in_progress, RideStatus.completed, RideStatus.canceled}:
            raise ValueError("Status must be in_progress, completed, or canceled")
        return v

@router.patch("/{ride_id}/status", response_model=RideRead)
def update_ride_status(
    ride_id: int,
    status_update: RideStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_driver),
):
    """Driver updates the status of an assigned ride"""
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ride not found")
    if ride.driver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update this ride")

    # Prevent updates if ride is completed or canceled
    if ride.status in [RideStatus.completed, RideStatus.canceled]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Cannot update a ride that is {ride.status}")

    allowed_transitions = {
        RideStatus.accepted: [RideStatus.in_progress, RideStatus.canceled],
        RideStatus.in_progress: [RideStatus.completed, RideStatus.canceled],
    }

    if ride.status not in allowed_transitions or status_update.status not in allowed_transitions[ride.status]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Cannot transition from {ride.status} to {status_update.status}")

    ride.status = status_update.status
    db.commit()
    db.refresh(ride)
    return ride

# -----------------------------
# Driver: List assigned rides
# -----------------------------
@router.get("/driver/me", response_model=List[RideRead])
def get_driver_rides(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_driver),
):
    """List all rides assigned to the logged-in driver"""
    rides = db.query(Ride).filter(Ride.driver_id == current_user.id).all()
    return rides
