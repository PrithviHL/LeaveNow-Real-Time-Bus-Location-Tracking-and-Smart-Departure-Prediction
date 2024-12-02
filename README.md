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
```
## 4. Video Demonstration
The system demonstration video showcases:
- Real-time bus tracking functionality
- ETD prediction accuracy
- User interface interactions
- System monitoring dashboards
- Deployment pipeline in action

## 5. Deployment Strategy
LeaveNow uses AWS cloud infrastructure with:
- Docker containers for application packaging
- Kubernetes for orchestration
- Jenkins CI/CD pipeline for automated deployment

Key deployment features:
- Blue-green deployment strategy
- Automated testing integration
- High availability configuration (99.9% uptime)
- Load balancing across multiple availability zones

## 6. Monitoring and Metrics
Monitoring stack:
- Prometheus for metric collection
- Grafana for visualization

Key metrics monitored:
- Prediction accuracy (87% within ±3 minutes)
- System response times
- API endpoint performance
- Resource utilization
- User engagement metrics

## 7. Project Documentation
Key documentation:
- IEEE format project report (documentation/IEEE-report-AIS.docx)
- API specifications
- System architecture diagrams
- Performance metrics reports

## 8. Version Control and Team Collaboration
Version control practices:
- Git-based workflow
- Feature branch development
- Pull request reviews
- Automated testing before merges

Team collaboration:
- Regular code reviews
- Documentation updates
- Issue tracking
- Sprint planning

## 9. System Requirements
- Python 3.8+
- Docker
- Kubernetes
- AWS account for cloud deployment
- React for frontend development

## Performance Metrics
The system achieved:
- 87% prediction accuracy within ±3 minutes
- Net Promoter Score (NPS) of 72
- Average time saving of 7 minutes per trip
- Successfully handled 300% usage spikes


