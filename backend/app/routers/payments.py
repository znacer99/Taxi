# app/routers/payments.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.core.dependencies import get_db, get_current_passenger
from app.models.user import User
from app.models.payment import Payment  # your Payment model
from app.schemas.payment import PaymentCreate, PaymentOut  # your Pydantic schemas

router = APIRouter(
    prefix="/payments",
    tags=["payments"]
)


@router.post("/", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
def create_payment(
    payment_data: PaymentCreate,
    current_user: User = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """
    Create a payment for the current passenger
    """
    payment = Payment(
        user_id=current_user.id,
        amount=payment_data.amount,
        currency=payment_data.currency,
        method=payment_data.method,
        ride_id=payment_data.ride_id
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


@router.get("/me", response_model=List[PaymentOut])
def get_my_payments(
    current_user: User = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """
    Get all payments of the current passenger
    """
    payments = db.query(Payment).filter(Payment.user_id == current_user.id).all()
    return payments
