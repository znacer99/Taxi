from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.user import User
from app.schemas.user import UserRead
from app.core.dependencies import get_current_user  # use centralized dependency

router = APIRouter(
    prefix="",
    tags=["users"]
)

@router.get("/me", response_model=UserRead)
def read_current_user(current_user: User = Depends(get_current_user)):
    """
    Return the currently logged-in user.
    This uses JWT authentication to fetch user info from the DB.
    """
    return current_user
