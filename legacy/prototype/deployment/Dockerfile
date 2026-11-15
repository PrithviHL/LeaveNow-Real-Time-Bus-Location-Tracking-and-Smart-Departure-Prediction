# Use a lightweight Python image as the base
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .

# Install dependencies from requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application files
COPY . .

# Expose ports for Streamlit and Prometheus
EXPOSE 8501 8000

# Run Streamlit and start Prometheus metrics server
CMD ["sh", "-c", "streamlit run app2.py --server.port=8501 --server.address=0.0.0.0 && python -m prometheus_client.start_http_server 8000"]
