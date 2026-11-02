from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models import Attendance, Registration
from ..utils import current_user, notify, role_required

attendance_bp = Blueprint("attendance", __name__)


@attendance_bp.post("/checkin")
@role_required("organizer", "admin")
def checkin():
    payload = request.get_json() or {}
    token = (payload.get("qr_token") or "").strip()
    if not token:
        return jsonify({"error": "QR token is required"}), 400

    registration = Registration.query.filter_by(qr_token=token).first()
    if not registration:
        return jsonify({"error": "Invalid ticket", "valid": False}), 404

    user = current_user()
    if user.role == "organizer" and registration.event.organizer_id != user.user_id:
        return jsonify({"error": "This ticket does not belong to one of your events"}), 403

    if registration.attendance:
        return jsonify(
            {
                "error": "Attendance already recorded",
                "duplicate": True,
                "valid": True,
                "registration": registration.to_dict(include_event=True, include_user=True),
                "attendance": registration.attendance.to_dict(),
            }
        ), 409

    if registration.status != "confirmed":
        return jsonify({"error": "This registration is not active", "valid": False}), 400

    attendance = Attendance(
        registration_id=registration.registration_id,
        marked_by=user.user_id,
        attendance_status="present",
    )
    registration.status = "attended"
    db.session.add(attendance)
    notify(
        registration.user_id,
        f'Check-in confirmed for "{registration.event.event_name}".',
        "attendance",
    )
    db.session.commit()
    return jsonify(
        {
            "valid": True,
            "message": "Attendance recorded",
            "registration": registration.to_dict(include_event=True, include_user=True),
            "attendance": attendance.to_dict(),
        }
    )


@attendance_bp.get("/event/<int:event_id>")
@role_required("organizer", "admin")
def event_attendance(event_id):
    from ..models import Event

    event = Event.query.get_or_404(event_id)
    user = current_user()
    if user.role == "organizer" and event.organizer_id != user.user_id:
        return jsonify({"error": "Not authorized"}), 403
    records = (
        Attendance.query.join(Registration)
        .filter(Registration.event_id == event_id)
        .all()
    )
    return jsonify([record.to_dict() for record in records])
