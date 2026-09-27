# Local, pinned IRIS Community 2026.2 base already present on this host.
FROM intersystemsdc/iris-community:2026.2-zpm
# Runner verifies local image ID 68bc1d43c98ca816f2e98a185edc1250bebb6b763f8159da35c8543b09c0df70.
USER root
RUN mkdir -p /durable && chown 51773:51773 /durable
COPY --chown=51773:51773 classes/ /opt/irisops-guard/classes/
COPY --chown=51773:51773 bootstrap/ /opt/irisops-guard/bootstrap/
COPY --chown=51773:51773 ui/ /opt/irisops-guard/ui/
COPY manifest.json /opt/irisops-guard/manifest.json
USER irisowner
WORKDIR /home/irisowner
RUN touch iris-main.log
ENTRYPOINT ["/tini", "--", "/iris-main"]
CMD ["--ISCAgent", "false"]
