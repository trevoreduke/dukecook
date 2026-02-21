"""Database engine, session, and base model configuration."""

import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

logger = logging.getLogger("dukecook.database")

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """Dependency that yields a database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db():
    """Create all tables."""
    logger.info("Initializing database tables")
    async with engine.begin() as conn:
        from app.models import (
            User, Recipe, Ingredient, RecipeIngredient, RecipeStep,
            Tag, RecipeTag, Rating, MealPlan, DietaryRule,
            SwipeSession, SwipeCard, SwipeMatch,
            TasteProfile, TastePreference, CookingHistory,
            ShoppingList, ShoppingItem, PantryStaple,
            CalendarEvent, ImportLog, KrogerToken,
            GuestMenu, GuestMenuItem, GuestVote, MenuView, RecipePhoto,
        )
        await conn.run_sync(Base.metadata.create_all)

    # Run each migration in its own transaction — PostgreSQL aborts the
    # entire transaction on any error, so a "column already exists" failure
    # would poison subsequent ALTER TABLEs if they share a transaction.
    migrations = [
        "ALTER TABLE guest_votes ADD COLUMN comment TEXT DEFAULT ''",
        "ALTER TABLE guest_menu_items ADD COLUMN subtext TEXT DEFAULT ''",
    ]
    for sql in migrations:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(sql))
                logger.info("Migration applied: %s", sql)
        except Exception:
            pass  # Column already exists
    logger.info("Database tables ready")
