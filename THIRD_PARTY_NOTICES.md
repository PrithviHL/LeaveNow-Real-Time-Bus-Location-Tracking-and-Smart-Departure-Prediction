# Third-party notices

## Leaflet 1.9.4

Browser mapping library, vendored under `public/vendor/leaflet`. Distributed under the BSD 2-Clause license included in `public/vendor/leaflet/LICENSE`. Source: https://github.com/Leaflet/Leaflet/tree/v1.9.4

## OpenStreetMap

Map data © OpenStreetMap contributors, available under the Open Database License. Map attribution remains visible. Tiles are fetched from the standard OpenStreetMap tile service for interactive viewing. See https://www.openstreetmap.org/copyright and https://operations.osmfoundation.org/policies/tiles/.

The bundled derivative pedestrian database at `src/server/walking-data/gainesville.json.gz` is distributed separately from application code under ODbL 1.0. See [its license and extract provenance](src/server/walking-data/LICENSE-OSM.md) and [refresh instructions](docs/walking-routing.md). No Google Maps data is included.

## RTS data

The current deployment uses Gainesville Regional Transit System (RTS) official GTFS and BusTime v3 vehicle/prediction data. Provider terms and availability apply: https://go-rts.com/rts-data/. Historical Rochester/RGRTA material remains archived and does not describe the active service.

Historical reports/notebooks may describe other third-party packages. Those Python packages are not dependencies of the active Node application.

## Streamlit prototype

The optional Python prototype uses Streamlit and streamlit-geolocation under their package licenses. They are pinned in prototypes/streamlit/requirements.txt and installed during image builds; they are not vendored into the Node application. Streamlit maps use its configured external basemap provider.
