from __future__ import annotations

import os

from providers.openai_provider import OpenAIProvider


class OpenRouterProvider(OpenAIProvider):
    """OpenRouter uses an OpenAI-compatible Chat Completions surface."""

    def __init__(self) -> None:
        api_key_env = "OPENROUTER_API_KEY" if os.getenv("OPENROUTER_API_KEY") else "OPENAI_API_KEY"
        base_url = os.getenv("OPENROUTER_BASE_URL") or os.getenv("OPENAI_BASE_URL") or "https://openrouter.ai/api/v1"
        default_model = os.getenv("LLM_MODEL") or "openai/gpt-4o-mini"
        super().__init__(
            api_key_env=api_key_env,
            base_url=base_url,
            default_model=default_model,
        )

