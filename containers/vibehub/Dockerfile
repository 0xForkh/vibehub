FROM node:current-alpine as base
RUN apk add -U build-base python3 py3-setuptools
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN npx pnpm i -g pnpm@latest
WORKDIR /usr/src/app
COPY . /usr/src/app

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM node:current-alpine
LABEL maintainer="butlerx@notthe.cloud"
WORKDIR /usr/src/app
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
EXPOSE 3000
RUN corepack enable && \
    apk add -U coreutils openssh-client sshpass tmux bash && \
    mkdir ~/.ssh
COPY --from=build /usr/src/app/node_modules /usr/src/app/node_modules
COPY --from=build /usr/src/app/build /usr/src/app/build
COPY --from=build /usr/src/app/package.json /usr/src/app/package.json

EXPOSE 8000
CMD [ "node", "." ]
