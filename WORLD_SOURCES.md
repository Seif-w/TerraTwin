# Worldwide reference index

The worldwide mode uses new, coordinate-centered satellite images—not expanded or fabricated measurements from the user's dataset.

Natural Earth country boundaries are public domain: https://www.naturalearthdata.com/about/terms-of-use/ . The source GeoJSON is https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson . Country/cartographic unit names do not imply an endorsement of boundary claims.

EOX provides global satellite mosaics: https://maps.eox.at/ . The service describes Sentinel-2 cloudless 2023 and its WMS map access. Imagery attribution and license: https://cloudless.eox.at/ . The 2023 layer is CC BY-NC-SA 4.0; noncommercial conditions apply. Blue Marble is used only where the Sentinel layer lacks pixels. Provider rate limits and skipped images are recorded.

`build_world_index.py` samples a deterministic six-degree land grid plus one interior point per country/cartographic unit. It downloads real images, rejects unusable/empty responses, saves local thumbnails, and derives RGB means, grayscale distribution, contrast and edge energy from the pixels. No generated or simulated images are used.

This gives sparse worldwide reference coverage, not a complete global terrain dataset or validated image-geolocation model. Satellite views differ from ground-level photos in scale, camera geometry and lighting. Similarity scores are not location probabilities. The original terrain models still cover Egypt's Western Desert only.

The provider WMS capabilities explicitly confirm the 2023 CC BY-NC-SA 4.0 license: https://tiles.maps.eox.at/wms?service=WMS&request=GetCapabilities . The Blue Marble layer identifies NASA as its imagery source.
