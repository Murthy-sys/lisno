from dataclasses import dataclass, field
from ipaddress import ip_address, ip_network
import os
import re
from urllib.parse import urlsplit

_PRIVATE = [ip_network(cidr) for cidr in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7")]


def validate_model_url(value: str) -> str:
    try:
        url = urlsplit(value)
        address = ip_address(url.hostname or "")
        if url.username or url.password or url.query or url.fragment or url.path not in ("", "/") or not url.port:
            raise ValueError()
        if not address.is_loopback and not any(address in network for network in _PRIVATE):
            raise ValueError()
        if url.scheme != "https" and not (url.scheme == "http" and address.is_loopback):
            raise ValueError()
    except ValueError:
        raise ValueError("Model destination must be a fixed private IP with TLS, or loopback HTTP") from None
    return value.rstrip("/")


@dataclass(frozen=True)
class Settings:
    service_token: str = field(repr=False)
    model_url: str
    model_name: str
    model_digest: str
    max_concurrency: int = 2
    request_timeout_ms: int = 19_000

    def __post_init__(self):
        if not re.fullmatch(r"[!-~]{32,512}", self.service_token):
            raise ValueError("A server-only assistant token of 32 to 512 ASCII characters is required")
        validate_model_url(self.model_url)
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,80}:[A-Za-z0-9_.-]{1,80}", self.model_name) or "cloud" in self.model_name.lower():
            raise ValueError("A fixed locally installed model tag is required")
        if not re.fullmatch(r"sha256:[a-f0-9]{64}", self.model_digest):
            raise ValueError("A pinned model SHA-256 digest is required")
        if not 1 <= self.max_concurrency <= 2 or not 100 <= self.request_timeout_ms <= 19_000:
            raise ValueError("Invalid service bounds")

    @classmethod
    def from_env(cls):
        if os.environ.get("OLLAMA_NO_CLOUD") != "1":
            raise ValueError("OLLAMA_NO_CLOUD=1 is required")
        try:
            concurrency = int(os.environ.get("ASSISTANT_MAX_CONCURRENCY", "2"))
            timeout_ms = int(os.environ.get("ASSISTANT_REQUEST_TIMEOUT_MS", "19000"))
        except ValueError:
            raise ValueError("Invalid service bounds") from None
        return cls(
            service_token=os.environ.get("ASSISTANT_SERVICE_TOKEN", ""),
            model_url=os.environ.get("ASSISTANT_MODEL_URL", "http://127.0.0.1:11434"),
            model_name=os.environ.get("ASSISTANT_MODEL_NAME", ""),
            model_digest=os.environ.get("ASSISTANT_MODEL_DIGEST", ""),
            max_concurrency=concurrency,
            request_timeout_ms=timeout_ms,
        )
