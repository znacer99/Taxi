import requests

BASE_URL = "http://127.0.0.1:8000"

# Replace these with your actual JWTs
PASSENGER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwYXNzZW5nZXIxQGV4YW1wbGUuY29tIiwiZXhwIjoxNzU5MDc1NTIxfQ.Y-I_JwlGIgtxJRJ6vfXinIWK2vggXsImTkV3iX06kX8"
DRIVER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkcml2ZXIxQGV4YW1wbGUuY29tIiwiZXhwIjoxNzU5MDc1NTQ1fQ.CCEZ8z8cICfwD8HlR88FEza6STNaAmPvC_oYG7f9Zrw"

passenger_headers = {
    "Authorization": f"Bearer {PASSENGER_TOKEN}",
    "Content-Type": "application/json"
}

driver_headers = {
    "Authorization": f"Bearer {DRIVER_TOKEN}",
    "Content-Type": "application/json"
}

def test_ride_lifecycle():
    # Passenger requests a ride
    ride_request = {
        "pickup_location": "Libya Street 123",
        "dropoff_location": "Green Park 45",
        "fare": 12.5
    }
    resp = requests.post(f"{BASE_URL}/rides/rides/", json=ride_request, headers=passenger_headers)
    ride = resp.json()
    ride_id = ride["id"]
    assert ride["status"] == "requested"

    # Driver accepts the ride
    resp = requests.post(f"{BASE_URL}/rides/rides/{ride_id}/accept", headers=driver_headers)
    ride = resp.json()
    assert ride["status"] == "accepted"

    # Driver starts the ride
    resp = requests.patch(f"{BASE_URL}/rides/rides/{ride_id}/status", json={"status": "in_progress"}, headers=driver_headers)
    ride = resp.json()
    assert ride["status"] == "in_progress"

    # Driver completes the ride
    resp = requests.patch(f"{BASE_URL}/rides/rides/{ride_id}/status", json={"status": "completed"}, headers=driver_headers)
    ride = resp.json()
    assert ride["status"] == "completed"

    # Passenger checks their rides
    resp = requests.get(f"{BASE_URL}/rides/rides/me", headers=passenger_headers)
    rides = resp.json()
    assert any(r["id"] == ride_id for r in rides)

    # Passenger requests another ride
    new_ride_data = {
        "pickup_location": "New Street 10",
        "dropoff_location": "City Center 99",
        "fare": 15.0
    }
    resp = requests.post(f"{BASE_URL}/rides/rides/", json=new_ride_data, headers=passenger_headers)
    new_ride = resp.json()
    new_ride_id = new_ride["id"]
    assert new_ride["status"] == "requested"

    # Driver accepts new ride
    resp = requests.post(f"{BASE_URL}/rides/rides/{new_ride_id}/accept", headers=driver_headers)
    ride = resp.json()
    assert ride["status"] == "accepted"

    # Passenger cancels the ride
    resp = requests.post(f"{BASE_URL}/rides/rides/{new_ride_id}/cancel", headers=passenger_headers)
    cancelled_ride = resp.json()

    # Handle both success and error
    if "status" in cancelled_ride:
        assert cancelled_ride["status"] == "cancelled"
    else:
        # If cancellation fails, check that the API returned a valid reason
        assert "detail" in cancelled_ride
        print(f"Ride cancellation not allowed: {cancelled_ride['detail']}")
