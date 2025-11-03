# debug_match.py
from rides.models import Ride, DriverProfile
from rides.views import haversine

ride = Ride.objects.latest('id')
print(f"\n🎯 Ride #{ride.id} - Status before: {ride.status}")
print(f"Pickup: {ride.pickup_lat}, {ride.pickup_lng}")

available = DriverProfile.objects.filter(is_available=True, latitude__isnull=False, longitude__isnull=False)
print(f"\nDrivers available: {available.count()}")

nearest_driver = None
min_distance = float('inf')
for d in available:
    dist = haversine(ride.pickup_lat, ride.pickup_lng, d.latitude, d.longitude)
    print(f"Driver {d.id} -> Distance: {dist:.4f} km | Available: {d.is_available}")
    if dist < min_distance:
        min_distance = dist
        nearest_driver = d

if nearest_driver:
    ride.driver = nearest_driver
    nearest_driver.is_available = False
    nearest_driver.save()
    ride.status = "ASSIGNED"   # use uppercase!
    ride.save()
    print(f"\n✅ Ride assigned to Driver {nearest_driver.id} with status: {ride.status}")
else:
    print("\n⚠️ No available driver found")
