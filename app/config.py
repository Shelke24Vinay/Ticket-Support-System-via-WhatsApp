import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./tickets.db")
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "9a15f013d7e82b3a882cb75e3be5b07fb8d7f76326e5e8e8fb45a2786a32a6bc")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

settings = Settings()
