import os
from datetime import timedelta

from dotenv import load_dotenv

load_dotenv()


class BaseConfig:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-jwt-secret")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=12)
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "mysql+pymysql://campus:campus@127.0.0.1:3306/campusconnect",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True, "pool_recycle": 280}
    CORS_ORIGINS = os.getenv("FRONTEND_URL", "http://localhost:3000").split(",")
    UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.getcwd(), "uploads"))
    MAX_CONTENT_LENGTH = 8 * 1024 * 1024
    USE_S3 = os.getenv("USE_S3", "false").lower() == "true"
    AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")
    AWS_S3_BUCKET = os.getenv("AWS_S3_BUCKET", "")
    SEED_DEMO_DATA = os.getenv("SEED_DEMO_DATA", "true").lower() == "true"
    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@campusconnect.edu")
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin@123")


class DevelopmentConfig(BaseConfig):
    DEBUG = True


class ProductionConfig(BaseConfig):
    DEBUG = False
    SEED_DEMO_DATA = os.getenv("SEED_DEMO_DATA", "false").lower() == "true"


class TestingConfig(BaseConfig):
    TESTING = True
    SECRET_KEY = "testing-secret-key-32-characters-min"
    JWT_SECRET_KEY = "testing-jwt-secret-key-32-chars-min"
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SEED_DEMO_DATA = False


def get_config(name=None):
    env = name or os.getenv("FLASK_ENV", "development")
    mapping = {
        "development": DevelopmentConfig,
        "production": ProductionConfig,
        "testing": TestingConfig,
    }
    return mapping.get(env, DevelopmentConfig)
