# LeaveNow - Real-Time Bus Location Tracking and Smart Departure Prediction

## Overview
LeaveNow revolutionizes public transit usage by addressing waiting times and delays through advanced AI techniques, real-time GPS tracking, and user-centric design.

## Features
- Real-time bus tracking
- AI-driven ETD predictions
- Personalized departure recommendations
- Integration with Google Maps
- Push notifications for alerts

## Repository Structure
leavenow/
├── src/
│ ├── main.py # Main application entry point
│ ├── data_collection/ # RGRTA API integration
│ ├── preprocessing/ # Data cleaning pipelines
│ ├── models/ # ML models (XGBoost, ARIMA)
│ ├── api/ # REST API implementation
│ └── ui/ # React frontend
├── deployment/
│ ├── Dockerfile # Container configuration
│ ├── kubernetes/ # K8s manifests
│ └── jenkins/ # CI/CD configs
├── monitoring/
│ ├── prometheus/ # Metrics collection
│ ├── grafana/ # Dashboards
│ └── alerts/ # Alert configurations
└── documentation/
├── IEEE-report-AIS.docx # Project report
├── architecture.md # System design docs
└── api_specs.md # API documentation

## Installation

```bash
# Clone repository
git clone https://github.com/PrithviHL/LeaveNow-Real-Time-Bus-Location-Tracking-and-Smart-Departure-Prediction.git
cd leavenow

# Set up virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
.\venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

Running locally
# Start the application
python src/main.py

# Run tests
pytest tests/

Docker deployment
# Build container
docker build -t leavenow .

# Run container
docker run -p 8080:8080 leavenow

## System Requiremnets
Python 3.8+
Docker
Kubernetes
AWS account for cloud deployment
