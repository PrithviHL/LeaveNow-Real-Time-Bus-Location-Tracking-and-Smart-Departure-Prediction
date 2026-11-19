# Location inputs

Starting from and Where to each use one live-search field for Gainesville RTS stops, addresses, and places. Coordinates and input-mode menus are removed. Select a suggestion with a click or arrow keys and Enter.

Stop matches filter locally as you type. Photon place requests start after a 1.1-second pause; successful results are cached. Late responses cannot replace newer text. Editing a resolved input immediately invalidates its old point, and duplicate component events are ignored.

Use my current location sits below the starting field. A successful GPS result fills that field once. Later typing or selecting a different location takes precedence until GPS is requested again. Presets and swap update the same two fields.

Device GPS still depends on browser/OS permissions. No Google Maps key is required. Place data: © OpenStreetMap contributors / Photon.

Each non-empty field has a **×** button inside its right edge. Clicking it clears both text and resolved coordinates, cancels pending search debounce, closes suggestions, invalidates old command events and the previous plan, and returns focus to the input. Empty fields hide the button. It is also keyboard-accessible and labelled separately for origin and destination. The other location is preserved.
