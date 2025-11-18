from rest_framework import viewsets, permissions, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError, PermissionDenied, NotFound
from math import radians, cos, sin, asin, sqrt
from django.utils import timezone
from django.db import models
from django.core.paginator import Paginator
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from .models import Ride, DriverProfile, PassengerProfile, Payment, User
from .serializers import (
    RideSerializer, DriverLocationSerializer, DriverProfileSerializer,
    PassengerProfileSerializer, PaymentSerializer
)
from .serializers_auth import PassengerRegisterSerializer, DriverRegisterSerializer
from rest_framework_simplejwt.authentication import JWTAuthentication


# ----------------------------
# Helpers
# ----------------------------
def haversine(lat1, lon1, lat2, lon2):
    """Calculate distance (km) between two lat/long points."""
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    return R * c


def send_websocket_update(ride_id, message_type, data):
    """Send WebSocket update to ride group"""
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'ride_{ride_id}',
            {'type': 'ride_update', 'ride': data}
        )
    except Exception as e:
        print(f"WebSocket error: {str(e)}")  # Log but don't fail


def get_standardized_response(success=True, message="", data=None, status_code=200):
    """Return standardized response format"""
    return {
        "success": success,
        "message": message,
        "data": data or {},
        "status_code": status_code
    }


# ----------------------------
# RideViewSet
# ----------------------------
class RideViewSet(viewsets.ModelViewSet):
    authentication_classes = [JWTAuthentication]
    queryset = Ride.objects.all()
    serializer_class = RideSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None  # We'll handle manually

    def get_queryset(self):
        """Filter rides based on user role and query params"""
        user = self.request.user
        queryset = Ride.objects.all()

        # Passengers see only their rides
        if hasattr(user, 'passenger_profile'):
            queryset = queryset.filter(passenger=user.passenger_profile)
        # Drivers see only their assigned rides
        elif hasattr(user, 'driver_profile'):
            queryset = queryset.filter(driver=user.driver_profile)

        # Filter by status if provided
        status_filter = self.request.query_params.get('status')
        if status_filter:
            # Accept both lowercase and uppercase, normalize to uppercase for DB
            status_upper = status_filter.upper()
            valid_statuses = ['REQUESTED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
            if status_upper not in valid_statuses:
                raise ValidationError(f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
            queryset = queryset.filter(status=status_upper)

        # Sort by newest first
        queryset = queryset.order_by('-requested_at')
        return queryset

    def create(self, request, *args, **kwargs):
        """Create ride - return 201"""

        # Debug lines
        print(f"User: {request.user}")
        print(f"User ID: {request.user.id}")
        print(f" Has passenger_profile: {hasattr(request.user, 'passenger_profile')}")
        if hasattr(request.user, 'passenger_profile'):
            print(f"Profile ID: {request.user.passenger_profile}")
        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        
        # Check user is passenger
        if not hasattr(request.user, 'passenger_profile'):
            return Response(
                get_standardized_response(
                    success=False,
                    message="Only passengers can create rides",
                    status_code=403
                ),
                status=status.HTTP_403_FORBIDDEN
            )

        # Perform create with driver matching
        ride = self._perform_create_with_matching(serializer)

        #if ride.driver:
            #from channels.layers import get_channel_layer
            #from asgiref.sync import async_to_sync

            #channel_layer = get_channel_layer()
            #async_to_sync(channel_layer.group_send)(
                #f"driver_{ride.driver.id}",
                #{
                    #"type": "ride_update",
                    #"ride": RideSerializer(ride).data
                #}
            #)
        
        return Response(
            get_standardized_response(
            success=True,
            message="Ride created successfully",
            data=RideSerializer(ride).data,
            status_code=201
            ),
            status=status.HTTP_201_CREATED
        )

    def list(self, request, *args, **kwargs):
        """List rides - rerturn 200"""
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(
            get_standardized_response(
                success=True,
                message="Rides retrieved successfully",
                data=serializer.data,
                status_code=200
            )
        )
    
    
    def _perform_create_with_matching(self, serializer):
        """Create ride and auto-match nearest driver"""
        ride = serializer.save()
        
        # Find nearest available driver
        nearest_driver = self._find_nearest_driver(
            ride.pickup_lat,
            ride.pickup_lng
        )
        
        if nearest_driver:
            # Assign driver
            ride.driver = nearest_driver
            nearest_driver.is_available = False
            nearest_driver.save()
            ride.status = "ASSIGNED"
            ride.save()
            
            print(f" Sending to driver_{nearest_driver.id}")
            # Broadcast to the specific driver via WebSocket
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"driver_{nearest_driver.id}",  # Only assigned driver
                {
                    "type": "ride_update",
                    "ride": RideSerializer(ride).data,
                    }
            )
            print(f" Sent to driver_{nearest_driver.id}")
        else:
            # No driver available, keep in requested state
            send_websocket_update(
                ride.id,
                'no_driver',
                {'status': 'REQUESTED', 'message': 'No drivers available'}
            )
        return ride


    def _find_nearest_driver(self, pickup_lat, pickup_lng):
        """Find nearest available driver using Haversine"""
        available_drivers = DriverProfile.objects.filter(
            is_available=True,
            latitude__isnull=False,
            longitude__isnull=False
        )

        if not available_drivers.exists():
            return None

        nearest_driver = None
        min_distance = float('inf')

        for driver in available_drivers:
            distance = haversine(pickup_lat, pickup_lng, driver.latitude, driver.longitude)
            if distance < min_distance:
                min_distance = distance
                nearest_driver = driver

        return nearest_driver

    @action(detail=False, methods=['post'])
    def update_location(self, request):
        """Update driver location - return 200"""
        try:
            driver_profile = request.user.driver_profile
        except DriverProfile.DoesNotExist:
            return Response(
                get_standardized_response(
                    success=False,
                    message="Only drivers can update location",
                    status_code=403
                ),
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = DriverLocationSerializer(
            driver_profile,
            data=request.data,
            partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(
            get_standardized_response(
                success=True,
                message="Location updated successfully",
                data=DriverLocationSerializer(driver_profile).data,
                status_code=200
            ),
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def accept_ride(self, request, pk=None):
        """Driver accepts ride - return 200"""
        ride = self.get_object()

        # Verify driver
        try:
            driver_profile = request.user.driver_profile
        except:
            raise PermissionDenied("Only drivers can accept rides")

        # Validate ride state
        if ride.status != "ASSIGNED":
            raise ValidationError(
                f"Ride cannot be accepted. Current status: {ride.status}"
            )

        if ride.driver != driver_profile:
            raise PermissionDenied("This ride is not assigned to you")

        ride.status = "ACCEPTED"
        ride.save()

        send_websocket_update(
            ride.id,
            'ride_accepted',
            {'status': 'ACCEPTED'}
        )

        return Response(
            get_standardized_response(
                success=True,
                message="Ride accepted successfully",
                data=RideSerializer(ride).data,
                status_code=200
            ),
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def start_ride(self, request, pk=None):
        """Driver starts ride - return 200"""
        ride = self.get_object()

        try:
            driver_profile = request.user.driver_profile
        except:
            raise PermissionDenied("Only drivers can start rides")

        if ride.driver != driver_profile:
            raise PermissionDenied("This ride is not assigned to you")

        if ride.status != "ACCEPTED":
            raise ValidationError(
                f"Ride must be accepted first. Current status: {ride.status}"
            )

        ride.status = "IN_PROGRESS"
        ride.save()

        send_websocket_update(
            ride.id,
            'ride_started',
            {'status': 'IN_PROGRESS'}
        )

        return Response(
            get_standardized_response(
                success=True,
                message="Ride started successfully",
                data=RideSerializer(ride).data,
                status_code=200
            ),
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def complete_ride(self, request, pk=None):
        """Driver completes ride, calculate fare - return 200"""
        ride = self.get_object()

        try:
            driver_profile = request.user.driver_profile
        except:
            raise PermissionDenied("Only drivers can complete rides")

        if ride.driver != driver_profile:
            raise PermissionDenied("This ride is not assigned to you")

        if ride.status != "IN_PROGRESS":
            raise ValidationError(
                f"Ride must be in progress. Current status: {ride.status}"
            )

        # Calculate fare
        distance = haversine(
            ride.pickup_lat,
            ride.pickup_lng,
            ride.dropoff_lat,
            ride.dropoff_lng
        )
        amount = round(5.0 + (distance * 1.5), 2)

        # Update ride
        ride.status = "COMPLETED"
        ride.completed_at = timezone.now()
        ride.fare = amount
        ride.save()

        # Create payment
        payment = Payment.objects.create(
            ride=ride,
            amount=amount,
            payment_status="completed",
            paid_at=timezone.now()
        )

        # Free up driver
        driver_profile.is_available = True
        driver_profile.save()

        send_websocket_update(
            ride.id,
            'ride_completed',
            {
                'status': 'COMPLETED',
                'distance_km': round(distance, 2),
                'amount': amount
            }
        )

        response_data = RideSerializer(ride).data
        response_data['payment'] = PaymentSerializer(payment).data

        return Response(
            get_standardized_response(
                success=True,
                message="Ride completed successfully",
                data=response_data,
                status_code=200
            ),
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def cancel_ride(self, request, pk=None):
        """Cancel ride - return 200"""
        ride = self.get_object()
        user = request.user

        # Check authorization
        is_passenger = hasattr(user, 'passenger_profile') and ride.passenger == user.passenger_profile
        is_driver = hasattr(user, 'driver_profile') and ride.driver == user.driver_profile

        if not (is_passenger or is_driver):
            raise PermissionDenied("You are not authorized to cancel this ride")

        if ride.status in ["COMPLETED", "CANCELLED"]:
            raise ValidationError(
                f"Cannot cancel ride with status: {ride.status}"
            )

        ride.status = "CANCELLED"
        ride.save()

        # Free up driver if assigned
        if ride.driver:
            ride.driver.is_available = True
            ride.driver.save()

            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"driver_{ride.driver.id}",
                {
                    "type": "ride_update",
                    "ride": RideSerializer(ride).data
                }
            )

        send_websocket_update(
            ride.id,
            'ride_cancelled',
            {'status': 'CANCELLED'}
        )

        return Response(
            get_standardized_response(
                success=True,
                message="Ride cancelled successfully",
                data=RideSerializer(ride).data,
                status_code=200
            ),
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['get'])
    def earnings(self, request):
        """Get driver earnings - return 200"""
        try:
            driver_profile = request.user.driver_profile
        except:
            raise PermissionDenied("Only drivers can view earnings")

        completed_rides = Ride.objects.filter(
            driver=driver_profile,
            status="COMPLETED"
        )

        total_earnings = Payment.objects.filter(
            ride__in=completed_rides
        ).aggregate(total=models.Sum('amount'))['total'] or 0

        earnings_data = {
            "total_rides": completed_rides.count(),
            "total_earnings": round(total_earnings, 2),
            "average_per_ride": round(
                total_earnings / completed_rides.count() if completed_rides.count() > 0 else 0,
                2
            )
        }

        return Response(
            get_standardized_response(
                success=True,
                message="Earnings retrieved successfully",
                data=earnings_data,
                status_code=200
            ),
            status=status.HTTP_200_OK
        )


# ----------------------------
# Profile endpoints
# ----------------------------
class PassengerProfileView(generics.RetrieveUpdateAPIView):
    """GET/PUT /api/passengers/me/ - return 200"""
    authentication_classes = [JWTAuthentication]
    serializer_class = PassengerProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        try:
            return self.request.user.passenger_profile
        except PassengerProfile.DoesNotExist:
            raise NotFound("Passenger profile not found")

    def retrieve(self, request, *args, **kwargs):
        profile = self.get_object()
        serializer = self.get_serializer(profile)
        return Response(
            get_standardized_response(
                success=True,
                message="Passenger profile retrieved",
                data=serializer.data,
                status_code=200
            ),
            status=status.HTTP_200_OK
        )

    def update(self, request, *args, **kwargs):
        profile = self.get_object()
        serializer = self.get_serializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        return Response(
            get_standardized_response(
                success=True,
                message="Passenger profile updated",
                data=serializer.data,
                status_code=200
            ),
            status=status.HTTP_200_OK
        )


class DriverProfileView(generics.RetrieveUpdateAPIView):
    """GET/PUT /api/drivers/me/ - return 200"""
    authentication_classes = [JWTAuthentication]
    serializer_class = DriverProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        try:
            return self.request.user.driver_profile
        except DriverProfile.DoesNotExist:
            raise NotFound("Driver profile not found")

    def retrieve(self, request, *args, **kwargs):
        profile = self.get_object()
        serializer = self.get_serializer(profile)
        return Response(
            get_standardized_response(
                success=True,
                message="Driver profile retrieved",
                data=serializer.data,
                status_code=200
            ),
            status=status.HTTP_200_OK
        )

    def update(self, request, *args, **kwargs):
        profile = self.get_object()
        serializer = self.get_serializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        return Response(
            get_standardized_response(
                success=True,
                message="Driver profile updated",
                data=serializer.data,
                status_code=200
            ),
            status=status.HTTP_200_OK
        )


# ----------------------------
# Registration endpoints
# ----------------------------
class PassengerRegisterView(generics.CreateAPIView):
    """POST /api/register/passenger/ - return 201"""
    serializer_class = PassengerRegisterSerializer
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(
            get_standardized_response(
                success=True,
                message="Passenger registered successfully",
                data=serializer.data,
                status_code=201
            ),
            status=status.HTTP_201_CREATED
        )


class DriverRegisterView(generics.CreateAPIView):
    """POST /api/register/driver/ - return 201"""
    serializer_class = DriverRegisterSerializer
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(
            get_standardized_response(
                success=True,
                message="Driver registered successfully",
                data=serializer.data,
                status_code=201
            ),
            status=status.HTTP_201_CREATED
        )