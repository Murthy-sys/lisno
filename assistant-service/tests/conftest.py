import socket
import pytest


@pytest.fixture(autouse=True)
def no_real_network(monkeypatch):
    def denied(*_args, **_kwargs):
        raise AssertionError("Unit tests cannot access a real network")
    monkeypatch.setattr(socket, "getaddrinfo", denied)
    monkeypatch.setattr(socket.socket, "connect", denied)
