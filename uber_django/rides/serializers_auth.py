from rest_framework import serializers
from django.contrib.auth.models import User
from .models import User, DriverProfile, PassengerProfile

class PassengerRegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'password']

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password'],
            is_passenger=True,
            is_driver=False
        )
        PassengerProfile.objects.create(user=user, phone_number='')
        return user


class DriverRegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    car_model = serializers.CharField(write_only=True)
    car_plate = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'car_model', 'car_plate']

    def create(self, validated_data):  # Indent this inside the class
        car_model = validated_data.pop('car_model')
        car_plate = validated_data.pop('car_plate')
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password'],
            is_driver=True,
            is_passenger=False
        )
        DriverProfile.objects.create(
            user=user, 
            car_model=car_model,
            car_plate=car_plate
        )
        return user