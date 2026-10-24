"""Credential-scoped HTTP transport for the private worker API."""
from __future__ import annotations

from contextlib import contextmanager
import http.client
import io
import ipaddress
import re
import socket
import time
from typing import Iterator
from urllib.parse import SplitResult, urljoin, urlsplit


def backend_url(value: str) -> SplitResult:
    # Reject characters urllib would silently discard or normalize.
    if not value or any(ord(char) <= 32 or ord(char) == 127 for char in value):
        raise ValueError("OCR_API_BASE_URL is invalid.")
    if any(char in value for char in ("\\", "?", "#", "%")):
        raise ValueError("OCR_API_BASE_URL is invalid.")
    try:
        parsed = urlsplit(value)
        port = parsed.port
        if (
            parsed.scheme not in ("http", "https") or not parsed.hostname
            or parsed.username is not None or parsed.password is not None
            or port == 0
            or not re.fullmatch(r"(?:/[A-Za-z0-9_-]+)*/?", parsed.path)
        ):
            raise ValueError
        if parsed.scheme == "http":
            # DNS names, including localhost, cannot establish literal loopback.
            if not ipaddress.ip_address(parsed.hostname).is_loopback:
                raise ValueError
    except ValueError:
        raise ValueError(
            "OCR_API_BASE_URL requires HTTPS, or HTTP on a literal loopback address."
        ) from None
    return parsed


def source_url(base: str, supplied: str, job_id: str) -> str:
    origin = backend_url(base)
    if (
        not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", job_id)
        or not supplied or supplied.startswith("//")
        or any(ord(char) <= 32 or ord(char) == 127 for char in supplied)
        or any(char in supplied for char in ("\\", "?", "#", "%"))
    ):
        raise ValueError("Invalid source URL.")
    resolved = urlsplit(urljoin(base.rstrip("/") + "/", supplied))
    expected_path = origin.path.rstrip("/") + f"/internal/extraction-jobs/{job_id}/source"
    if (
        resolved.scheme != origin.scheme or resolved.hostname != origin.hostname
        or (resolved.port or (443 if resolved.scheme == "https" else 80))
        != (origin.port or (443 if origin.scheme == "https" else 80))
        or resolved.username is not None or resolved.password is not None
        or resolved.path != expected_path
    ):
        raise ValueError("Invalid source URL.")
    return resolved.geturl()


def _remaining(deadline: float) -> float:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("Worker HTTP deadline exceeded.")
    return remaining


class _DeadlineReader(io.RawIOBase):
    """Apply the remaining budget to every socket read, including header reads."""

    def __init__(self, sock: socket.socket, deadline: float):
        self._socket = sock
        self._raw = sock.makefile("rb", buffering=0)
        self._deadline = deadline

    def readable(self) -> bool:
        return True

    def readinto(self, buffer: bytearray) -> int:
        self._socket.settimeout(_remaining(self._deadline))
        result = self._raw.readinto(buffer)
        _remaining(self._deadline)
        return result

    def close(self) -> None:
        try:
            self._raw.close()
        finally:
            super().close()


class _DeadlineResponse(http.client.HTTPResponse):
    def __init__(self, sock: socket.socket, *, deadline: float, **kwargs):
        super().__init__(sock, **kwargs)
        self.fp.close()
        self.fp = io.BufferedReader(_DeadlineReader(sock, deadline))


@contextmanager
def open_response(
    url: str, method: str, headers: dict[str, str], body: bytes | None, timeout: float
) -> Iterator[http.client.HTTPResponse]:
    parsed = urlsplit(url)
    deadline = time.monotonic() + timeout
    connection_type = (
        http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    )
    connection = connection_type(parsed.hostname, port=parsed.port, timeout=timeout)
    connection.response_class = lambda sock, **kwargs: _DeadlineResponse(
        sock, deadline=deadline, **kwargs
    )
    try:
        # http.client makes a direct connection: no redirects or environment proxies.
        # HTTPSConnection retains the platform certificate and hostname verification.
        connection.connect()
        connection.sock.settimeout(_remaining(deadline))
        connection.request(method, parsed.path, body=body, headers=headers)
        connection.sock.settimeout(_remaining(deadline))
        with connection.getresponse() as response:
            yield response
    finally:
        connection.close()


def bounded_chunks(response: http.client.HTTPResponse, maximum: int) -> Iterator[bytes]:
    if response.getheader("Content-Encoding", "identity").lower() != "identity":
        raise ValueError("Encoded worker responses are unsupported.")
    length = response.getheader("Content-Length")
    if length is not None and (not length.isascii() or not length.isdigit() or len(length) > 10):
        raise ValueError("Invalid response length.")
    expected = int(length) if length is not None else None
    if expected is not None and expected > maximum:
        raise ValueError("Worker response exceeded its byte limit.")
    total = 0
    while chunk := response.read1(min(64 * 1024, maximum - total + 1)):
        total += len(chunk)
        if total > maximum:
            raise ValueError("Worker response exceeded its byte limit.")
        yield chunk
    if expected is not None and total != expected:
        raise ValueError("Worker response ended before its declared length.")
