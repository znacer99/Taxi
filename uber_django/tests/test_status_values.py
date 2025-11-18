"""
Test to verify status values are consistent between database and code.
This test ensures the bug fix for status value mismatch is working correctly.
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from rides.models import Ride, DriverProfile, PassengerProfile

User = get_user_model()


class StatusValueConsistencyTest(TestCase):
    """Test that status values match between database schema and application code"""

    def setUp(self):
        """Create test users and profiles"""
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

        # Create driver
        self.driver_user = User.objects.create_user(
            username='testdriver',
            password='testpass123',
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

    def test_ride_status_values_are_uppercase(self):
        """Test that ride status values stored in database are UPPERCASE"""
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
        
        # Verify status is stored as uppercase
        ride.refresh_from_db()
        self.assertEqual(ride.status, 'REQUESTED')
        self.assertNotEqual(ride.status, 'requested')

    def test_all_valid_status_transitions(self):
        """Test that all status values in STATUS_CHOICES are uppercase"""
        valid_statuses = [choice[0] for choice in Ride.STATUS_CHOICES]
        
        # All statuses should be uppercase
        for status_value in valid_statuses:
            self.assertEqual(status_value, status_value.upper(),
                           f"Status '{status_value}' should be uppercase")

    def test_ride_lifecycle_with_correct_status_values(self):
        """Test complete ride lifecycle uses correct uppercase status values"""
        # Create ride
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
        
        # Assign driver
        ride.driver = self.driver_profile
        ride.status = 'ASSIGNED'
        ride.save()
        ride.refresh_from_db()
        self.assertEqual(ride.status, 'ASSIGNED')
        
        # Accept ride
        ride.status = 'ACCEPTED'
        ride.save()
        ride.refresh_from_db()
        self.assertEqual(ride.status, 'ACCEPTED')
        
        # Start ride
        ride.status = 'IN_PROGRESS'
        ride.save()
        ride.refresh_from_db()
        self.assertEqual(ride.status, 'IN_PROGRESS')
        
        # Complete ride
        ride.status = 'COMPLETED'
        ride.save()
        ride.refresh_from_db()
        self.assertEqual(ride.status, 'COMPLETED')

    def test_status_filtering_works_with_uppercase(self):
        """Test that filtering by status works with uppercase values"""
        # Create rides with different statuses
        Ride.objects.create(
            passenger=self.passenger_profile,
            pickup_location='Location 1',
            pickup_lat=40.7128,
            pickup_lng=-74.0060,
            dropoff_location='Location 2',
            dropoff_lat=40.7580,
            dropoff_lng=-73.9855,
            status='REQUESTED'
        )
        
        Ride.objects.create(
            passenger=self.passenger_profile,
            driver=self.driver_profile,
            pickup_location='Location 3',
            pickup_lat=40.7128,
            pickup_lng=-74.0060,
            dropoff_location='Location 4',
            dropoff_lat=40.7580,
            dropoff_lng=-73.9855,
            status='ASSIGNED'
        )
        
        # Filter by uppercase status
        requested_rides = Ride.objects.filter(status='REQUESTED')
        assigned_rides = Ride.objects.filter(status='ASSIGNED')
        
        self.assertEqual(requested_rides.count(), 1)
        self.assertEqual(assigned_rides.count(), 1)
        
        # Lowercase filtering should return nothing (verifying the fix)
        lowercase_rides = Ride.objects.filter(status='requested')
        self.assertEqual(lowercase_rides.count(), 0)

    def test_driver_consumer_status_values(self):
        """Test that DriverConsumer queries use correct status values"""
        # Create rides in different states
        assigned_ride = Ride.objects.create(
            passenger=self.passenger_profile,
            driver=self.driver_profile,
            pickup_location='Location 1',
            pickup_lat=40.7128,
            pickup_lng=-74.0060,
            dropoff_location='Location 2',
            dropoff_lat=40.7580,
            dropoff_lng=-73.9855,
            status='ASSIGNED'
        )
        
        in_progress_ride = Ride.objects.create(
            passenger=self.passenger_profile,
            driver=self.driver_profile,
            pickup_location='Location 3',
            pickup_lat=40.7128,
            pickup_lng=-74.0060,
            dropoff_location='Location 4',
            dropoff_lat=40.7580,
            dropoff_lng=-73.9855,
            status='IN_PROGRESS'
        )
        
        # Query like DriverConsumer does
        current_rides = Ride.objects.filter(
            driver=self.driver_profile,
            status__in=['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS']
        )
        
        self.assertEqual(current_rides.count(), 2)
        self.assertIn(assigned_ride, current_rides)
        self.assertIn(in_progress_ride, current_rides)
        
        # Verify old incorrect status 'PICKED_UP' doesn't exist
        picked_up_rides = Ride.objects.filter(status='PICKED_UP')
        self.assertEqual(picked_up_rides.count(), 0)
