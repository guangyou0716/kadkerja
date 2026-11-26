# Spring Boot API. Built from source; tests run in CI, not here (`./mvnw verify`).
FROM eclipse-temurin:21-jdk-noble AS build
WORKDIR /src
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -B -q dependency:go-offline
COPY src src
RUN ./mvnw -B -q -DskipTests package && cp target/kadkerja-*.jar /app.jar

FROM eclipse-temurin:21-jre-noble
RUN useradd --system --no-create-home --uid 10001 kadkerja
COPY --from=build /app.jar /app/kadkerja.jar
USER kadkerja
EXPOSE 8080
# Port open = Tomcat is up (bash's /dev/tcp; the image has no curl requirement).
HEALTHCHECK --interval=5s --timeout=3s --start-period=60s --retries=30 \
  CMD bash -c ':> /dev/tcp/127.0.0.1/8080' || exit 1
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/kadkerja.jar"]
