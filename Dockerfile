ARG IMAGE=intersystemsdc/iris-community:2026.2-zpm
FROM ${IMAGE}

USER root
RUN mkdir -p /durable/iris && chown -R 51773:51773 /durable

WORKDIR /home/irisowner/irisbuild
USER ${ISC_PACKAGE_MGRUSER}

RUN --mount=type=bind,src=.,dst=. \
    iris start IRIS && \
    iris session IRIS < iris.script && \
    date -Iseconds > "${ISC_PACKAGE_INSTALLDIR}/iris.init" && \
    iris stop IRIS quietly

# The ZPM-derived image adds a first-run bootstrap that is unnecessary after
# this image has installed the application at build time.  Starting iris-main
# directly lets the official durable-directory migration run without a second
# DB-API initialization pass.
WORKDIR /home/irisowner
RUN touch iris-main.log

ENTRYPOINT ["/tini", "--", "/iris-main"]
CMD ["--ISCAgent", "false"]
