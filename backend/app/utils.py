from functools import wraps
from io import BytesIO

import qrcode
from flask import abort, send_file
from flask_jwt_extended import get_jwt, get_jwt_identity, verify_jwt_in_request

from .extensions import db
from .models import Notification, User


def current_user():
    user_id = get_jwt_identity()
    if user_id is None:
        return None
    return db.session.get(User, int(user_id))


def role_required(*roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            if claims.get("role") not in roles:
                abort(403, description="You do not have permission for this action")
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def notify(user_id, message, notification_type="info"):
    item = Notification(
        user_id=user_id, message=message, notification_type=notification_type
    )
    db.session.add(item)
    return item


def qr_png_response(token, box_size=8):
    image = qrcode.make(token, box_size=box_size, border=2)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return send_file(buffer, mimetype="image/png")
