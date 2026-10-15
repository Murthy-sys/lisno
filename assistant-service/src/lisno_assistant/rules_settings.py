"""Configuration for the standalone, model-free rules process."""
from dataclasses import dataclass, field
import os
import re


@dataclass(frozen=True)
class RulesSettings:
    service_token: str = field(repr=False)
    port: int = 8080
    request_timeout_ms: int = 19_000

    def __post_init__(self):
        if not re.fullmatch(r"[!-~]{32,512}", self.service_token):
            raise ValueError("A server-only assistant token of 32 to 512 ASCII characters is required")
        if type(self.port) is not int or not 1024 <= self.port <= 65535:
            raise ValueError("Invalid rules-service port")
        if type(self.request_timeout_ms) is not int or not 100 <= self.request_timeout_ms <= 19_000:
            raise ValueError("Invalid rules-service timeout")

    @classmethod
    def from_env(cls):
        try:
            port = int(os.environ.get("ASSISTANT_RULES_PORT", "8080"))
            timeout_ms = int(os.environ.get("ASSISTANT_REQUEST_TIMEOUT_MS", "19000"))
        except ValueError:
            raise ValueError("Invalid rules-service bounds") from None
        return cls(
            service_token=os.environ.get("ASSISTANT_SERVICE_TOKEN", ""),
            port=port,
            request_timeout_ms=timeout_ms,
        )
