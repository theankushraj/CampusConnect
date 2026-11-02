import pytest

from app import create_app
from app.extensions import db


@pytest.fixture()
def client():
    app = create_app("testing")
    with app.app_context():
        db.create_all()
        yield app.test_client()
        db.session.remove()
        db.drop_all()


def auth_header(client, email, password, name="Test User", role="student"):
    client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": password, "role": role, "department": "CS"},
    )
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    token = response.get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"


def test_register_and_login(client):
    created = client.post(
        "/api/auth/register",
        json={
            "name": "Student One",
            "email": "one@campus.edu",
            "password": "Password1",
            "role": "student",
        },
    )
    assert created.status_code == 201
    login = client.post("/api/auth/login", json={"email": "one@campus.edu", "password": "Password1"})
    assert login.status_code == 200
    assert "access_token" in login.get_json()


def test_event_capacity_and_duplicate_registration(client):
    organizer = auth_header(client, "org@campus.edu", "Password1", "Org", "organizer")
    student_a = auth_header(client, "a@campus.edu", "Password1", "Student A")
    student_b = auth_header(client, "b@campus.edu", "Password1", "Student B")
    admin = auth_header(client, "admin@campus.edu", "Password1", "Admin", "organizer")

    # Promote last organizer-created user is not admin; create event then publish via SQL-free path:
    # organizers create pending events. For the test, insert as published by using admin role after patch.
    from app.models import User

    with client.application.app_context():
        user = User.query.filter_by(email="admin@campus.edu").first()
        user.role = "admin"
        db.session.commit()

    admin_login = client.post("/api/auth/login", json={"email": "admin@campus.edu", "password": "Password1"})
    admin_headers = {"Authorization": f"Bearer {admin_login.get_json()['access_token']}"}

    created = client.post(
        "/api/events",
        headers=organizer,
        json={
            "event_name": "Tiny Workshop",
            "description": "A short workshop used for capacity testing.",
            "event_date": "2030-01-01T10:00:00",
            "venue": "Lab 1",
            "capacity": 1,
            "category": "Workshop",
            "eligibility": "All",
        },
    )
    event_id = created.get_json()["event_id"]
    client.post(f"/api/admin/events/{event_id}/approve", headers=admin_headers)

    first = client.post(f"/api/events/{event_id}/register", headers=student_a)
    assert first.status_code == 201
    duplicate = client.post(f"/api/events/{event_id}/register", headers=student_a)
    assert duplicate.status_code == 409
    full = client.post(f"/api/events/{event_id}/register", headers=student_b)
    assert full.status_code == 409


def test_qr_checkin_prevents_duplicates(client):
    organizer = auth_header(client, "org2@campus.edu", "Password1", "Org Two", "organizer")
    student = auth_header(client, "stu@campus.edu", "Password1", "Student")

    from app.models import User

    with client.application.app_context():
        user = User.query.filter_by(email="org2@campus.edu").first()
        user.role = "admin"
        db.session.commit()
    admin_login = client.post("/api/auth/login", json={"email": "org2@campus.edu", "password": "Password1"})
    admin_headers = {"Authorization": f"Bearer {admin_login.get_json()['access_token']}"}

    created = client.post(
        "/api/events",
        headers=organizer,
        json={
            "event_name": "Check-in Drill",
            "description": "Used to verify QR attendance validation.",
            "event_date": "2030-02-01T10:00:00",
            "venue": "Atrium",
            "capacity": 10,
            "category": "General",
        },
    )
    event_id = created.get_json()["event_id"]
    client.post(f"/api/admin/events/{event_id}/approve", headers=admin_headers)
    registration = client.post(f"/api/events/{event_id}/register", headers=student).get_json()

    first = client.post("/api/attendance/checkin", headers=organizer, json={"qr_token": registration["qr_token"]})
    assert first.status_code == 200
    second = client.post("/api/attendance/checkin", headers=organizer, json={"qr_token": registration["qr_token"]})
    assert second.status_code == 409
