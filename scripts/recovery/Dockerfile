# Build with immutable repo digests and the release-verified Linux binaries.
ARG DOCKER_CLI_IMAGE
ARG PYTHON_IMAGE
FROM ${DOCKER_CLI_IMAGE} AS dockercli
FROM ${PYTHON_IMAGE}
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
COPY tools/linux/age tools/linux/rclone /usr/local/bin/
COPY recovery/ /opt/recovery/
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /opt/recovery
ENTRYPOINT ["python3", "/opt/recovery/recovery.py"]
