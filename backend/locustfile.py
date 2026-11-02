"""
Locust load tests for CampusConnect.
Run from the backend directory:
  locust -f locustfile.py --host http://localhost:5001
  # Docker Compose API: --host http://localhost:5000
"""

from locust import HttpUser, between, task


class StudentUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        response = self.client.post(
            "/api/auth/login",
            json={"email": "student@campusconnect.edu", "password": "Campus@123"},
        )
        if response.status_code == 200:
            token = response.json()["access_token"]
            self.client.headers.update({"Authorization": f"Bearer {token}"})

    @task(4)
    def list_events(self):
        self.client.get("/api/events")

    @task(2)
    def health(self):
        self.client.get("/api/health")

    @task(2)
    def my_registrations(self):
        self.client.get("/api/registrations/me")

    @task(1)
    def analytics(self):
        self.client.get("/api/analytics/overview")

    @task(1)
    def notifications(self):
        self.client.get("/api/notifications")
