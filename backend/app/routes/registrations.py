import csv
import io
import secrets
from datetime import datetime

from flask import Blueprint, Response, jsonify
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models import Event, Registration
from ..utils import current_user, notify, qr_png_response, role_required

registrations_bp = Blueprint("registrations", __name__)


@registrations_bp.post("/events/<int:event_id>/register")
@role_required("student")
def register_for_event(event_id):
    event = Event.query.get_or_404(event_id)
    user = current_user()
    now = datetime.utcnow()

    if event.status != "published":
        return jsonify({"error": "This event is not open for registration"}), 400
    if event.event_date < now:
        return jsonify({"error": "This event has already taken place"}), 400
    if event.registration_deadline and event.registration_deadline < now:
        return jsonify({"error": "Registration deadline has passed"}), 400

    existing = Registration.query.filter_by(user_id=user.user_id, event_id=event.event_id).first()
    if existing:
        return jsonify({"error": "You are already registered", "registration": existing.to_dict()}), 409
    if event.registered_count() >= event.capacity:
        return jsonify({"error": "This event is at full capacity"}), 409

    registration = Registration(
        user_id=user.user_id,
        event_id=event.event_id,
        qr_token=secrets.token_urlsafe(32),
        status="confirmed",
    )
    db.session.add(registration)
    notify(
        user.user_id,
        f'You are registered for "{event.event_name}". Your ticket is ready.',
        "registration",
    )
    notify(
        event.organizer_id,
        f'{user.name} registered for "{event.event_name}".',
        "registration",
    )
    db.session.commit()
    return jsonify(registration.to_dict(include_event=True)), 201


@registrations_bp.get("/registrations/me")
@jwt_required()
def my_registrations():
    user = current_user()
    rows = (
        Registration.query.filter_by(user_id=user.user_id)
        .order_by(Registration.registration_date.desc())
        .all()
    )
    return jsonify([row.to_dict(include_event=True) for row in rows])


@registrations_bp.get("/registrations/<int:registration_id>")
@jwt_required()
def get_registration(registration_id):
    registration = Registration.query.get_or_404(registration_id)
    user = current_user()
    if user.role == "student" and registration.user_id != user.user_id:
        return jsonify({"error": "Not authorized"}), 403
    if user.role == "organizer" and registration.event.organizer_id != user.user_id:
        return jsonify({"error": "Not authorized"}), 403
    return jsonify(registration.to_dict(include_event=True, include_user=True))


@registrations_bp.get("/registrations/<int:registration_id>/qr")
@jwt_required()
def registration_qr(registration_id):
    registration = Registration.query.get_or_404(registration_id)
    user = current_user()
    allowed = (
        registration.user_id == user.user_id
        or user.role == "admin"
        or (user.role == "organizer" and registration.event.organizer_id == user.user_id)
    )
    if not allowed:
        return jsonify({"error": "Not authorized"}), 403
    return qr_png_response(registration.qr_token)


@registrations_bp.post("/registrations/<int:registration_id>/cancel")
@role_required("student")
def cancel_registration(registration_id):
    registration = Registration.query.get_or_404(registration_id)
    user = current_user()
    if registration.user_id != user.user_id:
        return jsonify({"error": "Not authorized"}), 403
    if registration.attendance:
        return jsonify({"error": "Attendance already recorded"}), 400
    if registration.event.event_date < datetime.utcnow():
        return jsonify({"error": "Cannot cancel after the event date"}), 400
    registration.status = "cancelled"
    db.session.delete(registration)
    notify(user.user_id, f'Registration cancelled for "{registration.event.event_name}".', "registration")
    db.session.commit()
    return jsonify({"message": "Registration cancelled"})


@registrations_bp.get("/events/<int:event_id>/participants.csv")
@role_required("organizer", "admin")
def participants_csv(event_id):
    event = Event.query.get_or_404(event_id)
    user = current_user()
    if user.role != "admin" and event.organizer_id != user.user_id:
        return jsonify({"error": "Not authorized"}), 403

    rows = Registration.query.filter_by(event_id=event_id).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        ["Registration ID", "Name", "Email", "Department", "Status", "Registered At", "Attended", "Check-in"]
    )
    for row in rows:
        writer.writerow(
            [
                row.registration_id,
                row.student.name,
                row.student.email,
                row.student.department or "",
                row.status,
                row.registration_date.isoformat() if row.registration_date else "",
                "yes" if row.attendance else "no",
                row.attendance.checkin_time.isoformat() if row.attendance else "",
            ]
        )
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename=event-{event_id}-participants.csv"},
    )
