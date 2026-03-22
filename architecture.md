# MediCentral Architecture & DevOps Overview

This document outlines the architectural and DevOps decisions made for the "MediCentral" Situational Monitoring System, aligning with the "Mission-Critical" requirements specified in the SRS.

## 1. Architecture: Microservices & Event-Driven

While this repository contains a unified full-stack application for demonstration purposes within the AI Studio environment, the intended production architecture is highly decoupled:

*   **Data Ingestion Layer (Simulated in `server.ts`)**: In a real-world scenario, this would be a fleet of lightweight services (e.g., written in Golang) listening on TCP/MQTT ports for raw HL7/FHIR data from Philips, GE, or Mindray monitors.
*   **Event Broker (Kafka/RabbitMQ)**: The ingestion layer publishes raw vital signs to a high-throughput message broker (like Apache Kafka). This ensures zero data loss even if downstream services temporarily fail.
*   **Processing & Alarm Engine**: Consumes from Kafka, applies threshold logic (Smart Alarms), and detects artifacts.
*   **WebSocket Gateway (Socket.io)**: Subscribes to processed streams and pushes them to connected React clients with sub-second latency.

## 2. Technology Stack

*   **Backend**: Node.js (Express) with `tsx` for rapid development. Production would compile to standard JS or use a compiled language like Go for the ingestion layer.
*   **Frontend**: React 19 with Vite.
*   **Real-time Rendering**: The ECG waveform is rendered using the HTML5 `<canvas>` API (`ECGCurve.tsx`). This is crucial because standard SVG-based charting libraries (like Recharts or Chart.js) cannot handle 60-100Hz refresh rates for multiple patients simultaneously without severe performance degradation (jank).
*   **State Management**: `zustand` is used for lightweight, fast, and unopinionated global state management, specifically optimized for high-frequency WebSocket updates.

## 3. DevOps & Infrastructure (IaC)

To fulfill the strict SLA (99.99% availability) and scalability requirements, the following DevOps assets are included:

*   **`Dockerfile`**: A multi-stage Docker build ensuring a minimal, secure production image.
*   **`k8s/deployment.yaml`**: Kubernetes manifests defining a Deployment, Service, and Ingress.
    *   **Replicas**: Configured for 3 replicas to ensure High Availability (HA).
    *   **Probes**: Liveness and Readiness probes are configured pointing to the `/api/health` endpoint to enable Kubernetes self-healing.
    *   **Resources**: CPU and Memory requests/limits are strictly defined to prevent noisy neighbor issues on the cluster.
    *   **Ingress**: Configured with specific NGINX annotations to support long-lived WebSocket connections (`proxy-read-timeout`).
*   **`.github/workflows/main.yml`**: A complete CI/CD pipeline demonstrating automated testing, Docker image building/pushing, and GitOps-style deployment to a Kubernetes cluster.

## 4. Security & Compliance

*   **Network**: The K8s deployment assumes a private VPC. The Ingress controller handles TLS termination.
*   **Data**: The simulated backend structure is ready to integrate with PostgreSQL (for patient metadata) and TimescaleDB (for high-frequency time-series vital signs).

## 5. UX/UI

*   **Dark Mode**: Enforced via Tailwind CSS (`bg-black`, `text-zinc-300`) to reduce eye strain in 24/7 monitoring environments.
*   **Visual Hierarchy**: Critical alarms (Red) use aggressive pulsing and drop shadows to immediately draw attention, while technical alarms (Blue) are more subdued.
