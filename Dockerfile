FROM gradle:8.10.2-jdk17 AS build
WORKDIR /workspace
COPY . .
RUN gradle clean bootJar --no-daemon

FROM eclipse-temurin:17-jre
WORKDIR /app
ENV WMS_PORT=8080
COPY --from=build /workspace/build/libs/*.jar /app/wms-logoff.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/wms-logoff.jar"]
