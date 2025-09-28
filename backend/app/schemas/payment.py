from pydantic import BaseModel
from datetime import datetime

class PaymentBase(BaseModel):
    ride_id: int
    amount: float
    method: str = "card"
    currency: str = "USD"

class PaymentCreate(PaymentBase):
    pass

class PaymentUpdateStatus(BaseModel):
    status: str  # pending, completed, failed

class PaymentOut(PaymentBase):
    id: int
    passenger_id: int
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True
