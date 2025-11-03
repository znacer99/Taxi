from django.contrib.auth.models import AbstractUser
from django.db import models

# ----------------------------
# User model
# ----------------------------
class User(AbstractUser):
    is_driver = models.BooleanField(default=False)
    is_passenger = models.BooleanField(default=True)


# ----------------------------
# Driver profile with live location
# ----------------------------
class DriverProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='driver_profile')
    car_model = models.CharField(max_length=100)
    car_plate = models.CharField(max_length=20)

    # Live location & availability
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    is_available = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.user.username} ({'Available' if self.is_available else 'Busy'})"


# ----------------------------
# Passenger profile
# ----------------------------
class PassengerProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='passenger_profile')
    phone_number = models.CharField(max_length=20)

    def __str__(self):
        return self.user.username


# ----------------------------
# Ride model
# ----------------------------
class Ride(models.Model):
    STATUS_CHOICES = [
        ('REQUESTED', 'Requested'),
        ('ASSIGNED', 'Assigned'),
        ('ACCEPTED', 'Accepted'),
        ('ON_THE_WAY', 'On the way'),
        ('IN_PROGRESS', 'In progress'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    ]

    passenger = models.ForeignKey(PassengerProfile, on_delete=models.CASCADE, related_name='rides')
    driver = models.ForeignKey(DriverProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='rides')

    pickup_location = models.CharField(max_length=255)
    pickup_lat = models.FloatField(null=True, blank=True)
    pickup_lng = models.FloatField(null=True, blank=True)
    dropoff_location = models.CharField(max_length=255)
    dropoff_lat = models.FloatField(null=True, blank=True)
    dropoff_lng = models.FloatField(null=True, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='REQUESTED')
    requested_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    fare = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return f"Ride #{self.id} ({self.status})"


# ----------------------------
# Payment model
# ----------------------------
class Payment(models.Model):
    ride = models.OneToOneField(Ride, on_delete=models.CASCADE, related_name="payment")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_status = models.CharField(max_length=20, choices=[
        ("pending", "Pending"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ], default="pending")
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Payment for Ride #{self.ride.id} - ${self.amount}"