# Matches the Node version pinned in .nvmrc / package.json engines.
FROM node:24-bookworm

# better-sqlite3 is a native module. The prebuilt binary covers most cases, but
# python3 + build-essential are needed when it has to compile from source.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        build-essential \
        sqlite3 \
        git \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# The `node` user ships with the base image; run as it rather than root so
# files created in the bind mount keep sane ownership.
USER node

EXPOSE 3000 5555
