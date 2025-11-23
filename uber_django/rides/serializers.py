from rest_framework import serializers
from django.core.exceptions import ValidationError
from .models import User, DriverProfile, PassengerProfile, Ride, Payment


# ----------------------------
# Validation helpers
# ----------------------------
def validate_latitude(value):
    """Validate latitude is between -90 and 90"""
    if not -90 <= value <= 90:
        raise serializers.ValidationError("Latitude must be between -90 and 90")
    return value


def validate_longitude(value):
    """Validate longitude is between -180 and 180"""
    if not -180 <= value <= 180:
        raise serializers.ValidationError("Longitude must be between -180 and 180")
    return value


def validate_non_empty_string(value):
    """Validate string is not empty"""
    if not value or not value.strip():
        raise serializers.ValidationError("This field cannot be empty")
    return value.strip()


# ----------------------------
# User serializer
# ----------------------------
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'is_driver', 'is_passenger']
        read_only_fields = ['id', 'is_driver', 'is_passenger']


# ----------------------------
# Driver profile serializer
# ----------------------------
class DriverProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = DriverProfile
        fields = ['id', 'user', 'car_model', 'car_plate', 'latitude', 'longitude', 'is_available']
        read_only_fields = ['id', 'user']

    def validate_car_model(self, value):
        return validate_non_empty_string(value)

    def validate_car_plate(self, value):
        return validate_non_empty_string(value)

    def validate_latitude(self, value):
        if value is not None:
            return validate_latitude(value)
        return value

    def validate_longitude(self, value):
        if value is not None:
            return validate_longitude(value)
        return value


# 🚕 Serializer for updating driver location & availability only
class DriverLocationSerializer(serializers.ModelSerializer):
    latitude = serializers.FloatField(validators=[validate_latitude])
    longitude = serializers.FloatField(validators=[validate_longitude])

    class Meta:
        model = DriverProfile
        fields = ['latitude', 'longitude', 'is_available']


# ----------------------------
# Passenger profile serializer
# ----------------------------
class PassengerProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = PassengerProfile
        fields = ['id', 'user', 'phone_number']
        read_only_fields = ['id', 'user']

    def validate_phone_number(self, value):
        if value:
            return validate_non_empty_string(value)
        return value


# ----------------------------
# Ride serializer (with full validation)
# ----------------------------
class RideSerializer(serializers.ModelSerializer):
    passenger = PassengerProfileSerializer(read_only=True)
    driver = DriverProfileSerializer(read_only=True)
    payment = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Ride
        fields = [
            'id', 'passenger', 'driver', 'pickup_location', 'pickup_lat', 'pickup_lng',
            'dropoff_location', 'dropoff_lat', 'dropoff_lng', 'status', 'fare',
            'requested_at', 'completed_at', 'payment'
        ]
        read_only_fields = ['id', 'passenger', 'driver', 'status', 'fare', 'requested_at', 'completed_at', 'payment']
    
    def validate_pickup_lat(self, value):
        return validate_latitude(value)
    
    def validate_pickup_lng(self, value):
        return validate_longitude(value)
    
    def validate_dropoff_lat(self, value):
        return validate_latitude(value)
    
    def validate_dropoff_lng(self, value):
        return validate_longitude(value)
    
    def validate_pickup_location(self, value):
        return validate_non_empty_string(value)
    
    def validate_dropoff_location(self, value):
        return validate_non_empty_string(value)

    def get_payment(self, obj):
        """Get payment details if ride is completed"""
        try:
            payment = obj.payment
            return PaymentSerializer(payment).data
        except:
            return None

    def validate(self, data):
        """Cross-field validation"""
        from math import radians, cos, sin, asin, sqrt
        
        pickup_lat = data.get('pickup_lat')
        pickup_lng = data.get('pickup_lng')
        dropoff_lat = data.get('dropoff_lat')
        dropoff_lng = data.get('dropoff_lng')

        # Check pickup != dropoff
        if pickup_lat == dropoff_lat and pickup_lng == dropoff_lng:
            raise serializers.ValidationError(
                "Pickup and dropoff locations cannot be the same"
            )

        # Calculate distance using Haversine formula
        R = 6371  # Earth's radius in km
        dlat = radians(dropoff_lat - pickup_lat)
        dlon = radians(dropoff_lng - pickup_lng)
        a = sin(dlat/2)**2 + cos(radians(pickup_lat)) * cos(radians(dropoff_lat)) * sin(dlon/2)**2
        c = 2 * asin(sqrt(a))
        distance = R * c

        # Validate maximum distance (500 km)
        if distance > 500:
            raise serializers.ValidationError(
                f"Ride distance ({distance:.1f} km) exceeds maximum allowed distance (500 km)"
            )

        # Validate minimum distance (0.1 km = 100 meters)
        if distance < 0.1:
            raise serializers.ValidationError(
                f"Ride distance ({distance:.1f} km) is too short. Minimum distance is 0.1 km"
            )

        return data

    def create(self, validated_data):
        """Create ride with validated data"""
        passenger_profile = self.context['request'].user.passenger_profile

        ride = Ride.objects.create(
            passenger=passenger_profile,
            **validated_data
        )
        return ride


# ----------------------------
# Payment serializer
# ----------------------------
class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ['id', 'ride', 'amount', 'payment_status', 'paid_at', 'created_at']
        read_only_fields = ['id', 'created_at']
