# Streamlit prototype: Docker and Kubernetes

This is an active Streamlit prototype in `prototypes/streamlit`, separate from the archived Python submission in `legacy`. It calls the existing Node trip planner rather than duplicating routing logic or loading historical pickle models.

## Services

```text
Browser (GPS, stop search, coordinates)
  → Streamlit :8501
    → internal Node API :3001
      → RTS HTTPS API
```

Only the Node API receives `RTS_API_KEY`. Streamlit reads `LEAVENOW_API_URL` server-side. GPS uses the `streamlit-geolocation` component and requires a user click plus browser permission. Search and coordinates are available when GPS is unavailable. Maps and the geolocation component require actual browser verification; Python AppTest checks server-rendered UI logic.

The same direct-trip constraints apply: nearby stops at each end, matching live trip and vehicle, downstream destination ETA, fresh predictions, sufficient walking time, and a two-minute boarding buffer. No transfers or future timetable planning are added.

## Docker Compose

Install Docker Engine/Docker Desktop with Compose, then start Docker. From the repository root:

```sh
# Use the existing ignored .env, or create it from .env.example and set RTS_API_KEY.
docker compose up --build --wait
```

Open http://localhost:8501. Compose builds two images and checks backend health before starting Streamlit. The API is on the internal Compose network; only Streamlit is published to host loopback. Both containers run without root or added capabilities, with read-only root filesystems and temporary storage where needed.

```sh
docker compose logs --tail=50
docker compose down
```

Do not print `docker compose config` with a real credential into logs: interpolation can expose its value. The `.dockerignore` uses an allowlist and excludes `.env`, research artifacts, runtime downloads, caches, and Git history from image contexts. Direct Python requirements are version-pinned; transitive dependencies and base-image digests are not fully locked.

## Local Kubernetes with kind

Requires a running Docker daemon, [kind](https://kind.sigs.k8s.io/), and kubectl. These commands create a local development cluster; they do not provision paid cloud infrastructure.

```sh
docker compose build
kind create cluster --name leavenow
kind load docker-image leavenow-api:prototype leavenow-streamlit:prototype --name leavenow
kubectl apply -f deploy/kubernetes/namespace.yaml
python3 scripts/create-k8s-secret.py | kubectl apply -f -
kubectl apply -k deploy/kubernetes
kubectl -n leavenow rollout status deployment/leavenow-api
kubectl -n leavenow rollout status deployment/leavenow-streamlit
kubectl -n leavenow port-forward service/leavenow-streamlit 8501:80
```

Open http://localhost:8501 while port forwarding remains running. The secret helper reads the local ignored `.env` (or `RTS_API_KEY` environment variable) and streams a Secret to kubectl without placing the key in a command argument or tracked manifest. Do not run the helper alone in a logged terminal or redirect its secret output into a tracked file. Kubernetes Secrets require appropriate cluster RBAC and encryption-at-rest configuration; base64 is not encryption.

For an existing cluster, select and review your kubectl context first. Publish both images to your registry and use a Kustomize overlay to replace `leavenow-api` and `leavenow-streamlit` with registry references. `IfNotPresent` supports kind-loaded images; production releases should use immutable image tags/digests. The committed base deliberately uses ClusterIP services and no public ingress.

### Kubernetes resources

- `namespace.yaml`: isolated application namespace.
- `api.yaml`: Node Deployment and internal Service; credential from `leavenow-rts` Secret.
- `streamlit.yaml`: Streamlit Deployment and Service; calls `http://leavenow-api:3001`.
- `kustomization.yaml`: renders the base resources in the namespace.

Deployments include resource requests/limits, non-root execution, dropped capabilities, no service-account token mount, and startup/readiness/liveness probes. API probes use a localhost Host header because host validation remains enabled. Health checks confirm process/config readiness; they intentionally do not require RTS availability on every probe.

Streamlit uses one replica to keep WebSocket/session behavior simple. More replicas need session affinity and a reviewed session/storage design. A cloud ingress needs WebSocket support, HTTPS, domain configuration, access/rate controls, and a provider-capacity review before sharing publicly. The cluster-internal API has no authentication layer; use a trusted development cluster, not a multi-tenant public API.

```sh
kubectl -n leavenow get pods,services
kubectl -n leavenow logs deployment/leavenow-streamlit
kubectl -n leavenow logs deployment/leavenow-api
# Remove only this prototype from an existing cluster:
kubectl delete namespace leavenow
# Or delete the dedicated local development cluster:
kind delete cluster --name leavenow
```

## Native development without Docker

Start the Node API with `npm start` or `./run.sh`. In another terminal:

```sh
python3.12 -m venv .venv
.venv/bin/pip install -r prototypes/streamlit/requirements.txt
LEAVENOW_API_URL=http://127.0.0.1:3001 .venv/bin/python -m streamlit run prototypes/streamlit/app.py --server.port=8501
```

The Streamlit UI defaults to API port 3001. If the backend uses another port, set `LEAVENOW_API_URL` accordingly. Never put the RTS key in this variable. On the current Codex machine, Python dependencies for verification were installed into ignored `.cache/streamlit-venv`, and a native preview may use API port 3002 to avoid an existing app on 3001.

## Configuration

| Service   | Variable           | Default               | Purpose                                                                 |
| --------- | ------------------ | --------------------- | ----------------------------------------------------------------------- |
| API       | `RTS_API_KEY`      | required              | Provider credential, server only                                        |
| API       | `PORT`             | 3001                  | HTTP port                                                               |
| API       | `HOST`             | 127.0.0.1             | Bind address; explicitly use 0.0.0.0 in containers                      |
| API       | `ALLOWED_HOSTS`    | localhost aliases     | Add explicit internal service hostnames, comma-separated, without ports |
| Streamlit | `LEAVENOW_API_URL` | http://127.0.0.1:3001 | Trusted backend service URL                                             |

Local host restrictions remain the default. Container manifests explicitly opt into binding on all container interfaces and allow the required service DNS name. This is not an automatic public-hosting configuration.

## Verification and remaining limits

```sh
npm test
python -m unittest discover -s prototypes/streamlit/tests -v
kubectl kustomize deploy/kubernetes
```

Node tests check container configuration while retaining local defaults. Eight Python tests cover the API client and Streamlit initial, success, no-service, and backend-failure states. A local kubectl client can render Kustomize without a cluster. All five rendered resources also passed kubeconform strict schema validation against Kubernetes 1.35.0.

`.github/workflows/containers.yml` is configured to test Streamlit, build/run Compose, create a disposable kind cluster, load the built images, and verify both Kubernetes deployments and the internal API connection. CI uses a dummy key and process health checks; it does not claim successful live RTS predictions. No deployment is created in a user cloud account by this workflow.

Docker Engine and a Kubernetes cluster were unavailable in the authoring environment. Image builds and pod startup therefore have not been verified locally; the workflow must run successfully before claiming container/cluster validation. Native app tests, Kubernetes rendering, and native health/connectivity checks are separate evidence.

References: [Streamlit Docker](https://docs.streamlit.io/deploy/tutorials/docker), [Streamlit Kubernetes](https://docs.streamlit.io/deploy/tutorials/kubernetes), [Kubernetes Secrets](https://kubernetes.io/docs/concepts/configuration/secret/).
