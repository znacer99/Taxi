import requests
import uuid

BASE_URL = "http://127.0.0.1:8000"

def test_user_registration_and_login():
    # unique email per test run
    email = f"testuser_{uuid.uuid4().hex[:6]}@example.com"

    register_data = {
        "email": email,
        "password": "SecurePass123",
        "confirm_password": "SecurePass123",
        "full_name": "Test Passenger"
    }
    resp = requests.post(f"{BASE_URL}/auth/signup", json=register_data)
    assert resp.status_code in [200, 201], f"Signup failed: {resp.text}"

    # Login with the same passenger
    login_data = {
        "email": email,
        "password": "SecurePass123"
    }
    resp = requests.post(f"{BASE_URL}/auth/login", json=login_data)
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    tokens = resp.json()
    assert "access_token" in tokens

    # Verify current user
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    resp = requests.get(f"{BASE_URL}/users/me", headers=headers)
    assert resp.status_code == 200, f"/users/me failed: {resp.text}"
    assert resp.json()["email"] == email
