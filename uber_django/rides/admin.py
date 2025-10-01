from django.contrib import admin
from .models import User, DriverProfile, PassengerProfile, Ride

admin.site.register(User)
admin.site.register(DriverProfile)
admin.site.register(PassengerProfile)
admin.site.register(Ride)
