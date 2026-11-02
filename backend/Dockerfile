FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src src
RUN mvn -q -B -DskipTests package

FROM eclipse-temurin:21-jre
# drivers VAAPI (GPU Intel e AMD); só são usados se o contêiner receber /dev/dri (docker-compose.gpu.yml)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg intel-media-va-driver mesa-va-drivers && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
