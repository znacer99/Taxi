# app/models/user.py
import enum
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum
from app.core.db import Base
from datetime import datetime


class UserRole(enum.Enum):
    passenger = "passenger"
    driver = "driver"
    admin = "admin"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String(255), nullable=False)  # increased length for Argon2
    role = Column(Enum(UserRole), default=UserRole.passenger, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email} role={self.role}>"
