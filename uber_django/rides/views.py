from rest_framework import viewsets, permissions
from .models import Ride
from .serializers import RideSerializer

class RideViewSet(viewsets.ModelViewSet):
    queryset = Ride.objects.all()
    serializer_class = RideSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        passenger_profile = self.request.user.passenger_profile
        serializer.save(passenger=passenger_profile)
