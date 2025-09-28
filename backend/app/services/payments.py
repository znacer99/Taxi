from sqlalchemy.orm import Session
from models.payment import Payment

def create_payment(db: Session, ride_id: int, passenger_id: int, amount: float, method: str = "card"):
    payment = Payment(
        ride_id=ride_id,
        passenger_id=passenger_id,
        amount=amount,
        method=method,
        status="pending"
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment

def update_payment_status(db: Session, payment_id: int, status: str):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if payment:
        payment.status = status
        db.commit()
        db.refresh(payment)
    return payment

def get_payments_for_passenger(db: Session, passenger_id: int):
    return db.query(Payment).filter(Payment.passenger_id == passenger_id).all()

def get_payment(db: Session, payment_id: int):
    return db.query(Payment).filter(Payment.id == payment_id).first()
