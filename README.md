# LeaveNow - Real-Time Bus Tracking and Smart Departure Prediction

## 1. Project Overview
LeaveNow revolutionizes public transit usage by addressing two major pain points: waiting times and bus delays. The system employs advanced AI techniques, including time series forecasting, machine learning models, and deep learning algorithms, to accurately predict Expected Time of Departure (ETD). By combining real-time data with predictive analytics, LeaveNow enhances user experience and improves overall transit efficiency.

## 2. Repository Structure
leavenow/
├── src/
│ ├── main.py # Main application entry point
│ ├── data_collection/ # RGRTA API integration
│ ├── preprocessing/ # Data cleaning pipelines
│ ├── models/ # XGBoost and ARIMA models
│ ├── api/ # REST API implementation
│ └── ui/ # React frontend
├── deployment/
│ ├── Dockerfile # Container configuration
│ ├── kubernetes/ # K8s manifests
│ └── jenkins/ # CI/CD pipeline configs
├── monitoring/
│ ├── prometheus/ # Metrics collection
│ ├── grafana/ # Dashboard configurations
│ └── alerts/ # Alert rules
└── documentation/
├── IEEE-report-AIS.docx # Project report
└── api_specs.md # API documentation


## 3. System Entry Point
```bash
# Local Development
python src/main.py

# Docker Deployment
docker build -t leavenow .
docker run -p 8080:8080 leavenow



