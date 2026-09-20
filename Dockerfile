ARG IMAGE=intersystemsdc/iris-community:2026.2-zpm
FROM ${IMAGE}

WORKDIR /home/irisowner/irisbuild
USER ${ISC_PACKAGE_MGRUSER}

RUN --mount=type=bind,src=.,dst=. \
    iris start IRIS && \
    iris session IRIS < iris.script && \
    date -Iseconds > "${ISC_PACKAGE_INSTALLDIR}/iris.init" && \
    iris stop IRIS quietly
