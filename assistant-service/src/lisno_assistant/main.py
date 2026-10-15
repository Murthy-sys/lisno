import logging
import uvicorn


def main():
    # Never record request headers/bodies or upstream exceptions. Destination
    # firewall logs, counters and status codes are sufficient for operations.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    metrics = logging.getLogger("lisno_assistant.metrics")
    metrics.setLevel(logging.INFO)
    metrics.addHandler(logging.StreamHandler())
    metrics.propagate = False
    uvicorn.run("lisno_assistant.app:create_app", factory=True, host="0.0.0.0", port=8080, workers=1, access_log=False, log_level="warning", timeout_graceful_shutdown=25, limit_concurrency=8)


if __name__ == "__main__":
    main()
