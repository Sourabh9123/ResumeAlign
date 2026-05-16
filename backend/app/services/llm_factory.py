from abc import ABC, abstractmethod
from typing import Optional

from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI

from app.core.config import settings
from app.core.logging import logger


class BaseLLMProvider(ABC):
    """Common interface implemented by all LLM providers."""

    @abstractmethod
    async def generate(self, prompt: str) -> str:
        """Generate text for a prompt using the concrete provider."""
        pass


class OpenAIProvider(BaseLLMProvider):
    """LLM provider implementation backed by OpenAI chat models."""

    def __init__(self):
        """Initialize the OpenAI chat client from application settings."""
        self.llm = ChatOpenAI(api_key=settings.OPENAI_API_KEY, model=settings.OPENAI_MODEL)

    async def generate(self, prompt: str) -> str:
        """Generate a response from the configured OpenAI model."""
        try:
            response = await self.llm.ainvoke(prompt)
            return response.content
        except Exception as e:
            logger.error(f"OpenAI generation failed: {str(e)}", exc_info=True)
            raise Exception("AI generation failed with OpenAI")


class AnthropicProvider(BaseLLMProvider):
    """LLM provider implementation backed by Anthropic chat models."""

    def __init__(self):
        """Initialize the Anthropic chat client from application settings."""
        self.llm = ChatAnthropic(api_key=settings.ANTHROPIC_API_KEY, model=settings.ANTHROPIC_MODEL)

    async def generate(self, prompt: str) -> str:
        """Generate a response from the configured Anthropic model."""
        try:
            response = await self.llm.ainvoke(prompt)
            return response.content
        except Exception as e:
            logger.error(f"Anthropic generation failed: {str(e)}", exc_info=True)
            raise Exception("AI generation failed with Anthropic")


class LLMProviderFactory:
    """Factory for creating configured LLM provider instances."""

    @staticmethod
    def create(provider_name: Optional[str] = None) -> BaseLLMProvider:
        """Return an LLM provider by name or the configured default provider."""
        name = provider_name or settings.DEFAULT_AI_PROVIDER
        try:
            if name == "openai":
                return OpenAIProvider()
            elif name == "anthropic":
                return AnthropicProvider()
            else:
                raise ValueError(f"Unsupported AI provider: {name}")
        except Exception as e:
            logger.error(f"Failed to create LLM provider {name}: {str(e)}", exc_info=True)
            raise ValueError(f"Could not initialize AI provider: {name}")
