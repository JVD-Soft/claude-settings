# Node 20 вышел из поддержки. 24 — текущий LTS; та же версия закреплена в
# frontend/.nvmrc и в CI, чтобы разрешение зависимостей везде совпадало.
FROM node:24-slim

RUN apt-get update && \
    apt-get install -y git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Yarn 4 ставится corepack'ом по полю packageManager в package.json.
# Без DOWNLOAD_PROMPT=0 corepack ждёт подтверждения и сборка виснет.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/

# Слой кэша зависимостей — пересобирается только при изменении этих файлов
COPY frontend/package.json frontend/yarn.lock frontend/.yarnrc.yml ./
RUN yarn install --immutable

# Копируем исходники отдельным слоем
COPY frontend/ .
