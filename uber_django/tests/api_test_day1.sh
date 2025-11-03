#!/bin/bash

# GoTaxi Day 1 - Complete Testing Guide
# Test all endpoints with curl to verify status codes, validation, and responses

API_URL="http://localhost:8000/api"
PASSENGER_TOKEN=""
DRIVER_TOKEN=""
RIDE_ID=""

echo "=== GoTaxi Day 1 Testing Suite ==="
echo ""

# ============================================================
# 1. PASSENGER REGISTRATION (expect 201)
# ============================================================
echo "1️⃣  REGISTER PASSENGER"
echo "Expected: 201 Created"
RESPONSE=$(curl -s -X POST "$API_URL/register/passenger/" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "passenger_john",
    "email": "john@test.com",
    "password": "Pass123!@",
    "phone_number": "555-1234"
  }')

echo "$RESPONSE" | jq '.'
PASSENGER_ID=$(echo "$RESPONSE" | jq -r '.data.id')
echo ""

# ============================================================
# 2. DRIVER REGISTRATION (expect 201)
# ============================================================
echo "2️⃣  REGISTER DRIVER"
echo "Expected: 201 Created"
RESPONSE=$(curl -s -X POST "$API_URL/register/driver/" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "driver_bob",
    "email": "bob@test.com",
    "password": "Pass123!@",
    "car_model": "Tesla Model 3",
    "car_plate": "EV-001"
  }')

echo "$RESPONSE" | jq '.'
DRIVER_ID=$(echo "$RESPONSE" | jq -r '.data.id')
echo ""

# ============================================================
# 3. LOGIN PASSENGER (expect 200)
# ============================================================
echo "3️⃣  LOGIN PASSENGER"
echo "Expected: 200 OK"
RESPONSE=$(curl -s -X POST "$API_URL/token/" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "passenger_john",
    "password": "Pass123!@"
  }')

echo "$RESPONSE" | jq '.'
PASSENGER_TOKEN=$(echo "$RESPONSE" | jq -r '.access')
echo "Token: $PASSENGER_TOKEN"
echo ""

# ============================================================
# 4. LOGIN DRIVER (expect 200)
# ============================================================
echo "4️⃣  LOGIN DRIVER"
echo "Expected: 200 OK"
RESPONSE=$(curl -s -X POST "$API_URL/token/" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "driver_bob",
    "password": "Pass123!@"
  }')

echo "$RESPONSE" | jq '.'
DRIVER_TOKEN=$(echo "$RESPONSE" | jq -r '.access')
echo "Token: $DRIVER_TOKEN"
echo ""

# ============================================================
# 5. GET PASSENGER PROFILE (expect 200)
# ============================================================
echo "5️⃣  GET PASSENGER PROFILE"
echo "Expected: 200 OK, success: true"
curl -s -X GET "$API_URL/passengers/me/" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" | jq '.'
echo ""

# ============================================================
# 6. UPDATE DRIVER LOCATION (expect 200)
# ============================================================
echo "6️⃣  UPDATE DRIVER LOCATION"
echo "Expected: 200 OK"
curl -s -X POST "$API_URL/rides/update_location/" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 34.0522,
    "longitude": -118.2437,
    "is_available": true
  }' | jq '.'
echo ""

# ============================================================
# 7. GET DRIVER PROFILE (expect 200)
# ============================================================
echo "7️⃣  GET DRIVER PROFILE"
echo "Expected: 200 OK"
curl -s -X GET "$API_URL/drivers/me/" \
  -H "Authorization: Bearer $DRIVER_TOKEN" | jq '.'
echo ""

# ============================================================
# 8. CREATE RIDE - VALID (expect 201)
# ============================================================
echo "8️⃣  CREATE RIDE (Valid Coordinates)"
echo "Expected: 201 Created, status: assigned (driver matched)"
RESPONSE=$(curl -s -X POST "$API_URL/rides/" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pickup_location": "123 Main St, LA",
    "pickup_lat": 34.0522,
    "pickup_lng": -118.2437,
    "dropoff_location": "456 Oak Ave, LA",
    "dropoff_lat": 34.0722,
    "dropoff_lng": -118.2637
  }')

echo "$RESPONSE" | jq '.'
RIDE_ID=$(echo "$RESPONSE" | jq -r '.data.id')
echo "Ride ID: $RIDE_ID"
echo ""

# ============================================================
# 9. CREATE RIDE - VALIDATION ERROR (expect 400)
# ============================================================
echo "9️⃣  CREATE RIDE (Invalid - Pickup = Dropoff)"
echo "Expected: 400 Bad Request, success: false"
curl -s -X POST "$API_URL/rides/" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pickup_location": "123 Main St",
    "pickup_lat": 34.0522,
    "pickup_lng": -118.2437,
    "dropoff_location": "123 Main St",
    "dropoff_lat": 34.0522,
    "dropoff_lng": -118.2437
  }' | jq '.'
echo ""

# ============================================================
# 10. CREATE RIDE - VALIDATION ERROR (expect 400)
# ============================================================
echo "🔟 CREATE RIDE (Invalid - Latitude out of range)"
echo "Expected: 400 Bad Request"
curl -s -X POST "$API_URL/rides/" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pickup_location": "123 Main St",
    "pickup_lat": 95.0,
    "pickup_lng": -118.2437,
    "dropoff_location": "456 Oak Ave",
    "dropoff_lat": 34.0722,
    "dropoff_lng": -118.2637
  }' | jq '.'
echo ""

# ============================================================
# 11. ACCEPT RIDE (expect 200)
# ============================================================
echo "1️⃣1️⃣  ACCEPT RIDE (Driver)"
echo "Expected: 200 OK, status: accepted"
curl -s -X POST "$API_URL/rides/$RIDE_ID/accept_ride/" \
  -H "Authorization: Bearer $DRIVER_TOKEN" | jq '.'
echo ""

# ============================================================
# 12. START RIDE (expect 200)
# ============================================================
echo "1️⃣2️⃣  START RIDE (Driver)"
echo "Expected: 200 OK, status: in_progress"
curl -s -X POST "$API_URL/rides/$RIDE_ID/start_ride/" \
  -H "Authorization: Bearer $DRIVER_TOKEN" | jq '.'
echo ""

# ============================================================
# 13. COMPLETE RIDE (expect 200)
# ============================================================
echo "1️⃣3️⃣  COMPLETE RIDE (Driver)"
echo "Expected: 200 OK, status: completed, fare calculated"
curl -s -X POST "$API_URL/rides/$RIDE_ID/complete_ride/" \
  -H "Authorization: Bearer $DRIVER_TOKEN" | jq '.'
echo ""

# ============================================================
# 14. GET RIDE DETAILS (expect 200)
# ============================================================
echo "1️⃣4️⃣  GET RIDE DETAILS"
echo "Expected: 200 OK, full ride info with payment"
curl -s -X GET "$API_URL/rides/$RIDE_ID/" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" | jq '.'
echo ""

# ============================================================
# 15. LIST RIDES - FILTER BY STATUS (expect 200)
# ============================================================
echo "1️⃣5️⃣  LIST RIDES (Filter by completed status)"
echo "Expected: 200 OK, array of completed rides"
curl -s -X GET "$API_URL/rides/?status=completed" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" | jq '.'
echo ""

# ============================================================
# 16. GET DRIVER EARNINGS (expect 200)
# ============================================================
echo "1️⃣6️⃣  GET DRIVER EARNINGS"
echo "Expected: 200 OK, total_rides, total_earnings, average_per_ride"
curl -s -X GET "$API_URL/rides/earnings/" \
  -H "Authorization: Bearer $DRIVER_TOKEN" | jq '.'
echo ""

# ============================================================
# 17. CANCEL RIDE - NEW RIDE (expect 200)
# ============================================================
echo "1️⃣7️⃣  CREATE ANOTHER RIDE FOR CANCELLATION TEST"
RESPONSE=$(curl -s -X POST "$API_URL/rides/" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pickup_location": "789 Park St",
    "pickup_lat": 34.0322,
    "pickup_lng": -118.2237,
    "dropoff_location": "321 Hill Ave",
    "dropoff_lat": 34.0622,
    "dropoff_lng": -118.2537
  }')

RIDE_ID_2=$(echo "$RESPONSE" | jq -r '.data.id')
echo "New Ride ID: $RIDE_ID_2"
echo ""

echo "1️⃣8️⃣  CANCEL RIDE (Passenger)"
echo "Expected: 200 OK, status: cancelled"
curl -s -X POST "$API_URL/rides/$RIDE_ID_2/cancel_ride/" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" | jq '.'
echo ""

# ============================================================
# 19. PERMISSION ERROR TEST (expect 403)
# ============================================================
echo "1️⃣9️⃣  PERMISSION ERROR (Passenger tries to accept ride)"
echo "Expected: 403 Forbidden"
RESPONSE=$(curl -s -X POST "$API_URL/rides/" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pickup_location": "111 Test St",
    "pickup_lat": 34.0122,
    "pickup_lng": -118.2137,
    "dropoff_location": "222 Test Ave",
    "dropoff_lat": 34.0522,
    "dropoff_lng": -118.2437
  }')

RIDE_ID_3=$(echo "$RESPONSE" | jq -r '.data.id')
curl -s -X POST "$API_URL/rides/$RIDE_ID_3/accept_ride/" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" | jq '.'
echo ""

# ============================================================
# 20. INVALID STATUS FILTER (expect 400)
# ============================================================
echo "2️⃣0️⃣  INVALID STATUS FILTER"
echo "Expected: 400 Bad Request"
curl -s -X GET "$API_URL/rides/?status=invalid_status" \
  -H "Authorization: Bearer $DRIVER_TOKEN" | jq '.'
echo ""

# ============================================================
# SUMMARY
# ============================================================
echo ""
echo "=== Test Summary ==="
echo "✅ All 20 tests completed!"
echo ""
echo "Expected Results:"
echo "  ✓ 201: Register passenger, Register driver, Create ride"
echo "  ✓ 200: Login, Get profiles, Update location, Accept/Start/Complete, Cancel, Earnings, List, Details, Filters"
echo "  ✓ 400: Invalid validation (lat/lng out of range, pickup=dropoff, invalid status)"
echo "  ✓ 403: Permission denied (wrong user type, wrong assignment)"
echo ""
echo "Next Steps:"
echo "  1. Verify all responses have success/message/data fields"
echo "  2. Verify status codes match expected"
echo "  3. Verify timestamps are correct"
echo "  4. Verify fare calculation is correct"
echo "  5. Commit: 'feat: fix status codes, add validation, standardize errors'"