# tests/test_payments.py
import pytest
import uuid
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.main import app
from app.core.security import create_access_token
from app.models.user import User, UserRole
from app.models.payment import Payment  # make sure Payment model is imported correctly
from app.core.db import get_db

client = TestClient(app)

# --- Fixtures ---
@pytest.fixture
def test_db_session():
    """Yields a database session for testing"""
    db: Session = next(get_db())
    try:
        yield db
    finally:
        db.close()

@pytest.fixture
def test_passenger(test_db_session):
    """Create a test passenger user"""
    user = User(
        email=f"passenger_{uuid.uuid4()}@example.com",
        full_name="Test Passenger",
        hashed_password="not_really_used_here",
        role=UserRole.passenger,
        is_active=True
    )
    test_db_session.add(user)
    test_db_session.commit()
    test_db_session.refresh(user)
    return user

@pytest.fixture
def passenger_token(test_passenger):
    """Generate JWT token for test passenger"""
    return create_access_token({"sub": test_passenger.email})

@pytest.fixture
def passenger_headers(passenger_token):
    return {"Authorization": f"Bearer {passenger_token}"}


# --- Tests ---
def test_create_payment(passenger_headers, test_db_session, test_passenger):
    # Create payment via API
    response = client.post(
        "/payments/",
        json={"ride_id": 1, "amount": 20.0, "method": "card"},
        headers=passenger_headers
    )
    assert response.status_code == 200

    data = response.json()
    assert data["amount"] == 20.0
    assert data["ride_id"] == 1
    assert data["passenger_id"] == test_passenger.id

    # Also check DB directly
    payment_in_db = test_db_session.query(Payment).filter_by(id=data["id"]).first()
    assert payment_in_db is not None
    assert payment_in_db.passenger_id == test_passenger.id


def test_get_my_payments(passenger_headers, test_db_session, test_passenger):
    # First, create a payment in DB
    payment = Payment(
        passenger_id=test_passenger.id,
        ride_id=1,
        amount=25.0,
        method="card"
    )
    test_db_session.add(payment)
    test_db_session.commit()
    test_db_session.refresh(payment)

    # Fetch payments for this passenger via API
    response = client.get("/payments/me", headers=passenger_headers)
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0

    # Make sure at least one payment belongs to test_passenger
    assert any(p["passenger_id"] == test_passenger.id for p in data)
