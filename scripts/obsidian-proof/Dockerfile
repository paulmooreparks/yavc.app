# Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb xauth xdotool libgtk-3-0 libgbm1 libnss3 libasound2 libx11-xcb1 \
    libxshmfence1 libxrandr2 libxfixes3 libatk-bridge2.0-0 libdrm2 \
    libxkbcommon0 libcups2 libdbus-1-3 libxss1 libxtst6 libxcomposite1 \
    libxcursor1 libcairo2 libpango-1.0-0 libxdamage1 libnotify4 \
    libsecret-1-0 fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
ADD --checksum=sha256:251805fdcb696af32129e8f5e8656f6688802fc38b169822175d23a74c5174b3 \
    https://github.com/obsidianmd/obsidian-releases/releases/download/v1.15.0/obsidian_1.15.0_amd64.deb /tmp/obsidian.deb
RUN dpkg-deb --extract /tmp/obsidian.deb / && rm /tmp/obsidian.deb
WORKDIR /opt/proof
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY test.cjs compare.cjs ./
USER node
ENV DISPLAY=:99
ENTRYPOINT ["node","/opt/proof/test.cjs"]
