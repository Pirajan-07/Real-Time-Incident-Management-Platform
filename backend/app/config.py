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

    # Comma-separated list of allowed CORS origins (the deployed frontend's
    # URL(s) go here in production; defaults to the local Vite dev server).
    cors_origins: str = "http://localhost:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


# Singleton instance used throughout the app
settings = Settings()
