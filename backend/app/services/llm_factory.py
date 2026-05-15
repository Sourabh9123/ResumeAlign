from abc import ABC, abstractmethod
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from app.core.config import settings

class BaseLLMProvider(ABC):
    @abstractmethod
    async def generate(self, prompt: str) -> str:
        pass

class OpenAIProvider(BaseLLMProvider):
    def __init__(self):
        self.llm = ChatOpenAI(api_key=settings.OPENAI_API_KEY, model="gpt-4o-mini")

    async def generate(self, prompt: str) -> str:
        response = await self.llm.ainvoke(prompt)
        return response.content

class AnthropicProvider(BaseLLMProvider):
    def __init__(self):
        self.llm = ChatAnthropic(api_key=settings.ANTHROPIC_API_KEY, model="claude-3-haiku-20240307")
        
    async def generate(self, prompt: str) -> str:
        response = await self.llm.ainvoke(prompt)
        return response.content

class LLMProviderFactory:
    @staticmethod
    def create(provider_name: str = None) -> BaseLLMProvider:
        name = provider_name or settings.DEFAULT_AI_PROVIDER
        if name == "openai":
            return OpenAIProvider()
        elif name == "anthropic":
            return AnthropicProvider()
        else:
            raise ValueError(f"Unsupported AI provider: {name}")
