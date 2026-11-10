# EpiTown civic-v1 replay

Source: PHIA-DCMARL/versions/civic-v1/demo/, the project's documented default demonstration.
This is the original seven-day engineering replay (seed 91002), not a live simulation or an efficacy claim.

- town.js is copied byte-for-byte.
- Every original PNG is copied byte-for-byte to ../assets/buildings/.
- The embedded replay JSON is unchanged except sprites[*].file, adjusted to the shared asset directory.
- embed-bridge.js only reports load status and pauses playback when the containing page is hidden.
- Source asset provenance and original permissions remain unchanged.
