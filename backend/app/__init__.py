import os

from flask import Flask, jsonify
from flask_cors import CORS

from .config import get_config
from .extensions import bcrypt, db, jwt
from .models import Attendance, Event, Notification, Registration, User  # noqa: F401


def create_app(config_name=None):
    app = Flask(__name__)
    app.config.from_object(get_config(config_name))

    os.makedirs(app.config["UPLOAD_DIR"], exist_ok=True)

    CORS(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=True,
    )
    db.init_app(app)
    jwt.init_app(app)
    bcrypt.init_app(app)

    from .routes.admin import admin_bp
    from .routes.analytics import analytics_bp
    from .routes.attendance import attendance_bp
    from .routes.auth import auth_bp
    from .routes.events import events_bp
    from .routes.health import health_bp
    from .routes.notifications import notifications_bp
    from .routes.registrations import registrations_bp

    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(events_bp, url_prefix="/api/events")
    app.register_blueprint(registrations_bp, url_prefix="/api")
    app.register_blueprint(attendance_bp, url_prefix="/api/attendance")
    app.register_blueprint(analytics_bp, url_prefix="/api/analytics")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(notifications_bp, url_prefix="/api/notifications")

    @app.errorhandler(400)
    def bad_request(err):
        return jsonify({"error": getattr(err, "description", "Bad request")}), 400

    @app.errorhandler(401)
    def unauthorized(err):
        return jsonify({"error": getattr(err, "description", "Unauthorized")}), 401

    @app.errorhandler(403)
    def forbidden(err):
        return jsonify({"error": getattr(err, "description", "Forbidden")}), 403

    @app.errorhandler(404)
    def not_found(err):
        return jsonify({"error": getattr(err, "description", "Not found")}), 404

    @jwt.invalid_token_loader
    def invalid_token(_reason):
        return jsonify({"error": "Invalid authentication token"}), 401

    @jwt.unauthorized_loader
    def missing_token(_reason):
        return jsonify({"error": "Authorization required"}), 401

    @jwt.expired_token_loader
    def expired_token(_header, _payload):
        return jsonify({"error": "Token has expired"}), 401

    with app.app_context():
        db.create_all()
        if app.config.get("SEED_DEMO_DATA"):
            from .seed import seed_demo_data

            seed_demo_data()

    return app
