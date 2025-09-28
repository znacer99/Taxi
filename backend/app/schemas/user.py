from pydantic import BaseModel, EmailStr, Field, model_validator
from enum import Enum

# Use Enum to match the User model roles
class UserRole(str, Enum):
    passenger = "passenger"
    driver = "driver"
    admin = "admin"


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.passenger  # default to passenger


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str = Field(..., min_length=8, max_length=128)

    @model_validator(mode="after")
    def passwords_match(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class UserRead(UserBase):
    id: int
    is_active: bool

    class Config:
        from_attributes = True
