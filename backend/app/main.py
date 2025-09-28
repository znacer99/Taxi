from fastapi import FastAPI
from app.routers import auth, users, rides, payments
import logging
app = FastAPI(title="Uber MVP Backend")

# Include routers
app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(users.router, prefix="/users", tags=["Users"])
app.include_router(rides.router, prefix="/rides", tags=["Rides"])
app.include_router(payments.router)
for route in app.routes:
    logging.info(f"Route: {route.path} | name: {route.name} | methods: {route.methods}")

# Health check / root endpoint
@app.get("/")
def root():
    return {"message": "Uber MVP Backend is running!"}

@app.get("/routes")
def list_routes():
    return [{"path": r.path, "name": r.name, "methods": list(r.methods)} for r in app.routes]
