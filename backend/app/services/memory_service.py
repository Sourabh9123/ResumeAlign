import json
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from langchain_openai import OpenAIEmbeddings
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import logger
from app.models.agent_memory import AgentMemory
from app.services.cache import RedisCache


class MemoryService:
    """Service to handle agent long-term memory operations."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.cache = RedisCache(namespace="agent_memory")
        # Ensure we have an API key for embeddings
        if settings.OPENAI_API_KEY:
            self.embeddings = OpenAIEmbeddings(
                api_key=settings.OPENAI_API_KEY, 
                model="text-embedding-3-small"
            )
        else:
            self.embeddings = None
            logger.warning("OPENAI_API_KEY not found. Semantic search might be degraded.")

    async def add(
        self,
        user_id: str | UUID,
        category: str,
        key: str,
        value: str,
        importance: str = "Low",
        source: Optional[str] = "Conversation",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AgentMemory:
        """Add a new memory for a user."""
        try:
            if isinstance(user_id, str):
                user_id = UUID(user_id)

            embedding = None
            if self.embeddings:
                # Create embedding representing the memory statement
                text_to_embed = f"{category} - {key}: {value}"
                embedding = await self.embeddings.aembed_query(text_to_embed)

            new_memory = AgentMemory(
                user_id=user_id,
                category=category,
                key=key,
                value=value,
                importance=importance,
                source=source,
                embedding=embedding,
                metadata_json=metadata or {},
            )
            self.db.add(new_memory)
            await self.db.commit()
            await self.db.refresh(new_memory)

            # Clear user list cache
            await self._clear_user_cache(user_id)
            return new_memory

        except Exception as e:
            await self.db.rollback()
            logger.error(f"Failed to add agent memory: {e}", exc_info=True)
            raise e

    async def list_memories(self, user_id: str | UUID, category: Optional[str] = None) -> List[AgentMemory]:
        """List all memories for a user, optionally filtered by category."""
        if isinstance(user_id, str):
            user_id = UUID(user_id)
            
        cache_key = f"{user_id}:{category}" if category else str(user_id)
        cached_data = await self.cache.get_json(cache_key)
        
        if cached_data:
            # Reconstruct slightly basic representation if we wanted to return dicts,
            # but we need SQLAlchemy models. Let's just bypass cache for SQLAlchemy models, 
            # or return dicts. We'll fetch from DB directly for true models.
            pass

        query = select(AgentMemory).where(AgentMemory.user_id == user_id)
        if category:
            query = query.where(AgentMemory.category == category)
            
        query = query.order_by(AgentMemory.updated_at.desc())
        
        result = await self.db.execute(query)
        memories = result.scalars().all()
        return list(memories)

    async def search(self, user_id: str | UUID, query: str, limit: int = 5) -> List[AgentMemory]:
        """Search memories semantically using vector similarity."""
        if not self.embeddings:
            logger.warning("Embeddings not configured, falling back to simple ILIKE search.")
            # Fallback to simple ILIKE search if pgvector/embeddings aren't ready
            if isinstance(user_id, str):
                user_id = UUID(user_id)
            stmt = select(AgentMemory).where(
                AgentMemory.user_id == user_id,
                AgentMemory.value.ilike(f"%{query}%")
            ).limit(limit)
            result = await self.db.execute(stmt)
            return list(result.scalars().all())

        if isinstance(user_id, str):
            user_id = UUID(user_id)

        try:
            query_embedding = await self.embeddings.aembed_query(query)
            # Using pgvector cosine distance: <-> (L2), <#> (inner product), <=> (cosine)
            # Higher cosine similarity = lower cosine distance
            stmt = (
                select(AgentMemory)
                .where(AgentMemory.user_id == user_id)
                .order_by(AgentMemory.embedding.cosine_distance(query_embedding))
                .limit(limit)
            )
            
            result = await self.db.execute(stmt)
            memories = result.scalars().all()
            
            # Update last_accessed_at
            if memories:
                memory_ids = [m.id for m in memories]
                update_stmt = (
                    update(AgentMemory)
                    .where(AgentMemory.id.in_(memory_ids))
                    .values(last_accessed_at=datetime.utcnow())
                )
                await self.db.execute(update_stmt)
                await self.db.commit()

            return list(memories)
        except Exception as e:
            logger.error(f"Semantic search failed: {e}", exc_info=True)
            return []

    async def update(
        self,
        memory_id: str | UUID,
        value: Optional[str] = None,
        importance: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[AgentMemory]:
        """Update an existing memory."""
        if isinstance(memory_id, str):
            memory_id = UUID(memory_id)

        try:
            result = await self.db.execute(select(AgentMemory).where(AgentMemory.id == memory_id))
            memory = result.scalars().first()

            if not memory:
                return None

            if value is not None:
                memory.value = value
                if self.embeddings:
                    text_to_embed = f"{memory.category} - {memory.key}: {value}"
                    memory.embedding = await self.embeddings.aembed_query(text_to_embed)
                    
            if importance is not None:
                memory.importance = importance
            if metadata is not None:
                # Merge existing metadata
                current_metadata = memory.metadata_json or {}
                current_metadata.update(metadata)
                memory.metadata_json = current_metadata

            await self.db.commit()
            await self.db.refresh(memory)
            await self._clear_user_cache(memory.user_id)
            
            return memory
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Failed to update agent memory: {e}", exc_info=True)
            raise e

    async def delete(self, memory_id: str | UUID) -> bool:
        """Delete a memory by its ID."""
        if isinstance(memory_id, str):
            memory_id = UUID(memory_id)
            
        try:
            result = await self.db.execute(select(AgentMemory).where(AgentMemory.id == memory_id))
            memory = result.scalars().first()
            if not memory:
                return False
                
            user_id = memory.user_id
            
            await self.db.execute(delete(AgentMemory).where(AgentMemory.id == memory_id))
            await self.db.commit()
            
            await self._clear_user_cache(user_id)
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Failed to delete agent memory: {e}", exc_info=True)
            raise e
            
    async def _clear_user_cache(self, user_id: UUID) -> None:
        """Helper to clear cached memories for a user."""
        pass  # Implementation for cache invalidation if needed
