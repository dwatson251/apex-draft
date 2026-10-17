# Apex Draft online server. Build from the repository root:
#   docker build -f server/Dockerfile -t apex-draft-server .
# The Node version is pinned: the sim uses Math.sin/cos/pow, and the same engine keeps lap times identical from build to build.
FROM node:24.14.1-slim AS build
WORKDIR /app
# only esbuild is needed to bundle (no package.json here, so none of the Electron or Android toolchain is installed)
RUN npm install --no-save --no-audit --no-fund esbuild@0.21.5
COPY packages ./packages
COPY server ./server
RUN node server/build.mjs

FROM node:24.14.1-slim
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/server/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--no-warnings", "dist/server.js"]
