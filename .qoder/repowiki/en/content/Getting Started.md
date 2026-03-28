# Getting Started

<cite>
**Referenced Files in This Document**
- [README.md](file://README.md)
- [docker-compose.yml](file://docker-compose.yml)
- [backend/Dockerfile](file://backend/Dockerfile)
- [backend/requirements.txt](file://backend/requirements.txt)
- [backend/medicentral/settings.py](file://backend/medicentral/settings.py)
- [backend/manage.py](file://backend/manage.py)
- [frontend/package.json](file://frontend/package.json)
- [frontend/.env.example](file://frontend/.env.example)
- [k8s/deployment.yaml](file://k8s/deployment.yaml)
- [deploy/clinicmonitoring-daphne.service](file://deploy/clinicmonitoring-daphne.service)
- [deploy/nginx-clinicmonitoring.conf](file://deploy/nginx-clinicmonitoring.conf)
- [deploy/SERVER-SETUP.md](file://deploy/SERVER-SETUP.md)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Development Environment Setup](#development-environment-setup)
4. [Local Development with Docker Compose](#local-development-with-docker-compose)
5. [Manual Local Setup (Virtual Environment)](#manual-local-setup-virtual-environment)
6. [Frontend Development Server](#frontend-development-server)
7. [Production Deployment](#production-deployment)
8. [Initial Configuration](#initial-configuration)
9. [Running the System Locally](#running-the-system-locally)
10. [Connecting Test Medical Devices](#connecting-test-medical-devices)
11. [Common Setup Issues and Solutions](#common-setup-issues-and-solutions)
12. [Troubleshooting Guide](#troubleshooting-guide)
13. [Conclusion](#conclusion)

## Introduction
Medicentral is a healthcare monitoring platform built with a modern stack: Django backend with Django Channels and Daphne for real-time updates, and a React frontend served via Vite. It supports HL7 MLLP ingestion for real-time patient vitals from medical devices, with optional AI-powered insights. This guide focuses on rapid onboarding and initial setup for local development, Docker-based workflows, and production deployment using Kubernetes and Nginx.

## Prerequisites
Before starting, ensure you have:
- Python 3.8+ installed on your machine
- Node.js and npm for frontend development
- Docker and Docker Compose for containerized local development
- Basic understanding of healthcare IT concepts (HL7, TCP/IP networking, and device connectivity)
- Access to a terminal/shell for command-line operations

These requirements align with the technologies used in the backend (Python/Django) and frontend (React/Vite), and the deployment targets (Docker/Kubernetes/Nginx).

**Section sources**
- [README.md:20-51](file://README.md#L20-L51)
- [backend/requirements.txt:1-14](file://backend/requirements.txt#L1-L14)
- [frontend/package.json:1-35](file://frontend/package.json#L1-L35)

## Development Environment Setup
Set up your environment by choosing one of the following paths:
- Local development with Docker Compose (recommended for quick start)
- Manual setup using Python virtual environments and Node.js

Both approaches are documented below with step-by-step instructions.

## Local Development with Docker Compose
Use Docker Compose to spin up the backend, Redis, and persistent volumes locally. This method ensures consistent dependencies and network configuration.

Steps:
1. Build and start services:
   - Run: docker compose up --build
   - Backend becomes available at http://127.0.0.1:8000
   - SQLite database persists under /app/data inside the container
   - Redis runs internally on port 6379

2. Verify services:
   - Confirm backend responds at http://127.0.0.1:8000/api/health/
   - Open browser at http://127.0.0.1:5173 for the frontend

Key environment variables and mounts are preconfigured in the compose file:
- DJANGO_DEBUG set to true
- DJANGO_ALLOWED_HOSTS configured for localhost and backend service
- REDIS_URL set to internal Redis service
- SQLite path mapped to a named volume for persistence

**Section sources**
- [README.md:69-76](file://README.md#L69-L76)
- [docker-compose.yml:1-29](file://docker-compose.yml#L1-L29)

## Manual Local Setup (Virtual Environment)
For manual development without Docker, follow these steps:

Backend (Python/Django):
1. Navigate to backend and create a virtual environment:
   - cd backend
   - python -m venv .venv
   - Activate the environment (Windows: .venv\Scripts\activate)
2. Install dependencies:
   - pip install -r requirements.txt
3. Apply migrations:
   - python manage.py migrate
4. Start Daphne:
   - daphne -b 127.0.0.1 -p 8000 medicentral.asgi:application

Frontend (React/Vite):
1. Navigate to frontend and install dependencies:
   - cd frontend
   - npm install
2. Start the development server:
   - npm run dev
3. Open browser at http://127.0.0.1:5173

Proxy behavior:
- Vite proxies /api and /ws to http://127.0.0.1:8000 during development.

Notes:
- If you encounter “table already exists” errors, use the fake-initial migration option as described in the repository’s README.
- Simulations require the ASGI server (Daphne/runserver) to operate; they do not work in shell or migrate contexts.

**Section sources**
- [README.md:20-51](file://README.md#L20-L51)
- [backend/manage.py:1-15](file://backend/manage.py#L1-L15)

## Frontend Development Server
The frontend uses Vite for fast development. The development server listens on port 5173 and proxies API and WebSocket traffic to the backend.

Key points:
- Proxy configuration forwards /api and /ws to the backend address
- For production builds, configure VITE_BACKEND_ORIGIN if hosting frontend on a separate domain

**Section sources**
- [README.md:41-49](file://README.md#L41-L49)
- [frontend/package.json:1-35](file://frontend/package.json#L1-L35)
- [frontend/.env.example:1-6](file://frontend/.env.example#L1-L6)

## Production Deployment
Two primary production deployment paths are supported:
- Kubernetes (K8s) with a Deployment, Service, and Ingress
- Traditional Linux server with systemd-managed Daphne, Nginx, and Certbot for TLS

### Kubernetes Setup
Deployments are defined with:
- A backend Deployment exposing port 8000
- A Service mapping to the backend pods
- An Ingress configured for the frontend domain

Steps:
1. Apply namespace, Redis, and backend resources:
   - kubectl apply -f k8s/namespace.yaml
   - kubectl apply -f k8s/redis.yaml
   - kubectl apply -f k8s/deployment.yaml
2. Configure environment variables in the Deployment:
   - DJANGO_SECRET_KEY, DJANGO_ALLOWED_HOSTS, REDIS_URL, CORS_ALLOWED_ORIGINS
3. For multi-replica deployments, ensure Redis is available and properly configured

Ingress specifics:
- Annotations enable long-running WebSocket connections
- Hostnames and paths are defined for routing

**Section sources**
- [README.md:77-88](file://README.md#L77-L88)
- [k8s/deployment.yaml:1-101](file://k8s/deployment.yaml#L1-L101)

### Nginx and SSL Configuration
On a traditional server, configure Nginx as a reverse proxy for both API/WebSocket and static assets. The provided configuration demonstrates:
- Upstream pointing to Daphne
- Proxy settings for /api/, /ws/, /admin/, and /static/
- Separate server blocks for frontend and API domains
- TLS termination with Certbot certificates

Systemd service:
- A unit file runs Daphne under a dedicated user and loads environment variables from .env

SSL certificate management:
- Use Certbot to obtain and renew certificates
- Ensure certificate paths match the Nginx configuration

**Section sources**
- [deploy/nginx-clinicmonitoring.conf:1-112](file://deploy/nginx-clinicmonitoring.conf#L1-L112)
- [deploy/clinicmonitoring-daphne.service:1-18](file://deploy/clinicmonitoring-daphne.service#L1-L18)
- [deploy/SERVER-SETUP.md:82-101](file://deploy/SERVER-SETUP.md#L82-L101)

## Initial Configuration
Configure environment variables for both backend and frontend. The backend reads from .env and supports:
- Database selection (SQLite by default or DATABASE_URL for PostgreSQL)
- Security settings (SECRET_KEY, ALLOWED_HOSTS, CSRF origins, cookies)
- CORS and proxy behavior
- Redis-backed Channels for multi-instance deployments
- Logging level and other operational flags

Frontend variables:
- VITE_BACKEND_ORIGIN for production builds hosted on a separate domain

Settings behavior:
- DEBUG toggles development vs production behavior
- In production, SECRET_KEY must be set; otherwise, Django raises an error
- CORS_ALLOW_ALL_ORIGINS is enabled only in debug mode

**Section sources**
- [README.md:53-68](file://README.md#L53-L68)
- [backend/medicentral/settings.py:1-218](file://backend/medicentral/settings.py#L1-L218)
- [frontend/.env.example:1-6](file://frontend/.env.example#L1-L6)

## Running the System Locally
Choose your preferred development path and follow the steps below.

Option A: Docker Compose
- docker compose up --build
- Backend: http://127.0.0.1:8000
- Frontend: http://127.0.0.1:5173
- Health check: GET /api/health/

Option B: Manual Setup
- Backend: daphne -b 127.0.0.1 -p 8000 medicentral.asgi:application
- Frontend: npm run dev
- Health check: GET /api/health/

Access the dashboard:
- After logging in, navigate to the monitoring dashboard to view real-time vitals and device status.

**Section sources**
- [README.md:20-51](file://README.md#L20-L51)
- [README.md:97-99](file://README.md#L97-L99)

## Connecting Test Medical Devices
The system listens for HL7 MLLP messages on TCP port 6006 by default. To connect devices:
- Configure devices to send to the server’s IP and port 6006
- Assign devices to a bed/room and admit patients accordingly
- Use the device connection check endpoint or UI radio button to verify connectivity

Operational tips:
- Ensure firewall allows inbound TCP 6006
- If device source IP differs from expectations, adjust peer IP via management command or admin UI

**Section sources**
- [README.md:89-96](file://README.md#L89-L96)
- [deploy/SERVER-SETUP.md:113-122](file://deploy/SERVER-SETUP.md#L113-L122)

## Common Setup Issues and Solutions
- “table already exists” during migrations:
  - Use the fake-initial migration option as documented in the README
- Backend not reachable at expected port:
  - Confirm Daphne is running and bound to the correct interface/port
- Frontend cannot reach API:
  - Verify Vite proxy settings and backend address
- CORS or authentication failures in production:
  - Set ALLOWED_HOSTS, CSRF_TRUSTED_ORIGINS, and CORS_ALLOWED_ORIGINS appropriately
- Multi-instance WebSocket issues:
  - Provide REDIS_URL and use channels-redis; ensure Redis is reachable
- Health checks failing:
  - Confirm migrations applied and backend reachable at /api/health/

**Section sources**
- [README.md:20-51](file://README.md#L20-L51)
- [README.md:59-68](file://README.md#L59-L68)
- [backend/medicentral/settings.py:170-183](file://backend/medicentral/settings.py#L170-L183)

## Troubleshooting Guide
- Health endpoint:
  - GET /api/health/ returns 200 with database connectivity status
- Logs:
  - Review Django logs and channel-layer logs for errors
- Device connectivity:
  - Use device connection check UI or endpoint to inspect last packet timestamps and warnings
- Static assets and admin:
  - Ensure collectstatic ran and WhiteNoise serves static files correctly behind Nginx

**Section sources**
- [README.md:97-99](file://README.md#L97-L99)
- [backend/medicentral/settings.py:185-217](file://backend/medicentral/settings.py#L185-L217)

## Conclusion
With this guide, you can rapidly onboard to Medicentral, choose between Docker or manual setups, and deploy to production using Kubernetes or traditional servers. Focus on environment configuration, database initialization, and HL7 device connectivity to achieve a working system within hours. Refer to the troubleshooting section for quick fixes and consult the deployment-specific documents for advanced configurations.