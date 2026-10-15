"""Run with python -m lisno_assistant.rules_main; Node is the public listener."""
import logging

import uvicorn

from .rules_app import create_app
from .rules_settings import RulesSettings


def main():
    try:
        settings = RulesSettings.from_env()
    except ValueError:
        raise SystemExit("Invalid rules-service configuration") from None
    metrics = logging.getLogger("lisno_assistant.rules")
    metrics.setLevel(logging.INFO)
    metrics.addHandler(logging.StreamHandler())
    metrics.propagate = False
    uvicorn.run(
        create_app(settings), host="127.0.0.1", port=settings.port, workers=1,
        access_log=False, log_level="critical", proxy_headers=False,
        server_header=False, timeout_graceful_shutdown=25, limit_concurrency=8,
    )


if __name__ == "__main__":
    main()
