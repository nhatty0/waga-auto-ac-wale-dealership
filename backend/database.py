import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

env_path = BASE_DIR / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./ac_wale_cars.db").strip().strip("\"'")

# Handles SQLite vs PostgreSQL connection flags cleanly
# Strictly ensures that SQLite databases resolve to the backend folder regardless of working directory
if DATABASE_URL.startswith("sqlite:///./") or DATABASE_URL == "sqlite:///./ac_wale_cars.db":
    db_filename = DATABASE_URL.replace("sqlite:///./", "")
    db_file_path = (BASE_DIR / db_filename).resolve()
    engine = create_engine(f"sqlite:///{db_file_path.as_posix()}", connect_args={"check_same_thread": False})
elif DATABASE_URL.startswith("sqlite:///"):
    # If a relative SQLite path like sqlite:///ac_wale_cars.db was given
    sub_path = DATABASE_URL[len("sqlite:///"):]
    if not (":" in sub_path or sub_path.startswith("/") or sub_path.startswith("\\")):
        db_file_path = (BASE_DIR / sub_path).resolve()
        engine = create_engine(f"sqlite:///{db_file_path.as_posix()}", connect_args={"check_same_thread": False})
    else:
        engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
elif DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL)

if engine.dialect.name == "sqlite":
    # Shared hosting (Passenger) may run several worker processes against one SQLite file.
    # WAL mode + a busy timeout prevents "database is locked" errors under concurrent writes.
    from sqlalchemy import event

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
