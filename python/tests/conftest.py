"""Shared fixtures. Every test runs with the network switched off.

No test may reach a real server: a real send would text a real person from
a real phone. The socket guard below fails any test that tries.
"""

import json
import socket

import pytest
import requests

import androidtexter


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    def guard(*args, **kwargs):
        raise RuntimeError("Network access is disabled in tests")

    monkeypatch.setattr(socket.socket, "connect", guard)
    monkeypatch.setattr(socket, "create_connection", guard)
    monkeypatch.delenv("ANDROIDTEXTER_API_KEY", raising=False)
    monkeypatch.delenv("ANDROIDTEXTER_BASE_URL", raising=False)


class FakeResponse:
    def __init__(self, status_code=200, body=None, text=None, reason="OK"):
        self.status_code = status_code
        self._body = body
        self.text = text if text is not None else (json.dumps(body) if body is not None else "")
        self.reason = reason

    def json(self):
        if self._body is None:
            return json.loads(self.text)  # raises ValueError on non-JSON
        return self._body


class FakeSession:
    """Stands in for requests.Session and records every call."""

    def __init__(self):
        self.calls = []
        self.responses = []
        self.raise_exc = None

    def queue(self, status_code=200, body=None, text=None, reason="OK"):
        self.responses.append(FakeResponse(status_code, body, text, reason))
        return self

    def request(self, method, url, params=None, json=None, headers=None, timeout=None):
        self.calls.append(
            {"method": method, "url": url, "params": params, "json": json, "headers": headers, "timeout": timeout}
        )
        if self.raise_exc is not None:
            raise self.raise_exc
        if not self.responses:
            return FakeResponse(200, {})
        return self.responses.pop(0)

    def close(self):
        pass

    @property
    def last(self):
        return self.calls[-1]


@pytest.fixture
def session():
    return FakeSession()


@pytest.fixture
def client(session):
    return androidtexter.Client(api_key="atx_test", session=session)


__all__ = ["FakeSession", "FakeResponse", "requests"]
