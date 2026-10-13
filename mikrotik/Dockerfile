# Exodus for MikroTik: the image of the container of RouterOS
# built from the root of the repository: docker build -f mikrotik/Dockerfile .
# the core and yq are downloaded by install.sh for the platform of the build, the settings live in the mount /opt/etc/exodus

FROM alpine:3.22

ARG CORE=meta
ARG GH_PROXY=
ARG COMMIT=

RUN apk add --no-cache curl jq lighttpd nftables iproute2 ca-certificates tzdata tini

COPY install.sh /tmp/exodus-src/install.sh
COPY mikrotik/opt /tmp/exodus-src/mikrotik/opt

RUN EXODUS_SRC=/tmp/exodus-src CORE="$CORE" GH_PROXY="$GH_PROXY" COMMIT="$COMMIT" sh /tmp/exodus-src/install.sh \
	&& rm -rf /tmp/exodus-src /tmp/exodus-install \
	&& mkdir -p /opt/etc/exodus

# the web ui, the api of the core with the dashboard, the proxy port
EXPOSE 9099/tcp 9090/tcp 7890/tcp

# tini passes the signals of /container/stop and reaps the processes the web ui starts
ENTRYPOINT ["/sbin/tini", "--", "/opt/share/exodus/exodus", "container"]
