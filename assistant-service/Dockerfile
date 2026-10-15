# Supply an independently verified immutable python:3.11-slim image digest.
ARG PYTHON_IMAGE
FROM ${PYTHON_IMAGE}
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 OTEL_SDK_DISABLED=true OTEL_TRACES_EXPORTER=none
WORKDIR /app
COPY pyproject.toml ./
COPY requirements.lock ./
COPY src ./src
RUN pip install --no-cache-dir -r requirements.lock && pip install --no-cache-dir --no-deps . && useradd --uid 10001 --create-home assistant
USER 10001:10001
EXPOSE 8080
CMD ["lisno-assistant"]
