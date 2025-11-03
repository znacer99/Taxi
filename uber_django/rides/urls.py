from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import (
    RideViewSet,
    PassengerRegisterView,
    DriverRegisterView,
    PassengerProfileView,
    DriverProfileView
)

router = DefaultRouter()
router.register(r'rides', RideViewSet, basename='ride')

urlpatterns = [
    # Router endpoints
    path('', include(router.urls)),

    # Auth endpoints
    # path('token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    # path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Registration endpoints (return 201)
    path('register/passenger/', PassengerRegisterView.as_view(), name='passenger_register'),
    path('register/driver/', DriverRegisterView.as_view(), name='driver_register'),

    # Profile endpoints (return 200)
    path('passengers/me/', PassengerProfileView.as_view(), name='passenger_profile'),
    path('drivers/me/', DriverProfileView.as_view(), name='driver_profile'),
]