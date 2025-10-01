from rest_framework import serializers
from .models import User, DriverProfile, PassengerProfile, Ride

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'is_driver', 'is_passenger']

class DriverProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer()
    class Meta:
        model = DriverProfile
        fields = '__all__'

class PassengerProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer()
    class Meta:
        model = PassengerProfile
        fields = '__all__'

class RideSerializer(serializers.ModelSerializer):
    passenger = PassengerProfileSerializer(read_only=True)
    driver = DriverProfileSerializer(read_only=True)
    class Meta:
        model = Ride
        fields = '__all__'
