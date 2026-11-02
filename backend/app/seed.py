from datetime import datetime, timedelta

from .extensions import bcrypt, db
from .models import Attendance, Event, Notification, Registration, User
import secrets


def seed_demo_data():
    if User.query.filter_by(email="admin@campusconnect.edu").first():
        return

    def make_user(name, email, role, department, password="Campus@123"):
        return User(
            name=name,
            email=email,
            password_hash=bcrypt.generate_password_hash(password).decode("utf-8"),
            role=role,
            department=department,
            year_of_study="III" if role == "student" else None,
        )

    admin = make_user("Campus Admin", "admin@campusconnect.edu", "admin", "Administration", "Admin@123")
    organizer = make_user("Priya Sharma", "organizer@campusconnect.edu", "organizer", "Computer Science")
    organizer2 = make_user("Rahul Mehta", "cultural@campusconnect.edu", "organizer", "Student Affairs")
    student = make_user("Ananya Iyer", "student@campusconnect.edu", "student", "Computer Science")
    student2 = make_user("Arjun Patel", "arjun@campusconnect.edu", "student", "Electronics")
    student3 = make_user("Meera Nair", "meera@campusconnect.edu", "student", "Mechanical")
    db.session.add_all([admin, organizer, organizer2, student, student2, student3])
    db.session.flush()

    now = datetime.utcnow()
    events = [
        Event(
            event_name="Cloud Native Hackathon",
            description="A 24-hour campus hackathon focused on cloud-native applications, containers and AWS services. Teams of 2–4 build a deployable prototype.",
            organizer_id=organizer.user_id,
            event_date=now + timedelta(days=12, hours=4),
            registration_deadline=now + timedelta(days=10),
            venue="Innovation Lab, Block C",
            capacity=80,
            category="Hackathon",
            eligibility="UG and PG students from all departments",
            status="published",
        ),
        Event(
            event_name="Guest Lecture: Careers in Cloud Computing",
            description="Industry practitioners discuss IAM, managed databases, observability and how campus projects map to real cloud roles.",
            organizer_id=organizer.user_id,
            event_date=now + timedelta(days=5, hours=2),
            registration_deadline=now + timedelta(days=4),
            venue="Seminar Hall 2",
            capacity=120,
            category="Seminar",
            eligibility="Open to all students",
            status="published",
        ),
        Event(
            event_name="Inter-Department Cricket Finals",
            description="Season-ending cricket final with live scoring, student commentary and food stalls around the ground.",
            organizer_id=organizer2.user_id,
            event_date=now + timedelta(days=8),
            registration_deadline=now + timedelta(days=6),
            venue="Main Sports Ground",
            capacity=200,
            category="Sports",
            eligibility="Department team members and spectators",
            status="published",
        ),
        Event(
            event_name="Classical Night",
            description="An evening of music and dance performances organized by the cultural committee. Seating is limited.",
            organizer_id=organizer2.user_id,
            event_date=now + timedelta(days=18),
            registration_deadline=now + timedelta(days=15),
            venue="Open Air Theatre",
            capacity=150,
            category="Cultural",
            eligibility="Open to all students and faculty",
            status="pending",
        ),
        Event(
            event_name="Docker & Kubernetes Workshop",
            description="Hands-on lab covering Dockerfiles, Compose, image registries and a simple Kubernetes deployment on a demo cluster.",
            organizer_id=organizer.user_id,
            event_date=now + timedelta(days=3),
            registration_deadline=now + timedelta(days=2),
            venue="CS Lab 1",
            capacity=40,
            category="Workshop",
            eligibility="CS / IT / ECE students",
            status="published",
        ),
    ]
    db.session.add_all(events)
    db.session.flush()

    def register(user, event, attended=False):
        row = Registration(
            user_id=user.user_id,
            event_id=event.event_id,
            qr_token=secrets.token_urlsafe(32),
            status="attended" if attended else "confirmed",
        )
        db.session.add(row)
        db.session.flush()
        if attended:
            db.session.add(
                Attendance(
                    registration_id=row.registration_id,
                    marked_by=event.organizer_id,
                    attendance_status="present",
                )
            )
        return row

    register(student, events[1])
    register(student, events[4])
    register(student2, events[0])
    register(student2, events[1])
    register(student3, events[2])

    db.session.add(
        Notification(
            user_id=student.user_id,
            message='You are registered for "Guest Lecture: Careers in Cloud Computing". Your ticket is ready.',
            notification_type="registration",
        )
    )
    db.session.add(
        Notification(
            user_id=organizer.user_id,
            message='Submit "Classical Night" is awaiting admin review from the cultural committee.',
            notification_type="event",
        )
    )
    db.session.commit()
