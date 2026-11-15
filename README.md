# LeaveNow

**Your next bus, figured out.** A Rochester RTS trip planner combining published timetables with available live predictions.

**[Open the live Render app](https://leavenow-prithvihl.onrender.com)**

## Current application

The deployed Streamlit app and its current source are on **[`feature/streamlit-containers`](https://github.com/PrithviHL/LeaveNow-Real-Time-Bus-Location-Tracking-and-Smart-Departure-Prediction/tree/feature/streamlit-containers)**. This `main` branch retains the earlier direct-bus browser implementation. This documentation update does not merge that application branch into `main`.

The live app includes:

- Google sign-in, a top-right account menu, and sign-out.
- Searchable stop suggestions for both starting point and destination, GPS for the starting point, coordinates, and sample trips.
- **Leave now**, **Depart at**, and **Arrive by** controls.
- Direct journeys and up to one transfer using official RTS GTFS schedules, walking estimates, and connection buffers.
- **Live**, **Scheduled**, and **Live + Scheduled** timing labels, journey timelines, and maps.
- Server-side RTS credentials and a private Node API inside the public Docker service.

Suggestions cover RTS stops rather than arbitrary street addresses. Routing is bounded and live data may be unavailable; check the source labels and verify before travel. The free Render service may sleep. Google's consent audience may restrict sign-in while in Testing.

## Documentation and local setup

- [Current README, quick start, and examples](https://github.com/PrithviHL/LeaveNow-Real-Time-Bus-Location-Tracking-and-Smart-Departure-Prediction/blob/feature/streamlit-containers/README.md)
- [Timetable rules and limits](https://github.com/PrithviHL/LeaveNow-Real-Time-Bus-Location-Tracking-and-Smart-Departure-Prediction/blob/feature/streamlit-containers/docs/timetable-routing.md)
- [Google sign-in setup](https://github.com/PrithviHL/LeaveNow-Real-Time-Bus-Location-Tracking-and-Smart-Departure-Prediction/blob/feature/streamlit-containers/docs/google-sign-in.md)
- [Public deployment and secret handling](https://github.com/PrithviHL/LeaveNow-Real-Time-Bus-Location-Tracking-and-Smart-Departure-Prediction/blob/feature/streamlit-containers/docs/public-deployment.md)
- [Docker and development Kubernetes profiles](https://github.com/PrithviHL/LeaveNow-Real-Time-Bus-Location-Tracking-and-Smart-Departure-Prediction/blob/feature/streamlit-containers/docs/streamlit-containers.md)

To get the deployed implementation:

```sh
git clone --branch feature/streamlit-containers https://github.com/PrithviHL/LeaveNow-Real-Time-Bus-Location-Tracking-and-Smart-Departure-Prediction.git
```

Follow the active README for Node/Python setup, GTFS import, and local Google secrets. Never commit API keys or `.streamlit/secrets.toml`. The Google callback for the live app is `https://leavenow-prithvihl.onrender.com/oauth2callback`.

## Deployment boundaries

Render runs the Streamlit interface and private Node API in one Docker container. The repository also provides separate-service Docker Compose and Kubernetes examples for development/CI; those examples are not the live Render topology. Archived research and model-accuracy claims do not describe the current runtime.

The service display name is `leavenow`, but the actual public URL is still **https://leavenow-prithvihl.onrender.com**. Use that URL for LinkedIn or portfolio links.
