from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    # Database
    database_url: str

    # Redis
    redis_url: str

    # Authentication
    ingestion_api_key: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    admin_email: str
    admin_password_hash: str

    # External integrations
    llm_api_key: str
    slack_webhook_url: str

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


# Singleton instance used throughout the app
settings = Settings()
