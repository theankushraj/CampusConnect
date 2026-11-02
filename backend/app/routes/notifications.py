from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models import Notification
from ..utils import current_user

notifications_bp = Blueprint("notifications", __name__)


@notifications_bp.get("")
@jwt_required()
def list_notifications():
    user = current_user()
    rows = (
        Notification.query.filter_by(user_id=user.user_id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    unread = Notification.query.filter_by(user_id=user.user_id, is_read=False).count()
    return jsonify({"unread": unread, "items": [row.to_dict() for row in rows]})


@notifications_bp.post("/<int:notification_id>/read")
@jwt_required()
def mark_read(notification_id):
    user = current_user()
    item = Notification.query.get_or_404(notification_id)
    if item.user_id != user.user_id:
        return jsonify({"error": "Not authorized"}), 403
    item.is_read = True
    db.session.commit()
    return jsonify(item.to_dict())


@notifications_bp.post("/read-all")
@jwt_required()
def mark_all_read():
    user = current_user()
    Notification.query.filter_by(user_id=user.user_id, is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify({"message": "All notifications marked as read"})
