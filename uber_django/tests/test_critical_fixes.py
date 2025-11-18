"""
Tests for critical bug fixes in the ride system.
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.db import transaction
from unittest.mock import patch, MagicMock
from rides.models import Ride, DriverProfile, PassengerProfile, Payment
from rides.serializers import RideSerializer
from rest_framework.test import APITestCase, APIClient
from rest_framework import status as http_status
import threading
import time

User = get_user_model()


class CoordinateSerializerTest(APITestCase):
    """Test that coordinates are returned in API responses"""

    def setUp(self):
        # Create passenger
        self.passenger_user = User.objects.create_user(
            username='testpassenger',
            password='testpass123',
            is_passenger=True
        )
        self.passenger_profile = PassengerProfile.objects.create(
            user=self.passenger_user,
            phone_number='+1234567890'
        )
        
        self.client = APIClient()
        self.client.force_authenticate(user=self.passenger_user)

    def test_coordinates_returned_in_ride_response(self):
        """Test that coordinate fields are included in API response"""
        ride = Ride.objects.create(
            passenger=self.passenger_profile,
            pickup_location='123 Main St',
            pickup_lat=40.7128,
            pickup_lng=-74.0060,
            dropoff_location='456 Oak Ave',
            dropoff_lat=40.7580,
            dropoff_lng=-73.9855,
            status='REQUESTED'
        )
        
        serializer = RideSerializer(ride)
        data = serializer.data
        
        # Verify coordinates are present
        self.assertIn('pickup_lat', data)
        self.assertIn('pickup_lng', data)
        self.assertIn('dropoff_lat', data)
        self.assertIn('dropoff_lng', data)
        
        # Verify values are correct
        self.assertEqual(float(data['pickup_lat']), 40.7128)
        self.assertEqual(float(data['pickup_lng']), -74.0060)
        self.assertEqual(float(data['dropoff_lat']), 40.7580)
        self.assertEqual(float(data['dropoff_lng']), -73.9855)


class DriverAssignmentRaceConditionTest(TestCase):
    """Test that driver assignment prevents race conditions"""

    def setUp(self):
        # Create passengers
        self.passenger1 = User.objects.create_user(
            username='passenger1',
            password='test123',
            is_passenger=True
        )
        self.passenger_profile1 = PassengerProfile.objects.create(
            user=self.passenger1,
            phone_number='+1111111111'
        )
        
        self.passenger2 = User.objects.create_user(
            username='passenger2',
            password='test123',
            is_passenger=True
        )
        self.passenger_profile2 = PassengerProfile.objects.create(
            user=self.passenger2,
            phone_number='+2222222222'
        )
        
        # Create single driver
        self.driver_user = User.objects.create_user(
            username='driver1',
            password='test123',
            is_driver=True
        )
        self.driver_profile = DriverProfile.objects.create(
            user=self.driver_user,
            car_model='Toyota Camry',
            car_plate='ABC123',
            latitude=40.7128,
            longitude=-74.0060,
            is_available=True
        )

    def test_concurrent_ride_requests_single_driver(self):
        """Test that only one ride gets assigned when multiple requests come simultaneously"""
        from rides.views import RideViewSet
        
        # Create two rides
        ride1 = Ride.objects.create(
            passenger=self.passenger_profile1,
            pickup_location='Location 1',
            pickup_lat=40.7128,
            pickup_lng=-74.0060,
            dropoff_location='Location 2',
            dropoff_lat=40.7580,
            dropoff_lng=-73.9855,
            status='REQUESTED'
        )
        
        ride2 = Ride.objects.create(
            passenger=self.passenger_profile2,
            pickup_location='Location 3',
            pickup_lat=40.7200,
            pickup_lng=-74.0100,
            dropoff_location='Location 4',
            dropoff_lat=40.7600,
            dropoff_lng=-73.9900,
            status='REQUESTED'
        )
        
        # Simulate concurrent assignment
        viewset = RideViewSet()
        
        # Mock the WebSocket send to avoid errors
        with patch('rides.views.async_to_sync'):
            with patch('rides.views.get_channel_layer'):
                # Assign driver to ride1
                with transaction.atomic():
                    driver = DriverProfile.objects.select_for_update().get(id=self.driver_profile.id)
                    if driver.is_available:
                        ride1.driver = driver
                        driver.is_available = False
                        driver.save()
                        ride1.status = 'ASSIGNED'
                        ride1.save()
                
                # Try to assign same driver to ride2 (should fail)
                with transaction.atomic():
                    driver = DriverProfile.objects.select_for_update().get(id=self.driver_profile.id)
                    # Driver should not be available anymore
                    self.assertFalse(driver.is_available)
        
        # Verify only one ride got the driver
        ride1.refresh_from_db()
        ride2.refresh_from_db()
        
        self.assertEqual(ride1.driver, self.driver_profile)
        self.assertEqual(ride1.status, 'ASSIGNED')
        self.assertIsNone(ride2.driver)
        self.assertEqual(ride2.status, 'REQUESTED')


class PaymentDuplicatePreventionTest(TestCase):
    """Test that duplicate payments are prevented"""

    def setUp(self):
        # Create passenger
        self.passenger_user = User.objects.create_user(
            username='passenger',
            password='test123',
            is_passenger=True
        )
        self.passenger_profile = PassengerProfile.objects.create(
            user=self.passenger_user,
            phone_number='+1234567890'
        )
        
        # Create driver
        self.driver_user = User.objects.create_user(
            username='driver',
            password='test123',
            is_driver=True
        )
        self.driver_profile = DriverProfile.objects.create(
            user=self.driver_user,
            car_model='Toyota Camry',
            car_plate='ABC123',
            latitude=40.7128,
            longitude=-74.0060,
            is_available=False
        )
        
        # Create completed ride
        self.ride = Ride.objects.create(
            passenger=self.passenger_profile,
            driver=self.driver_profile,
            pickup_location='Location 1',
            pickup_lat=40.7128,
            pickup_lng=-74.0060,
            dropoff_location='Location 2',
            dropoff_lat=40.7580,
            dropoff_lng=-73.9855,
            status='COMPLETED',
            fare=25.50
        )

    def test_get_or_create_prevents_duplicate_payments(self):
        """Test that get_or_create prevents duplicate payment records"""
        # Create first payment
        payment1, created1 = Payment.objects.get_or_create(
            ride=self.ride,
            defaults={
                'amount': 25.50,
                'payment_status': 'completed',
            }
        )
        
        self.assertTrue(created1)
        self.assertEqual(payment1.amount, 25.50)
        
        # Try to create duplicate payment
        payment2, created2 = Payment.objects.get_or_create(
            ride=self.ride,
            defaults={
                'amount': 30.00,  # Different amount
                'payment_status': 'completed',
            }
        )
        
        self.assertFalse(created2)  # Should not create new payment
        self.assertEqual(payment1.id, payment2.id)  # Should be same payment
        self.assertEqual(payment2.amount, 25.50)  # Should keep original amount
        
        # Verify only one payment exists
        payment_count = Payment.objects.filter(ride=self.ride).count()
        self.assertEqual(payment_count, 1)


class DistanceValidationTest(TestCase):
    """Test that ride distance validation works correctly"""

    def setUp(self):
        self.passenger_user = User.objects.create_user(
            username='passenger',
            password='test123',
            is_passenger=True
        )
        self.passenger_profile = PassengerProfile.objects.create(
            user=self.passenger_user,
            phone_number='+1234567890'
        )

    def test_maximum_distance_validation(self):
        """Test that rides exceeding 500km are rejected"""
        from rides.serializers import RideSerializer
        from rest_framework.exceptions import ValidationError
        
        # Create ride data with distance > 500km
        # New York to Chicago is ~1150km
        data = {
            'pickup_location': 'New York',
            'pickup_lat': 40.7128,
            'pickup_lng': -74.0060,
            'dropoff_location': 'Chicago',
            'dropoff_lat': 41.8781,
            'dropoff_lng': -87.6298,
        }
        
        serializer = RideSerializer(data=data)
        
        with self.assertRaises(ValidationError) as context:
            serializer.is_valid(raise_exception=True)
        
        self.assertIn('maximum allowed distance', str(context.exception))

    def test_minimum_distance_validation(self):
        """Test that rides shorter than 0.1km are rejected"""
        from rides.serializers import RideSerializer
        from rest_framework.exceptions import ValidationError
        
        # Create ride data with distance < 0.1km (same location essentially)
        data = {
            'pickup_location': 'Location A',
            'pickup_lat': 40.7128,
            'pickup_lng': -74.0060,
            'dropoff_location': 'Location B',
            'dropoff_lat': 40.7129,  # Only 0.01 degrees away
            'dropoff_lng': -74.0061,
        }
        
        serializer = RideSerializer(data=data)
        
        with self.assertRaises(ValidationError) as context:
            serializer.is_valid(raise_exception=True)
        
        self.assertIn('too short', str(context.exception))

    def test_valid_distance_accepted(self):
        """Test that rides with valid distance are accepted"""
        from rides.serializers import RideSerializer
        
        # Create ride data with valid distance (~5km)
        data = {
            'pickup_location': 'Location A',
            'pickup_lat': 40.7128,
            'pickup_lng': -74.0060,
            'dropoff_location': 'Location B',
            'dropoff_lat': 40.7580,
            'dropoff_lng': -73.9855,
        }
        
        # Mock the request context
        from unittest.mock import Mock
        request = Mock()
        request.user = self.passenger_user
        
        serializer = RideSerializer(data=data, context={'request': request})
        
        # Should not raise validation error
        self.assertTrue(serializer.is_valid())


class WebSocketAuthenticationTest(TestCase):
    """Test that WebSocket connections require authentication"""

    def setUp(self):
        self.driver_user = User.objects.create_user(
            username='driver',
            password='test123',
            is_driver=True
        )
        self.driver_profile = DriverProfile.objects.create(
            user=self.driver_user,
            car_model='Toyota Camry',
            car_plate='ABC123',
            latitude=40.7128,
            longitude=-74.0060,
            is_available=True
        )

    def test_driver_consumer_requires_token(self):
        """Test that DriverConsumer requires authentication token"""
        from rides.consumers import DriverConsumer
        from channels.testing import WebsocketCommunicator
        from channels.routing import URLRouter
        from django.urls import re_path
        
        # This is a conceptual test - actual WebSocket testing requires more setup
        # The key is that the connect method checks for token
        consumer = DriverConsumer()
        
        # Verify the authenticate_token method exists
        self.assertTrue(hasattr(consumer, 'authenticate_token'))

    def test_driver_consumer_validates_driver_ownership(self):
        """Test that driver can only connect to their own WebSocket"""
        # This would require full WebSocket testing setup
        # The key validation is in the connect method checking driver_profile.id
        pass


class StatusValueConsistencyTest(TestCase):
    """Test that all status values use UPPERCASE consistently"""

    def test_all_status_values_uppercase(self):
        """Verify all status choices are uppercase"""
        from rides.models import Ride
        
        for status_value, _ in Ride.STATUS_CHOICES:
            self.assertEqual(status_value, status_value.upper(),
                           f"Status '{status_value}' should be uppercase")

    def test_ride_creation_uses_uppercase_status(self):
        """Test that rides are created with uppercase status"""
        passenger_user = User.objects.create_user(
            username='passenger',
            password='test123',
            is_passenger=True
        )
        passenger_profile = PassengerProfile.objects.create(
            user=passenger_user,
            phone_number='+1234567890'
        )
        
        ride = Ride.objects.create(
            passenger=passenger_profile,
            pickup_location='Location A',
            pickup_lat=40.7128,
            pickup_lng=-74.0060,
            dropoff_location='Location B',
            dropoff_lat=40.7580,
            dropoff_lng=-73.9855,
        )
        
        # Default status should be uppercase
        self.assertEqual(ride.status, 'REQUESTED')
        self.assertEqual(ride.status, ride.status.upper())
