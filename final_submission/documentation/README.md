# 1. LeaveNow
This project focuses on developing a Bus Arrival Time Prediction System that predicts the estimated time for a commuter to leave from their current location to catch a bus at a given stop. The system aims to enhance the experience of commuters by providing more accurate, real-time predictions of bus arrivals, thereby reducing wait times and improving planning for public transport users.<br>
Objectives:<br>
Predict Bus Arrival Times: The primary objective is to develop a machine learning model that can predict the time at which a bus will arrive at a stop based on various input factors, such as the bus route, time of day, and historical data.<br>
Enhance Public Transportation Efficiency: By accurately predicting bus arrival times, the system helps reduce passenger uncertainty, which can improve overall user satisfaction and public transport efficiency.<br>
Real-Time Adaptability: The system incorporates real-time factors like traffic conditions, bus schedules, and historical delays to provide dynamic predictions based on current data.<br>
Problem It Solves:<br>
Public transportation systems often suffer from inaccurate or unpredictable arrival times, leaving commuters uncertain about when their bus will arrive. This uncertainty can lead to wasted time, missed buses, and an inefficient commuting experience. The Bus Arrival Time Prediction System addresses these challenges by leveraging historical bus schedule data and real-time conditions (such as route and traffic) to predict arrival times with a high degree of accuracy.<br>

By using machine learning models (such as XGBoost), the system takes multiple factors into account to forecast bus arrival times. This will help:<br>
Commuters: By providing more accurate and real-time predictions, commuters can plan their travel better, leading to reduced waiting times and improved punctuality.<br>
Transport Authorities: By utilizing predictive analytics, transport authorities can optimize schedules, improve fleet management, and enhance operational efficiency.<br>

# 2. Purpose of each folder in the repository:
ais/: Contains the core system code, including the main script, models, utilities, sample data, and dependencies.<br>
deployment/: Holds containerization files (e.g., Docker) and CI/CD pipeline configurations for deployment automation.<br>
monitoring/: Stores configurations for monitoring system performance using tools like Prometheus and Grafana.<br>
documentation/: Includes project documentation, proposal templates, and detailed reports.<br>
videos/: Contains demo screencasts showcasing the system in action.<br>

# 3. System Entry Point
- Make sure the files (app2.py, Dockerfile, requirements.txt, prometheus.yml, stops.json, stoparrival.json, docker-compose.yml) are in the same directory.<br>
- #Code to build docker image and run the app<br>
    docker-compose build<br>
    docker-compose up<br>
- Open #Links to access the streamlit web-app, Prometheus, and grafana<br>
        Streamlit on http://localhost:8501<br>
        Prometheus on http://localhost:9090<br>
        Grafana on http://localhost:3000<br>
- Enter the inputs(For ex. 43.158464, -77.607674, State & Vincent) and click on submit button.<br>
- The app will run successfully and give out the output.<br>

# 4. Video Demonstration
The video with the demo of the system and backend working has been pushed to git repo.<br>

# 5. Deployment Strategy
- Docker will be used to containerize the machine learning model and supporting API. This ensures that the application runs consistently across development, testing, and production environments.<br>
- Package the model and app  built with Streamlit into a Docker image.<br>
- Include all dependencies (e.g., Python libraries, Streamlit, requests and prometheus_client) in the requirement file<br>


# 6. Monitoring and Metrics
Tools used: Prometheus, Grafana<br>
Setup Instructions<br>
Prometheus Setup:<br>
Install Prometheus:<br>
Download the Prometheus binaries.<br>
Extract the files and move to a suitable directory.<br>
Configure Prometheus:<br>
Edit prometheus.yml to include the scrape configurations for your web app.yaml(the prometheus.yml file has been pushed to the git)<br>
Start Prometheus:Code:<br>
./prometheus --config.file=prometheus.yml<br>
Verify Prometheus is running by visiting http://localhost:9090.<br>
Grafana Setup:<br>
Install Grafana:<br>
Download the Grafana installer.<br>
Start Grafana: Code:<br>
systemctl start grafana-server<br>
Access Grafana on http://localhost:3000.<br><br>
Default login: admin / admin.<br>
Add Prometheus as a data source:<br>
Go to Grafana → Configuration → Data Sources → Add Prometheus → Set URL to http://localhost:9090.<br>
Create Dashboards:<br>
Use pre-built templates or create custom dashboards to visualize the metrics.<br>
Overview of Monitored Performance Metrics<br>
Latency: Measure the response time of your application to ensure ETD predictions are generated under the required time (typically <500ms).<br><br>
Throughput: Track the number of requests handled per second to assess the system’s capacity to handle high traffic loads.<br>
Error Rate: Monitor failed requests to identify potential issues like downtime or API failures.<br>
CPU and Memory Usage: Keep an eye on resource consumption to avoid performance degradation during peak traffic.<br><br>
Uptime: Ensure the system is up and running without interruptions.<br>
These metrics provide insights into system health, performance, and scalability, ensuring optimal operation post-deployment.<br>

8. Project Documentation<br>
Key documentation files: (All documentation has been pushed to the git repo)<br><br>
- Data Collection Management Plan and Report<br>
- Elevator Pitch.<br><br>
- Experiment Design and Report<br>
- Performance Metrics Report<br><br>
- Project Plan<br>
- Project Proposal<br>
- README<br>